import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GET } from "../route";

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

describe("GET /api/threads/[threadId]/state", () => {
  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: vi.fn() } as never);

    const req = new NextRequest(
      "http://localhost/api/threads/" + VALID_UUID + "/state",
    );
    const res = await GET(req, makeParams(VALID_UUID));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid threadId", async () => {
    const req = new NextRequest(
      "http://localhost/api/threads/not-a-uuid/state",
    );
    const res = await GET(req, makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should proxy valid request", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ values: { messages: [] } }), {
        status: 200,
      }),
    );

    const req = new NextRequest(
      "http://localhost/api/threads/" + VALID_UUID + "/state",
    );
    const res = await GET(req, makeParams(VALID_UUID));
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0]).toProxyToLangGraphWithAuthorization(
      `/threads/${VALID_UUID}/state`,
    );
  });
});
