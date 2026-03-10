import { z } from "zod";

export const threadIdParam = z.string().uuid("threadId must be a valid UUID");

const ALLOWED_STREAM_MODES = ["messages", "updates", "events", "values"] as const;
const ALLOWED_SORT_FIELDS = ["created_at", "updated_at"] as const;

export const createThreadBody = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const searchThreadsBody = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sortBy: z.enum(ALLOWED_SORT_FIELDS).optional(),
});

export const updateThreadBody = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const runBody = z.object({
  assistant_id: z.string().min(1),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
  command: z.record(z.string(), z.unknown()).optional(),
  stream_mode: z.array(z.enum(ALLOWED_STREAM_MODES)).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  stream_resumable: z.boolean().optional(),
  on_disconnect: z.enum(["cancel", "continue"]).optional(),
  multitask_strategy: z.enum(["reject", "interrupt", "rollback", "enqueue"]).optional(),
  durability: z.enum(["sync", "async", "exit"]).optional(),
});

export const cancelRunBody = z.object({
  run_id: z.string().uuid("run_id must be a valid UUID"),
});
