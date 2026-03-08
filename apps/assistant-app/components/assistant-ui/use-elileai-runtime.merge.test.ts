import { describe, it, expect } from "vitest";
import {
  mergeStreamedAiMessage,
  type MinimalAiMessage,
} from "./use-elileai-runtime";

describe("mergeStreamedAiMessage", () => {
  it("preserves additional_kwargs.reasoning while merging tool_calls", () => {
    const prev: MinimalAiMessage = {
      type: "ai",
      id: "assistant-1",
      content: "",
      tool_calls: [{ id: "call_1", name: "t", args: { a: 1 } }],
      additional_kwargs: undefined,
    };

    const incoming: MinimalAiMessage = {
      type: "ai",
      id: "server-id",
      content: [{ type: "text", text: "Hi" }],
      tool_calls: [{ id: "call_1", name: "t", args: { a: 2 } }],
      additional_kwargs: {
        reasoning: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Because..." }],
        },
      },
    };

    const merged = mergeStreamedAiMessage({
      previous: prev,
      incoming,
    });

    expect(merged.id).toBe("server-id");
    expect(merged.additional_kwargs?.reasoning).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((merged.additional_kwargs!.reasoning as any).summary[0].text).toBe(
      "Because...",
    );
    expect(merged.tool_calls![0]!.args).toEqual({ a: 2 });
  });

  it("preserves content array as-is from incoming message", () => {
    const prev: MinimalAiMessage = {
      type: "ai",
      id: "a1",
      content: "",
    };

    const incoming: MinimalAiMessage = {
      type: "ai",
      id: "server",
      content: [
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "thinking..." }],
        },
        { type: "text", text: "Hello" },
      ],
    };

    const merged = mergeStreamedAiMessage({
      previous: prev,
      incoming,
    });

    expect(Array.isArray(merged.content)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((merged.content as any[]).length).toBe(2);
  });
});
