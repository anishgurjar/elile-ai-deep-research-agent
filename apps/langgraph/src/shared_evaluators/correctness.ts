import { createLLMAsJudge } from "openevals";

export const CORRECTNESS_KEY = "correctness";

const CORRECTNESS_PROMPT = `
You are an expert evaluator. Your job is to evaluate a deep research agent's response for correctness against a reference answer.

Score as a percentage, but output the score as a float between 0 and 1:
- 1.0 = 100% correct
- 0.0 = 0% correct

Use the reference outputs as the source of truth for what facts must be present and what facts are disallowed.

<Rubric>
  Assign a score between 0.0 and 1.0 based on factual alignment with the reference:

  - 1.0: The response matches the reference's key facts and implications. Minor phrasing differences are fine. Additional facts are allowed only if they do not contradict the reference and do not introduce incorrect claims.
  - 0.7–0.99: Mostly matches the reference, but has minor omissions of non-critical details or minor inaccuracies that do not change the overall meaning.
  - 0.4–0.69: Partially correct. Misses one or more important facts from the reference and/or includes some questionable or unsupported claims, but does not contain major contradictions.
  - 0.1–0.39: Largely incorrect or misleading. Contains significant factual errors, fabricated details, or misses most key facts from the reference.
  - 0.0: Directly contradicts core reference facts, provides a confidently wrong answer, or is mostly irrelevant to the question.

  Apply strong penalties for:
  - Direct contradictions of any reference fact.
  - Claims that are presented as factual but conflict with the reference.

  Apply moderate penalties for:
  - Missing facts that the reference clearly states and that are necessary to answer the question.
  - Overly vague "it depends"/hedging that avoids providing the reference's concrete answer when one exists.

  Do NOT penalize for:
  - Extra, correct context that is consistent with the reference.
  - Uncertainty statements *only when* the reference itself indicates uncertainty/unknown.
</Rubric>

<Instructions>
  - Carefully read the input, output, and reference outputs.
  - Identify the reference's key factual claims needed to answer the question.
  - Compare the agent output fact-by-fact against the reference:
    - If the output contains facts that contradict the reference, reduce the score.
    - If the output omits important reference facts, reduce the score.
    - If the output adds extra facts, keep the score high only if those facts are consistent and not incorrect.
  - The score should reflect overall factual correctness, not style.
</Instructions>

<input>
{inputs}
</input>

<output>
{outputs}
</output>

Use the reference outputs below to help you evaluate the correctness of the response:

<reference_outputs>
{reference_outputs}
</reference_outputs>
`;

export function createCorrectnessEvaluator() {
  return createLLMAsJudge({
    prompt: CORRECTNESS_PROMPT,
    feedbackKey: CORRECTNESS_KEY,
    model: process.env.OPENEVALS_JUDGE_MODEL ?? "openai:gpt-5-mini",
    continuous: process.env.OPENEVALS_CONTINUOUS !== "false",
    useReasoning: true,
  });
}
