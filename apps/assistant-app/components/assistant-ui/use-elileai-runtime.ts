"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

type RawMsg = Record<string, unknown>;

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
  const existingToolCalls = (previous.tool_calls ?? []) as Array<RawMsg>;
  const incomingToolCalls = (incoming.tool_calls ?? []) as Array<RawMsg>;

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
    const r = additionalKwargs.reasoning as RawMsg;
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

function findAllPendingResearchToolCallIds(
  byId: Map<string, RawMsg>,
): string[] {
  const resolved = new Set<string>();
  for (const m of byId.values()) {
    if (m.type === "tool") {
      const tcId = String(m.tool_call_id ?? "");
      if (tcId) resolved.add(tcId);
    }
  }

  const pending: string[] = [];
  for (const m of byId.values()) {
    if (m.type === "ai" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls as Array<RawMsg>) {
        if (String(tc?.name ?? "") === "research_agent") {
          const tcId = String(tc?.id ?? "");
          if (tcId && !resolved.has(tcId)) pending.push(tcId);
        }
      }
    }
  }
  return pending;
}

function extractTextFromRawContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (typeof block === "object" && block !== null) {
          const rec = block as RawMsg;
          if (typeof rec.text === "string") return rec.text;
        }
        return "";
      })
      .filter((s) => s.length > 0)
      .join("\n");
  }
  return "";
}

export function useElileaiExternalRuntime() {
  const aui = useAui();
  const [lcMessages, setLcMessages] = useState<LangChainMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const externalId = aui.threadListItem().getState().externalId;
  const isStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const messagesByIdRef = useRef(new Map<string, RawMsg>());
  const subagentMsgIdsRef = useRef(new Set<string>());
  const subagentToToolCallRef = useRef(new Map<string, string>());
  const [subagentStreams, setSubagentStreams] = useState<
    Record<string, string>
  >({});

  const syncLcMessages = useCallback(() => {
    setLcMessages(
      Array.from(messagesByIdRef.current.values()) as LangChainMessage[],
    );
  }, []);

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
          const msgWithId = m as RawMsg;
          return {
            ...m,
            id: msgWithId.id || `loaded-${idx}`,
          };
        });

        const byId = new Map<string, RawMsg>();
        for (const m of msgsWithIds) {
          const id = (m as RawMsg).id as string;
          if (id) byId.set(id, m as RawMsg);
        }
        messagesByIdRef.current = byId;
        setLcMessages(msgsWithIds as LangChainMessage[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalId]);

  const uiMessages = useMemo(() => {
    const toolResults = new Map<string, unknown>();
    for (const msg of lcMessages as Array<RawMsg>) {
      if (msg.type === "tool") {
        const toolCallId = String(msg.tool_call_id ?? "");
        if (!toolCallId) continue;
        const artifact = msg.artifact as unknown;
        const artifactOutput =
          isRecord(artifact) && "output" in artifact
            ? artifact.output
            : undefined;
        const result =
          artifactOutput !== undefined
            ? stringifyToolOutput(artifactOutput)
            : typeof msg.content === "string"
              ? msg.content
              : stringifyToolOutput(msg.content);
        toolResults.set(toolCallId, result);
      }
    }

    const messages = lcMessages
      .map((msg) => {
        const converted = convertLangChainMessages(msg, {});
        const threadMessage = Array.isArray(converted)
          ? converted[0]
          : converted;
        if (!threadMessage) return null;

        if ((threadMessage as { role?: string }).role === "tool") return null;

        if (
          threadMessage.role === "assistant" &&
          Array.isArray(threadMessage.content)
        ) {
          const enrichedContent = threadMessage.content.map((part) => {
            if (
              part.type === "tool-call" &&
              "toolCallId" in part &&
              typeof part.toolCallId === "string"
            ) {
              const finalResult = toolResults.get(part.toolCallId);
              if (finalResult !== undefined) {
                return { ...part, result: finalResult };
              }
              const streamingContent = subagentStreams[part.toolCallId];
              if (streamingContent) {
                return { ...part, result: streamingContent };
              }
            }
            return part;
          });

          const toolCalls = enrichedContent.filter(
            (part) => part.type === "tool-call",
          );
          const otherContent = enrichedContent.filter(
            (part) => part.type !== "tool-call",
          );

          if (toolCalls.length > 0) {
            return {
              ...threadMessage,
              content: [...toolCalls, ...otherContent],
              ...(isStreamingRef.current ? { _streaming: Date.now() } : {}),
            } as ThreadMessageLike;
          }

          return {
            ...threadMessage,
            content: enrichedContent,
            ...(isStreamingRef.current ? { _streaming: Date.now() } : {}),
          } as ThreadMessageLike;
        }

        return {
          ...threadMessage,
          ...(isStreamingRef.current ? { _streaming: Date.now() } : {}),
        } as ThreadMessageLike;
      })
      .filter((m): m is ThreadMessageLike => m !== null);

    return messages;
  }, [lcMessages, subagentStreams]);

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
      const userMessage: RawMsg = {
        type: "human",
        content: humanText,
        id: userMessageId,
      };

      messagesByIdRef.current.set(userMessageId, userMessage);
      syncLcMessages();

      subagentMsgIdsRef.current.clear();
      subagentToToolCallRef.current.clear();
      setSubagentStreams({});

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
            const meta = part.data as RawMsg | null;
            if (meta?.run_id && typeof meta.run_id === "string") {
              runIdRef.current = meta.run_id;
            }
          }

          if (
            (part.event === "messages/partial" ||
              part.event === "messages/complete") &&
            isStreamingRef.current
          ) {
            const data = part.data as unknown;
            const serializedMsgs = Array.isArray(data)
              ? (data as Array<RawMsg>)
              : [];

            if (serializedMsgs.length === 0) continue;

            const byId = messagesByIdRef.current;
            const subagentUpdates: Record<string, string> = {};

            for (const raw of serializedMsgs) {
              const type = raw?.["type"] as string | undefined;
              const id =
                (raw?.["id"] as string | undefined) ?? generateId();

              if (type === "ai") {
                const existing = byId.get(id);

                if (existing) {
                  if (subagentMsgIdsRef.current.has(id)) {
                    // Only forward content when there's a stable 1:1 mapping to a tool call.
                    // For parallel calls the mapping is absent because content is interleaved.
                    const tcId = subagentToToolCallRef.current.get(id);
                    if (tcId) {
                      const text = extractTextFromRawContent(raw.content);
                      if (text) subagentUpdates[tcId] = text;
                    }
                  } else {
                    const merged = mergeStreamedAiMessage({
                      previous: existing as unknown as MinimalAiMessage,
                      incoming: raw as unknown as MinimalAiMessage,
                    });
                    byId.set(id, merged as unknown as RawMsg);
                  }
                } else {
                  const pendingTcIds =
                    findAllPendingResearchToolCallIds(byId);

                  if (pendingTcIds.length === 1) {
                    const tcId = pendingTcIds[0];
                    subagentMsgIdsRef.current.add(id);
                    subagentToToolCallRef.current.set(id, tcId);
                    const text = extractTextFromRawContent(raw.content);
                    if (text) {
                      subagentUpdates[tcId] = text;
                    }
                  } else if (pendingTcIds.length > 1) {
                    // LangGraph interleaves parallel subagent streams into one message;
                    // we can't attribute content to a specific tool call. Filter out;
                    // each box shows its result when the tool completes.
                    subagentMsgIdsRef.current.add(id);
                  } else {
                    byId.set(id, { ...raw, id });
                  }
                }
              } else {
                byId.set(id, { ...raw, id });
              }
            }

            syncLcMessages();

            if (Object.keys(subagentUpdates).length > 0) {
              setSubagentStreams((prev) => ({ ...prev, ...subagentUpdates }));
            }
          }
        }

        isStreamingRef.current = false;

        if (isFirstMessage && currentExternalId) {
          try {
            await aui.threadListItem().generateTitle();
          } catch {
            /* title generation non-critical */
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
