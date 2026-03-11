import { describe, it, expect } from "vitest";
import { PlannerToolResultSchema } from "./contracts";

describe("PlannerToolResultSchema", () => {
  it("accepts a ready plan with goals and seed scopes", () => {
    const parsed = PlannerToolResultSchema.parse({
      subject: "Jane Doe",
      status: "ready",
      goals: [
        {
          key: "identity",
          title: "Identity confirmation",
          why: "Confirm correct person.",
        },
        {
          key: "adverse_media",
          title: "Adverse media",
          why: "Look for lawsuits/regulatory actions.",
        },
      ],
      seed_scopes: [
        { scope: "identity", angle: "Confirm identity via primary sources" },
      ],
      questions: [],
      candidates: [],
    });
    expect(parsed.status).toBe("ready");
    expect(parsed.goals.length).toBeGreaterThan(0);
  });

  it("accepts a disambiguation response with candidates", () => {
    const parsed = PlannerToolResultSchema.parse({
      subject: "Alex Smith",
      status: "needs_disambiguation",
      goals: [],
      seed_scopes: [],
      questions: ["Which Alex Smith do you mean?"],
      candidates: [
        {
          label: "Alex Smith (VC, SF)",
          why: "Matches query context",
          sources: [{ url: "https://example.com" }],
        },
      ],
    });
    expect(parsed.candidates?.length).toBe(1);
  });
});
