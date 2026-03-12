export const CORRECTNESS_PROMPT_TEMPLATE = `You are an expert evaluator. Your job is to evaluate a deep research agent's response for correctness against a reference answer.

Score as a percentage, but output the score as a float between 0 and 1:
- 1.0 = 100% correct
- 0.0 = 0% correct

Question: {input}

Reference Answer (source of truth): {expected}

Agent's Response: {output}

<Rubric>
Assign a score between 0.0 and 1.0 based on factual alignment with the reference.

- 1.0: Matches all key reference facts and implications. Minor phrasing differences are fine. Extra facts are allowed only if they do not contradict the reference and are not incorrect.
- 0.7–0.99: Mostly matches. Minor omissions of non-critical details and/or minor inaccuracies that do not change the overall meaning.
- 0.4–0.69: Partially correct. Misses one or more important reference facts and/or includes some questionable or unsupported claims, but no major contradictions.
- 0.1–0.39: Largely incorrect or misleading. Significant factual errors, fabricated details, or misses most key facts.
- 0.0: Directly contradicts core reference facts, provides a confidently wrong answer, or is mostly irrelevant.

Penalize heavily for any direct contradiction of a reference fact.
Penalize for missing important facts the reference clearly states and that are necessary to answer the question.

Do NOT penalize for:
- Extra, correct context consistent with the reference.
- Uncertainty statements only when the reference itself indicates uncertainty/unknown.
</Rubric>

<Instructions>
- Identify the key factual claims in the reference answer.
- Compare the agent response fact-by-fact:
  - Contradictions => lower score.
  - Missing important reference facts => lower score.
  - Additional facts are OK only if consistent and not incorrect.
- Score correctness, not style.
</Instructions>`;
