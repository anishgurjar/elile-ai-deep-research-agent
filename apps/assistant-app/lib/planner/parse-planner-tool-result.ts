export type PlannerToolResult = {
  subject: string;
  status: string;
  goals: Array<{ key: string; title: string; why: string }>;
  seed_scopes: Array<{ scope: string; angle: string }>;
  questions: string[];
  candidates?: Array<{
    label: string;
    why: string;
    sources: Array<{ url: string; title?: string }>;
  }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateShape(obj: Record<string, unknown>): PlannerToolResult | null {
  if (typeof obj.subject !== "string") return null;
  if (typeof obj.status !== "string") return null;
  if (!Array.isArray(obj.goals)) return null;
  if (!Array.isArray(obj.seed_scopes)) return null;
  if (!Array.isArray(obj.questions)) return null;
  return obj as unknown as PlannerToolResult;
}

function extractJsonFromText(text: string): string | null {
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = text.match(fencePattern);
  if (fenceMatch) return fenceMatch[1].trim();

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];

  return null;
}

function tryParseJson(text: string): PlannerToolResult | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return null;
    return validateShape(parsed);
  } catch {
    return null;
  }
}

export function parsePlannerToolResult(
  input: unknown,
): PlannerToolResult | null {
  if (isRecord(input)) return validateShape(input);

  if (typeof input !== "string" || input.length === 0) return null;

  const direct = tryParseJson(input);
  if (direct) return direct;

  const extracted = extractJsonFromText(input);
  if (extracted) return tryParseJson(extracted);

  return null;
}
