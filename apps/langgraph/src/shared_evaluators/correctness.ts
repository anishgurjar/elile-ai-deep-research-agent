import { createLLMAsJudge } from "openevals";

export const CORRECTNESS_KEY = "correctness";

const CORRECTNESS_PROMPT = `
Your task is to assign a score based on if the model provides accurate information. Nothing more, nothing less. 
What qualifies as accurate information: 
- If the model's response is same as the reference output answer, give it a score of 1. 
- If the model responds with if it is unsure or if it did not find the information, still give it a score of 1. That's the model being honest and not making up information.
- If the model gives answers like it depends, make sure that the model answer's recommendation / paths are the same as the reference output answer. They don't need to be 1 to 1, but most of them should match. It's okay if it misses one or two, but it should absolutely not contradcit what the reference output answer is.
- If the model's response offer incorrect, contradictory, misleading, or confusing information to the reference output answer, give it a score of 0. 

</Rubric>

<Instructions>
  - Carefully read the input and output
  - Check for factual accuracy and completeness
  - Focus not just on correctness of information, but also on the overall quality of the response. If the model responds correctly but reaches the answer through a convoluted path, or the model might be correct but the rest of the response is completely misleading / irrelevant from the reference output answer, give it a score of 0. 
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
    continuous: process.env.OPENEVALS_CONTINUOUS === "false",
    useReasoning: true,
  });
}
