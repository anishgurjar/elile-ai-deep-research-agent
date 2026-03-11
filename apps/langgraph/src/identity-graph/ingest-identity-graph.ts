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

  const MAX_CHARS_PER_RESULT = 12_000;
  const TRANSFORM_CONCURRENCY = 4;
  const WRITE_BATCH_SIZE = 3;

  const documents: Document[] = researchResults.map((result, idx) => {
    const text = result.text ?? "";
    return new Document({
      pageContent: `Subject: ${subject}\n\n${text.slice(0, MAX_CHARS_PER_RESULT)}`,
      metadata: {
        subject,
        threadId,
        scope: result.scope ?? "general",
        angle: result.angle ?? "unknown",
        chunkIndex: idx,
        truncated: text.length > MAX_CHARS_PER_RESULT,
      },
    });
  });

  const graphDocuments: Awaited<
    ReturnType<typeof transformer.convertToGraphDocuments>
  > = [];

  // Convert concurrently (bounded) to reduce perceived wall-clock time.
  for (let i = 0; i < documents.length; i += TRANSFORM_CONCURRENCY) {
    const window = documents.slice(i, i + TRANSFORM_CONCURRENCY);

    const convertedLists = await Promise.all(
      window.map(async (doc) => transformer.convertToGraphDocuments([doc])),
    );
    for (const converted of convertedLists) {
      graphDocuments.push(...converted);
    }
  }

  normalizeGraphDocuments(graphDocuments, schema);

  for (let i = 0; i < graphDocuments.length; i += WRITE_BATCH_SIZE) {
    const batch = graphDocuments.slice(i, i + WRITE_BATCH_SIZE);
    await graph.addGraphDocuments(batch, { includeSource: true });
  }

  const nodeCount = graphDocuments.reduce((sum, gd) => sum + gd.nodes.length, 0);
  const relationshipCount = graphDocuments.reduce(
    (sum, gd) => sum + gd.relationships.length,
    0,
  );

  return { nodeCount, relationshipCount };
}
