import { beforeAll, describe, expect, it, vi } from "vitest";
import { setupPollyRecording } from "@elileai/shared-testing/polly-recording";
import { fetchClerkSessionToken } from "@elileai/shared-testing/clerk-test-token";
import { RealLangGraphClient } from "./real-langgraph-client";

const assistantId = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID;

const hasRealClerkSecret =
  typeof process.env.CLERK_SECRET_KEY === "string" &&
  process.env.CLERK_SECRET_KEY.length > 0 &&
  !process.env.CLERK_SECRET_KEY.includes("your-clerk-secret-key-here");

describe.skipIf(!hasRealClerkSecret)("RealLangGraphClient (integration)", () => {
  vi.setConfig({ testTimeout: 120_000 });
  setupPollyRecording({
    sensitiveHeaders: ["authorization", "x-api-key"],
  });

  let userToken: string;

  beforeAll(async () => {
    userToken = await fetchClerkSessionToken();
  });

  const newClient = () => new RealLangGraphClient({ userToken });
  const marker = "real-langgraph-client-stable-test-marker";

  const createSeedThread = async () => {
    const client = newClient();
    return client.createThread({
      metadata: {
        suite: "real-langgraph-client.int.test.ts",
        marker,
      },
    });
  };

  it("createThread returns thread id and preserves metadata", async () => {
    const client = newClient();
    const created = await client.createThread({
      metadata: {
        suite: "real-langgraph-client.int.test.ts",
        marker,
        testCase: "createThread",
      },
    });

    expect(typeof created.thread_id).toBe("string");
    expect(created.thread_id.length).toBeGreaterThan(0);
    expect((created.metadata as { marker?: string })?.marker).toBe(marker);
  });

  it("getThread returns the thread for a valid id", async () => {
    const client = newClient();
    const created = await createSeedThread();
    const fetched = await client.getThread(created.thread_id);

    expect(fetched.thread_id).toBe(created.thread_id);
    expect(fetched.created_at).toBe(created.created_at);
    expect(fetched.updated_at).toBe(created.updated_at);
  });

  it("getThread rejects invalid thread id", async () => {
    const client = newClient();
    await expect(client.getThread("not-a-uuid")).rejects.toThrow();
  });

  it("updateThread persists metadata updates", async () => {
    const client = newClient();
    const created = await createSeedThread();
    const updated = await client.updateThread(created.thread_id, {
      metadata: {
        suite: "real-langgraph-client.int.test.ts",
        marker,
        phase: "updated",
      },
    });

    expect(updated.thread_id).toBe(created.thread_id);
    expect((updated.metadata as { phase?: string })?.phase).toBe("updated");
  });

  it("updateThread rejects invalid thread id", async () => {
    const client = newClient();
    await expect(client.updateThread("not-a-uuid", { metadata: {} })).rejects.toThrow();
  });

  it("getThreadState returns an object for valid thread id", async () => {
    const client = newClient();
    const created = await createSeedThread();
    const state = await client.getThreadState(created.thread_id);

    expect(state).toBeDefined();
    expect(typeof state).toBe("object");
  });

  it("getThreadState rejects invalid thread id", async () => {
    const client = newClient();
    await expect(client.getThreadState("not-a-uuid")).rejects.toThrow();
  });

  it("searchThreads returns a list and respects basic filters", async () => {
    const client = newClient();
    await createSeedThread();

    const threads = await client.searchThreads({
      metadata: { marker },
      limit: 10,
      offset: 0,
      sortBy: "updated_at",
    });

    expect(Array.isArray(threads)).toBe(true);
    expect(threads.length).toBeGreaterThan(0);
    expect(threads.some((thread) => thread.thread_id)).toBe(true);
  });

  it("searchThreads rejects invalid limit values", async () => {
    const client = newClient();
    await expect(
      client.searchThreads({
        metadata: {},
        limit: 0,
      }),
    ).rejects.toThrow();
  });

  it("waitRun returns thread values for a valid run request", async () => {
    const client = newClient();
    const thread = await createSeedThread();

    const result = await client.waitRun(thread.thread_id, {
      assistant_id: assistantId!,
      input: {
        messages: [{ type: "human", content: "Reply with one short sentence only." }],
      },
      config: {},
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("waitRun rejects invalid assistant id", async () => {
    const client = newClient();
    const thread = await createSeedThread();
    await expect(
      client.waitRun(thread.thread_id, {
        assistant_id: "not-a-uuid",
        input: { messages: [{ type: "human", content: "hello" }] },
        config: {},
      }),
    ).rejects.toThrow();
  });

  it("streamRun yields at least one event for a valid stream request", async () => {
    const client = newClient();
    const thread = await createSeedThread();

    const stream = await client.streamRun(thread.thread_id, {
      assistant_id: assistantId!,
      input: {
        messages: [{ type: "human", content: "Say hello in one sentence." }],
      },
      stream_mode: ["messages", "events"],
      config: {},
    });

    const events: Array<{ event: string; data: unknown }> = [];
    for await (const part of stream) {
      events.push({ event: part.event, data: part.data });
      if (events.length >= 3) break;
    }

    expect(events.length).toBeGreaterThan(0);
    expect(typeof events[0]?.event).toBe("string");
    expect(events[0]).toHaveProperty("data");
  });

  it("streamRun throws during iteration with invalid assistant id", async () => {
    const client = newClient();
    const thread = await createSeedThread();
    const stream = await client.streamRun(thread.thread_id, {
      assistant_id: "not-a-uuid",
      input: { messages: [{ type: "human", content: "hello" }] },
      stream_mode: ["messages"],
      config: {},
    });

    const consume = async () => {
      const events = [];
      for await (const part of stream) {
        events.push(part);
      }
    };

    await expect(consume()).rejects.toThrow();
  });
});
