import { describe, expect, test } from "vitest";
import { createReportGeneratorTool } from "./report-generator-tools";

describe("report_generator tool", () => {
  test("returns markdown with hyperlinked citations (citation-heavy)", async () => {
    const tool = createReportGeneratorTool({
      runReportGeneratorAgent: async () =>
        JSON.stringify({
          subject: "Jane Doe",
          executive_summary: "Summary.",
          key_facts: [
            {
              fact: "Jane Doe is CEO of ExampleCo (as of 2024).",
              final_confidence: 0.8,
              confidence_bucket: "high",
              why_confident: "Two independent sources.",
              sources: [
                { url: "https://example.com/bio", title: "Bio" },
                { url: "https://example.org/profile", title: "Profile" },
              ],
            },
          ],
          deep_links_and_connections: [],
          visited: [
            {
              scope: "identity",
              angle: "Confirm identity",
              urls: ["https://example.com/bio"],
            },
          ],
          open_questions: [],
        }),
    });

    const md = await tool.invoke({
      subject: "Jane Doe",
      research_results: [
        JSON.stringify({
          thread_id: "round1:identity",
          scope: "identity",
          angle: "Confirm identity",
          summary: "Summary.",
          findings: [
            {
              claim: "Jane Doe is CEO of ExampleCo (as of 2024).",
              confidence: 0.6,
              sources: [{ url: "https://example.com/bio", title: "Bio" }],
            },
          ],
          out_of_scope_leads: [],
          suggested_queries: [],
          visited_urls: ["https://example.com/bio"],
        }),
      ],
    });

    expect(md).toContain("[Bio](https://example.com/bio)");
    expect(md).toContain("## Key facts");
    expect(md).toContain("## What we visited");
  });
});

