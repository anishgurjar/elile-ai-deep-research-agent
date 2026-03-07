import { describe, expect, test } from "vitest";

import { createLoadSkillTool } from "./create-load-skill-tool";
import type { Skill } from "./types";

const catalog: Skill[] = [
  { name: "global-skill", description: "A global skill" },
  { name: "local-skill", description: "A local skill" },
  { name: "overridden", description: "Exists in both, local wins" },
];

const sources = {
  global: {
    "global-skill": "# Global skill content",
    overridden: "# Global version of overridden",
  },
  local: {
    "local-skill": "# Local skill content",
    overridden: "# Local override wins",
  },
} as const;

describe("createLoadSkillTool", () => {
  test("returns a tool named load_skill", () => {
    const tool = createLoadSkillTool({ catalog, sources });
    expect(tool.name).toBe("load_skill");
  });

  test("loads a global-only skill", async () => {
    const tool = createLoadSkillTool({ catalog, sources });
    const result = await tool.invoke({ skillName: "global-skill" });
    expect(result).toMatch(/Loaded skill: global-skill/);
    expect(result).toMatch(/Global skill content/);
  });

  test("loads a local-only skill", async () => {
    const tool = createLoadSkillTool({ catalog, sources });
    const result = await tool.invoke({ skillName: "local-skill" });
    expect(result).toMatch(/Loaded skill: local-skill/);
    expect(result).toMatch(/Local skill content/);
  });

  test("local overrides global when both exist", async () => {
    const tool = createLoadSkillTool({ catalog, sources });
    const result = await tool.invoke({ skillName: "overridden" });
    expect(result).toMatch(/Local override wins/);
    expect(result).not.toMatch(/Global version/);
  });

  test("rejects path traversal characters", async () => {
    const tool = createLoadSkillTool({ catalog, sources });
    await expect(
      tool.invoke({ skillName: "../etc/passwd" }),
    ).rejects.toThrow(/Invalid skillName/i);
  });

  test("returns not-found for skill not in catalog", async () => {
    const tool = createLoadSkillTool({ catalog, sources });
    const result = await tool.invoke({ skillName: "unknown" });
    expect(result).toMatch(/not found/i);
    expect(result).toMatch(/Available skills/i);
  });

  test("works without local (global-only)", async () => {
    const tool = createLoadSkillTool({ catalog, sources: { global: sources.global } });
    const result = await tool.invoke({ skillName: "global-skill" });
    expect(result).toMatch(/Global skill content/);
  });
});
