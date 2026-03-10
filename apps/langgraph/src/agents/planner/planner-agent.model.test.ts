import { describe, it, expect } from "vitest";
import { createPlannerModel } from "./planner-agent.model";

describe("Planner model config", () => {
  it("uses Claude Sonnet 4.6 with thinking enabled", () => {
    const model = createPlannerModel();
    expect(model.model).toContain("claude-sonnet-4-6");
    expect(model.streaming).toBe(false);
    expect(model.thinking).toEqual({ type: "enabled", budget_tokens: 3000 });
  });
});
