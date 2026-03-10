import { describe, expect, test } from "vitest";
import { ResearchToolResultSchema } from "./contracts";

describe("ResearchToolResultSchema", () => {
  test("accepts dense synthesis with visited_urls", () => {
    const parsed = ResearchToolResultSchema.parse({
      thread_id: "seed1:sec",
      scope: "sec_filings",
      angle: "Board member filings",
      summary: "Paragraph one.\n\nParagraph two.",
      findings: [
        {
          claim: "Example claim",
          confidence: 0.6,
          sources: [{ url: "https://example.com", title: "Example" }],
        },
      ],
      out_of_scope_leads: [
        {
          label: "Real estate fraud allegation appears",
          why_it_matters: "Potential risk; separate thread needed",
          suggested_next_query: "timothy overturf real estate fraud",
          sources: [{ url: "https://example.com" }],
        },
      ],
      suggested_queries: [{ query: "follow-up", reason: "verify", priority: 7 }],
      visited_urls: [
        "https://example.com/1",
        "https://example.com/2",
        "https://example.com/3",
        "https://example.com/4",
        "https://example.com/5",
        "https://example.com/6",
      ],
    });

    expect(parsed.visited_urls.length).toBe(6);
  });

  test("accepts empty visited_urls via default", () => {
    const parsed = ResearchToolResultSchema.parse({
      thread_id: "seed1:sec",
      scope: "sec_filings",
      angle: "Board member filings",
      summary: "Paragraph one.",
      findings: [
        {
          claim: "Example claim",
          confidence: 0.6,
          sources: [{ url: "https://example.com", title: "Example" }],
        },
      ],
    });

    expect(parsed.visited_urls).toEqual([]);
  });
});
