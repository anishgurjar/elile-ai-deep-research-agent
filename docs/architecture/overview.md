# Architecture Overview

This project is a demo deep research agent for ELILEAI. The system is intentionally small, but it demonstrates a few production-oriented concerns:

- **Planning before execution** (avoid wasteful web research)
- **Memory/knowledge reuse** via an **identity graph** (Neo4j)
- **Parallel, scoped research** using sub-agents
- **Deterministic consolidation** (de-dupe and scoring) before a final report

## Components

- **`apps/assistant-app/` (Next.js 15)**:
  - Web UI for chat + viewing tool activity
  - Internal API routes that proxy requests to the LangGraph service (streaming)

- **`apps/langgraph/` (LangGraph backend)**:
  - Orchestrator agent with a system prompt that enforces the workflow
  - Tools:
    - `planner_agent`
    - `identity_graph_read` (read-only)
    - `research_agent` (web research sub-agent)
    - `identity_graph_ingest`
    - `report_generator`

- **Infrastructure**
  - **Postgres**: used by LangGraph for state/checkpoints
  - **Neo4j**: identity graph memory; see `docs/architecture/identity-graph.md`

## Key design constraints

### Planning gate
When the user asks to investigate a new subject, the orchestrator calls `planner_agent` first. If the planner returns `status != "ready"`, the system asks the user follow-ups instead of launching web research.

### Read-before-write memory
The orchestrator queries `identity_graph_read` before launching web research. This reduces duplicated work and enables follow-up questions with accumulated context.

### Parallel research scopes
When web research is needed, the orchestrator launches 3–4 parallel `research_agent` calls using the planner-produced scopes/angles. This improves coverage and reduces single-path bias.

### Deterministic consolidation
Before generating the final report, the system:
- de-dupes and scores facts deterministically
- persists the findings via `identity_graph_ingest`
- generates the user-facing report via `report_generator`

