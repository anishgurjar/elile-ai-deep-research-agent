import { Document } from "@langchain/core/documents";
import type { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import type { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import {
  fetchExistingSchema,
  normalizeGraphDocuments,
  type ExistingSchema,
} from "./schema";

export interface ResearchResult {
  text: string;
  scope?: string;
  angle?: string;
}

export interface IngestIdentityGraphOptions {
  subject: string;
  threadId: string;
  researchResults: ResearchResult[];
  graph: Pick<Neo4jGraph, "addGraphDocuments" | "query">;
  transformer: Pick<LLMGraphTransformer, "convertToGraphDocuments">;
  /** Override for testing — skips the Neo4j schema query. */
  existingSchema?: ExistingSchema;
}

/**
 * Converts research subagent outputs into LangChain Documents, runs them
 * through an LLMGraphTransformer, normalizes the output against the
 * existing Neo4j schema (casing, dedup), and writes to Neo4j.
 */
export async function ingestIdentityGraphFromResearch(
  options: IngestIdentityGraphOptions,
): Promise<{ nodeCount: number; relationshipCount: number }> {
  const { subject, threadId, researchResults, graph, transformer } = options;

  const schema = options.existingSchema ?? await fetchExistingSchema(graph);

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

  normalizeGraphDocuments(graphDocuments, schema);

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
