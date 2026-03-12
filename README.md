# ELILEAI Deep Research Agent (Demo)

This repo contains a **deep research agent** created for **ELILEAI** as a demo/take-home style project. It’s a small multi-agent system that:

- **Plans** a research approach for a person (disambiguation + scoped sub-queries)
- **Checks an identity graph** (Neo4j) to avoid redundant web research
- **Runs parallel web research sub-agents** and collects structured findings
- **Persists the results** back into the identity graph
- **Generates a citation-heavy report** as the final response

The monorepo is an **Nx TypeScript workspace** with:
- `apps/assistant-app`: Next.js UI + internal API routes
- `apps/langgraph`: LangGraph backend (orchestrator + tools)
- `packages/*`: shared libraries (logger, test utilities)

## Quickstart

### Prerequisites
- Node.js 20+
- Docker (for Postgres + Neo4j)

### First-time setup

```bash
cp .env.example .env
# fill in secrets in .env

npm run setup
```

### Run it locally

```bash
npm run dev
```

- **UI**: `http://localhost:3000`
- **LangGraph API** (default): `http://localhost:2024`
- **Neo4j Browser** (default): `http://localhost:7474`

## Common commands

```bash
npm run dev            # start all dev servers
npm run build          # build all projects
npm run test           # run all tests
npm run lint           # lint all projects
npm run infra:up       # start docker services (postgres + neo4j)
npm run infra:down     # stop docker services
```

Targeted tests:

```bash
npx nx run assistant-app:test
npx nx run langgraph:test:unit
npx nx run langgraph:test:int
```

## Architecture (at a glance)

### System overview

```mermaid
flowchart LR
  U[User] --> UI["assistant-app\nNext.js"]
  UI --> API["Internal API routes\n/api"]
  API -->|SSE/HTTP| LG["langgraph\nLangGraph orchestrator"]

  LG -->|identity read/write| N4J["Neo4j\nIdentity Graph"]
  LG -->|state checkpoints| PG["Postgres\nLangGraph state"]

  LG -->|LLM calls| AN[Anthropic]
  LG -->|LLM calls and web search| OA[OpenAI]
  LG -->|optional traces/evals| LS[LangSmith]
```

### Deep research flow (planner → graph → sub-agents → report)

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant UI as assistant-app (UI)
  participant LG as langgraph (orchestrator)
  participant Planner as planner_agent
  participant Read as identity_graph_read
  participant Research as research_agent (parallel)
  participant Ingest as identity_graph_ingest
  participant Report as report_generator

  User->>UI: Ask about a person
  UI->>LG: Start run (stream)
  LG->>Planner: Plan research (scopes + disambiguation)
  Planner-->>LG: JSON plan (ready / questions / candidates)

  alt planner status != ready
    LG-->>UI: Ask follow-ups / present candidates
  else planner status == ready
    LG->>Read: Query what we already know
    Read-->>LG: Existing graph knowledge

    alt Graph has sufficient info
      LG-->>UI: Respond using graph knowledge
    else Graph empty/partial
      par 3–4 scoped calls
        LG->>Research: Scope A (web research)
        LG->>Research: Scope B (web research)
        LG->>Research: Scope C (web research)
      end
      Research-->>LG: Structured findings (JSON)
      LG->>Ingest: Persist findings into Neo4j
      Ingest-->>LG: Write counts (nodes/edges)
      LG->>Report: Synthesize report (citations)
      Report-->>LG: Markdown report
      LG-->>UI: Final answer
    end
  end
```

### Search strategy (parallel scopes → consolidation)

```mermaid
flowchart TB
  Q[User question] --> P["planner_agent\nproduces seed_scopes"]
  P -->|3–4 scopes| R1["research_agent\nscope A"]
  P -->|3–4 scopes| R2["research_agent\nscope B"]
  P -->|3–4 scopes| R3["research_agent\nscope C"]

  R1 --> F["Findings\nstructured JSON"]
  R2 --> F
  R3 --> F

  F --> D["De-dupe and score facts\ndeterministic"]
  D --> G[identity_graph_ingest]
  D --> RG[report_generator]
  RG --> OUT[Final markdown report]
```

## More details
- **Architecture docs**:
  - `docs/architecture/overview.md`
  - `docs/architecture/agent-flow.md`
  - `docs/architecture/identity-graph.md`
- **Infrastructure notes**: `infrastructure/README.md`

## Repo structure

```
├── apps/
│   ├── langgraph/           # TypeScript backend (LangGraph)
│   └── assistant-app/       # Next.js frontend
├── packages/
│   ├── logger/              # Shared logger
│   └── shared-testing/      # Shared Vitest utilities
├── infrastructure/          # Docker Compose + init scripts
└── docs/                    # Architecture docs
```
