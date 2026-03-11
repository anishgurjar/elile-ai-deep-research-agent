import { createAgent } from "langchain";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";
import { interruptMessageMiddleware } from "../middleware/interrupt-message-middleware";
import { createOrchestratorModel } from "./graph.model";
import { orchestratorTools } from "./tools";

const agent = createAgent({
  model: createOrchestratorModel(),
  tools: orchestratorTools,
  systemPrompt: prompt,
  middleware: [interruptMessageMiddleware, skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
