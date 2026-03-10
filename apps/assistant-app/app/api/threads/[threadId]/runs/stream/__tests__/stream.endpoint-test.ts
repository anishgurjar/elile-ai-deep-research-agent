import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { POST } from "../route";

const mockAuth = auth as MockedFunction<typeof auth>;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const makeParams = (threadId: string) => ({
  params: Promise.resolve({ threadId }),
});

const validBody = {
  assistant_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  input: { messages: [{ role: "user", content: "hello" }] },
  stream_mode: ["messages", "updates"],
  config: {},
  stream_resumable: true,
  on_disconnect: "continue",
  multitask_strategy: "enqueue",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_LANGGRAPH_API_URL = "https://api.langgraph.com";
  mockAuth.mockResolvedValue({
    userId: "user_123",
    getToken: vi.fn().mockResolvedValue("test-token"),
  } as never);
});

describe("POST /api/threads/[threadId]/runs/stream", () => {
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: vi.fn() } as never);

    const req = new NextRequest("http://localhost/api/threads/x/runs/stream", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, makeParams(VALID_UUID));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid threadId", async () => {
    const req = new NextRequest("http://localhost/api/threads/x/runs/stream", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 when assistant_id is missing", async () => {
    const req = new NextRequest("http://localhost/api/threads/x/runs/stream", {
      method: "POST",
      body: JSON.stringify({ input: null }),
    });
    const res = await POST(req, makeParams(VALID_UUID));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid stream_mode", async () => {
    const req = new NextRequest("http://localhost/api/threads/x/runs/stream", {
      method: "POST",
      body: JSON.stringify({ ...validBody, stream_mode: ["hacked"] }),
    });
    const res = await POST(req, makeParams(VALID_UUID));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid stream request", async () => {
    mockFetch.mockResolvedValue(
      new Response("data: {}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const req = new NextRequest("http://localhost/api/threads/x/runs/stream", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, makeParams(VALID_UUID));
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      `/threads/${VALID_UUID}/runs/stream`,
      { method: "POST" },
    );
  });
});
