import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { prompt } from "../prompt";
import { skillMiddleware } from "../skills/middleware";
import { createOrchestratorModel } from "./graph.model";
import { createResearchAgentTool } from "../research-tools";
import {
  createIdentityGraphIngestTool,
  createIdentityGraphReadTool,
  createGraphCypherChain,
} from "../../../shared-tools/identity-graph";
import { runResearchAgent } from "../../research/research-agent";
import { createNeo4jGraph } from "../../../identity-graph/neo4j-graph";
import { createNeo4jReadonlyGraph } from "../../../identity-graph/neo4j-readonly-graph";
import { fetchExistingSchema, buildSchemaAwarePrompt } from "../../../identity-graph/schema";

const researchAgentTool = createResearchAgentTool({
  runResearchAgent: runResearchAgent,
});

const identityGraphIngestTool = createIdentityGraphIngestTool({
  createGraph: () => createNeo4jGraph(),
  createTransformer: async (graph) => {
    const schema = await fetchExistingSchema(graph);
    return new LLMGraphTransformer({
      llm: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0, streaming: false }),
      prompt: buildSchemaAwarePrompt(schema),
      strictMode: false,
    });
  },
});

const identityGraphReadTool = createIdentityGraphReadTool({
  createChain: async () => {
    const graph = createNeo4jReadonlyGraph();
    return createGraphCypherChain({
      graph,
      llm: new ChatOpenAI({ model: "gpt-5o-mini", temperature: 0, streaming: false }),
    });
  },
});

const agent = createAgent({
  model: createOrchestratorModel(),
  tools: [researchAgentTool, identityGraphReadTool, identityGraphIngestTool],
  systemPrompt: prompt,
  middleware: [skillMiddleware],
  name: "ELILEAI_Orchestrator_Agent",
});

export const graph = agent.graph;
