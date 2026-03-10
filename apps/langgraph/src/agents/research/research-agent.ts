import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { prompt } from "./prompt";
import { webSearchTool } from "./tools";

const modelName = process.env.ELILEAI_RESEARCH_MODEL ?? "gpt-5-mini";

const agent = createAgent({
  model: new ChatOpenAI({
    model: modelName,
    streaming: false,
    reasoning: {
      effort: "low",
      summary: "auto",
    },
  }),
  tools: [webSearchTool],
  systemPrompt: prompt,
  name: "ELILEAI_Research_Agent",
});

export function extractTextFromModelContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (part == null) return "";
        if (typeof part === "string") return part;
        if (typeof part === "object") {
          const rec = part as Record<string, unknown>;
          if (rec.type === "thinking") return "";
          const text = rec.text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .filter((s) => s.trim().length > 0);
    return parts.join("\n").trim();
  }

  if (typeof content === "object") {
    const rec = content as Record<string, unknown>;
    if (typeof rec.text === "string") return rec.text.trim();
    if (typeof rec.content === "string") return rec.content.trim();
  }

  return "";
}

export async function runResearchTopic(topic: string): Promise<string> {
  const state = await agent.invoke({
    messages: [{ role: "user", content: topic }],
  });

  const messages = state?.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const text = extractTextFromModelContent(last?.content);
  return text && text.length > 0 ? text : "";
}

export async function runResearchAgent(instructions: string): Promise<string> {
  return runResearchTopic(instructions);
}

export function getResearchModelNameForTest() {
  return modelName;
}
