import { tool } from "langchain";
import { z } from "zod";
import {
  ReportGeneratorDraftSchema,
  type ReportGeneratorDraft,
} from "../report-generator/contracts";
import { scoreFact } from "../report-generator/confidence";
import { renderReportMarkdown } from "../report-generator/render-markdown";
import { ResearchToolResultSchema } from "./research/contracts";
import { stripMarkdownFences } from "../../shared/markdown";
import { getErrorMessage } from "../../shared/errors";

const InputSchema = z.object({
  subject: z.string().min(1),
  /**
   * Raw JSON strings returned by `research_agent`.
   * (Orchestrator passes these through verbatim.)
   */
  research_results: z.array(z.string().min(2)).min(1),
});

function normalizeFactKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type RunReportGeneratorAgentFn = (instructions: string) => Promise<string>;

export function createReportGeneratorTool(options: {
  runReportGeneratorAgent: RunReportGeneratorAgentFn;
}) {
  const { runReportGeneratorAgent } = options;

  return tool(
    async (input: z.infer<typeof InputSchema>) => {
      const parsedResults = input.research_results.map((raw) =>
        ResearchToolResultSchema.parse(JSON.parse(stripMarkdownFences(raw))),
      );

      const scoredFacts = parsedResults.flatMap((r) =>
        r.findings.map((f) => {
          const scored = scoreFact({
            claim: f.claim,
            reportedConfidence: f.confidence,
            sources: f.sources,
          });
          return {
            fact: f.claim,
            ...scored,
            sources: f.sources,
          };
        }),
      );

      const visited = parsedResults.map((r) => ({
        scope: r.scope,
        angle: r.angle,
        urls: r.visited_urls,
      }));

      const instructions = JSON.stringify({
        subject: input.subject,
        // Provide full context to help summarization and de-duplication.
        research_results: parsedResults,
        // Provide pre-scored atomic facts so the model doesn't need to invent scoring.
        scored_facts: scoredFacts,
        visited,
        requirements: {
          citation_heavy: true,
          no_jargon: true,
          no_invented_sources: true,
          include_visited_section: true,
        },
      });

      const rawDraft = await runReportGeneratorAgent(instructions);
      const cleaned = stripMarkdownFences(rawDraft);

      const safeFallbackDraft: ReportGeneratorDraft = {
        subject: input.subject,
        executive_summary:
          "Summary unavailable (formatting error). See key facts below.",
        key_facts: scoredFacts.slice(0, 80).map((s) => ({
          fact: s.fact,
          final_confidence: s.final_confidence,
          confidence_bucket: s.confidence_bucket,
          why_confident: s.why_confident,
          sources: s.sources,
        })),
        deep_links_and_connections: [],
        visited,
        open_questions: [],
      };

      let draft: ReportGeneratorDraft | null = null;
      let parseError: string | undefined;
      try {
        draft = ReportGeneratorDraftSchema.parse(JSON.parse(cleaned));
      } catch (error) {
        // Ignore — we fall back below.
        parseError = getErrorMessage(error);
      }

      // Ensure the model didn't drop facts: if it did, prefer deterministic output.
      const scoredKeys = new Set(scoredFacts.map((f) => normalizeFactKey(f.fact)));
      const draftKeys = new Set(
        (draft?.key_facts ?? []).map((f) => normalizeFactKey(f.fact)),
      );
      const looksComplete =
        draft != null &&
        draftKeys.size > 0 &&
        [...scoredKeys].every((k) => draftKeys.has(k));

      const finalDraft = looksComplete ? draft! : safeFallbackDraft;
      const markdown = renderReportMarkdown(finalDraft);

      return [
        markdown,
        {
          tool: "report_generator",
          subject: input.subject,
          parsedResearchCount: parsedResults.length,
          usedFallbackDraft: !looksComplete,
          ...(parseError ? { parse_error: parseError } : {}),
        },
      ] as const;
    },
    {
      name: "report_generator",
      description:
        "Generate a citation-heavy final report from research_agent JSON outputs. Returns markdown with hyperlinked citations.",
      schema: InputSchema,
      responseFormat: "content_and_artifact",
    },
  );
}

