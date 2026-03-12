import { describe, expect, test } from "vitest";

import { getLastMessageText } from "./messages";

describe("getLastMessageText", () => {
  test("returns undefined when there are no messages", () => {
    expect(getLastMessageText({ messages: [] })).toBeUndefined();
    expect(getLastMessageText({})).toBeUndefined();
  });

  test("returns trimmed string content from the last message", () => {
    const res = getLastMessageText({
      messages: [{ content: "hello" }, { content: "  world  " }],
    });
    expect(res).toBe("world");
  });

  test("returns undefined if last message content is empty/whitespace", () => {
    const res = getLastMessageText({
      messages: [{ content: "hi" }, { content: "   " }],
    });
    expect(res).toBeUndefined();
  });

  test("stringifies non-string content via toString()", () => {
    const res = getLastMessageText({
      messages: [{ content: { toString: () => "  ok  " } }],
    });
    expect(res).toBe("ok");
  });

  test("extracts text from Anthropic-style content blocks array", () => {
    const res = getLastMessageText({
      messages: [
        {
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    });
    expect(res).toBe("Hello world");
  });

  test("extracts text from a single text block object", () => {
    const res = getLastMessageText({
      messages: [{ content: { type: "text", text: "  hi  " } }],
    });
    expect(res).toBe("hi");
  });
});
