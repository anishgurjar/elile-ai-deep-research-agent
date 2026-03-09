import { tool } from "langchain";
import { z } from "zod";
import {
  ingestIdentityGraphFromResearch,
  type ResearchResult,
} from "../../identity-graph/ingest-identity-graph";
import type { IngestIdentityGraphOptions } from "../../identity-graph/ingest-identity-graph";

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

type GraphFactory = () => Pick<IngestIdentityGraphOptions["graph"], "addGraphDocuments">;
type TransformerFactory = () => Pick<
  IngestIdentityGraphOptions["transformer"],
  "convertToGraphDocuments"
>;

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
      const transformer = options.createTransformer?.();

      if (!graph || !transformer) {
        return "Identity graph ingestion skipped: graph or transformer not configured.";
      }

      const result = await ingestIdentityGraphFromResearch({
        subject: input.subject,
        threadId: input.threadId,
        researchResults: input.researchResults,
        graph,
        transformer,
      });

      return `Identity graph ingestion complete: ${result.nodeCount} nodes, ${result.relationshipCount} relationships written for "${input.subject}".`;
    },
    {
      name: "identity_graph_ingest",
      description:
        "After completing research on a person, call this tool to persist the findings as an identity graph in Neo4j. Pass the subject name, thread ID, and all research results.",
      schema: IdentityGraphIngestSchema,
    },
  );
}
