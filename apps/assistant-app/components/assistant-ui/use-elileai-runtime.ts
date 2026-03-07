"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import { useAui, useExternalStoreRuntime } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import { getThreadState, sendMessage } from "@/lib/chatApi";
import { getAppendText } from "./elileai-adapter";

function generateId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Custom runtime hook that integrates ELILEAI backend with Assistant UI
 * Handles message loading, streaming, and state management
 * Supports tool call streaming and tool result handling
 */
export function useElileaiExternalRuntime() {
  const aui = useAui();
  const [lcMessages, setLcMessages] = useState<LangChainMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const externalId = aui.threadListItem().getState().externalId;
  const isStreamingRef = useRef(false);

  useEffect(() => {
    if (!externalId || isStreamingRef.current) return;
    let cancelled = false;
    void (async () => {
      const state = await getThreadState(externalId);
      const msgs =
        (state as unknown as { values?: { messages?: LangChainMessage[] } })
          ?.values?.messages ?? [];
      if (!cancelled) {
        const filteredMsgs = (Array.isArray(msgs) ? msgs : []).filter((m) => {
          const msgWithType = m as Record<string, unknown>;
          return msgWithType.type !== "tool";
        });

        const msgsWithIds = filteredMsgs.map((m, idx) => {
          const msgWithId = m as Record<string, unknown>;
          return {
            ...m,
            id: msgWithId.id || `loaded-${idx}`,
          };
        });
        setLcMessages(msgsWithIds as LangChainMessage[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalId]);

  const uiMessages = useMemo(() => {
    const messages = lcMessages
      .map((msg) => {
        const converted = convertLangChainMessages(msg, {});
        const threadMessage = Array.isArray(converted)
          ? converted[0]
          : converted;
        if (!threadMessage) return null;

        if (
          threadMessage.role === "assistant" &&
          Array.isArray(threadMessage.content)
        ) {
          const toolCalls = threadMessage.content.filter(
            (part) => part.type === "tool-call",
          );
          const otherContent = threadMessage.content.filter(
            (part) => part.type !== "tool-call",
          );

          if (toolCalls.length > 0) {
            return {
              ...threadMessage,
              content: [...toolCalls, ...otherContent],
              ...(isStreamingRef.current ? { _streaming: Date.now() } : {}),
            } as ThreadMessageLike;
          }
        }

        return {
          ...threadMessage,
          ...(isStreamingRef.current ? { _streaming: Date.now() } : {}),
        } as ThreadMessageLike;
      })
      .filter((m): m is ThreadMessageLike => m !== null);

    return messages;
  }, [lcMessages]);

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: uiMessages,
    convertMessage: (msg) => msg,
    onNew: async (msg: AppendMessage) => {
      let currentExternalId = aui.threadListItem().getState().externalId;
      if (!currentExternalId) {
        try {
          const { externalId: newExternalId, remoteId } = await aui
            .threadListItem()
            .initialize();
          currentExternalId = newExternalId ?? remoteId;
        } catch (initError) {
          console.error("[useElileaiRuntime] Failed to initialize thread:", initError);
          return;
        }
      }

      if (!currentExternalId) {
        console.error("[useElileaiRuntime] No thread ID available after initialization");
        return;
      }

      const humanText = getAppendText(msg);
      if (!humanText) {
        console.warn("[useElileaiRuntime] Empty message text, skipping");
        return;
      }

      const isFirstMessage = lcMessages.length === 0;

      const userMessageId = generateId();
      const userMessage = {
        type: "human",
        content: humanText,
        id: userMessageId,
      } as unknown as LangChainMessage;

      setLcMessages((prev) => [...prev, userMessage]);

      const assistantMessageId = generateId();
      const assistantMessage = {
        type: "ai",
        content: "",
        id: assistantMessageId,
      } as unknown as LangChainMessage;

      setLcMessages((prev) => [...prev, assistantMessage]);

      setIsRunning(true);
      isStreamingRef.current = true;

      try {
        const stream = await sendMessage({
          threadId: currentExternalId!,
          messages: [{ type: "human", content: humanText }],
        });

        for await (const part of stream as AsyncGenerator<{
          event: string;
          data: unknown;
        }>) {
          if (part.event === "messages/partial" && isStreamingRef.current) {
            const data = part.data as unknown;
            const serialized = Array.isArray(data)
              ? (data[0] as Record<string, unknown> | undefined)
              : undefined;
            const content = serialized?.["content"] as unknown as
              | Array<Record<string, unknown>>
              | undefined;
            const type = serialized?.["type"] as string | undefined;
            const toolCalls = serialized?.["tool_calls"] as
              | Array<Record<string, unknown>>
              | undefined;

            if (type === "ai") {
              let fullText = "";
              const toolCallsFromMessage: Array<Record<string, unknown>> = [];

              if (typeof content === "string") {
                fullText = content;
              } else if (Array.isArray(content)) {
                for (const c of content) {
                  const ctype = c?.["type"];
                  const ctext = c?.["text"];

                  if (ctype === "text" && typeof ctext === "string") {
                    fullText = ctext;
                  }
                }
              }

              if (
                toolCalls &&
                Array.isArray(toolCalls) &&
                toolCalls.length > 0
              ) {
                for (const tc of toolCalls) {
                  toolCallsFromMessage.push({
                    type: "tool-call",
                    toolCallId: tc?.["id"] as string,
                    toolName: tc?.["name"] as string,
                    args: tc?.["args"] as Record<string, unknown>,
                  });
                }
              }

              setLcMessages((prev) =>
                prev.map((m) => {
                  const msgWithId = m as Record<string, unknown>;
                  const msgId = msgWithId.id;
                  if (msgId === assistantMessageId) {
                    const existingToolCalls = (msgWithId.tool_calls as
                      | Array<Record<string, unknown>>
                      | undefined) ?? [];

                    // Merge tool calls by ID to prevent count from decreasing
                    // during streaming updates
                    const mergedToolCalls = [...existingToolCalls];
                    if (toolCalls && toolCalls.length > 0) {
                      for (const newTc of toolCalls) {
                        const existingIndex = mergedToolCalls.findIndex(
                          (tc) => tc.id === newTc.id
                        );
                        if (existingIndex >= 0) {
                          // Update existing tool call
                          mergedToolCalls[existingIndex] = newTc;
                        } else {
                          // Add new tool call
                          mergedToolCalls.push(newTc);
                        }
                      }
                    }

                    return {
                      type: "ai",
                      content: fullText,
                      tool_calls: mergedToolCalls,
                      id: assistantMessageId,
                      _updated: Date.now(),
                    } as unknown as LangChainMessage;
                  }
                  return m;
                }),
              );
            }

          }
        }

        isStreamingRef.current = false;

        if (isFirstMessage && currentExternalId) {
          try {
            await aui.threadListItem().generateTitle();
          } catch {
            // Title generation is non-critical, silently ignore failures
          }
        }
      } catch (error) {
        console.error("[useElileaiRuntime] Error during message streaming:", error);
        setLcMessages((prev) =>
          prev.filter((m) => {
            const msgWithId = m as Record<string, unknown>;
            return msgWithId.id !== assistantMessageId;
          }),
        );
      } finally {
        setIsRunning(false);
        isStreamingRef.current = false;
      }
    },
  });

  return runtime;
}
