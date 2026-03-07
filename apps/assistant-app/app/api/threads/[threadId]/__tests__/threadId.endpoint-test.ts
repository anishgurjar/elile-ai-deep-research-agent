import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GET, PATCH } from "../route";

const mockAuth = auth as MockedFunction<typeof auth>;
const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const makeParams = (threadId: string) => ({
  params: Promise.resolve({ threadId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_LANGGRAPH_API_URL = "https://api.langgraph.com";
  mockAuth.mockResolvedValue({
    userId: "user_123",
    getToken: vi.fn().mockResolvedValue("test-token"),
  } as never);
});

describe("GET /api/threads/[threadId]", () => {
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: vi.fn() } as never);

    const req = new NextRequest("http://localhost/api/threads/" + VALID_UUID);
    const res = await GET(req, makeParams(VALID_UUID));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid threadId", async () => {
    const req = new NextRequest("http://localhost/api/threads/not-a-uuid");
    const res = await GET(req, makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for path traversal in threadId", async () => {
    const req = new NextRequest("http://localhost/api/threads/x");
    const res = await GET(req, makeParams("../../../etc/passwd"));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid GET request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ thread_id: VALID_UUID }), { status: 200 }),
    );

    const req = new NextRequest("http://localhost/api/threads/" + VALID_UUID);
    const res = await GET(req, makeParams(VALID_UUID));
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      `/threads/${VALID_UUID}`,
    );
  });
});

describe("PATCH /api/threads/[threadId]", () => {
  it("should return 400 for invalid threadId", async () => {
    const req = new NextRequest("http://localhost/api/threads/bad-id", {
      method: "PATCH",
      body: JSON.stringify({ metadata: {} }),
    });
    const res = await PATCH(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid metadata type", async () => {
    const req = new NextRequest("http://localhost/api/threads/" + VALID_UUID, {
      method: "PATCH",
      body: JSON.stringify({ metadata: "string" }),
    });
    const res = await PATCH(req, makeParams(VALID_UUID));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid PATCH request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ thread_id: VALID_UUID }), { status: 200 }),
    );

    const req = new NextRequest("http://localhost/api/threads/" + VALID_UUID, {
      method: "PATCH",
      body: JSON.stringify({ metadata: { title: "updated" } }),
    });
    const res = await PATCH(req, makeParams(VALID_UUID));
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      `/threads/${VALID_UUID}`,
      { method: "PATCH" },
    );
  });
});
