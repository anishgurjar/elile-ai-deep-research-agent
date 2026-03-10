import { tool } from "langchain";
import { z } from "zod";
import {
  ingestIdentityGraphFromResearch,
} from "../../../identity-graph/ingest-identity-graph";
import type { IngestIdentityGraphOptions } from "../../../identity-graph/ingest-identity-graph";

const ResearchResultItemSchema = z.object({
  text: z.string().describe("The research subagent's text output for this topic"),
  scope: z.string().optional().describe("Research scope (e.g. 'identity', 'career')"),
  angle: z.string().optional().describe("Research angle (e.g. 'Identity confirmation')"),
});

const IdentityGraphIngestSchema = z.object({
  subject: z.string().min(1).describe("The person's name being researched"),
  threadId: z.string().min(1).describe("The current thread/conversation ID"),
  researchResults: z
    .array(ResearchResultItemSchema)
    .min(1)
    .describe("Array of research results from subagent calls"),
});

export type IdentityGraphIngestInput = z.infer<typeof IdentityGraphIngestSchema>;

type GraphInstance = IngestIdentityGraphOptions["graph"];
type TransformerInstance = IngestIdentityGraphOptions["transformer"];

type GraphFactory = () => GraphInstance;
type TransformerFactory = (graph: GraphInstance) => TransformerInstance | Promise<TransformerInstance>;

export interface CreateIdentityGraphIngestToolOptions {
  createGraph?: GraphFactory;
  createTransformer?: TransformerFactory;
}

export function createIdentityGraphIngestTool(
  options: CreateIdentityGraphIngestToolOptions = {},
) {
  return tool(
    async (input: IdentityGraphIngestInput) => {
      const graph = options.createGraph?.();
      if (!graph || !options.createTransformer) {
        return [
          "Identity graph ingestion skipped: graph or transformer not configured.",
          { tool: "identity_graph_ingest", skipped: true },
        ] as const;
      }

      try {
        const transformer = await options.createTransformer(graph);

        const result = await ingestIdentityGraphFromResearch({
          subject: input.subject,
          threadId: input.threadId,
          researchResults: input.researchResults,
          graph,
          transformer,
        });

        const content = `Identity graph ingestion complete: ${result.nodeCount} nodes, ${result.relationshipCount} relationships written for "${input.subject}".`;

        return [
          content,
          {
            tool: "identity_graph_ingest",
            subject: input.subject,
            nodeCount: result.nodeCount,
            relationshipCount: result.relationshipCount,
          },
        ] as const;
      } finally {
        const maybeClose = (graph as unknown as { close?: () => Promise<void> | void }).close;
        if (typeof maybeClose === "function") {
          try {
            await maybeClose();
          } catch {
            // Best-effort cleanup — do not fail the tool output.
          }
        }
      }
    },
    {
      name: "identity_graph_ingest",
      description:
        "After completing research on a person, call this tool to persist the findings as an identity graph in Neo4j. Pass the subject name, thread ID, and all research results.",
      schema: IdentityGraphIngestSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
