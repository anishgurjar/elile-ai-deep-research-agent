import type { ReportGeneratorDraft } from "./contracts";

function escapeLinkText(s: string): string {
  return s.replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function link(titleOrUrl: string, url: string): string {
  const text = escapeLinkText(titleOrUrl);
  return `[${text}](${url})`;
}

function renderFactLine(f: ReportGeneratorDraft["key_facts"][number]): string {
  const citations = f.sources.map((s) => link(s.title ?? s.url, s.url)).join(" ");
  const conf = `${f.confidence_bucket.toUpperCase()} (${f.final_confidence.toFixed(2)})`;
  return `- **${f.fact}**  \n  - Confidence: **${conf}** — ${f.why_confident}  \n  - Sources: ${citations}`;
}

export function renderReportMarkdown(draft: ReportGeneratorDraft): string {
  const lines: string[] = [];

  lines.push(`# Report: ${draft.subject}`);
  lines.push("");

  lines.push("## Executive summary");
  lines.push(draft.executive_summary.trim());
  lines.push("");

  lines.push("## Key facts (citation-heavy)");
  for (const fact of draft.key_facts) lines.push(renderFactLine(fact));
  lines.push("");

  if (draft.deep_links_and_connections.length > 0) {
    lines.push("## Deep links and connections");
    for (const fact of draft.deep_links_and_connections) lines.push(renderFactLine(fact));
    lines.push("");
  }

  lines.push("## What we visited");
  for (const v of draft.visited) {
    lines.push(`- **${v.scope}** — ${v.angle}`);
    for (const u of v.urls) {
      lines.push(`  - ${link(u, u)}`);
    }
  }
  lines.push("");

  if (draft.open_questions.length > 0) {
    lines.push("## Open questions");
    for (const q of draft.open_questions) lines.push(`- ${q}`);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

