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

type SubagentRun = {
  toolCallId: string;
  toolName: string;
  instructions?: string;
  status: "running" | "success" | "error";
  result?: string;
};

function stringifyToolOutput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeStreamedAiMessage({
  previous,
  incoming,
}: {
  previous: MinimalAiMessage;
  incoming: MinimalAiMessage;
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
        const msgsWithIds = (Array.isArray(msgs) ? msgs : []).map((m, idx) => {
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

  const subagentRuns = useMemo((): SubagentRun[] => {
    const calls = new Map<string, SubagentRun>();

    for (const m of lcMessages as Array<Record<string, unknown>>) {
      if (m.type === "ai" && Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls as Array<Record<string, unknown>>) {
          const toolName = String(tc?.name ?? "");
          if (toolName !== "research_agent") continue;
          const toolCallId = String(tc?.id ?? "");
          if (!toolCallId) continue;
          const args = (tc?.args ?? {}) as Record<string, unknown>;
          const instructions =
            typeof args.instructions === "string" ? args.instructions : undefined;

          calls.set(toolCallId, {
            toolCallId,
            toolName,
            instructions,
            status: "running",
          });
        }
      }
    }

    for (const m of lcMessages as Array<Record<string, unknown>>) {
      if (m.type === "tool") {
        const toolName = String(m.name ?? "");
        if (toolName !== "research_agent") continue;
        const toolCallId = String(m.tool_call_id ?? "");
        if (!toolCallId) continue;
        const status = m.status === "error" ? "error" : "success";
        const artifact = m.artifact as unknown;
        const artifactOutput =
          isRecord(artifact) && "output" in artifact ? artifact.output : undefined;
        const output =
          artifactOutput !== undefined
            ? stringifyToolOutput(artifactOutput)
            : typeof m.content === "string"
              ? m.content
              : stringifyToolOutput(m.content);

        const existing = calls.get(toolCallId);
        calls.set(toolCallId, {
          toolCallId,
          toolName,
          instructions: existing?.instructions,
          status,
          result: output,
        });
      }
    }

    return Array.from(calls.values());
  }, [lcMessages]);

  const uiMessages = useMemo(() => {
    const messages = lcMessages
      .map((msg) => {
        const converted = convertLangChainMessages(msg, {});
        const threadMessage = Array.isArray(converted)
          ? converted[0]
          : converted;
        if (!threadMessage) return null;

        // IMPORTANT: @assistant-ui/core currently throws on role === "tool"
        // (Unknown message role: tool). We still keep tool data in lcMessages
        // and expose it via thread.extras for the Subagents panel.
        if ((threadMessage as { role?: string }).role === "tool") return null;

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
    extras: {
      elileai: {
        subagents: {
          runs: subagentRuns,
        },
      },
    },
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

      setIsRunning(true);
      isStreamingRef.current = true;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      runIdRef.current = null;

      try {
        const stream = await sendMessage({
          threadId: currentExternalId!,
          messages: [{ type: "human", content: humanText, id: userMessageId }],
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

          if (
            (part.event === "messages/partial" || part.event === "messages/complete") &&
            isStreamingRef.current
          ) {
            const data = part.data as unknown;
            const serializedMsgs = Array.isArray(data)
              ? (data as Array<Record<string, unknown>>)
              : [];

            if (serializedMsgs.length === 0) continue;

            setLcMessages((prev) => {
              const byId = new Map<string, LangChainMessage>();
              for (const m of prev) {
                const id = (m as unknown as { id?: string }).id;
                if (id) byId.set(id, m);
              }

              for (const raw of serializedMsgs) {
                const type = raw?.["type"] as string | undefined;
                const id = (raw?.["id"] as string | undefined) ?? generateId();

                const existing = byId.get(id);
                if (existing && type === "ai") {
                  const merged = mergeStreamedAiMessage({
                    previous: existing as unknown as MinimalAiMessage,
                    incoming: raw as unknown as MinimalAiMessage,
                  });
                  byId.set(id, merged as unknown as LangChainMessage);
                } else {
                  byId.set(id, { ...raw, id } as unknown as LangChainMessage);
                }
              }

              return Array.from(byId.values());
            });

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
