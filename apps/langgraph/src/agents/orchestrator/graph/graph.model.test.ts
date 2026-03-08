import { describe, it, expect } from "vitest";
import { createOrchestratorModel } from "./graph.model";

describe("Orchestrator reasoning model config", () => {
  it("uses Claude Sonnet 4.6 with extended thinking enabled", () => {
    const model = createOrchestratorModel();

    expect(model.model).toContain("claude-sonnet-4-6");
    expect(model.streaming).toBe(true);
    expect(model.thinking).toEqual({
      type: "enabled",
      budget_tokens: 5000,
    });
  });
});
