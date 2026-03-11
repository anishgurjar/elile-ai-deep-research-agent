import { ChatOpenAI } from "@langchain/openai";
import { LLMGraphTransformer } from "@langchain/community/experimental/graph_transformers/llm";
import { createResearchAgentTool } from "../research-tools";
import { createPlannerAgentTool } from "../planner-tools";
import { createReportGeneratorTool } from "../report-generator-tools";
import {
  createIdentityGraphIngestTool,
  createIdentityGraphReadTool,
} from "../../../shared-tools/identity-graph";
import { runResearchAgent } from "../../research/research-agent";
import { runPlannerAgent } from "../../planner/planner-agent";
import { runReportGeneratorAgent } from "../../report-generator/report-generator-agent";
import { createNeo4jGraph } from "../../../identity-graph/neo4j-graph";
import { createNeo4jReadonlyGraph } from "../../../identity-graph/neo4j-readonly-graph";
import {
  fetchExistingSchema,
  buildSchemaAwarePrompt,
} from "../../../identity-graph/schema";

export const researchAgentTool = createResearchAgentTool({
  runResearchAgent,
});

export const plannerAgentTool = createPlannerAgentTool({
  runPlannerAgent,
});

export const reportGeneratorTool = createReportGeneratorTool({
  runReportGeneratorAgent,
});

export const identityGraphIngestTool = createIdentityGraphIngestTool({
  createGraph: () => createNeo4jGraph(),
  createTransformer: async (graph) => {
    const schema = await fetchExistingSchema(graph);
    return new LLMGraphTransformer({
      llm: new ChatOpenAI({
        model: "gpt-4o-mini",
        streaming: false,
      }),
      prompt: buildSchemaAwarePrompt(schema),
      strictMode: false,
    });
  },
});

export const identityGraphReadTool = createIdentityGraphReadTool({
  createGraph: () => createNeo4jReadonlyGraph(),
});

export const orchestratorTools = [
  researchAgentTool,
  identityGraphReadTool,
  identityGraphIngestTool,
  plannerAgentTool,
  reportGeneratorTool,
];
