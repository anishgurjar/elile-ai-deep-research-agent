import type { Metadata, Thread, ThreadState } from "@langchain/langgraph-sdk";

export type CreateThreadRequest = {
  metadata?: Metadata;
};

export type SearchThreadsRequest = {
  metadata?: Metadata;
  limit?: number;
  offset?: number;
  sortBy?: "created_at" | "updated_at";
};

export type UpdateThreadRequest = {
  metadata?: Metadata;
};

export type RunRequestBody = {
  assistant_id: string;
  input?: Record<string, unknown> | null;
  command?: Record<string, unknown>;
  stream_mode?: Array<"messages" | "updates" | "events" | "values">;
  config?: Record<string, unknown>;
};

export type StreamEvent = {
  event: string;
  data: object | string | number | boolean | null;
};

export interface LangGraphClient {
  createThread(body: CreateThreadRequest): Promise<Thread>;
  searchThreads(body: SearchThreadsRequest): Promise<Thread[]>;
  getThread(threadId: string): Promise<Thread>;
  updateThread(threadId: string, body: UpdateThreadRequest): Promise<Thread>;
  getThreadState(threadId: string): Promise<ThreadState>;
  streamRun(threadId: string, body: RunRequestBody): Promise<AsyncGenerator<StreamEvent>>;
  waitRun(threadId: string, body: RunRequestBody): Promise<ThreadState["values"]>;
  cancelRun(threadId: string, runId: string): Promise<void>;
}
