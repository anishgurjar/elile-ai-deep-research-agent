import { describe, expect, test, vi } from "vitest";

import { createResearchAgentTool } from "./research-tools";

describe("research-tools", () => {
  test("creates a research_agent tool", () => {
    const tool = createResearchAgentTool({
      runResearchAgent: async () => "ok",
    });
    expect(tool.name).toBe("research_agent");
  });

  test("forwards Claude instructions and returns subagent output", async () => {
    const runResearchAgent = vi.fn(
      async (instructions: string) => `done:${instructions}`,
    );

    const tool = createResearchAgentTool({ runResearchAgent });

    const result = await tool.invoke({
      instructions: "research X and return sources",
    });

    expect(runResearchAgent).toHaveBeenCalledTimes(1);
    expect(runResearchAgent).toHaveBeenCalledWith("research X and return sources");

    // Tool content is the subagent output (so the supervisor sees it).
    // Note: when invoked directly, the tool returns just content.
    expect(result).toBe("done:research X and return sources");
  });
});

