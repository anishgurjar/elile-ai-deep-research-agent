import { describe, expect, test } from "vitest";
import { bucketForConfidence, scoreFact } from "./confidence";

describe("confidence scoring", () => {
  test("buckets confidence deterministically", () => {
    expect(bucketForConfidence(0.8)).toBe("high");
    expect(bucketForConfidence(0.6)).toBe("medium");
    expect(bucketForConfidence(0.2)).toBe("low");
  });

  test("rewards multiple independent source domains", () => {
    const out = scoreFact({
      claim: "Jane Doe is CEO of ExampleCo (as of 2024).",
      reportedConfidence: 0.6,
      sources: [
        { url: "https://example.com/bio", title: "Bio" },
        { url: "https://example.org/profile", title: "Profile" },
      ],
    });

    expect(out.final_confidence).toBeGreaterThanOrEqual(0.75);
    expect(out.confidence_bucket).toBe("high");
    expect(out.why_confident.toLowerCase()).toMatch(/independent/i);
  });

  test("penalizes single-source facts even if subagent self-reports high", () => {
    const out = scoreFact({
      claim: "Single-source claim",
      reportedConfidence: 0.95,
      sources: [{ url: "https://example.com/only" }],
    });

    expect(out.final_confidence).toBeLessThan(0.9);
  });
});

