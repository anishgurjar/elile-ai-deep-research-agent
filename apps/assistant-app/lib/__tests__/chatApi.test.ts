import { describe, it, expect, beforeEach, vi } from "vitest";
import { createThread, getThreadState, searchThreads, sendMessage } from "../chatApi";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const THREAD_ID = "550e8400-e29b-41d4-a716-446655440000";
const ASSISTANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID = ASSISTANT_ID;
});

describe("chatApi route-boundary behavior", () => {
  it("createThread calls internal API route", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ thread_id: THREAD_ID }), { status: 200 }),
    );

    await createThread();

    expect(mockFetch).toHaveBeenCalledWith("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: {} }),
    });
  });

  it("getThreadState calls internal API route", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ values: { messages: [] } }), { status: 200 }),
    );

    await getThreadState(THREAD_ID);

    expect(mockFetch).toHaveBeenCalledWith(`/api/threads/${THREAD_ID}/state`, {
      method: "GET",
    });
  });

  it("searchThreads calls internal API route", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await searchThreads();

    expect(mockFetch).toHaveBeenCalledWith("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {},
        limit: 100,
        offset: 0,
        sortBy: "updated_at",
      }),
    });
  });

  it("sendMessage posts run payload to stream route and yields events", async () => {
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

    const stream = await sendMessage({
      threadId: THREAD_ID,
      messages: [{ type: "human", content: "hello" }] as never,
    });
    const first = await stream.next();

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/threads/${THREAD_ID}/runs/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_id: ASSISTANT_ID,
          input: {
            messages: [{ type: "human", content: "hello" }],
          },
          stream_mode: ["messages", "updates", "events", "values"],
          config: {},
        }),
      },
    );
    expect(first.value).toEqual({
      event: "messages/partial",
      data: [{ type: "ai", content: "hi" }],
    });
  });

  it("sendMessage preserves additional_kwargs.reasoning in streamed events", async () => {
    const aiMsg = {
      type: "ai",
      id: "msg-1",
      content: "The answer.",
      additional_kwargs: {
        reasoning: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "I thought about it..." }],
        },
      },
    };

    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: messages/partial\ndata: ${JSON.stringify([aiMsg])}\n\n`,
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

    const stream = await sendMessage({
      threadId: THREAD_ID,
      messages: [{ type: "human", content: "why?" }] as never,
    });
    const first = await stream.next();

    const data = first.value as { event: string; data: unknown[] };
    expect(data.event).toBe("messages/partial");

    const parsed = data.data[0] as Record<string, unknown>;
    expect(parsed.additional_kwargs).toBeDefined();
    expect(
      (parsed.additional_kwargs as Record<string, unknown>).reasoning,
    ).toBeDefined();
  });
});
