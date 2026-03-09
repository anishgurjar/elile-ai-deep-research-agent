import { Document } from "@langchain/core/documents";
import type { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import type { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";

export const ALLOWED_NODES = [
  "Person",
  "Organization",
  "Role",
  "Location",
  "Source",
  "Claim",
] as const;

export const ALLOWED_RELATIONSHIPS = [
  "ASSOCIATED_WITH",
  "HAS_ROLE",
  "LOCATED_IN",
  "ABOUT",
  "SUPPORTED_BY",
] as const;

export interface ResearchResult {
  text: string;
  scope?: string;
  angle?: string;
}

export interface IngestIdentityGraphOptions {
  subject: string;
  threadId: string;
  researchResults: ResearchResult[];
  graph: Pick<Neo4jGraph, "addGraphDocuments">;
  transformer: Pick<LLMGraphTransformer, "convertToGraphDocuments">;
}

/**
 * Converts research subagent outputs into LangChain Documents, runs them
 * through an LLMGraphTransformer, and writes the resulting graph documents
 * to Neo4j via addGraphDocuments().
 */
export async function ingestIdentityGraphFromResearch(
  options: IngestIdentityGraphOptions,
): Promise<{ nodeCount: number; relationshipCount: number }> {
  const { subject, threadId, researchResults, graph, transformer } = options;

  const documents = researchResults.map(
    (result, idx) =>
      new Document({
        pageContent: `Subject: ${subject}\n\n${result.text}`,
        metadata: {
          subject,
          threadId,
          scope: result.scope ?? "general",
          angle: result.angle ?? "unknown",
          chunkIndex: idx,
        },
      }),
  );

  const graphDocuments = await transformer.convertToGraphDocuments(documents);

  await graph.addGraphDocuments(graphDocuments, {
    includeSource: true,
  });

  const nodeCount = graphDocuments.reduce((sum, gd) => sum + gd.nodes.length, 0);
  const relationshipCount = graphDocuments.reduce(
    (sum, gd) => sum + gd.relationships.length,
    0,
  );

  return { nodeCount, relationshipCount };
}
