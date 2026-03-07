export function toNumericScore(score: unknown): number {
  if (typeof score === "number") return score;
  if (typeof score === "boolean") return score ? 1 : 0;
  throw new Error(`Unsupported score type: ${typeof score}`);
}
