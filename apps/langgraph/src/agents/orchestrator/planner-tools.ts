import { tool } from "langchain";
import { z } from "zod";
import { PlannerToolResultSchema } from "../planner/contracts";

const PlannerAgentInputSchema = z.object({
  instructions: z
    .string()
    .min(1)
    .describe("Instructions from the orchestrator to the planner subagent"),
});

export type RunPlannerAgentFn = (instructions: string) => Promise<string>;

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

export function createPlannerAgentTool(options: {
  runPlannerAgent: RunPlannerAgentFn;
}) {
  const { runPlannerAgent } = options;

  return tool(
    async (input: z.infer<typeof PlannerAgentInputSchema>) => {
      const output = await runPlannerAgent(input.instructions);
      const cleaned = stripMarkdownFences(output);

      let parsed: z.infer<typeof PlannerToolResultSchema> | null = null;
      let parseError: string | undefined;
      try {
        parsed = PlannerToolResultSchema.parse(JSON.parse(cleaned));
      } catch (error) {
        // Validation failed — return raw output so orchestrator can still use it
        parseError =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message)
            : String(error);
      }

      return [
        parsed ? cleaned : output,
        {
          tool: "planner_agent",
          instructions: input.instructions,
          ...(parsed ? { output: parsed } : {}),
          ...(parseError ? { parse_error: parseError } : {}),
        },
      ] as const;
    },
    {
      name: "planner_agent",
      description:
        "Prepare a research plan for a new subject (disambiguate, ask follow-ups, or produce a 6–7 item plan) and return structured JSON.",
      schema: PlannerAgentInputSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
