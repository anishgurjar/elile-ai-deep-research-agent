import { describe, expect, test, vi } from "vitest";
import { createPlannerAgentTool } from "./planner-tools";

function makeValidPlannerOutput() {
  return JSON.stringify({
    subject: "Jane Doe",
    status: "ready",
    goals: [{ key: "identity", title: "Identity", why: "Confirm person." }],
    seed_scopes: [{ scope: "identity", angle: "Confirm identity" }],
    questions: [],
    candidates: [],
  });
}

describe("planner-tools", () => {
  test("creates a planner_agent tool", () => {
    const tool = createPlannerAgentTool({
      runPlannerAgent: async () => makeValidPlannerOutput(),
    });
    expect(tool.name).toBe("planner_agent");
  });

  test("forwards instructions and returns validated output", async () => {
    const runPlannerAgent = vi.fn(async () => makeValidPlannerOutput());

    const tool = createPlannerAgentTool({ runPlannerAgent });

    const result = await tool.invoke({
      instructions: "plan research on Jane Doe",
    });

    expect(runPlannerAgent).toHaveBeenCalledTimes(1);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/"subject"/);
    expect(result).toMatch(/"Jane Doe"/);
  });

  test("returns raw output when JSON is invalid instead of throwing", async () => {
    const tool = createPlannerAgentTool({
      runPlannerAgent: vi.fn(async () => "not json"),
    });
    const result = await tool.invoke({ instructions: "x" });
    expect(result).toBe("not json");
  });

  test("strips markdown code fences before parsing", async () => {
    const raw = makeValidPlannerOutput();
    const wrapped = "```json\n" + raw + "\n```";
    const tool = createPlannerAgentTool({
      runPlannerAgent: vi.fn(async () => wrapped),
    });
    const result = await tool.invoke({ instructions: "x" });
    expect(result).toMatch(/"subject"/);
  });
});
