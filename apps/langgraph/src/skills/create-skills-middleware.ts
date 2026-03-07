import { createMiddleware } from "langchain";
import type { StructuredTool } from "@langchain/core/tools";
import type { Skill } from "./types";

export interface SkillsMiddlewareOptions {
  catalog: Skill[];
  rulesText: string;
  loadSkillTool: StructuredTool;
}

export function createSkillsMiddleware({
  catalog,
  rulesText,
  loadSkillTool,
}: SkillsMiddlewareOptions) {
  const skillsList = catalog
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join("\n");

  return createMiddleware({
    name: "skillsMiddleware",
    tools: [loadSkillTool],
    wrapModelCall: async (request, handler) => {
      const addendum = `

## Available Skills (progressive disclosure)
You have specialized skills. Use **load_skill** to load them on-demand.

${skillsList}

### Skill-loading rules (STRICT)
${rulesText}`;

      return handler({
        ...request,
        systemMessage: request.systemMessage.concat(addendum),
      });
    },
  });
}
