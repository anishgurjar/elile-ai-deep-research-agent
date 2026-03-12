import { describe, expect, test } from "vitest";
import { createExperimentNameUTC } from "./experiment";

describe("createExperimentNameUTC", () => {
  test("includes prefix, ISO-ish timestamp (sanitized), and a short nonce", () => {
    const name = createExperimentNameUTC("dev");
    expect(name.startsWith("dev_")).toBe(true);
    expect(name.split("_").length).toBeGreaterThanOrEqual(3);
    expect(name).toMatch(
      /^dev_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[0-9a-f-]{8}$/i,
    );
  });

  test("is unique across calls", () => {
    const a = createExperimentNameUTC("dev");
    const b = createExperimentNameUTC("dev");
    expect(a).not.toEqual(b);
  });
});
