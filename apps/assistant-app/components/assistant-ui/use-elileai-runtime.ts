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
import { log } from "@/lib/log";
import { getErrorMessage } from "@/lib/errors";

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
type StoredMessage = LangChainMessage & RawMsg;

function stringifyToolOutput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    void error;
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
  } catch (error) {
    // Some environments surface AbortError synchronously. Never let cancel crash UI.
    log.debug("AbortController.abort threw; ignoring", {
      error: getErrorMessage(error),
    });
  }
}

function getStringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

function isAbortError(e: unknown): boolean {
  return getStringProp(e, "name") === "AbortError";
}

function asArrayOfRecords(value: unknown): RawMsg[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RawMsg => typeof v === "object" && v !== null);
}

function mergeStreamedAiMessageInternal(
  previous: RawMsg,
  incoming: RawMsg,
): RawMsg {
  const existingToolCalls = asArrayOfRecords(previous.tool_calls);
  const incomingToolCalls = asArrayOfRecords(incoming.tool_calls);

  const mergedToolCalls = [...existingToolCalls];
  for (const newTc of incomingToolCalls) {
    const id = newTc?.["id"];
    if (!id) continue;
    const idx = mergedToolCalls.findIndex((tc) => tc?.["id"] === id);
    if (idx >= 0) mergedToolCalls[idx] = newTc;
    else mergedToolCalls.push(newTc);
  }

  const additionalKwargs =
    incoming.additional_kwargs && typeof incoming.additional_kwargs === "object"
      ? { ...(incoming.additional_kwargs as RawMsg) }
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

export function mergeStreamedAiMessage({
  previous,
  incoming,
}: {
  previous: MinimalAiMessage;
  incoming: MinimalAiMessage;
}): MinimalAiMessage {
  return mergeStreamedAiMessageInternal(previous as RawMsg, incoming as RawMsg) as
    MinimalAiMessage;
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
  const [lcMessages, setLcMessages] = useState<StoredMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const externalId = aui.threadListItem().getState().externalId;
  const isStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const shouldGenerateTitleRef = useRef(false);

  const messagesByIdRef = useRef(new Map<string, RawMsg>());
  const parentMsgIdsRef = useRef(new Set<string>());
  const streamingMsgIdRef = useRef<string | null>(null);

  const syncLcMessages = useCallback(() => {
    setLcMessages(
      Array.from(messagesByIdRef.current.values()) as StoredMessage[],
    );
  }, []);

  const consumeStream = useCallback(
    async (
      threadId: string,
      stream: AsyncGenerator<{ id?: string; event: string; data: unknown }>,
      _opts: { isFirstMessage: boolean },
    ) => {
      void _opts;

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
            }).catch((error) => {
              log.debug("Failed to persist active_run_id metadata", {
                threadId,
                runId: meta.run_id,
                error: getErrorMessage(error),
              });
            });
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
                  const merged = mergeStreamedAiMessageInternal(existing, raw);
                  byId.set(id, merged);
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
    },
    [syncLcMessages],
  );

  useEffect(() => {
    if (!shouldGenerateTitleRef.current) return;
    if (lcMessages.length === 0) return;
    shouldGenerateTitleRef.current = false;
    void Promise.resolve()
      .then(() => aui.threadListItem().generateTitle())
      .catch((error) => {
        log.debug("Thread title generation failed; ignoring", {
          error: getErrorMessage(error),
        });
      });
  }, [aui, lcMessages]);

  useEffect(() => {
    if (!externalId || isStreamingRef.current) return;
    let cancelled = false;
    void (async () => {
      const state = await getThreadState(externalId);
      const msgs = (() => {
        if (!state || typeof state !== "object") return [];
        const values = (state as RawMsg).values;
        if (!values || typeof values !== "object") return [];
        const messages = (values as RawMsg).messages;
        return Array.isArray(messages) ? (messages as StoredMessage[]) : [];
      })();
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
        setLcMessages(msgsWithIds as StoredMessage[]);
      }

      try {
        const thread = await getThread(externalId);
        const status =
          thread && typeof thread === "object"
            ? ((thread as RawMsg).status as string | undefined)
            : undefined;
        const activeRunId =
          thread && typeof thread === "object"
            ? ((thread as RawMsg).metadata as RawMsg | undefined)?.[
                "active_run_id"
              ]
            : undefined;

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
            }).catch((error) => {
              log.debug("Failed to clear active_run_id metadata", {
                threadId: externalId,
                runId: activeRunId,
                error: getErrorMessage(error),
              });
            });
          } catch (e) {
            if (!isAbortError(e)) {
              log.errorWithCause("Failed to join run stream", e, {
                threadId: externalId,
                runId: activeRunId,
              });
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
        log.errorWithCause("Failed to load thread status", e, {
          threadId: externalId,
        });
      }
    })();
    return () => {
      cancelled = true;
      safeAbort(abortControllerRef.current);
      abortControllerRef.current = null;
    };
  }, [externalId, consumeStream, syncLcMessages]);

  const uiMessages = useMemo(() => {
    const toolResults = new Map<string, unknown>();
    for (const msg of lcMessages) {
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
          log.errorWithCause("Failed to initialize thread", initError);
          return;
        }
      }

      if (!currentExternalId) {
        log.error("No thread ID available after initialization");
        return;
      }

      const humanText = getAppendText(msg);
      if (!humanText) {
        log.warn("Empty message text; skipping send");
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

      if (isFirstMessage) shouldGenerateTitleRef.current = true;

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
        if (isAbortError(error)) {
          return;
        }
        log.errorWithCause("Error during message streaming", error, {
          threadId: currentExternalId,
        });
      } finally {
        setIsRunning(false);
        isStreamingRef.current = false;
        streamingMsgIdRef.current = null;
        abortControllerRef.current = null;
        if (currentExternalId && runIdRef.current) {
          void updateThreadMetadata(currentExternalId, {
            active_run_id: "",
          }).catch((error) => {
            log.debug("Failed to clear active_run_id metadata after run", {
              threadId: currentExternalId,
              runId: runIdRef.current,
              error: getErrorMessage(error),
            });
          });
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
        } catch (error) {
          log.debug("Failed to remove lastEventId from localStorage", {
            threadId,
            runId,
          error: getErrorMessage(error),
          });
        }
        void updateThreadMetadata(threadId, { active_run_id: "" }).catch(
          (error) => {
            log.debug("Failed to clear active_run_id metadata on cancel", {
              threadId,
              runId,
            error: getErrorMessage(error),
            });
          },
        );
        try {
          await cancelRun({ threadId, runId });
        } catch (error) {
          // Best-effort; aborting the stream is enough to unblock the UI.
          log.warn("Failed to cancel run; stream was aborted", {
            threadId,
            runId,
          error: getErrorMessage(error),
          });
        }
      }
      runIdRef.current = null;
      lastEventIdRef.current = null;
    },
  });

  return runtime;
}
