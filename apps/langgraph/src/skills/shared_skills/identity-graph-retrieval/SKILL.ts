const skill = `---
name: identity-graph-retrieval
description: Graph-first planning — always query the identity graph before launching web research.
---

# identity-graph-retrieval

## Overview
Before spending tokens on web research, always check what the identity graph already knows about the subject. This avoids redundant research and gives the user faster answers when existing knowledge is sufficient.

## Workflow

### Step 1: Query the graph
Call \`identity_graph_read\` with a broad question like "What do we already know about [person]?" to get a baseline.

### Step 2: Evaluate coverage
- **Full coverage** — the graph answers the user's question: summarize findings and ask:
  - "Want me to verify any of this with fresh web sources?"
  - "Want me to explore a different angle?"
- **Partial coverage** — some facts are known but gaps exist: note what's known, then call \`research_agent\` only for the gaps.
- **No coverage** — the person is new: proceed with full \`research_agent\` workflow.

### Step 3: After research, persist
After any new \`research_agent\` calls complete, call \`identity_graph_ingest\` as usual to persist the new findings.

## Rules
- \`identity_graph_read\` is **read-only**. It cannot write, update, or delete. This is enforced at the Neo4j database level via a read-only role.
- Treat graph facts as the default baseline; only research what the graph doesn't cover.
- If the user asks a question the graph already answers, prefer the graph answer over launching new research (saves time and cost).
- Always attribute graph-sourced facts clearly: "Based on existing knowledge in the identity graph..."
`;

export default skill;
