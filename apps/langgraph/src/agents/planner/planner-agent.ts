import { createAgent } from "langchain";
import { prompt } from "./prompt";
import { createPlannerModel } from "./planner-agent.model";
import { plannerTools } from "./tools";
import { extractTextFromModelContent } from "../research/research-agent";

const agent = createAgent({
  model: createPlannerModel(),
  tools: plannerTools,
  systemPrompt: prompt,
  name: "ELILEAI_Planner_Agent",
});

export async function runPlannerAgent(instructions: string): Promise<string> {
  const state = await agent.invoke({
    messages: [{ role: "user", content: instructions }],
  });
  const messages = state?.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const text = extractTextFromModelContent(last?.content);
  return text && text.length > 0 ? text : "";
}
