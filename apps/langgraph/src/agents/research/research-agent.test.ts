import { describe, expect, test } from "vitest";

import { extractTextFromModelContent } from "./research-agent";

describe("research-agent content extraction", () => {
  test("extracts from string content", () => {
    expect(extractTextFromModelContent(" hello ")).toBe("hello");
  });

  test("extracts from array of content blocks with text", () => {
    expect(
      extractTextFromModelContent([
        { type: "output_text", text: "Line 1" },
        { type: "output_text", text: "Line 2" },
      ]),
    ).toBe("Line 1\nLine 2");
  });

  test("extracts from object with text field", () => {
    expect(extractTextFromModelContent({ text: "Hi" })).toBe("Hi");
  });

  test("returns empty string for unknown shapes", () => {
    expect(extractTextFromModelContent({ foo: "bar" })).toBe("");
    expect(extractTextFromModelContent(123)).toBe("");
  });
});

