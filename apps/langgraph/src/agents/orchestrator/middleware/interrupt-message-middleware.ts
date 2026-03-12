import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * After an interrupt, the checkpoint may contain an AIMessage with
 * tool_calls that were never fulfilled (no matching ToolMessage).
 * Claude rejects this with "tool_use ids were found without tool_result
 * blocks". This middleware inserts synthetic ToolMessages for any
 * orphaned tool_calls so the model receives a valid message sequence.
 */
export function repairOrphanedToolCalls(messages: BaseMessage[]): BaseMessage[] {
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

export const interruptMessageMiddleware = createMiddleware({
  name: "interruptMessageMiddleware",
  wrapModelCall: async (request, handler) => {
    return handler({
      ...request,
      messages: repairOrphanedToolCalls(
        request.messages as BaseMessage[],
      ),
    });
  },
});
