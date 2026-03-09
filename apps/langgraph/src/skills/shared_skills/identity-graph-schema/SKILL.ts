const skill = `---
name: identity-graph-schema
description: Conventions for the identity graph — how entities and relationships are named, cased, and deduplicated when persisting research to Neo4j.
---

# identity-graph-schema

## Overview
When you call \`identity_graph_ingest\`, the system extracts entities and relationships from your research results and writes them to Neo4j. This skill documents the conventions the system enforces so you can structure your research output accordingly.

## How the Graph Grows
- Before extraction, the system queries Neo4j for **existing node labels and relationship types**.
- The LLM extractor is told to **reuse existing types** whenever they fit.
- If a genuinely new type is needed, it is allowed — but must follow casing conventions.
- After extraction, all types are **post-processed** to normalize casing and match existing schema.

## Casing Conventions (non-negotiable)

### Node Labels: PascalCase
- \`Person\`, \`Organization\`, \`Role\`, \`Location\`, \`Event\`, \`Award\`
- NOT: \`person\`, \`PERSON\`, \`Social_Media\`

### Relationship Types: UPPER_SNAKE_CASE
- \`ASSOCIATED_WITH\`, \`HAS_ROLE\`, \`LOCATED_IN\`, \`FOUNDED_BY\`
- NOT: \`associated_with\`, \`AssociatedWith\`, \`has role\`

## Deduplication Rules
- Nodes are merged by **(label, id)**. Two nodes with the same id and label become one.
- Always use the **most complete human-readable name** as the node id (e.g. "John Doe" not "John" or "JD").
- If a person is mentioned by multiple names or pronouns, use the **canonical full name** everywhere.

## When You Pass Research Results
Structure each result with:
- \`text\`: the subagent's full text output (this is what gets entity-extracted)
- \`scope\` (optional): e.g. "identity", "career", "education"
- \`angle\` (optional): e.g. "Background check", "Professional history"

The more structured and factual the text, the better the extraction quality. Avoid speculation or hedging language — if the subagent found it, state it clearly.

## Core Entity Types (commonly used, not exhaustive)
| Label | Use for |
|-------|---------|
| Person | Any individual being researched |
| Organization | Companies, universities, agencies, NGOs |
| Role | Job titles, positions, functions |
| Location | Cities, countries, regions, addresses |
| Source | URLs or publications that back up claims |
| Claim | Specific assertions with provenance |
| Event | Conferences, incidents, milestones |
| Award | Honors, certifications, recognitions |
| Education | Degrees, programs, institutions attended |

You are NOT limited to these — the system allows new types if nothing above fits.
`;

export default skill;
