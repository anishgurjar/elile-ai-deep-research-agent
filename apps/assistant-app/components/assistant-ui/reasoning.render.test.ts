import { describe, it, expect } from "vitest";
import { convertLangChainMessages } from "@assistant-ui/react-langgraph";

describe("reasoning message parts", () => {
  it("produces a reasoning part when additional_kwargs.reasoning is present", () => {
    const converted = convertLangChainMessages(
      {
        type: "ai",
        id: "m1",
        content: "The answer is 42.",
        additional_kwargs: {
          reasoning: {
            type: "reasoning",
            summary: [{ type: "summary_text", text: "I considered..." }],
          },
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

    const msg = Array.isArray(converted) ? converted[0] : converted;
    expect(msg?.role).toBe("assistant");
    expect(Array.isArray(msg?.content)).toBe(true);

    const parts = msg!.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === "reasoning")).toBe(true);
    expect(parts.some((p) => p.type === "text")).toBe(true);
  });
});
