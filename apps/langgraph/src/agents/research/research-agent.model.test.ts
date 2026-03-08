import { describe, expect, test } from "vitest";
import { getResearchModelNameForTest } from "./research-agent";

describe("research agent model config", () => {
  test("defaults to GPT 5.2", () => {
    expect(getResearchModelNameForTest()).toBe("gpt-5.2");
  });
});
