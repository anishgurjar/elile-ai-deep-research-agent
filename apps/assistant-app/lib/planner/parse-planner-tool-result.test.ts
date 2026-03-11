import { describe, it, expect } from "vitest";
import { parsePlannerToolResult } from "./parse-planner-tool-result";

const validPlan = {
  subject: "Jane Doe",
  status: "ready",
  goals: [{ key: "identity", title: "Identity", why: "Confirm." }],
  seed_scopes: [{ scope: "identity", angle: "Confirm identity" }],
  questions: [],
  candidates: [],
};

describe("parsePlannerToolResult", () => {
  it("parses valid JSON string", () => {
    const parsed = parsePlannerToolResult(JSON.stringify(validPlan));
    expect(parsed?.subject).toBe("Jane Doe");
    expect(parsed?.status).toBe("ready");
  });

  it("returns null for non-JSON", () => {
    expect(parsePlannerToolResult("not json")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parsePlannerToolResult(42)).toBeNull();
    expect(parsePlannerToolResult(null)).toBeNull();
    expect(parsePlannerToolResult(undefined)).toBeNull();
  });

  it("returns null for object missing required fields", () => {
    expect(parsePlannerToolResult(JSON.stringify({ subject: "x" }))).toBeNull();
  });

  it("accepts a plain object (already-parsed artifact output)", () => {
    const parsed = parsePlannerToolResult(validPlan);
    expect(parsed?.subject).toBe("Jane Doe");
    expect(parsed?.goals).toHaveLength(1);
  });

  it("extracts JSON from markdown code fences", () => {
    const wrapped =
      "Here is the plan:\n```json\n" +
      JSON.stringify(validPlan) +
      "\n```\nDone.";
    const parsed = parsePlannerToolResult(wrapped);
    expect(parsed?.subject).toBe("Jane Doe");
  });

  it("extracts JSON from a string with surrounding text", () => {
    const messy =
      "I analyzed the request. " + JSON.stringify(validPlan) + " Let me know.";
    const parsed = parsePlannerToolResult(messy);
    expect(parsed?.subject).toBe("Jane Doe");
  });

  it("returns null for empty string", () => {
    expect(parsePlannerToolResult("")).toBeNull();
  });
});
