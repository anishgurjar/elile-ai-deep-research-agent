import { tool } from "langchain";
import { z } from "zod";
import { ResearchToolResultSchema } from "./research/contracts";
import { stripMarkdownFences } from "../../shared/markdown";
import { getErrorMessage } from "../../shared/errors";

const ResearchAgentInputSchema = z.object({
  instructions: z
    .string()
    .min(1)
    .describe("Instructions from the orchestrator (Claude) to the research subagent"),
});

export type RunResearchAgentFn = (instructions: string) => Promise<string>;

export function createResearchAgentTool(options: {
  runResearchAgent: RunResearchAgentFn;
}) {
  const { runResearchAgent } = options;

  return tool(
    async (input: z.infer<typeof ResearchAgentInputSchema>) => {
      const output = await runResearchAgent(input.instructions);
      const cleaned = stripMarkdownFences(output);

      let parsed: z.infer<typeof ResearchToolResultSchema> | null = null;
      let parseError: string | undefined;
      try {
        parsed = ResearchToolResultSchema.parse(JSON.parse(cleaned));
      } catch (error) {
        // Validation failed — return raw output so orchestrator can still use it
        parseError = getErrorMessage(error);
      }

      return [
        parsed ? cleaned : output,
        {
          tool: "research_agent",
          instructions: input.instructions,
          ...(parsed ? { parsed } : {}),
          ...(parseError ? { parse_error: parseError } : {}),
        },
      ] as const;
    },
    {
      name: "research_agent",
      description:
        "Run a web-enabled research subagent with the provided instructions and return its final output.",
      schema: ResearchAgentInputSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
