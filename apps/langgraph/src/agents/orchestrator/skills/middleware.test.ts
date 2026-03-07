import { describe, expect, test } from "vitest";
import { skillMiddleware } from "./middleware";
import { SKILL_CATALOG } from "./config";

describe("orchestrator skillMiddleware", () => {
  test("is defined with the standard name", () => {
    expect(skillMiddleware).toBeDefined();
    expect(skillMiddleware.name).toBe("skillsMiddleware");
  });

  test("registers the load_skill tool", () => {
    const toolNames = skillMiddleware.tools!.map((t) => t.name);
    expect(toolNames).toContain("load_skill");
  });

  test("can load all cataloged skills (local + global)", async () => {
    const loadSkillTool = skillMiddleware.tools!.find(
      (t) => t.name === "load_skill",
    );
    expect(loadSkillTool).toBeDefined();

    for (const skill of SKILL_CATALOG) {
      const result = await loadSkillTool!.invoke({ skillName: skill.name });
      expect(result).toMatch(new RegExp(`Loaded skill: ${skill.name}`, "i"));
    }
  });
});
