import { describe, expect, test } from "vitest";
import { prompt } from "./prompt";

describe("report generator prompt", () => {
  test("requires citation-heavy output and disallows invented sources", () => {
    expect(prompt).toMatch(/citation-heavy/i);
    expect(prompt).toMatch(/Return ONLY valid JSON/i);
    expect(prompt).toMatch(/Do NOT invent URLs/i);
    expect(prompt).toMatch(/Every fact MUST include/i);
  });
});

