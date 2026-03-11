import { ChatAnthropic } from "@langchain/anthropic";

export function createPlannerModel() {
  return new ChatAnthropic({
    model: "claude-sonnet-4-6",
    streaming: false,
    thinking: {
      type: "enabled",
      budget_tokens: 3000,
    },
  });
}
