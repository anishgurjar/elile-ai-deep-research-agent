import { describe, expect, test } from "vitest";
import { renderReportMarkdown } from "./render-markdown";
import type { ReportGeneratorDraft } from "./contracts";

describe("renderReportMarkdown", () => {
  test("hyperlinks all citations and includes visited urls", () => {
    const draft: ReportGeneratorDraft = {
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
        { scope: "identity", angle: "Confirm identity", urls: ["https://example.com/bio"] },
      ],
      open_questions: [],
    };

    const md = renderReportMarkdown(draft);
    expect(md).toContain("[Bio](https://example.com/bio)");
    expect(md).toContain("[Profile](https://example.org/profile)");
    expect(md).toContain("## What we visited");
    expect(md).toContain("[https://example.com/bio](https://example.com/bio)");
  });
});

