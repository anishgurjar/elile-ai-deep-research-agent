"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { AppendMessage, ThreadMessageLike } from "@assistant-ui/react";
import { useAui, useExternalStoreRuntime } from "@assistant-ui/react";
import {
  convertLangChainMessages,
  type LangChainMessage,
} from "@assistant-ui/react-langgraph";
import {
  getThread,
  getThreadState,
  joinRunStream,
  sendMessage,
  cancelRun,
  updateThreadMetadata,
} from "@/lib/chatApi";
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

function safeAbort(controller: AbortController | null) {
  if (!controller) return;
  try {
    controller.abort();
  } catch {
    // Some environments surface AbortError synchronously. Never let cancel crash UI.
  }
}

function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).name === "AbortError"
  );
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

function findPendingToolCallIds(byId: Map<string, RawMsg>): string[] {
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
        const tcId = String(tc?.id ?? "");
        if (tcId && !resolved.has(tcId)) pending.push(tcId);
      }
    }
  }
  return pending;
}

function hasAnyPendingToolCalls(byId: Map<string, RawMsg>): boolean {
  return findPendingToolCallIds(byId).length > 0;
}

function markPendingToolCallsCancelled(byId: Map<string, RawMsg>) {
  const pending = findPendingToolCallIds(byId);
  if (pending.length === 0) return;

  const now = Date.now();
  for (const tcId of pending) {
    const syntheticId = `tool-cancelled-${tcId}-${now}`;
    byId.set(syntheticId, {
      type: "tool",
      id: syntheticId,
      tool_call_id: tcId,
      content: "Cancelled",
      artifact: { output: "Cancelled" },
    });
  }
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
  const lastEventIdRef = useRef<string | null>(null);

  const messagesByIdRef = useRef(new Map<string, RawMsg>());
  const parentMsgIdsRef = useRef(new Set<string>());
  const streamingMsgIdRef = useRef<string | null>(null);

  const syncLcMessages = useCallback(() => {
    setLcMessages(
      Array.from(messagesByIdRef.current.values()) as LangChainMessage[],
    );
  }, []);

  const consumeStream = useCallback(
    async (
      threadId: string,
      stream: AsyncGenerator<{ id?: string; event: string; data: unknown }>,
      opts: { isFirstMessage: boolean },
    ) => {
      const isFirstMessage = opts.isFirstMessage;

      for await (const part of stream) {
        if (part.id && runIdRef.current) {
          lastEventIdRef.current = part.id;
          localStorage.setItem(
            `lg:lastEventId:${threadId}:${runIdRef.current}`,
            part.id,
          );
        }

        if (part.event === "metadata") {
          const meta = part.data as RawMsg | null;
          if (meta?.run_id && typeof meta.run_id === "string") {
            runIdRef.current = meta.run_id;
            lastEventIdRef.current = null;
            void updateThreadMetadata(threadId, {
              active_run_id: meta.run_id,
            }).catch(() => {});
          }
        }

        if (part.event === "values" && isStreamingRef.current) {
          streamingMsgIdRef.current = null;
          const data = part.data as { messages?: Array<RawMsg> } | null;
          const msgs = data?.messages;
          if (Array.isArray(msgs)) {
            const byId = messagesByIdRef.current;
            let didUpdate = false;

            for (const m of msgs) {
              const id = (m.id as string) ?? generateId();
              parentMsgIdsRef.current.add(id);
              const newMsg = { ...m, id };
              const existing = byId.get(id);
              if (
                !existing ||
                JSON.stringify(existing) !== JSON.stringify(newMsg)
              ) {
                byId.set(id, newMsg);
                didUpdate = true;
              }
            }

            if (didUpdate) {
              syncLcMessages();
            }
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
          let didUpdate = false;

          for (const raw of serializedMsgs) {
            const type = raw?.["type"] as string | undefined;
            const id = (raw?.["id"] as string | undefined) ?? generateId();

            if (parentMsgIdsRef.current.has(id)) {
              if (type === "ai") {
                const existing = byId.get(id);
                if (existing) {
                  const merged = mergeStreamedAiMessage({
                    previous: existing as unknown as MinimalAiMessage,
                    incoming: raw as unknown as MinimalAiMessage,
                  });
                  byId.set(id, merged as unknown as RawMsg);
                  streamingMsgIdRef.current = id;
                  didUpdate = true;
                }
              }
              continue;
            }

            if (hasAnyPendingToolCalls(byId)) {
              continue;
            }

            parentMsgIdsRef.current.add(id);
            byId.set(id, { ...raw, id });
            if (type === "ai") streamingMsgIdRef.current = id;
            didUpdate = true;
          }

          if (didUpdate) {
            syncLcMessages();
          }
        }
      }

      isStreamingRef.current = false;
      streamingMsgIdRef.current = null;
      syncLcMessages();

      if (isFirstMessage && threadId) {
        aui.threadListItem().generateTitle();
      }
    },
    [aui, syncLcMessages],
  );

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
        const parentIds = new Set<string>();
        for (const m of msgsWithIds) {
          const id = (m as RawMsg).id as string;
          if (id) {
            byId.set(id, m as RawMsg);
            parentIds.add(id);
          }
        }
        messagesByIdRef.current = byId;
        parentMsgIdsRef.current = parentIds;
        setLcMessages(msgsWithIds as LangChainMessage[]);
      }

      try {
        const thread = await getThread(externalId);
        const status = (thread as unknown as { status?: string }).status;
        const activeRunId = (thread as unknown as { metadata?: RawMsg })
          .metadata?.["active_run_id"];

        if (
          !cancelled &&
          status &&
          status !== "idle" &&
          typeof activeRunId === "string" &&
          activeRunId.length > 0
        ) {
          setIsRunning(true);
          isStreamingRef.current = true;
          runIdRef.current = activeRunId;
          lastEventIdRef.current = null;

          const storedLastEventId = localStorage.getItem(
            `lg:lastEventId:${externalId}:${activeRunId}`,
          );
          if (storedLastEventId)
            lastEventIdRef.current = storedLastEventId;

          const abortController = new AbortController();
          abortControllerRef.current = abortController;

          try {
            const stream = await joinRunStream({
              threadId: externalId,
              runId: activeRunId,
              lastEventId: lastEventIdRef.current ?? undefined,
              signal: abortController.signal,
            });

            await consumeStream(
              externalId,
              stream as AsyncGenerator<{
                id?: string;
                event: string;
                data: unknown;
              }>,
              { isFirstMessage: false },
            );

            void updateThreadMetadata(externalId, {
              active_run_id: "",
            }).catch(() => {});
          } catch (e) {
            if (!isAbortError(e)) {
              console.error("[useElileaiRuntime] Failed to join stream:", e);
            }
          } finally {
            setIsRunning(false);
            isStreamingRef.current = false;
            streamingMsgIdRef.current = null;
            abortControllerRef.current = null;
            runIdRef.current = null;
            lastEventIdRef.current = null;
          }
        }
      } catch (e) {
        console.error(
          "[useElileaiRuntime] Failed to load thread status:",
          e,
        );
      }
    })();
    return () => {
      cancelled = true;
      safeAbort(abortControllerRef.current);
      abortControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const activeStreamingId = streamingMsgIdRef.current;

    const messages = lcMessages
      .map((msg) => {
        const converted = convertLangChainMessages(msg, {});
        const threadMessage = Array.isArray(converted)
          ? converted[0]
          : converted;
        if (!threadMessage) return null;

        if ((threadMessage as { role?: string }).role === "tool") return null;

        const rawId = (msg as RawMsg).id as string | undefined;
        const isActivelyStreaming =
          isStreamingRef.current && rawId === activeStreamingId;

        const streamingFlag = isActivelyStreaming
          ? {
              _streaming: `s${extractTextFromRawContent((msg as RawMsg).content).length}`,
            }
          : {};

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
            }
            return part;
          });

          return {
            ...threadMessage,
            content: enrichedContent,
            ...streamingFlag,
          } as ThreadMessageLike;
        }

        return {
          ...threadMessage,
          ...streamingFlag,
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
          console.error(
            "[useElileaiRuntime] Failed to initialize thread:",
            initError,
          );
          return;
        }
      }

      if (!currentExternalId) {
        console.error(
          "[useElileaiRuntime] No thread ID available after initialization",
        );
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

      // If a previous run left tool calls unresolved (e.g. interrupted or hung),
      // our stream-merging logic can suppress new assistant messages forever.
      // Mark them cancelled before starting a new run.
      markPendingToolCallsCancelled(messagesByIdRef.current);

      messagesByIdRef.current.set(userMessageId, userMessage);
      parentMsgIdsRef.current.add(userMessageId);
      syncLcMessages();

      setIsRunning(true);
      isStreamingRef.current = true;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      runIdRef.current = null;

      try {
        const stream = await sendMessage({
          threadId: currentExternalId!,
          messages: [
            { type: "human", content: humanText, id: userMessageId },
          ],
          signal: abortController.signal,
        });

        await consumeStream(
          currentExternalId,
          stream as AsyncGenerator<{
            id?: string;
            event: string;
            data: unknown;
          }>,
          { isFirstMessage },
        );
      } catch (error) {
        const isAbort =
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name: string }).name === "AbortError";
        if (isAbort) {
          return;
        }
        console.error(
          "[useElileaiRuntime] Error during message streaming:",
          error,
        );
      } finally {
        setIsRunning(false);
        isStreamingRef.current = false;
        streamingMsgIdRef.current = null;
        abortControllerRef.current = null;
        if (currentExternalId && runIdRef.current) {
          void updateThreadMetadata(currentExternalId, {
            active_run_id: "",
          }).catch(() => {});
        }
        runIdRef.current = null;
        lastEventIdRef.current = null;
      }
    },
    onCancel: async () => {
      isStreamingRef.current = false;
      streamingMsgIdRef.current = null;
      setIsRunning(false);

      const threadId = aui.threadListItem().getState().externalId;
      const runId = runIdRef.current;

      // Ensure unresolved tool calls don't poison this thread.
      markPendingToolCallsCancelled(messagesByIdRef.current);
      syncLcMessages();

      safeAbort(abortControllerRef.current);
      abortControllerRef.current = null;

      if (threadId && runId) {
        try {
          localStorage.removeItem(`lg:lastEventId:${threadId}:${runId}`);
        } catch {
          // ignore
        }
        void updateThreadMetadata(threadId, { active_run_id: "" }).catch(() => {});
        try {
          await cancelRun({ threadId, runId });
        } catch {
          // Best-effort; aborting the stream is enough to unblock the UI.
        }
      }
      runIdRef.current = null;
      lastEventIdRef.current = null;
    },
  });

  return runtime;
}
