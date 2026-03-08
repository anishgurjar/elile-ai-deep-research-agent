import { createAgent } from "langchain";
import { ChatOpenAI, tools as openaiTools } from "@langchain/openai";

const researchPrompt = `
# ELILEAI Research Agent

## Mission
You are a specialist research subagent. You can use OpenAI's native web search tool to find up-to-date information.

## Output requirements (STRICT)
- Return a concise, structured answer.
- Include a short "Sources" section with the most relevant links (URLs) you used.
- If the question is ambiguous, state assumptions briefly rather than asking follow-ups.
- The supervisor only sees your final message, so include the actual findings in your final output.
`.trim();

const modelName = process.env.ELILEAI_RESEARCH_MODEL ?? "gpt-4.1";

const agent = createAgent({
  model: new ChatOpenAI({ model: modelName }),
  tools: [openaiTools.webSearch()],
  systemPrompt: researchPrompt,
  name: "ELILEAI_Research_Agent",
});

export async function runResearchTopic(topic: string): Promise<string> {
  const state = await agent.invoke({
    messages: [{ role: "user", content: topic }],
  });

  const messages = state?.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const text = last?.content?.toString().trim();
  return text && text.length > 0 ? text : "";
}

