import { describe, expect, test } from "vitest";
import { runResearchRounds } from "./run-rounds";

function makeResult(
  scope: string,
  angle: string,
  suggestedQueries: { query: string; reason: string; priority?: number }[] = [],
) {
  return JSON.stringify({
    thread_id: `seed1:${scope}`,
    scope,
    angle,
    summary: "Dense paragraph summary.",
    findings: [
      {
        claim: `Claim about ${scope}`,
        confidence: 0.4,
        sources: [{ url: "https://example.com" }],
      },
    ],
    out_of_scope_leads: [],
    suggested_queries: suggestedQueries,
    visited_urls: [
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
      "https://example.com/5",
      "https://example.com/6",
    ],
  });
}

describe("runResearchRounds", () => {
  test("seeds multiple scopes and stops when no worthwhile followups exist", async () => {
    const out = await runResearchRounds({
      subject: "Timothy Overturf, CEO of Sisu Capital",
      seed_scopes: [
        {
          scope: "identity",
          angle: "Confirm identity + role via primary sources",
        },
        {
          scope: "company_background",
          angle: "Sisu Capital background and affiliations",
        },
        {
          scope: "sec_filings",
          angle: "SEC/EDGAR ties for related entities",
        },
      ],
      max_rounds: 2,
      callResearchAgent: async (instr) => {
        const parsed = JSON.parse(instr);
        return makeResult(parsed.scope, parsed.angle);
      },
    });

    expect(out.rounds_taken).toBe(1);
    expect(out.by_scope.length).toBe(3);
  });

  test("runs a second round when high-priority suggestions exist", async () => {
    let callCount = 0;
    const out = await runResearchRounds({
      subject: "Timothy Overturf",
      seed_scopes: [{ scope: "identity", angle: "Identity confirmation" }],
      max_rounds: 2,
      callResearchAgent: async (instr) => {
        callCount++;
        const parsed = JSON.parse(instr);
        if (callCount === 1) {
          return makeResult(parsed.scope, parsed.angle, [
            { query: "follow-up query", reason: "verify claim", priority: 8 },
          ]);
        }
        return makeResult(parsed.scope, parsed.angle);
      },
    });

    expect(out.rounds_taken).toBe(2);
    expect(callCount).toBe(2);
  });

  test("deduplicates merged findings by claim text", async () => {
    const out = await runResearchRounds({
      subject: "Timothy Overturf",
      seed_scopes: [
        { scope: "a", angle: "angle a" },
        { scope: "b", angle: "angle b" },
      ],
      max_rounds: 1,
      callResearchAgent: async () =>
        JSON.stringify({
          thread_id: "r1:a",
          scope: "a",
          angle: "angle a",
          summary: "Summary.",
          findings: [
            {
              claim: "Same claim",
              confidence: 0.5,
              sources: [{ url: "https://example.com" }],
            },
          ],
          out_of_scope_leads: [],
          suggested_queries: [],
          visited_urls: [
            "https://example.com/1",
            "https://example.com/2",
            "https://example.com/3",
            "https://example.com/4",
            "https://example.com/5",
            "https://example.com/6",
          ],
        }),
    });

    expect(out.merged_findings.length).toBe(1);
  });
});
