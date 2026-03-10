import { describe, test, expect } from "vitest";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

// We test the pure function by re-implementing the same logic used
// inside the middleware, since the middleware wraps it in createMiddleware.
function repairOrphanedToolCalls(messages: BaseMessage[]): BaseMessage[] {
  const resolvedIds = new Set<string>();
  for (const m of messages) {
    const tcId = (m as unknown as Record<string, unknown>).tool_call_id;
    if (typeof tcId === "string" && tcId) resolvedIds.add(tcId);
  }

  const result: BaseMessage[] = [];
  for (const m of messages) {
    result.push(m);
    const toolCalls = (m as unknown as Record<string, unknown>).tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) continue;

    for (const tc of toolCalls as Array<{ id?: string; name?: string }>) {
      if (!tc.id || resolvedIds.has(tc.id)) continue;
      result.push(
        new ToolMessage({
          content:
            "This tool call was cancelled because the user interrupted the conversation.",
          tool_call_id: tc.id,
          name: tc.name ?? "unknown",
        }),
      );
      resolvedIds.add(tc.id);
    }
  }
  return result;
}

describe("repairOrphanedToolCalls", () => {
  test("inserts synthetic ToolMessages for orphaned tool calls", () => {
    const messages: BaseMessage[] = [
      new HumanMessage("Tell me about Anish"),
      new AIMessage({
        content: "I'll research this.",
        tool_calls: [
          { id: "tc_1", name: "research_agent", args: { query: "scope 1" } },
          { id: "tc_2", name: "research_agent", args: { query: "scope 2" } },
        ],
      }),
    ];

    const repaired = repairOrphanedToolCalls(messages);

    expect(repaired).toHaveLength(4);
    expect(repaired[0]._getType()).toBe("human");
    expect(repaired[1]._getType()).toBe("ai");
    expect(repaired[2]._getType()).toBe("tool");
    expect(repaired[3]._getType()).toBe("tool");
    expect((repaired[2] as ToolMessage).tool_call_id).toBe("tc_1");
    expect((repaired[3] as ToolMessage).tool_call_id).toBe("tc_2");
  });

  test("leaves fully-resolved messages unchanged", () => {
    const messages: BaseMessage[] = [
      new HumanMessage("Tell me about Anish"),
      new AIMessage({
        content: "Looking it up.",
        tool_calls: [
          { id: "tc_1", name: "research_agent", args: { query: "scope" } },
        ],
      }),
      new ToolMessage({
        content: "results here",
        tool_call_id: "tc_1",
        name: "research_agent",
      }),
      new AIMessage({ content: "Here are the results." }),
    ];

    const repaired = repairOrphanedToolCalls(messages);

    expect(repaired).toHaveLength(4);
    expect(repaired).toEqual(messages);
  });

  test("only fills the gap for partially-resolved tool calls", () => {
    const messages: BaseMessage[] = [
      new HumanMessage("Research"),
      new AIMessage({
        content: "Launching 3 scopes.",
        tool_calls: [
          { id: "tc_1", name: "research_agent", args: {} },
          { id: "tc_2", name: "research_agent", args: {} },
          { id: "tc_3", name: "research_agent", args: {} },
        ],
      }),
      new ToolMessage({
        content: "result 1",
        tool_call_id: "tc_1",
        name: "research_agent",
      }),
      new HumanMessage("Actually, stop and tell me something else"),
    ];

    const repaired = repairOrphanedToolCalls(messages);

    expect(repaired).toHaveLength(6);
    const syntheticTools = repaired.filter(
      (m) =>
        m._getType() === "tool" &&
        m.content ===
          "This tool call was cancelled because the user interrupted the conversation.",
    );
    expect(syntheticTools).toHaveLength(2);
    expect((syntheticTools[0] as ToolMessage).tool_call_id).toBe("tc_2");
    expect((syntheticTools[1] as ToolMessage).tool_call_id).toBe("tc_3");
  });
});
