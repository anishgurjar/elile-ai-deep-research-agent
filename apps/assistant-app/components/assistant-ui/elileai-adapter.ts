"use client";

import type {
  unstable_RemoteThreadListAdapter as RemoteThreadListAdapter,
  AppendMessage,
} from "@assistant-ui/react";
import type { ReactNode } from "react";
import {
  createThread,
  getThread,
  searchThreads,
  updateThreadMetadata,
} from "@/lib/chatApi";
import { log } from "@/lib/log";
import { getErrorMessage } from "@/lib/errors";
import { createAssistantStream } from "assistant-stream";

export function getAppendText(msg: AppendMessage) {
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return text;
}

async function generateTitleFromMessage(message: string): Promise<string> {
  try {
    const response = await fetch("/api/generate-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate title");
    }

    const data = await response.json();
    return data.title || "New Conversation";
  } catch (error) {
    log.warn("Title generation failed; falling back to default title", {
      error: getErrorMessage(error),
    });
    return "New Conversation";
  }
}

export const ElileaiThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const threads = await searchThreads();

    return {
      threads: threads.map((thread) => ({
        remoteId: thread.thread_id,
        externalId: thread.thread_id,
        status: "regular" as const,
        title:
          (thread.metadata as { title?: string })?.title ||
          thread.thread_id.slice(-8),
      })),
    };
  },
  async fetch(remoteId) {
    const thread = await getThread(remoteId);
    return {
      remoteId: thread.thread_id,
      externalId: thread.thread_id,
      status: "regular" as const,
      title:
        (thread.metadata as { title?: string })?.title ||
        thread.thread_id.slice(-8),
    };
  },
  async initialize() {
    const thread = await createThread();
    return { remoteId: thread.thread_id, externalId: thread.thread_id };
  },
  async rename(_remoteId, _title) {
    throw new Error(
      "Not implemented: rename threads. Take-home focus is the deep research agent; thread management polish is intentionally deferred.",
    );
  },
  async archive(_remoteId) {
    throw new Error(
      "Not implemented: archive threads. Take-home focus is the deep research agent; thread management polish is intentionally deferred.",
    );
  },
  async unarchive(_remoteId) {
    throw new Error(
      "Not implemented: unarchive threads. Take-home focus is the deep research agent; thread management polish is intentionally deferred.",
    );
  },
  async delete(_remoteId) {
    throw new Error(
      "Not implemented: delete threads. Take-home focus is the deep research agent; thread management polish is intentionally deferred.",
    );
  },
  async generateTitle(remoteId, messages) {
    return createAssistantStream(async (controller) => {
      const firstUserMessage = messages.find((m) => m.role === "user");

      if (firstUserMessage) {
        const messageText = getAppendText({
          ...firstUserMessage,
          parentId: null,
          sourceId: null,
          runConfig: undefined,
        });
        const title = await generateTitleFromMessage(messageText);
        try {
          await updateThreadMetadata(remoteId, { title });
        } catch (error) {
          log.warn("Failed to persist generated title; continuing anyway", {
            threadId: remoteId,
            error: getErrorMessage(error),
          });
        }
        controller.appendText(title);
      } else {
        controller.appendText(remoteId.slice(-8));
      }

      controller.close();
    });
  },
  unstable_Provider: ({ children }) => children as unknown as ReactNode,
};
