import type { Thread, ThreadState } from "@langchain/langgraph-sdk";
import { LangChainMessage } from "@assistant-ui/react-langgraph";
import { assertOk } from "./utils";

export const createThread = async () => {
  const res = await fetch("/api/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metadata: {},
    }),
  });

  await assertOk(res, "createThread");
  return res.json();
};

export const getThreadState = async (
  threadId: string,
): Promise<ThreadState<{ messages: LangChainMessage[] }>> => {
  const res = await fetch(`/api/threads/${threadId}/state`, {
    method: "GET",
  });

  await assertOk(res, "getThreadState");
  return res.json();
};

export const searchThreads = async (): Promise<Thread[]> => {
  const res = await fetch("/api/threads/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metadata: {},
      limit: 100,
      offset: 0,
      sortBy: "updated_at",
    }),
  });

  await assertOk(res, "searchThreads");
  return res.json();
};

export const updateThreadMetadata = async (
  threadId: string,
  metadata: Record<string, string>,
) => {
  const res = await fetch(`/api/threads/${threadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ metadata }),
  });

  await assertOk(res, "updateThreadMetadata");
  return res.json();
};

export const getThread = async (threadId: string) => {
  const res = await fetch(`/api/threads/${threadId}`, {
    method: "GET",
  });

  await assertOk(res, "getThread");
  return res.json();
};
