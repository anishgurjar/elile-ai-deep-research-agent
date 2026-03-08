import { describe, expect, test, vi } from "vitest";

import { createResearchAgentTool } from "./research-tools";

function makeValidOutput() {
  return JSON.stringify({
    thread_id: "r1:bio",
    scope: "bio",
    angle: "Identity confirmation",
    summary: "Dense paragraph summary of findings across multiple pages.",
    findings: [
      {
        claim: "Example verified claim",
        confidence: 0.5,
        sources: [{ url: "https://example.com", title: "Example" }],
      },
    ],
    out_of_scope_leads: [],
    suggested_queries: [],
    visited_urls: [
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
      "https://example.com/5",
      "https://example.com/6",
    ],
  });
}

describe("research-tools", () => {
  test("creates a research_agent tool", () => {
    const tool = createResearchAgentTool({
      runResearchAgent: async () => makeValidOutput(),
    });
    expect(tool.name).toBe("research_agent");
  });

  test("forwards instructions and returns validated output", async () => {
    const runResearchAgent = vi.fn(async () => makeValidOutput());

    const tool = createResearchAgentTool({ runResearchAgent });

    const result = await tool.invoke({
      instructions: "research X",
    });

    expect(runResearchAgent).toHaveBeenCalledTimes(1);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/"thread_id"/);
  });

  test("returns raw output when JSON is invalid instead of throwing", async () => {
    const tool = createResearchAgentTool({
      runResearchAgent: vi.fn(async () => "not json"),
    });
    const result = await tool.invoke({ instructions: "x" });
    expect(result).toBe("not json");
  });

  test("strips markdown code fences before parsing", async () => {
    const raw = makeValidOutput();
    const wrapped = "```json\n" + raw + "\n```";
    const tool = createResearchAgentTool({
      runResearchAgent: vi.fn(async () => wrapped),
    });
    const result = await tool.invoke({ instructions: "x" });
    expect(result).toMatch(/"thread_id"/);
  });
});
