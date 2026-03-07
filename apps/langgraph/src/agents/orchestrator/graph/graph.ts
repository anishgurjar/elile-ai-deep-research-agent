import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";

const agent = createAgent({
  model: new ChatOpenAI({ model: "gpt-5.2" }),
  tools: [],
  systemPrompt: prompt,
  middleware: [skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
