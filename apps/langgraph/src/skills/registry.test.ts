import { describe, expect, test } from "vitest";
import { listAvailableSkills, resolveSkill, type SkillSources } from "./registry";

const sources: SkillSources = {
  global: {
    "output-contract": "# Global output-contract\n\nGlobal content here.",
    "shared-only": "# Shared only\n\nOnly in global.",
  },
  local: {
    "local-only": "# Local only\n\nOnly in local.",
    "output-contract": "# Local output-contract\n\nLocal override wins.",
  },
};

describe("resolveSkill", () => {
  test("returns local content when skill exists in both local and global", () => {
    const content = resolveSkill("output-contract", sources);
    expect(content).toMatch(/Local override wins/);
    expect(content).not.toMatch(/Global content/);
  });

  test("falls back to global when skill only exists globally", () => {
    const content = resolveSkill("shared-only", sources);
    expect(content).toMatch(/Only in global/);
  });

  test("returns local content when skill only exists locally", () => {
    const content = resolveSkill("local-only", sources);
    expect(content).toMatch(/Only in local/);
  });

  test("returns null when skill does not exist anywhere", () => {
    const content = resolveSkill("nonexistent", sources);
    expect(content).toBeNull();
  });

  test("works when local is undefined (global-only mode)", () => {
    const content = resolveSkill("shared-only", { global: sources.global });
    expect(content).toMatch(/Only in global/);
  });
});

describe("listAvailableSkills", () => {
  test("returns merged list of skill names without duplicates", () => {
    const skills = listAvailableSkills(sources);
    expect(skills).toContain("output-contract");
    expect(skills).toContain("shared-only");
    expect(skills).toContain("local-only");
    expect(new Set(skills).size).toBe(skills.length);
  });

  test("works with global-only (no local)", () => {
    const skills = listAvailableSkills({ global: sources.global });
    expect(skills).toContain("output-contract");
    expect(skills).toContain("shared-only");
    expect(skills).not.toContain("local-only");
  });
});
