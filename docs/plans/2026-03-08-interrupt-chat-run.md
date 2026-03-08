# Interrupt Chat Run — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing "Stop generating" button actually cancel an in-progress LangGraph run, aborting both the client-side SSE stream and the server-side run.

**Architecture:** The cancel flow has three layers. (1) The `@assistant-ui/react` runtime already renders a cancel button via `ComposerPrimitive.Cancel` — we just need to provide an `onCancel` callback to `useExternalStoreRuntime`. (2) Client-side, `sendMessage` needs to accept an `AbortSignal` so the SSE fetch can be aborted. (3) Server-side, a new API route calls `client.runs.cancel(threadId, runId)` on the LangGraph SDK. The `onCancel` handler does both: abort the fetch + call the cancel API with the `runId` extracted from the stream's `metadata` event.

**Tech Stack:** Next.js 15 (App Router, Edge runtime), `@assistant-ui/react` ^0.12.15, `@langchain/langgraph-sdk` ^0.0.84, Vitest, Zod

---

## Architecture Diagram

```
User clicks Stop ──► ComposerPrimitive.Cancel
                            │
                    ┌───────▼────────┐
                    │   onCancel()   │  (use-elileai-runtime.ts)
                    └───────┬────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼                           ▼
   abortController.abort()    POST /api/threads/{id}/runs/{runId}/cancel
   (kills SSE fetch)                      │
                                          ▼
                               RealLangGraphClient.cancelRun()
                                          │
                                          ▼
                               SDK: client.runs.cancel(threadId, runId)
```

## Files Overview

| File | Action | Purpose |
|------|--------|---------|
| `apps/assistant-app/lib/chat-api/messages.ts` | Modify | Accept `AbortSignal`, pass to `fetch` |
| `apps/assistant-app/lib/__tests__/chatApi.test.ts` | Modify | Test signal abort behavior |
| `apps/assistant-app/lib/integrations/langgraph/types.ts` | Modify | Add `cancelRun` to `LangGraphClient` interface |
| `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.ts` | Modify | Implement `cancelRun` |
| `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.int.test.ts` | Modify | Integration test for `cancelRun` |
| `apps/assistant-app/app/api/_middleware/schemas.ts` | Modify | Add `cancelRunBody` schema |
| `apps/assistant-app/app/api/_middleware/__tests__/schemas.test.ts` | Modify | Test `cancelRunBody` schema |
| `apps/assistant-app/app/api/threads/[threadId]/runs/cancel/route.ts` | Create | API route that calls `cancelRun` |
| `apps/assistant-app/lib/chat-api/messages.ts` | Modify | Add `cancelRun` client function |
| `apps/assistant-app/lib/chatApi.ts` | Modify | Re-export `cancelRun` |
| `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts` | Modify | Add `onCancel`, `AbortController`, `runId` tracking |

---

## Task 1: Add `AbortSignal` support to `sendMessage`

The fetch call in `ChatMessagesClient.sendMessage` doesn't accept an `AbortSignal`, so there's no way to abort the SSE stream from the caller. We add an optional `signal` parameter.

**Files:**
- Modify: `apps/assistant-app/lib/chat-api/messages.ts:89-124`
- Test: `apps/assistant-app/lib/__tests__/chatApi.test.ts`

### Step 1: Write the failing test

Add a new test to `apps/assistant-app/lib/__tests__/chatApi.test.ts`:

```typescript
it("sendMessage forwards AbortSignal to fetch", async () => {
  const streamBody = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'event: messages/partial\ndata: [{"type":"ai","content":"hi"}]\n\n',
        ),
      );
      controller.close();
    },
  });

  mockFetch.mockResolvedValue(
    new Response(streamBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );

  const controller = new AbortController();
  await sendMessage({
    threadId: THREAD_ID,
    messages: [{ type: "human", content: "hello" }] as never,
    signal: controller.signal,
  });

  const fetchCall = mockFetch.mock.calls[0];
  expect(fetchCall[1].signal).toBe(controller.signal);
});
```

### Step 2: Run test to verify it fails

Run: `npx nx run assistant-app:test -- --testPathPattern chatApi.test`
Expected: FAIL — `sendMessage` doesn't accept `signal` parameter yet.

### Step 3: Implement `AbortSignal` support

In `apps/assistant-app/lib/chat-api/messages.ts`, update the `MessageParams` type and `sendMessage` method:

```typescript
type MessageParams = {
  threadId: string;
  messages?: LangChainMessage[];
  command?: LangGraphCommand | undefined;
  signal?: AbortSignal;
};
```

Update the `sendMessage` method in `ChatMessagesClient`:

```typescript
async sendMessage(params: MessageParams): Promise<AsyncGenerator<unknown>> {
  const res = await fetch(`/api/threads/${params.threadId}/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assistant_id: this.assistantId,
      input: params.messages?.length ? { messages: params.messages } : null,
      command: params.command,
      stream_mode: STREAM_MODES,
      config: {},
    }),
    signal: params.signal,
  });

  await assertOk(res, "sendMessage");

  if (!res.body) {
    throw new Error("sendMessage failed: missing response stream");
  }

  return parseSseStream(res.body);
}
```

### Step 4: Run test to verify it passes

Run: `npx nx run assistant-app:test -- --testPathPattern chatApi.test`
Expected: ALL PASS

### Step 5: Commit

```bash
git add apps/assistant-app/lib/chat-api/messages.ts apps/assistant-app/lib/__tests__/chatApi.test.ts
git commit -m "feat(assistant-app): accept AbortSignal in sendMessage"
```

---

## Task 2: Add `cancelRun` to the `LangGraphClient` interface and `RealLangGraphClient`

The LangGraph SDK's `RunsClient` has `cancel(threadId, runId)`, but our wrapper doesn't expose it. We add it to the interface and implementation.

**Files:**
- Modify: `apps/assistant-app/lib/integrations/langgraph/types.ts`
- Modify: `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.ts`
- Modify: `apps/assistant-app/lib/integrations/langgraph/index.ts` (re-export if needed)
- Test: `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.int.test.ts`

### Step 1: Write the failing integration test

Add to `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.int.test.ts`:

```typescript
it("cancelRun cancels a running run without throwing", async () => {
  const client = newClient();
  const thread = await createSeedThread();

  const stream = await client.streamRun(thread.thread_id, {
    assistant_id: assistantId!,
    input: {
      messages: [{ type: "human", content: "Write a very long essay about the history of mathematics." }],
    },
    stream_mode: ["messages", "events"],
    config: {},
  });

  // Read the first event to get the run started, then extract run_id from metadata
  let runId: string | undefined;
  for await (const part of stream) {
    if (part.event === "metadata" && typeof part.data === "object" && part.data !== null) {
      runId = (part.data as Record<string, unknown>).run_id as string;
    }
    if (runId) break;
  }

  expect(runId).toBeDefined();
  await expect(client.cancelRun(thread.thread_id, runId!)).resolves.not.toThrow();
});
```

### Step 2: Run test to verify it fails

Run: `npx nx run assistant-app:test:int -- --testPathPattern real-langgraph-client`
Expected: FAIL — `cancelRun` is not a method on the client.

### Step 3: Add `cancelRun` to the interface

In `apps/assistant-app/lib/integrations/langgraph/types.ts`, add to the `LangGraphClient` interface:

```typescript
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
```

### Step 4: Implement `cancelRun` in `RealLangGraphClient`

In `apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.ts`, add after `waitRun`:

```typescript
cancelRun(threadId: string, runId: string): Promise<void> {
  return this.client.runs.cancel(threadId, runId);
}
```

### Step 5: Run test to verify it passes

Run: `npx nx run assistant-app:test:int -- --testPathPattern real-langgraph-client`
Expected: ALL PASS

### Step 6: Commit

```bash
git add apps/assistant-app/lib/integrations/langgraph/types.ts apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.ts apps/assistant-app/lib/integrations/langgraph/real-langgraph-client.int.test.ts
git commit -m "feat(assistant-app): add cancelRun to LangGraphClient"
```

---

## Task 3: Add the cancel API route

We need a Next.js API route that the frontend can call to cancel a run server-side. This route authenticates, validates, and calls `cancelRun`.

**Files:**
- Modify: `apps/assistant-app/app/api/_middleware/schemas.ts`
- Modify: `apps/assistant-app/app/api/_middleware/__tests__/schemas.test.ts`
- Create: `apps/assistant-app/app/api/threads/[threadId]/runs/cancel/route.ts`

### Step 1: Write the failing schema test

Add to `apps/assistant-app/app/api/_middleware/__tests__/schemas.test.ts`:

```typescript
import { cancelRunBody } from "../schemas";

describe("cancelRunBody", () => {
  it("accepts valid run_id", () => {
    const result = cancelRunBody.safeParse({ run_id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(true);
  });

  it("rejects missing run_id", () => {
    const result = cancelRunBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID run_id", () => {
    const result = cancelRunBody.safeParse({ run_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx nx run assistant-app:test -- --testPathPattern schemas.test`
Expected: FAIL — `cancelRunBody` doesn't exist.

### Step 3: Add the schema

In `apps/assistant-app/app/api/_middleware/schemas.ts`, add:

```typescript
export const cancelRunBody = z.object({
  run_id: z.string().uuid("run_id must be a valid UUID"),
});
```

### Step 4: Run schema test to verify it passes

Run: `npx nx run assistant-app:test -- --testPathPattern schemas.test`
Expected: ALL PASS

### Step 5: Create the API route

Create `apps/assistant-app/app/api/threads/[threadId]/runs/cancel/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../_middleware/auth";
import { createLangGraphClient } from "@/lib/integrations/langgraph";
import { threadIdParam, cancelRunBody } from "../../../../_middleware/schemas";

export const runtime = "edge";

type RouteParams = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return authResult.response;
    }

    const parsedId = threadIdParam.safeParse((await params).threadId);
    if (!parsedId.success) {
      return NextResponse.json({ error: parsedId.error.issues }, { status: 400 });
    }

    const parsed = cancelRunBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const client = createLangGraphClient(authResult.token);
    await client.cancelRun(parsedId.data, parsed.data.run_id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
```

### Step 6: Commit

```bash
git add apps/assistant-app/app/api/_middleware/schemas.ts apps/assistant-app/app/api/_middleware/__tests__/schemas.test.ts apps/assistant-app/app/api/threads/\[threadId\]/runs/cancel/route.ts
git commit -m "feat(assistant-app): add cancel run API route"
```

---

## Task 4: Add `cancelRun` client function

The frontend needs a thin client function (like `sendMessage`) that POSTs to the cancel API route.

**Files:**
- Modify: `apps/assistant-app/lib/chat-api/messages.ts`
- Modify: `apps/assistant-app/lib/chatApi.ts`
- Modify: `apps/assistant-app/lib/__tests__/chatApi.test.ts`

### Step 1: Write the failing test

Add to `apps/assistant-app/lib/__tests__/chatApi.test.ts`:

```typescript
import { createThread, getThreadState, searchThreads, sendMessage, cancelRun } from "../chatApi";
```

(Update the import at the top of the file.)

```typescript
it("cancelRun posts to the cancel route", async () => {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

  const runId = "660e8400-e29b-41d4-a716-446655440001";
  await cancelRun({ threadId: THREAD_ID, runId });

  expect(mockFetch).toHaveBeenCalledWith(
    `/api/threads/${THREAD_ID}/runs/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId }),
    },
  );
});
```

### Step 2: Run test to verify it fails

Run: `npx nx run assistant-app:test -- --testPathPattern chatApi.test`
Expected: FAIL — `cancelRun` doesn't exist yet.

### Step 3: Implement the client function

In `apps/assistant-app/lib/chat-api/messages.ts`, add a new method to `ChatMessagesClient` and export it:

```typescript
type CancelParams = {
  threadId: string;
  runId: string;
};

// Inside ChatMessagesClient class:
async cancelRun(params: CancelParams): Promise<void> {
  const res = await fetch(`/api/threads/${params.threadId}/runs/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: params.runId }),
  });

  await assertOk(res, "cancelRun");
}
```

Add at the bottom of the file alongside other exports:

```typescript
export const cancelRun = defaultClient.cancelRun.bind(defaultClient);
```

### Step 4: Re-export from `chatApi.ts`

In `apps/assistant-app/lib/chatApi.ts`:

```typescript
export { sendMessage, sendMessageAndWait, cancelRun } from "./chat-api/messages";
```

### Step 5: Run test to verify it passes

Run: `npx nx run assistant-app:test -- --testPathPattern chatApi.test`
Expected: ALL PASS

### Step 6: Commit

```bash
git add apps/assistant-app/lib/chat-api/messages.ts apps/assistant-app/lib/chatApi.ts apps/assistant-app/lib/__tests__/chatApi.test.ts
git commit -m "feat(assistant-app): add cancelRun client function"
```

---

## Task 5: Wire up `onCancel` in the runtime hook

This is the keystone task. We modify `useElileaiExternalRuntime` to:
1. Create an `AbortController` for each streaming run
2. Extract `run_id` from stream metadata events
3. Pass `signal` to `sendMessage`
4. Implement `onCancel` that aborts the fetch and calls the cancel API

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`

### Step 1: Add refs for `AbortController` and `runId`

Near the existing refs at the top of `useElileaiExternalRuntime`, add:

```typescript
const abortControllerRef = useRef<AbortController | null>(null);
const runIdRef = useRef<string | null>(null);
```

### Step 2: Pass `signal` to `sendMessage` and extract `runId` from metadata

Update the `onNew` handler. Replace the `sendMessage` call and add metadata extraction:

```typescript
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
      // ... existing message merge logic stays the same ...
    }
  }
```

### Step 3: Clean up refs in `finally`

In the existing `finally` block, add cleanup:

```typescript
} finally {
  setIsRunning(false);
  isStreamingRef.current = false;
  abortControllerRef.current = null;
  runIdRef.current = null;
}
```

### Step 4: Handle `AbortError` in `catch`

Update the `catch` block to handle aborted fetches gracefully — don't remove the assistant message on abort, the user expects to see partial content:

```typescript
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    // User cancelled — keep partial message, just stop streaming
    return;
  }
  console.error("[useElileaiRuntime] Error during message streaming:", error);
  setLcMessages((prev) =>
    prev.filter((m) => {
      const msgWithId = m as Record<string, unknown>;
      return msgWithId.id !== assistantMessageId;
    }),
  );
}
```

### Step 5: Implement `onCancel`

Add `onCancel` to `useExternalStoreRuntime`:

```typescript
const runtime = useExternalStoreRuntime({
  isRunning,
  messages: uiMessages,
  convertMessage: (msg) => msg,
  onNew: async (msg: AppendMessage) => {
    // ... existing onNew logic ...
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
```

### Step 6: Update imports

At the top of `use-elileai-runtime.ts`, update the import:

```typescript
import { getThreadState, sendMessage, cancelRun } from "@/lib/chatApi";
```

### Step 7: Verify the full file compiles

Run: `npx nx run assistant-app:lint`
Expected: No errors.

### Step 8: Commit

```bash
git add apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts
git commit -m "feat(assistant-app): wire onCancel to abort stream and cancel LangGraph run"
```

---

## Task 6: Manual smoke test

Verify the full flow works end-to-end.

### Step 1: Start the dev environment

Run: `npm run dev`

### Step 2: Test the happy path

1. Open the app in browser
2. Send a message that triggers a long response (e.g. "Write a detailed essay about the history of computer science")
3. While streaming, click the Stop button (square icon)
4. Verify:
   - Streaming stops immediately
   - Partial content remains visible
   - The input field is re-enabled (no longer in "running" state)
   - No console errors (check browser DevTools)
   - You can send a new message after cancelling

### Step 3: Test edge cases

1. **Cancel before metadata arrives:** Send a message and immediately hit Stop. Verify no crash — the fetch is aborted, no `runId` to cancel server-side, graceful handling.
2. **Cancel after completion:** Verify that if the run completes before you click Stop, everything is fine (the button should disappear when `isRunning` becomes `false`).
3. **Multiple rapid cancels:** Send message, cancel, send another, cancel again. No state corruption.

### Step 4: Commit (if any fixes needed)

```bash
git add -A
git commit -m "fix(assistant-app): address interrupt edge cases"
```

---

## Summary of Changes

| Layer | What changes | Why |
|-------|-------------|-----|
| `ChatMessagesClient.sendMessage` | Accepts `AbortSignal` | So the SSE fetch can be aborted client-side |
| `LangGraphClient` interface | New `cancelRun` method | Contract for cancelling a server-side run |
| `RealLangGraphClient` | Implements `cancelRun` via SDK | Calls `client.runs.cancel(threadId, runId)` |
| API route `/runs/cancel` | New `POST` endpoint | Frontend proxy to LangGraph cancel API |
| `ChatMessagesClient.cancelRun` | New client function | Frontend calls the cancel API route |
| `useElileaiExternalRuntime` | `onCancel`, `AbortController`, `runId` tracking | Wires the Stop button to both abort + cancel |
