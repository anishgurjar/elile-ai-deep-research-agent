import { describe, expect, test } from "vitest";

import { createSkillsMiddleware } from "./create-skills-middleware";
import { createLoadSkillTool } from "./create-load-skill-tool";
import type { Skill } from "./types";

const catalog: Skill[] = [
  { name: "alpha", description: "Alpha skill for testing" },
  { name: "beta", description: "Beta skill for testing" },
];

const rulesText = `- Before answering: load_skill("alpha")`;

const sources = {
  global: { alpha: "# Alpha" },
  local: { beta: "# Beta" },
} as const;

describe("createSkillsMiddleware", () => {
  test("returns a middleware with name 'skillsMiddleware'", () => {
    const loadSkillTool = createLoadSkillTool({ catalog, sources });
    const mw = createSkillsMiddleware({ catalog, rulesText, loadSkillTool });
    expect(mw.name).toBe("skillsMiddleware");
  });

  test("registers load_skill in the middleware tools", () => {
    const loadSkillTool = createLoadSkillTool({ catalog, sources });
    const mw = createSkillsMiddleware({ catalog, rulesText, loadSkillTool });
    const toolNames = mw.tools!.map((t) => t.name);
    expect(toolNames).toContain("load_skill");
  });

  test("the registered tool can load skills through the middleware", async () => {
    const loadSkillTool = createLoadSkillTool({ catalog, sources });
    const mw = createSkillsMiddleware({ catalog, rulesText, loadSkillTool });
    const tool = mw.tools!.find((t) => t.name === "load_skill")!;

    const alphaResult = await tool.invoke({ skillName: "alpha" });
    expect(alphaResult).toMatch(/Loaded skill: alpha/);

    const betaResult = await tool.invoke({ skillName: "beta" });
    expect(betaResult).toMatch(/Loaded skill: beta/);
  });

  test("has a wrapModelCall hook defined", () => {
    const loadSkillTool = createLoadSkillTool({ catalog, sources });
    const mw = createSkillsMiddleware({ catalog, rulesText, loadSkillTool });
    expect(mw.wrapModelCall).toBeDefined();
    expect(typeof mw.wrapModelCall).toBe("function");
  });
});
