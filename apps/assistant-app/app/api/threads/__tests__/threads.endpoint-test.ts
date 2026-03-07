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
});

function authenticateAs(token = "test-token") {
  mockAuth.mockResolvedValue({
    userId: "user_123",
    getToken: vi.fn().mockResolvedValue(token),
  } as never);
}

function unauthenticated() {
  mockAuth.mockResolvedValue({
    userId: null,
    getToken: vi.fn(),
  } as never);
}

describe("POST /api/threads", () => {
  it("should return 401 when not authenticated", async () => {
    unauthenticated();

    const req = new NextRequest("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ metadata: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid metadata type", async () => {
    authenticateAs();

    const req = new NextRequest("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ metadata: "not-an-object" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid request to LangGraph", async () => {
    authenticateAs();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ thread_id: "new-id" }), { status: 200 }),
    );

    const req = new NextRequest("http://localhost/api/threads", {
      method: "POST",
      body: JSON.stringify({ metadata: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      "/threads",
      { method: "POST" },
    );
  });
});
