import { createLLMAsJudge } from "openevals";
import { CORRECTNESS_PROMPT_TEMPLATE } from "./prompt";

export const CORRECTNESS_KEY = "correctness";

const evaluator = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT_TEMPLATE,
  feedbackKey: CORRECTNESS_KEY,
  model: "openai:gpt-5-mini",
  continuous: false,
  useReasoning: true,
});

/**
 * Evaluate the correctness of an agent response against a reference answer.
 *
 * @param question - The user's question
 * @param referenceAnswer - The expected correct answer
 * @param agentOutput - The agent's actual response
 * @returns Score of 0 or 1, where 1 is correct and 0 is incorrect
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
  return typeof score === "boolean" ? (score ? 1 : 0) : score;
}
