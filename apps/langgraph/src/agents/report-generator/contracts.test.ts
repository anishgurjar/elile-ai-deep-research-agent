import { describe, expect, test } from "vitest";
import {
  ReportGeneratorDraftSchema,
  ReportGeneratorInputSchema,
} from "./contracts";

describe("report-generator contracts", () => {
  test("accepts minimal valid input", () => {
    const parsed = ReportGeneratorInputSchema.parse({
      subject: "Jane Doe",
      research_results: [
        {
          thread_id: "round1:identity",
          scope: "identity",
          angle: "Confirm identity via primary sources",
          summary: "Summary.",
          findings: [
            {
              claim: "Jane Doe is CEO of ExampleCo (as of 2024).",
              confidence: 0.7,
              sources: [{ url: "https://example.com/bio", title: "Bio" }],
            },
          ],
          out_of_scope_leads: [],
          suggested_queries: [],
          visited_urls: ["https://example.com/bio"],
        },
      ],
    });

    expect(parsed.subject).toBe("Jane Doe");
    expect(parsed.research_results[0]?.findings.length).toBe(1);
  });

  test("draft output requires sources list (for hyperlink rendering)", () => {
    const draft = ReportGeneratorDraftSchema.parse({
      subject: "Jane Doe",
      executive_summary: "Plain English summary.",
      key_facts: [
        {
          fact: "Jane Doe is CEO of ExampleCo (as of 2024).",
          final_confidence: 0.8,
          confidence_bucket: "high",
          why_confident: "Supported by 2 independent sources from different domains.",
          sources: [
            { url: "https://example.com/bio", title: "ExampleCo bio" },
            { url: "https://example.org/profile", title: "Conference profile" },
          ],
        },
      ],
      visited: [
        {
          scope: "identity",
          angle: "Confirm identity via primary sources",
          urls: ["https://example.com/bio"],
        },
      ],
      open_questions: [],
    });

    expect(draft.key_facts[0]?.sources.length).toBeGreaterThanOrEqual(1);
  });
});

