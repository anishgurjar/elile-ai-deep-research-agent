import { ChatAnthropic } from "@langchain/anthropic";

export function createOrchestratorModel() {
  return new ChatAnthropic({
    model: "claude-sonnet-4-6",
    streaming: true,
    thinking: {
      type: "enabled",
      budget_tokens: 5000,
    },
  });
}
