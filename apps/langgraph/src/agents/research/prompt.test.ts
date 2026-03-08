import { describe, expect, test } from "vitest";
import { prompt } from "./prompt";

describe("research prompt", () => {
  test("requires JSON-only output and 6-10 visited urls", () => {
    expect(prompt).toMatch(/Return ONLY valid JSON/i);
    expect(prompt).toMatch(/6[–-]10/);
    expect(prompt).toMatch(/visited_urls/i);
  });

  test("instructs out-of-scope leads without pursuing them", () => {
    expect(prompt).toMatch(/out_of_scope_leads/i);
    expect(prompt).toMatch(/do not pursue/i);
  });
});
