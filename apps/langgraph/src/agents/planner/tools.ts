import { ChatOpenAI } from "@langchain/openai";
import { tools as anthropicTools } from "@langchain/anthropic";
import {
  createIdentityGraphReadTool,
  createGraphCypherChain,
} from "../../shared-tools/identity-graph";
import { createNeo4jReadonlyGraph } from "../../identity-graph/neo4j-readonly-graph";

export const webSearchTool = anthropicTools.webSearch_20250305();

export const identityGraphReadTool = createIdentityGraphReadTool({
  createChain: async () => {
    const graph = createNeo4jReadonlyGraph();
    return createGraphCypherChain({
      graph,
      llm: new ChatOpenAI({
        model: "gpt-5-mini",
        streaming: false,
      }),
    });
  },
});

export const plannerTools = [identityGraphReadTool, webSearchTool];
