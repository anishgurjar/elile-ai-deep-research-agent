# Identity Graph Read + GraphCypherQAChain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only “graph-first planning” stage so the orchestrator can query what’s already in Neo4j before doing new web research, using LangChain’s `GraphCypherQAChain` and a Neo4j read-only role/user created automatically on Docker startup.

**Architecture:** Use Neo4j RBAC as the primary safety control (separate read-only DB user). Add a dedicated orchestrator tool (read-only) that runs a GraphCypherQAChain over Neo4j to answer “what’s already known?” questions. Update the orchestrator prompt + global skills so it always queries the graph first, then decides whether to research.

**Tech Stack:** NX monorepo (TypeScript), LangChain/LangGraph (TS), Neo4j (Docker Compose), `neo4j-driver`, `@langchain/community` Neo4j graph integration, LangChain `GraphCypherQAChain`.

---

## Constraints / non-goals (explicit)

- **Native-first**: Prefer Neo4j RBAC + LangChain’s existing `GraphCypherQAChain` rather than writing a custom Cypher firewall.
- **Local dev**: This is for local Docker usage; we will **not** build a full query firewall in this iteration.
- **Security baseline**: Tool must use **read-only Neo4j credentials**. No write privileges for graph read tool. (Defense-in-depth: DB-level privilege enforcement.)
- **Source understanding**: As part of implementation, read the `GraphCypherQAChain` source to understand config flags/behavior and use it correctly.

---

## Design decisions (locked for this plan)

### Read-only capability
- Add a Neo4j **read-only role + user** during local infra bring-up.
- Use separate env vars for the read-only account:
  - `ELILEAI_NEO4J_READ_URI`
  - `ELILEAI_NEO4J_READ_USERNAME`
  - `ELILEAI_NEO4J_READ_PASSWORD`
  - `ELILEAI_NEO4J_READ_DATABASE`

### Tooling
- Add a new orchestrator tool (name TBD, recommended: `identity_graph_read`) that:
  - uses the **read-only user**
  - uses LangChain **`GraphCypherQAChain`** to translate natural language → Cypher → results → answer
  - returns `content_and_artifact` so UI can display both summary and query metadata.

### Orchestrator behavior
- Add an explicit **Planning Stage**: before calling `research_agent`, call `identity_graph_read` to see what is already known.
- If the graph already answers the user’s question: summarize and ask if they want further/different angles.
- Otherwise: proceed with web research; after finishing, call `identity_graph_ingest` (existing behavior).

---

## Task 0: Create an isolated worktree (required)

**Files:** none

**Step 1: Create worktree**

Run:

```bash
git status
git fetch origin
git worktree add ../deep-research-agent-wt-idgraph-readonly -b feat/idgraph-readonly origin/main
cd ../deep-research-agent-wt-idgraph-readonly
```

Expected: new worktree directory exists; branch `feat/idgraph-readonly` checked out.

**Step 2: Install deps**

Run:

```bash
npm install
```

Expected: install succeeds.

---

## Task 1: Add Neo4j read-only user/role created at Docker startup

**Files:**
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/docker-compose.yml`
- Create: `/Users/anishgurjar/Desktop/deep-research-agent/infrastructure/neo4j/init-readonly.cypher`
- Create: `/Users/anishgurjar/Desktop/deep-research-agent/infrastructure/neo4j/init-readonly.sh`
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/infrastructure/README.md`
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/.env.example`
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/.env.ci`

**Step 1: Write failing integration test (infra-level smoke)**

Create a minimal “smoke” script test that verifies the read-only user cannot write.

Create:
- `apps/langgraph/src/identity-graph/neo4j-readonly.int.test.ts`

Test sketch (Vitest):

```ts
import { describe, expect, test } from "vitest";
import neo4j from "neo4j-driver";

describe("neo4j readonly user", () => {
  test("cannot write", async () => {
    const uri = process.env.ELILEAI_NEO4J_READ_URI ?? "bolt://localhost:7687";
    const user = process.env.ELILEAI_NEO4J_READ_USERNAME ?? "neo4j_read";
    const pass = process.env.ELILEAI_NEO4J_READ_PASSWORD ?? "neo4j_read_dev";

    const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
    const session = driver.session();
    try {
      await expect(
        session.run("CREATE (n:ShouldNotWrite {id: 'x'}) RETURN n"),
      ).rejects.toBeTruthy();
    } finally {
      await session.close();
      await driver.close();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
docker compose up -d neo4j
npx nx run langgraph:test:int --testFile=apps/langgraph/src/identity-graph/neo4j-readonly.int.test.ts
```

Expected: FAIL because the read-only user/role does not exist yet (auth error / login failure).

**Step 3: Implement Neo4j init job (native-first, minimal custom)**

Implementation approach:
- Keep the main `neo4j` service.
- Add a one-shot `neo4j-init` service that:
  - waits for `neo4j` healthcheck
  - runs `cypher-shell` to apply `init-readonly.cypher`
  - exits 0 and can be re-run idempotently

Create `infrastructure/neo4j/init-readonly.cypher` with **idempotent** statements:

```cypher
// Create role/user only if missing (Neo4j supports IF NOT EXISTS on newer versions; if not available, use TRY/CATCH via procedures is not allowed in Cypher).
// Prefer CREATE ... IF NOT EXISTS where supported.

CREATE ROLE idgraph_readonly IF NOT EXISTS;
GRANT ACCESS ON DATABASE neo4j TO idgraph_readonly;
GRANT MATCH {*} ON GRAPH neo4j NODES * TO idgraph_readonly;
GRANT MATCH {*} ON GRAPH neo4j RELATIONSHIPS * TO idgraph_readonly;

CREATE USER neo4j_read IF NOT EXISTS SET PASSWORD 'neo4j_read_dev' CHANGE NOT REQUIRED;
GRANT ROLE idgraph_readonly TO neo4j_read;
```

Create `infrastructure/neo4j/init-readonly.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

NEO4J_URI="${ELILEAI_NEO4J_URI:-bolt://neo4j:7687}"
NEO4J_ADMIN_USER="${ELILEAI_NEO4J_USERNAME:-neo4j}"
NEO4J_ADMIN_PASS="${ELILEAI_NEO4J_PASSWORD:-neo4j_dev}"

echo "Waiting for Neo4j to accept cypher-shell..."
until cypher-shell -a "$NEO4J_URI" -u "$NEO4J_ADMIN_USER" -p "$NEO4J_ADMIN_PASS" "RETURN 1" >/dev/null 2>&1; do
  sleep 2
done

echo "Applying readonly role/user..."
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_ADMIN_USER" -p "$NEO4J_ADMIN_PASS" -f /init/init-readonly.cypher
echo "Done."
```

Update `docker-compose.yml`:
- mount `./infrastructure/neo4j:/init:ro` into the init container
- add `neo4j-init` service using `neo4j:5` image (includes `cypher-shell`)
- `depends_on: neo4j` with condition “service_healthy” (or a manual wait loop in the script, which we already have)

**Step 4: Run test to verify it passes**

Run:

```bash
docker compose up -d neo4j
docker compose run --rm neo4j-init
npx nx run langgraph:test:int --testFile=apps/langgraph/src/identity-graph/neo4j-readonly.int.test.ts
```

Expected: PASS; write query fails with a permissions error (test expects rejection).

**Step 5: Document env + ports**

Update `.env.example` and `.env.ci` to include:

```bash
# Neo4j (Identity Graph) - Read-only tool user
ELILEAI_NEO4J_READ_URI=bolt://localhost:7687
ELILEAI_NEO4J_READ_USERNAME=neo4j_read
ELILEAI_NEO4J_READ_PASSWORD=neo4j_read_dev
ELILEAI_NEO4J_READ_DATABASE=neo4j
```

Update `infrastructure/README.md` to explain:
- how to run `neo4j-init`
- what the read-only user is for

**Step 6: Commit**

```bash
git add docker-compose.yml infrastructure/neo4j .env.example .env.ci apps/langgraph/src/identity-graph/neo4j-readonly.int.test.ts infrastructure/README.md
git commit -m "chore(infra): add Neo4j readonly role/user init"
```

---

## Task 2: Add a read-only graph QA tool using `GraphCypherQAChain`

**Files:**
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/package.json`
- Create: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/identity-graph/neo4j-readonly-graph.ts`
- Create: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.ts`
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/graph/graph.ts`
- Test: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.test.ts`

**Step 1: Read the upstream source code (required)**

Goal: understand exact config surface (e.g. “allow dangerous requests”, how schema is fetched, what it returns).

Run (pick one approach):

```bash
# Option A: inspect installed dependency source
node -p "require.resolve('@langchain/community/chains/graph_qa/cypher')"
node -p "require.resolve('@langchain/community/graphs/neo4j_graph')"

# Option B: inspect on GitHub
# (open the files in browser: GraphCypherQAChain implementation and any security warnings)
```

Expected: you can locate the TS source that defines `GraphCypherQAChain` and confirm:
- input keys / output keys
- whether it supports returning generated Cypher
- any flags meant to warn about dangerous credentials

**Step 2: Add dependency (if missing)**

If `@langchain/community` is not already present in `apps/langgraph`, add it (otherwise skip).

Run:

```bash
npm install @langchain/community
```

Expected: dependency present under the workspace lockfile.

**Step 3: Write failing unit test for the new tool**

Create `apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { createIdentityGraphReadTool } from "./identity-graph-read-tools";

describe("identity-graph-read-tools", () => {
  test("creates a readonly tool with content_and_artifact response", () => {
    const tool = createIdentityGraphReadTool({
      // Inject a fake chain so we don't need Neo4j in unit tests
      createChain: () => ({ invoke: vi.fn(async () => ({ result: "ok", cypher: "MATCH ..." })) }),
    });
    expect(tool.name).toBe("identity_graph_read");
    expect(tool.responseFormat).toBe("content_and_artifact");
  });

  test("invokes GraphCypherQAChain and returns summary + artifact", async () => {
    const invoke = vi.fn(async () => ({ result: "Ada summary", cypher: "MATCH (p:Person) ..." }));
    const tool = createIdentityGraphReadTool({ createChain: () => ({ invoke }) });

    const out = await tool.invoke({
      question: "What do we already know about Ada Lovelace?",
      threadId: "t1",
      subject: "Ada Lovelace",
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(out).toContain("Ada");
  });
});
```

**Step 4: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit --testFile=apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.test.ts
```

Expected: FAIL because `createIdentityGraphReadTool` doesn’t exist yet.

**Step 5: Implement the read-only graph factory**

Create `apps/langgraph/src/identity-graph/neo4j-readonly-graph.ts`:

```ts
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

export function createNeo4jReadonlyGraph(): Neo4jGraph {
  const url = process.env.ELILEAI_NEO4J_READ_URI ?? process.env.ELILEAI_NEO4J_URI;
  const username = process.env.ELILEAI_NEO4J_READ_USERNAME;
  const password = process.env.ELILEAI_NEO4J_READ_PASSWORD;
  const database = process.env.ELILEAI_NEO4J_READ_DATABASE ?? process.env.ELILEAI_NEO4J_DATABASE ?? "neo4j";

  if (!url || !username || !password) {
    throw new Error(
      "Neo4j readonly connection requires ELILEAI_NEO4J_READ_URI, ELILEAI_NEO4J_READ_USERNAME, and ELILEAI_NEO4J_READ_PASSWORD",
    );
  }

  return new Neo4jGraph({ url, username, password, database });
}
```

**Step 6: Implement `identity_graph_read` tool using GraphCypherQAChain**

Create `apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.ts`:

- Zod schema:
  - `subject` (string, required)
  - `threadId` (string, required)
  - `question` (string, required) — natural language question
- Implementation:
  - build `Neo4jGraph` via `createNeo4jReadonlyGraph()`
  - create `GraphCypherQAChain` with the orchestrator model (or a smaller model) + graph instance
  - call `chain.invoke({ query: input.question })` (or whatever key the source code confirms)
  - return `content_and_artifact` including:
    - `subject`, `threadId`
    - returned `cypher` (if available) and a “readonly enforced by DB role” note

**Step 7: Run test to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit --testFile=apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.test.ts
```

Expected: PASS.

**Step 8: Wire tool into orchestrator graph**

Modify `apps/langgraph/src/agents/orchestrator/graph/graph.ts` to add:
- `createIdentityGraphReadTool(...)` to the tools array (alongside `research_agent` and `identity_graph_ingest`)

**Step 9: Commit**

```bash
git add apps/langgraph/src/identity-graph/neo4j-readonly-graph.ts apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.ts apps/langgraph/src/agents/orchestrator/identity-graph-read-tools.test.ts apps/langgraph/src/agents/orchestrator/graph/graph.ts apps/langgraph/package.json package-lock.json
git commit -m "feat(orchestrator): add readonly identity graph read tool"
```

---

## Task 3: Update orchestrator prompt to add a “graph-first planning stage”

**Files:**
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/prompt.ts`
- Test: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/prompt.test.ts`

**Step 1: Write failing prompt tests**

Add tests:

```ts
test("instructs graph-first planning stage", () => {
  expect(prompt).toMatch(/Planning Stage/i);
  expect(prompt).toMatch(/identity_graph_read/);
});

test("states identity_graph_read must be read-only", () => {
  expect(prompt).toMatch(/read-only/i);
  expect(prompt).toMatch(/Neo4j role/i);
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npx nx run langgraph:test:unit --testFile=apps/langgraph/src/agents/orchestrator/prompt.test.ts
```

Expected: FAIL (prompt not updated yet).

**Step 3: Update prompt**

Add a new section above “Identity Graph Ingestion”:

- “Planning Stage (Graph-first)”
  - Always call `identity_graph_read` first for the subject.
  - If graph contains enough info, summarize and ask if the user wants new angles.
  - Otherwise proceed to `research_agent`.
  - State explicitly: `identity_graph_read` is **read-only** and must never be used to write/update/delete.

**Step 4: Run tests to verify pass**

Run:

```bash
npx nx run langgraph:test:unit --testFile=apps/langgraph/src/agents/orchestrator/prompt.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/prompt.ts apps/langgraph/src/agents/orchestrator/prompt.test.ts
git commit -m "chore(orchestrator): add graph-first planning stage"
```

---

## Task 4: Add/extend global skills to guide graph-first behavior (native-first)

**Files:**
- Create: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/skills/shared_skills/identity-graph-retrieval/SKILL.ts`
- Modify: `/Users/anishgurjar/Desktop/deep-research-agent/apps/langgraph/src/agents/orchestrator/skills/config.ts`

**Step 1: Write failing unit test for skills config**

Create a small test (or extend existing) verifying `identity-graph-retrieval` is included in globals.

**Step 2: Implement new skill**

`identity-graph-retrieval` should instruct:
- Always use `identity_graph_read` before web research.
- Treat returned graph facts as the default baseline; only research gaps/uncertainties.
- If user’s ask is already answered, offer:
  - summary + “want me to verify / expand / find sources?”

**Step 3: Register skill globally**

Update `skills/config.ts`:
- add `identity-graph-retrieval` to `SKILL_CATALOG`
- add it to `SKILL_SOURCES.global`
- extend `SKILL_RULES` so it’s loaded before answering person questions (alongside retrieval-protocol/output-contract)

**Step 4: Run tests**

Run:

```bash
npx nx run langgraph:test:unit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/skills/shared_skills/identity-graph-retrieval/SKILL.ts apps/langgraph/src/agents/orchestrator/skills/config.ts
git commit -m "feat(skills): add identity graph retrieval guidance"
```

---

## Task 5: End-to-end smoke test (local)

**Files:** none (runtime verification)

**Step 1: Start infra**

Run:

```bash
docker compose up -d
docker compose run --rm neo4j-init
```

Expected: neo4j + postgres up, init job prints “Done.”.

**Step 2: Run orchestrator and validate behavior**

Run:

```bash
npm run dev
```

Manual test:
- Ask about a known person you already ingested earlier (or ingest once).
- Confirm the orchestrator first calls `identity_graph_read`.
- Confirm it summarizes existing info and asks if you want additional angles.
- Confirm `identity_graph_ingest` still runs after research calls.

**Step 3: Commit any follow-up fixes**

Only if necessary.

---

## Notes / future hardening (explicitly deferred)

- Query firewall / AST validation for “raw Cypher”: deferred (local-only project, DB read-only is the baseline).
- If/when you want to expose this beyond local: add a real query firewall + timeouts + allowlist of procedures and clauses.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-09-identity-graph-readonly-graphcypherqachain.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration  
**2. Parallel Session (separate)** — Open new session in the worktree and use **superpowers:executing-plans** to execute task-by-task

Which approach?

