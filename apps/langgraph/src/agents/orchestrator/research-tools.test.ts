import { describe, expect, test, vi } from "vitest";

import { createResearchTopicsTool } from "./research-tools";

describe("research-tools", () => {
  test("creates a research_topics tool", () => {
    const tool = createResearchTopicsTool({
      runResearch: async () => "ok",
    });
    expect(tool.name).toBe("research_topics");
  });

  test("runs up to 3 topics and returns combined output", async () => {
    const runResearch = vi.fn(async (topic: string) => `answer:${topic}`);

    const tool = createResearchTopicsTool({ runResearch });

    const result = await tool.invoke({
      topics: ["t1", "t2", "t3", "t4"],
    });

    expect(runResearch).toHaveBeenCalledTimes(3);
    expect(runResearch).toHaveBeenNthCalledWith(1, "t1");
    expect(runResearch).toHaveBeenNthCalledWith(2, "t2");
    expect(runResearch).toHaveBeenNthCalledWith(3, "t3");

    expect(result).toContain("t1");
    expect(result).toContain("answer:t1");
    expect(result).toContain("t2");
    expect(result).toContain("answer:t2");
    expect(result).toContain("t3");
    expect(result).toContain("answer:t3");
    expect(result).not.toContain("t4");
    expect(result).toMatch(/max 3/i);
  });
});

