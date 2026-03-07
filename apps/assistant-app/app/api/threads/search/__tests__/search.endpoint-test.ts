import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { POST } from "../route";

const mockAuth = auth as MockedFunction<typeof auth>;
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_LANGGRAPH_API_URL = "https://api.langgraph.com";
  mockAuth.mockResolvedValue({
    userId: "user_123",
    getToken: vi.fn().mockResolvedValue("test-token"),
  } as never);
});

describe("POST /api/threads/search", () => {
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: vi.fn() } as never);

    const req = new NextRequest("http://localhost/api/threads/search", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for limit exceeding 100", async () => {
    const req = new NextRequest("http://localhost/api/threads/search", {
      method: "POST",
      body: JSON.stringify({ limit: 200 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for negative offset", async () => {
    const req = new NextRequest("http://localhost/api/threads/search", {
      method: "POST",
      body: JSON.stringify({ offset: -1 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid sortBy", async () => {
    const req = new NextRequest("http://localhost/api/threads/search", {
      method: "POST",
      body: JSON.stringify({ sortBy: "hacked" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid search request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const req = new NextRequest("http://localhost/api/threads/search", {
      method: "POST",
      body: JSON.stringify({
        metadata: {},
        limit: 100,
        offset: 0,
        sortBy: "updated_at",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      "/threads/search",
      { method: "POST" },
    );
  });
});
