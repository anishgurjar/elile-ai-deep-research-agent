import { tool } from "langchain";
import { z } from "zod";

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
      // Return the subagent's output as tool content so the supervisor (Claude)
      // can use it in its context window. The UI renders the output from the
      // artifact in the separate subagent panel.
      return [
        output,
        {
          tool: "research_agent",
          instructions: input.instructions,
          output,
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

