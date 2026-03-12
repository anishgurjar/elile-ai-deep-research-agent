import type { ConfidenceBucket } from "./contracts";

export function bucketForConfidence(c: number): ConfidenceBucket {
  if (c >= 0.75) return "high";
  if (c >= 0.5) return "medium";
  return "low";
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    void error;
    return null;
  }
}

export function scoreFact(input: {
  claim: string;
  reportedConfidence: number;
  sources: { url: string; title?: string }[];
}): {
  final_confidence: number;
  confidence_bucket: ConfidenceBucket;
  why_confident: string;
} {
  const domains = new Set(
    input.sources
      .map((s) => domainOf(s.url))
      .filter((d): d is string => Boolean(d)),
  );

  const domainCount = domains.size;
  const sourceCount = input.sources.length;

  // Conservative base: do not blindly trust self-reported confidence.
  let score = 0.25;
  const reasons: string[] = [];

  if (sourceCount >= 2) {
    score += 0.25;
    reasons.push("Multiple sources.");
  } else {
    reasons.push("Only one source.");
  }

  if (domainCount >= 2) {
    score += 0.35;
    reasons.push("Independent sources from different domains.");
  } else {
    reasons.push("Sources are not independently corroborated across domains.");
  }

  const clampedReported = Math.max(0, Math.min(1, input.reportedConfidence));
  score = Math.min(1, score + clampedReported * 0.15);

  // Hard cap: single-source facts cannot be near-certain.
  if (sourceCount < 2) score = Math.min(score, 0.85);

  return {
    final_confidence: score,
    confidence_bucket: bucketForConfidence(score),
    why_confident: reasons.join(" "),
  };
}

