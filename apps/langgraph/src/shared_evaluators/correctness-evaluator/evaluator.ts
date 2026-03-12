import { createLLMAsJudge } from "openevals";
import { CORRECTNESS_PROMPT_TEMPLATE } from "./prompt";

export const CORRECTNESS_KEY = "correctness";

const evaluator = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT_TEMPLATE,
  feedbackKey: CORRECTNESS_KEY,
  model: "openai:gpt-5-mini",
  continuous: true,
  useReasoning: true,
});

/**
 * Evaluate the correctness of an agent response against a reference answer.
 *
 * @param question - The user's question
 * @param referenceAnswer - The expected correct answer
 * @param agentOutput - The agent's actual response
 * @returns Score between 0 and 1 (interpretable as a percentage)
 */
export async function evaluateCorrectness(
  question: string,
  referenceAnswer: string,
  agentOutput: string,
): Promise<number> {
  const result = await evaluator({
    input: question,
    expected: referenceAnswer,
    output: agentOutput,
  });

  const score = result.score ?? 0;
  const numericScore =
    typeof score === "boolean" ? (score ? 1 : 0) : Number(score);
  if (Number.isNaN(numericScore)) return 0;
  return Math.max(0, Math.min(1, numericScore));
}
