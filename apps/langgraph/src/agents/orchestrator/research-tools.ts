import { tool } from "langchain";
import { z } from "zod";

const ResearchTopicsInputSchema = z.object({
  topics: z
    .array(z.string().min(1))
    .min(1)
    .describe("Research topics (each will be researched independently)"),
});

export type RunResearchFn = (topic: string) => Promise<string>;

export function createResearchTopicsTool(options: { runResearch: RunResearchFn }) {
  const { runResearch } = options;

  return tool(
    async (input: z.infer<typeof ResearchTopicsInputSchema>) => {
      const maxTopics = 3;
      const topics = input.topics.slice(0, maxTopics);
      const truncatedCount = input.topics.length - topics.length;

      const results = await Promise.all(
        topics.map(async (topic) => ({
          topic,
          answer: await runResearch(topic),
        })),
      );

      const parts: string[] = [];
      if (truncatedCount > 0) {
        parts.push(
          `Note: limited to max ${maxTopics} topics per call (skipped ${truncatedCount}).`,
        );
      }

      for (const r of results) {
        parts.push(`\n## ${r.topic}\n\n${r.answer}`.trim());
      }

      return parts.join("\n\n").trim();
    },
    {
      name: "research_topics",
      description:
        "Run web research on up to 3 independent topics in parallel (fan-out workers) and return consolidated findings.",
      schema: ResearchTopicsInputSchema,
    },
  );
}

