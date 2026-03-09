import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";
import { createOrchestratorModel } from "./graph.model";
import { createResearchAgentTool } from "../research-tools";
import { createIdentityGraphIngestTool } from "../identity-graph-tools";
import { runResearchAgent } from "../../research/research-agent";
import { createNeo4jGraph } from "../../../identity-graph/neo4j-graph";
import {
  ALLOWED_NODES,
  ALLOWED_RELATIONSHIPS,
} from "../../../identity-graph/ingest-identity-graph";

const researchAgentTool = createResearchAgentTool({
  runResearchAgent: runResearchAgent,
});

const identityGraphIngestTool = createIdentityGraphIngestTool({
  createGraph: () => createNeo4jGraph(),
  createTransformer: () =>
    new LLMGraphTransformer({
      llm: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 }),
      allowedNodes: [...ALLOWED_NODES],
      allowedRelationships: [...ALLOWED_RELATIONSHIPS],
      strictMode: true,
    }),
});

const agent = createAgent({
  model: createOrchestratorModel(),
  tools: [researchAgentTool, identityGraphIngestTool],
  systemPrompt: prompt,
  middleware: [skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
