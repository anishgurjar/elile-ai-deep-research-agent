import { describe, expect, test } from "vitest";

import { toNumericScore } from "./scoring";

describe("toNumericScore", () => {
  test("passes through numbers", () => {
    expect(toNumericScore(0)).toBe(0);
    expect(toNumericScore(0.75)).toBe(0.75);
    expect(toNumericScore(1)).toBe(1);
  });

  test("maps booleans to 1/0", () => {
    expect(toNumericScore(true)).toBe(1);
    expect(toNumericScore(false)).toBe(0);
  });

  test("throws on unsupported types", () => {
    expect(() => toNumericScore("1")).toThrow(/Unsupported score type: string/);
    expect(() => toNumericScore(null)).toThrow(/Unsupported score type/);
    expect(() => toNumericScore(undefined)).toThrow(/Unsupported score type/);
  });
});
