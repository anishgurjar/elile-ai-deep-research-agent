import { createAgent } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { prompt } from "./prompt";
import { webSearchTool } from "./tools";

const modelName = process.env.ELILEAI_RESEARCH_MODEL ?? "claude-sonnet-4-6";

const agent = createAgent({
  // IMPORTANT: this subagent must NOT stream tokens.
  // When invoked inside a tool call, streamed tokens can leak into the
  // supervisor's main UI stream via the shared callback/stream plumbing.
  model: new ChatAnthropic({ 
    model: modelName, 
    streaming: false,
    thinking: {
      type: "enabled",
      budget_tokens: 5000,
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
          const text = rec.text;
          if (typeof text === "string") return text;
          const thinking = rec.thinking;
          if (typeof thinking === "string") return thinking;
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
