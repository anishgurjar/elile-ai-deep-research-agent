# Identity Graph (Neo4j) Population Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After orchestrator-driven deep research on a person finishes, automatically persist an **identity graph** for that person into **Neo4j** (local via Docker Compose).

**Architecture:** Keep research as-is (orchestrator + `research_agent` subagent tool). Add a minimal, “native library first” **post-research ingestion step** that converts subagent findings into a constrained graph format and writes to Neo4j using existing, widely-adopted libraries (LangChain.js `Neo4jGraph.addGraphDocuments()` + `LLMGraphTransformer`). If the transformer is unreliable, fall back to official Neo4j MCP tooling behind a feature flag.

**Tech Stack:** Neo4j (Docker), `neo4j-driver`, `@langchain/community` (`Neo4jGraph`, `LLMGraphTransformer`), Vitest, NX.

---

## Principles (non-negotiable)

- **Native library first**: Prefer existing integrations and stable, well-used packages. Do not invent a new “Cypher-writing agent” or bespoke graph schema DSL unless absolutely necessary.
- **Minimal new code surface area**: Thin wrappers around established libs are acceptable (e.g., a tool that calls `Neo4jGraph.addGraphDocuments`).
- **Deterministic persistence**: Graph writing should be done by code (via libraries), not by free-form LLM Cypher generation, unless using the fallback path.
- **Ask the user if blocked**: If any step requires an assumption (schema, env var naming, service ports, model choice) and you cannot confidently infer it from the repo, stop and ask the user (single targeted question) before proceeding.

---

## Current repo touchpoints (already confirmed)

- Orchestrator agent: `apps/langgraph/src/agents/orchestrator/graph/graph.ts`
- Research subagent: `apps/langgraph/src/agents/research/research-agent.ts`
- Subagent tool wrapper: `apps/langgraph/src/agents/orchestrator/research-tools.ts` (parses JSON into `ResearchToolResultSchema` when possible)
- Compose today: `docker-compose.yml` has Postgres only; CI uses `docker compose up -d --wait` with `docker-compose.ci.yml`.

---

## Target behavior (definition of done)

When the orchestrator completes a “research a person” run:

1. The orchestrator still dispatches 3–4 `research_agent` calls and synthesizes results.
2. After it has enough findings, it triggers ingestion that:
   - creates/updates a `Person` node representing the subject
   - attaches `Organization`, `Role/Title`, `Location`, and other identity entities as discovered
   - preserves provenance by attaching each claim to its URL sources (at minimum: store URL + title when present)
3. Neo4j is available locally via `npm run infra:up` and in CI (compose + healthcheck).

---

## Proposed minimal graph model (v1)

Keep v1 intentionally small so the transformer is less likely to hallucinate:

- **Nodes**
  - `Person { canonicalName, threadId, createdAt, updatedAt }`
  - `Organization { name }`
  - `Role { name }` (or `Title`)
  - `Location { name }`
  - `Source { url, title? }`
  - `Claim { text, confidence?, scope?, angle?, threadId }`

- **Relationships**
  - `(Person)-[:ASSOCIATED_WITH]->(Organization)`
  - `(Person)-[:HAS_ROLE]->(Role)`
  - `(Person)-[:LOCATED_IN]->(Location)`
  - `(Claim)-[:ABOUT]->(Person)`
  - `(Claim)-[:SUPPORTED_BY]->(Source)`

Notes:
- v1 is “identity graph”, not a full knowledge graph.
- Prefer merges (idempotent writes) to avoid duplication on repeated runs.

If you cannot decide whether `Claim` should be a node vs property-only storage, ask the user. (Default recommendation: `Claim` node for provenance and later querying.)

---

## Plan

### Task 0: Create an isolated worktree for this feature

**Files:** none

**Step 1: Create branch + worktree**

Run:

```bash
git status
git checkout main
git pull --ff-only
git worktree add -b feat/identity-graph-neo4j ../deep-research-agent-identity-graph
```

Expected: a new worktree at `../deep-research-agent-identity-graph` on branch `feat/identity-graph-neo4j`.

**Step 2: Verify NX commands still run**

Run:

```bash
cd ../deep-research-agent-identity-graph
npm ci
npx nx --version
```

Expected: NX prints a version; install succeeds.

**Step 3: Commit**

No commit for this task.

---

### Task 1: Add Neo4j to Docker Compose (local + CI-compatible)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.ci.yml`
- Modify: `infrastructure/README.md`

**Step 1: Write the failing (smoke) test plan note**

No test yet; this task is infrastructure-only.

**Step 2: Add a `neo4j` service to `docker-compose.yml`**

Implement:
- `image: neo4j:5` (or a pinned 5.x tag)
- Ports: `7474` (HTTP) and `7687` (Bolt)
- `NEO4J_AUTH=neo4j/${ELILEAI_NEO4J_PASSWORD:-neo4j_dev}`
- Named volumes: `neo4j_data`, `neo4j_logs`
- Healthcheck: use HTTP ping or bolt check so `docker compose up --wait` works

**Step 3: Ensure CI doesn’t disable Neo4j**

Update `docker-compose.ci.yml` only if it currently disables services you’ll add. Keep Neo4j enabled in CI.

**Step 4: Update infra docs**

Update `infrastructure/README.md` to include Neo4j in the services table and list local connection info:
- HTTP: `http://localhost:7474`
- Bolt: `bolt://localhost:7687`

**Step 5: Run compose locally**

Run:

```bash
cp .env.example .env
npm run infra:up
docker compose ps
```

Expected: Postgres + Neo4j are “healthy”.

**Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.ci.yml infrastructure/README.md
git commit -m "chore(infra): add Neo4j service for identity graph"
```

---

### Task 2: Add Neo4j env vars (local, test, CI)

**Files:**
- Modify: `.env.example`
- Modify: `.env.ci`
- (Optional) Modify: `.env.test`

**Step 1: Add env var placeholders**

Add to `.env.example` (values are placeholders, not secrets):
- `ELILEAI_NEO4J_URI=bolt://localhost:7687`
- `ELILEAI_NEO4J_USERNAME=neo4j`
- `ELILEAI_NEO4J_PASSWORD=neo4j_dev`
- `ELILEAI_NEO4J_DATABASE=neo4j` (or empty for default)
- `ELILEAI_IDGRAPH_INGESTION_MODE=langchain_graph_documents`

Mirror appropriate values into `.env.ci` so CI tests can connect.

If you’re unsure about database name conventions (default DB vs named DB), ask the user before choosing.

**Step 2: Commit**

```bash
git add .env.example .env.ci
git commit -m "chore(env): add Neo4j config for identity graph"
```

---

### Task 3: Add direct dependencies for Neo4j graph ingestion

**Files:**
- Modify: `apps/langgraph/package.json`

**Step 1: Add dependencies (direct, not transitive)**

Add:
- `neo4j-driver` (direct dependency)

Add (only if/when implementing MCP fallback):
- `@langchain/mcp-adapters`

Rationale: `neo4j-driver` is currently present transitively; we want it pinned explicitly for reliability.

**Step 2: Install + verify lockfile**

Run:

```bash
npm install
```

Expected: lockfile updates.

**Step 3: Commit**

```bash
git add apps/langgraph/package.json package-lock.json
git commit -m "chore(langgraph): add Neo4j driver dependency"
```

---

### Task 4: Implement a Neo4j connection factory (LangChain `Neo4jGraph`)

**Files:**
- Create: `apps/langgraph/src/identity-graph/neo4j-graph.ts`
- Test: `apps/langgraph/src/identity-graph/neo4j-graph.test.ts`

**Step 1: Write the failing test**

Create a unit test that:
- sets env vars
- imports `createNeo4jGraph()`
- asserts it returns an object with a `query` method (or expected `Neo4jGraph` shape)

```ts
import { describe, expect, test, vi } from "vitest";

describe("createNeo4jGraph", () => {
  test("creates a Neo4jGraph using env vars", async () => {
    process.env.ELILEAI_NEO4J_URI = "bolt://localhost:7687";
    process.env.ELILEAI_NEO4J_USERNAME = "neo4j";
    process.env.ELILEAI_NEO4J_PASSWORD = "neo4j_dev";
    const { createNeo4jGraph } = await import("./neo4j-graph");
    const graph = await createNeo4jGraph();
    expect(graph).toBeTruthy();
    expect(typeof (graph as any).query).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: FAIL (module not found).

**Step 3: Write minimal implementation**

Implement `createNeo4jGraph()` using `@langchain/community/graphs/neo4j_graph`:
- reads env vars
- constructs `Neo4jGraph` with credentials
- (Optional) calls `refreshSchema()` if you plan to use Cypher QA later (not required for ingestion)

If the `Neo4jGraph` constructor signature differs from expectations, stop and check the LangChain.js docs; if still unclear, ask the user and/or pin the exact `@langchain/community` version behavior.

**Step 4: Run test to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/identity-graph/neo4j-graph.ts apps/langgraph/src/identity-graph/neo4j-graph.test.ts
git commit -m "feat(langgraph): add Neo4jGraph factory for identity graph"
```

---

### Task 5: Implement “graph document ingestion” (LLMGraphTransformer → Neo4jGraph)

**Files:**
- Create: `apps/langgraph/src/identity-graph/ingest-identity-graph.ts`
- Test: `apps/langgraph/src/identity-graph/ingest-identity-graph.test.ts`

**Step 1: Write the failing unit test**

Goal of the unit test (do not require a running Neo4j yet):
- Given `subject` + a small list of subagent JSON results (from `ResearchToolResultSchema` shape), ensure:
  - documents are constructed with provenance
  - transformer is called
  - `graph.addGraphDocuments()` is called with the produced graph documents

Use dependency injection so you can mock:
- `graph.addGraphDocuments`
- `transformer.convertToGraphDocuments`

Test skeleton:

```ts
import { describe, expect, test, vi } from "vitest";

describe("ingestIdentityGraph", () => {
  test("transforms research results and writes graph documents", async () => {
    const addGraphDocuments = vi.fn(async () => undefined);
    const graph = { addGraphDocuments } as any;
    const transformer = {
      convertToGraphDocuments: vi.fn(async () => [{ nodes: [], relationships: [] }]),
    } as any;

    const { ingestIdentityGraphFromResearch } = await import("./ingest-identity-graph");

    await ingestIdentityGraphFromResearch({
      subject: "Ada Lovelace",
      threadId: "t1",
      researchResults: [
        {
          thread_id: "r1:identity",
          scope: "identity",
          angle: "Identity confirmation",
          summary: "Ada Lovelace was ...",
          findings: [{ claim: "Example", confidence: 0.5, sources: [{ url: "https://example.com" }] }],
          out_of_scope_leads: [],
          suggested_queries: [],
          visited_urls: ["https://example.com"],
        },
      ],
      graph,
      transformer,
    });

    expect(transformer.convertToGraphDocuments).toHaveBeenCalledTimes(1);
    expect(addGraphDocuments).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: FAIL (module not found).

**Step 3: Implement minimal ingestion**

Implement `ingestIdentityGraphFromResearch()`:
- Input:
  - `subject: string`
  - `threadId: string`
  - `researchResults: Array<ResearchToolResultSchema-ish>`
  - dependency-injected `graph` + `transformer` (default factories for production)
- Convert research JSON → a list of `Document` objects:
  - pageContent: concatenate `summary` + each `finding.claim`
  - metadata: include `scope`, `angle`, `thread_id`, and (critically) `sources` URLs so provenance exists
- Configure transformer to reduce weirdness:
  - `strictMode: true`
  - allowed node/relationship types limited to v1 model (Person/Organization/Role/Location/Source/Claim and relationships listed above)
- Call:
  - `transformer.convertToGraphDocuments(docs)`
  - `graph.addGraphDocuments(graphDocs, { includeSource: true })` (or equivalent config)

If LangChain.js transformer schemas differ (string arrays vs schema objects), check the JS API reference and adapt. If unclear, ask the user before proceeding.

**Step 4: Run unit tests**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/identity-graph/ingest-identity-graph.ts apps/langgraph/src/identity-graph/ingest-identity-graph.test.ts
git commit -m "feat(langgraph): ingest identity graph from research results"
```

---

### Task 6: Expose a thin orchestrator tool: `identity_graph_ingest`

**Files:**
- Create: `apps/langgraph/src/agents/orchestrator/identity-graph-tools.ts`
- Modify: `apps/langgraph/src/agents/orchestrator/graph/graph.ts`
- Test: `apps/langgraph/src/agents/orchestrator/identity-graph-tools.test.ts`

**Step 1: Write the failing unit test**

Test that:
- tool exists
- validates input
- calls `ingestIdentityGraphFromResearch()` with provided payload

**Step 2: Implement tool wrapper**

Implement `createIdentityGraphIngestTool()` using `langchain.tool()` + zod schema:
- Inputs:
  - `threadId: string`
  - `subject: string`
  - `researchResultsJson: string` (or an array, but string is easiest to pass through tool calls)
- Behavior:
  - parse JSON
  - call `ingestIdentityGraphFromResearch()`
  - return a small success string (no huge payload)

This is “new code”, but it is a thin wrapper around existing libs and keeps the orchestrator in control.

**Step 3: Wire it into the orchestrator agent**

Modify `apps/langgraph/src/agents/orchestrator/graph/graph.ts` to include this tool alongside `researchAgentTool`.

**Step 4: Run unit tests**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/identity-graph-tools.ts apps/langgraph/src/agents/orchestrator/identity-graph-tools.test.ts apps/langgraph/src/agents/orchestrator/graph/graph.ts
git commit -m "feat(orchestrator): add identity_graph_ingest tool"
```

---

### Task 7: Update orchestrator prompt to (a) research people only, (b) ingest after subagents

**Files:**
- Modify: `apps/langgraph/src/agents/orchestrator/prompt.ts`
- Test: `apps/langgraph/src/agents/orchestrator/prompt.test.ts`

**Step 1: Write failing prompt test assertions**

Add tests expecting:
- explicit “we only research people” instruction
- instruction to call `identity_graph_ingest` after subagent research completes

**Step 2: Update prompt (no “formal prompt engineering”, just explicit instructions)**

In `apps/langgraph/src/agents/orchestrator/prompt.ts`, add:
- A line near the top: “This system only performs deep research on people.”
- A phase note: after completing subagent calls and follow-ups, call `identity_graph_ingest` with:
  - `subject`
  - `threadId` (from the run config or user-provided id if present)
  - aggregated subagent JSON results

Keep it short and explicit.

**Step 3: Run unit tests**

Run:

```bash
npx nx run langgraph:test:unit -- --runInBand
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/prompt.ts apps/langgraph/src/agents/orchestrator/prompt.test.ts
git commit -m "chore(orchestrator): instruct people-only research and graph ingestion"
```

---

### Task 8: Add an integration test that writes to Neo4j (happy path)

**Files:**
- Create: `apps/langgraph/src/identity-graph/ingest-identity-graph.int.test.ts`
- (Potentially) Modify: `apps/langgraph/vitest.int.config.ts` (if needed)

**Step 1: Write the failing integration test**

Test should:
- require env vars (Neo4j running via compose)
- call `ingestIdentityGraphFromResearch()` with a tiny sample
- query Neo4j (via `neo4j-driver` directly) to confirm at least:
  - one `Person` node exists for the subject
  - one `Source` node exists for a URL

If there is no existing integration-test harness for external services, ask the user before introducing a new convention.

**Step 2: Run integration tests locally**

Run:

```bash
npm run infra:up
npx nx run langgraph:test:int -- --runInBand
```

Expected: FAIL initially, then PASS after implementation.

**Step 3: Commit**

```bash
git add apps/langgraph/src/identity-graph/ingest-identity-graph.int.test.ts
git commit -m "test(langgraph): verify identity graph ingestion against Neo4j"
```

---

## Optional Phase 2 (fallback): Neo4j MCP-based ingestion

Only do this if `LLMGraphTransformer` is unreliable in practice.

### Task 9 (optional): Add Neo4j MCP server and wire it as tools

**Goal:** Use official Neo4j MCP tools rather than experimental transformer ingestion.

**Approach options (pick one):**
- **A. `neo4j/mcp` (Cypher MCP)**: tools like `get-schema`, `read-cypher`, `write-cypher`.
  - Pro: official, direct
  - Con: LLM may still generate Cypher strings
- **B. `mcp/neo4j-memory`**: higher-level tools (`create_entities`, `create_relations`, etc.)
  - Pro: less raw-Cypher, more “solved tool surface”
  - Con: memory schema might not match your identity graph exactly

**Files (likely):**
- Modify: `docker-compose.yml` (add MCP server container)
- Modify: `apps/langgraph/package.json` (add `@langchain/mcp-adapters`)
- Create: `apps/langgraph/src/identity-graph/mcp-client.ts`
- Modify: orchestrator graph tool wiring (add MCP tools)

**Feature flag:**
- `ELILEAI_IDGRAPH_INGESTION_MODE=neo4j_mcp_memory` or `neo4j_mcp_cypher`

**Stop and ask the user** which fallback they prefer before implementing Phase 2.

---

## Verification checklist (run before saying “done”)

Run:

```bash
npm run infra:up
npx nx run-many --target=lint --projects=langgraph
npx nx run langgraph:test:unit
npx nx run langgraph:test:int
```

Expected:
- Lint passes
- Unit tests pass
- Integration test passes with Neo4j running

