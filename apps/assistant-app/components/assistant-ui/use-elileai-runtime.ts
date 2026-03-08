"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import { useAui, useExternalStoreRuntime } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import { getThreadState, sendMessage, cancelRun } from "@/lib/chatApi";
import { getAppendText } from "./elileai-adapter";

function generateId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export type MinimalAiMessage = {
  type: "ai";
  id?: string;
  content: unknown;
  tool_calls?: Array<Record<string, unknown>>;
  additional_kwargs?: Record<string, unknown>;
};

export function mergeStreamedAiMessage({
  previous,
  incoming,
  forcedId,
}: {
  previous: MinimalAiMessage;
  incoming: MinimalAiMessage;
  forcedId: string;
}): MinimalAiMessage {
  const existingToolCalls = (previous.tool_calls ?? []) as Array<
    Record<string, unknown>
  >;
  const incomingToolCalls = (incoming.tool_calls ?? []) as Array<
    Record<string, unknown>
  >;

  const mergedToolCalls = [...existingToolCalls];
  for (const newTc of incomingToolCalls) {
    const id = newTc?.["id"];
    if (!id) continue;
    const idx = mergedToolCalls.findIndex((tc) => tc?.["id"] === id);
    if (idx >= 0) mergedToolCalls[idx] = newTc;
    else mergedToolCalls.push(newTc);
  }

  const additionalKwargs = incoming.additional_kwargs
    ? { ...incoming.additional_kwargs }
    : undefined;

  if (
    additionalKwargs?.reasoning &&
    typeof additionalKwargs.reasoning === "object"
  ) {
    const r = additionalKwargs.reasoning as Record<string, unknown>;
    if (!Array.isArray(r.summary)) {
      r.summary = [];
    }
  }

  return {
    ...incoming,
    id: forcedId,
    tool_calls: mergedToolCalls,
    additional_kwargs: additionalKwargs,
  };
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

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

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      runIdRef.current = null;

      try {
        const stream = await sendMessage({
          threadId: currentExternalId!,
          messages: [{ type: "human", content: humanText }],
          signal: abortController.signal,
        });

        for await (const part of stream as AsyncGenerator<{
          event: string;
          data: unknown;
        }>) {
          if (part.event === "metadata") {
            const meta = part.data as Record<string, unknown> | null;
            if (meta?.run_id && typeof meta.run_id === "string") {
              runIdRef.current = meta.run_id;
            }
          }

          if (part.event === "messages/partial" && isStreamingRef.current) {
            const data = part.data as unknown;
            const serialized = Array.isArray(data)
              ? (data[0] as Record<string, unknown> | undefined)
              : undefined;
            const type = serialized?.["type"] as string | undefined;

            if (type === "ai" && serialized) {
              setLcMessages((prev) =>
                prev.map((m) => {
                  const msgWithId = m as Record<string, unknown>;
                  if (msgWithId.id !== assistantMessageId) return m;

                  const merged = mergeStreamedAiMessage({
                    previous: msgWithId as unknown as MinimalAiMessage,
                    incoming: serialized as unknown as MinimalAiMessage,
                    forcedId: assistantMessageId,
                  });

                  return {
                    ...merged,
                    _updated: Date.now(),
                  } as unknown as LangChainMessage;
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
        const isAbort =
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name: string }).name === "AbortError";
        if (isAbort) {
          return;
        }
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
        abortControllerRef.current = null;
        runIdRef.current = null;
      }
    },
    onCancel: async () => {
      isStreamingRef.current = false;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      const threadId = aui.threadListItem().getState().externalId;
      const runId = runIdRef.current;
      if (threadId && runId) {
        try {
          await cancelRun({ threadId, runId });
        } catch (e) {
          console.error("[useElileaiRuntime] Failed to cancel run:", e);
        }
      }
      runIdRef.current = null;
    },
  });

  return runtime;
}
