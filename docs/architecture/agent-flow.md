# Agent Flow

This document describes the end-to-end flow used by the `langgraph` orchestrator when performing deep research on a person.

## Sequence (happy path)

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
  Planner-->>LG: JSON plan

  LG->>Read: Query graph knowledge (read-only)
  Read-->>LG: Existing knowledge / gaps

  par 3–4 scoped calls
    LG->>Research: Scope A
    LG->>Research: Scope B
    LG->>Research: Scope C
  end
  Research-->>LG: Findings JSON

  LG->>Ingest: Persist research results into Neo4j
  Ingest-->>LG: Write counts (nodes/edges)

  LG->>Report: Generate final report (markdown + citations)
  Report-->>LG: Markdown report
  LG-->>UI: Final answer
```

## Control-flow (ready vs follow-ups)

```mermaid
flowchart TD
  Q["User asks about a person"] --> P[planner_agent]
  P --> S{status == ready?}

  S -- No --> Ask["Ask follow-ups\npresent candidates"]
  Ask --> Q2["User clarifies"]
  Q2 --> P

  S -- Yes --> G[identity_graph_read]
  G --> Hit{Graph has enough?}
  Hit -- Yes --> A1["Answer from graph knowledge"]
  Hit -- No --> R["research_agent\n3-4 parallel scopes"]
  R --> I[identity_graph_ingest]
  I --> RG[report_generator]
  RG --> A2[Final report]
```

## Sub-agent search strategy

The orchestrator treats web research as expensive and fallible. The planner decomposes the task into **multiple distinct scopes** (e.g. identity confirmation, career, affiliations, adverse media), then the orchestrator runs those scopes in parallel. The final report is generated only after:

- facts have been consolidated and scored deterministically
- results have been persisted to the identity graph

This keeps the workflow reproducible and makes follow-up questions cheaper over time.

