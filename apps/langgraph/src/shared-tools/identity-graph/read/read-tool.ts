import { tool } from "langchain";
import { z } from "zod";
import type { ChainLike } from "./cypher-chain";

const IdentityGraphReadSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      "Natural-language question about what is already known in the identity graph",
    ),
  subject: z.string().min(1).describe("The person's name being queried"),
  threadId: z.string().min(1).describe("The current thread/conversation ID"),
});

export type IdentityGraphReadInput = z.infer<typeof IdentityGraphReadSchema>;

export interface CreateIdentityGraphReadToolOptions {
  createChain?: () => ChainLike | Promise<ChainLike>;
}

export function createIdentityGraphReadTool(
  options: CreateIdentityGraphReadToolOptions = {},
) {
  return tool(
    async (input: IdentityGraphReadInput) => {
      if (!options.createChain) {
        return [
          "Identity graph read skipped: chain not configured.",
          {
            tool: "identity_graph_read",
            skipped: true,
            subject: input.subject,
          },
        ] as const;
      }

      let chain: ChainLike;
      try {
        chain = await options.createChain();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return [
          `Identity graph read failed during setup: ${msg}`,
          { tool: "identity_graph_read", error: msg, subject: input.subject },
        ] as const;
      }

      let result: Record<string, unknown>;
      try {
        const query = `${input.question}\n\nSubject: ${input.subject}`;
        result = await chain.invoke({ query });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return [
          `Identity graph query failed: ${msg}. The graph may be empty or the generated Cypher was invalid. Proceed with web research instead.`,
          { tool: "identity_graph_read", error: msg, subject: input.subject },
        ] as const;
      } finally {
        try {
          await chain.close?.();
        } catch {
          // Best-effort cleanup — do not fail the tool output.
        }
      }

      const rawResult = result.result;
      const answer = typeof rawResult === "string"
        ? rawResult
        : JSON.stringify(rawResult, null, 2);
      const intermediateSteps = result.intermediateSteps as
        | Array<Record<string, unknown>>
        | undefined;

      const cypher =
        intermediateSteps?.[0]?.query ??
        "no cypher returned";

      const isEmpty = !rawResult
        || (Array.isArray(rawResult) && rawResult.length === 0)
        || answer.includes("No data in graph");

      const content = isEmpty
        ? `No existing knowledge found for "${input.subject}" in the identity graph. Proceed with web research.`
        : `Graph knowledge for "${input.subject}" (raw data from Neo4j):\n${answer}`;

      return [
        content,
        {
          tool: "identity_graph_read",
          subject: input.subject,
          threadId: input.threadId,
          cypher,
          note: "Read-only — enforced by Neo4j DB role (idgraph_readonly)",
        },
      ] as const;
    },
    {
      name: "identity_graph_read",
      description:
        "Query the identity graph to find what is already known about a person BEFORE doing new web research. Uses a read-only Neo4j connection. Pass a natural-language question, the subject name, and thread ID.",
      schema: IdentityGraphReadSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
