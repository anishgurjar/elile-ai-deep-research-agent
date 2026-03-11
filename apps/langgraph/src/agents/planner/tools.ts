import { tools as anthropicTools } from "@langchain/anthropic";
import {
  createIdentityGraphReadTool,
} from "../../shared-tools/identity-graph";
import { createNeo4jReadonlyGraph } from "../../identity-graph/neo4j-readonly-graph";

export const webSearchTool = anthropicTools.webSearch_20250305();

export const identityGraphReadTool = createIdentityGraphReadTool({
  createGraph: () => createNeo4jReadonlyGraph(),
});

export const plannerTools = [identityGraphReadTool, webSearchTool];
