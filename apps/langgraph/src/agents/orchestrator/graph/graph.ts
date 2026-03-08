import { createAgent } from "langchain";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";
import { createOrchestratorModel } from "./graph.model";
import { createResearchAgentTool } from "../research-tools";
import { runResearchAgent } from "../../research-agent";

const researchAgentTool = createResearchAgentTool({
  runResearchAgent: runResearchAgent,
});

const agent = createAgent({
  model: createOrchestratorModel(),
  tools: [researchAgentTool],
  systemPrompt: prompt,
  middleware: [skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
