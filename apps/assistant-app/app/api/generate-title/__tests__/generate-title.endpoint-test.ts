import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { POST } from "../route";

const mockAuth = auth as MockedFunction<typeof auth>;

const mockCreate = vi.fn();

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
    constructor(_opts: unknown) {}
  }
  return { default: OpenAI };
});

describe("POST /api/generate-title", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";
    mockAuth.mockResolvedValue({
      userId: "user_123",
      getToken: vi.fn().mockResolvedValue("test-token"),
    } as never);
  });

  it("should return 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, getToken: vi.fn() } as never);

    const req = new NextRequest("http://localhost/api/generate-title", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return generated title for valid request", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "My Great Title" } }],
    });

    const req = new NextRequest("http://localhost/api/generate-title", {
      method: "POST",
      body: JSON.stringify({ message: "hello world" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ title: "My Great Title" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
      }),
    );
  });
});

