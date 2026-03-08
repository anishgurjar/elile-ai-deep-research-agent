import { createAgent } from "langchain";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";
import { createOrchestratorModel } from "./graph.model";

const agent = createAgent({
  model: createOrchestratorModel(),
  tools: [],
  systemPrompt: prompt,
  middleware: [skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
