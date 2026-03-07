export const CORRECTNESS_PROMPT_TEMPLATE = `You are evaluating an AI agent's response for correctness against a reference answer.

Question: {input}

Reference Answer: {expected}

Agent's Response: {output}

Evaluate strictly:
1. Does the agent's response directly answer the question?
2. Does it align with the reference answer's key facts?
3. Is the information accurate and not misleading?

What does NOT qualify as accurate:
- If the agent says it is unsure or could not find the information, but the reference answer contains a specific factual answer, give it a score of 0.
- If the agent's answer contradicts the reference answer, give it a score of 0.
- If the agent provides general information or asks clarifying questions instead of answering, but the reference answer shows a definitive answer exists, give it a score of 0.
- If the agent answers with "it depends" or multiple scenarios when the reference answer is definitive for the asked scenario, give it a score of 0.
- If the question asks for a single deterministic value and the agent adds extra values not required by the reference answer, give it a score of 0.

What qualifies as accurate:
- If the agent's response matches the reference answer's key facts, give it a score of 1.
- If the agent phrased the answer differently but conveys the same factual information as the reference, give it a score of 1.`;
