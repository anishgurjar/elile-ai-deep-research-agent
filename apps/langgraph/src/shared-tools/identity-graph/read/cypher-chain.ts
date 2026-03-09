import { PromptTemplate } from "@langchain/core/prompts";
import { GraphCypherQAChain } from "@langchain/community/chains/graph_qa/cypher";
import type { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import type { BaseLanguageModelInterface } from "@langchain/core/language_models/base";

export interface ChainLike {
  invoke(input: Record<string, string>): Promise<Record<string, unknown>>;
}

export interface CreateGraphCypherChainOptions {
  graph: Neo4jGraph;
  llm: BaseLanguageModelInterface;
}

export const IDENTITY_GRAPH_CYPHER_PROMPT = new PromptTemplate({
  template: `Task: Generate a Cypher statement to query a Neo4j identity graph about people.

This is a knowledge graph where Person nodes are connected to other entities
(Organization, Role, Location, Education, Award, Event, Claim, Source, etc.)
via typed relationships (e.g. HAS_ROLE, LOCATED_IN, ASSOCIATED_WITH, FOUNDED_BY).

Instructions:
- Use ONLY the node labels, relationship types, and properties shown in the schema.
- To retrieve everything known about a person, use this pattern to get ALL connected data with full properties:
    MATCH (p:Person)
    WHERE toLower(p.id) CONTAINS toLower('<name>')
    OPTIONAL MATCH (p)-[r]->(related)
    RETURN p AS person,
           collect(DISTINCT {{relationship: type(r), relatedType: labels(related), relatedNode: properties(related)}}) AS connections
- For targeted questions (e.g. "where does X work?"), match the specific relationship/node type but still return properties(node) to get all stored fields.
- Always use properties() to return ALL stored fields on nodes, not just the node reference.
- Use case-insensitive matching for names: toLower() or CONTAINS.
- Do NOT use UNION, CALL, or subqueries.
- If the schema is empty (no node labels), return: MATCH (n) RETURN 'No data in graph yet' AS result LIMIT 1
- Return ONLY the Cypher statement, no explanations.

Schema:
{schema}

Question:
{question}`,
  inputVariables: ["schema", "question"],
});

/**
 * Builds a GraphCypherQAChain configured for read-only identity graph queries.
 * Calls graph.refreshSchema() so the LLM knows the current graph structure.
 * Uses returnDirect so raw Neo4j results go straight to the orchestrator
 * without a lossy QA summarization step.
 */
export async function createGraphCypherChain(
  opts: CreateGraphCypherChainOptions,
): Promise<ChainLike> {
  await opts.graph.refreshSchema();
  return GraphCypherQAChain.fromLLM({
    graph: opts.graph,
    llm: opts.llm,
    cypherPrompt: IDENTITY_GRAPH_CYPHER_PROMPT,
    returnDirect: true,
    returnIntermediateSteps: true,
  });
}
