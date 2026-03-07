import { tool } from "langchain";
import { z } from "zod";
import { resolveSkill, type SkillSources } from "./registry";
import type { Skill } from "./types";

const LoadSkillInputSchema = z.object({
  skillName: z.string().describe("Name of skill to load"),
});

type LoadSkillInput = z.infer<typeof LoadSkillInputSchema>;

export interface LoadSkillToolOptions {
  catalog: Skill[];
  sources: SkillSources;
}

export function createLoadSkillTool({
  catalog,
  sources,
}: LoadSkillToolOptions) {
  const catalogNames = new Set(catalog.map((s) => s.name));

  return tool(
    async (input: LoadSkillInput) => {
      const { skillName } = input;
      if (!/^[a-z0-9-]+$/.test(skillName)) {
        throw new Error(
          `Invalid skillName "${skillName}". Expected only lowercase letters, numbers, and hyphens.`,
        );
      }

      if (!catalogNames.has(skillName)) {
        const available = catalog.map((s) => s.name).join(", ");
        return `Skill '${skillName}' not found. Available skills: ${available}`;
      }

      const content = resolveSkill(skillName, sources);
      if (content === null) {
        const available = catalog.map((s) => s.name).join(", ");
        return `Skill '${skillName}' not found. Available skills: ${available}`;
      }

      return `Loaded skill: ${skillName}\n\n${content}`;
    },
    {
      name: "load_skill",
      description: `Load a specialized skill prompt on-demand.

Use this when you need detailed instructions for handling a specific
type of request. Returns the skill's full prompt and context.`,
      schema: LoadSkillInputSchema,
    },
  );
}
