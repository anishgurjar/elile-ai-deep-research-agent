// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";

const streamGate = (() => {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve: () => resolve?.() };
})();

const generateTitle = vi.fn();

vi.mock("@assistant-ui/react", () => {
  return {
    useAui: () => ({
      threadListItem: () => ({
        getState: () => ({ externalId: "" }),
        initialize: vi.fn().mockResolvedValue({
          externalId: "thread_123",
          remoteId: "thread_123",
        }),
        generateTitle,
      }),
    }),
    useExternalStoreRuntime: (runtime: unknown) => runtime,
  };
});

vi.mock("@/lib/chatApi", () => {
  async function* blockedStream() {
    await streamGate.promise;
  }

  return {
    // used by onNew()
    sendMessage: vi.fn().mockResolvedValue(blockedStream()),
    cancelRun: vi.fn(),
    joinRunStream: vi.fn(),
    updateThreadMetadata: vi.fn(),

    // used by the effect in other tests; kept as safe no-ops here
    getThreadState: vi.fn(),
    getThread: vi.fn(),
  };
});

import { useElileaiExternalRuntime } from "../use-elileai-runtime";

function Harness({ onRuntime }: { onRuntime: (rt: unknown) => void }) {
  const runtime = useElileaiExternalRuntime();
  React.useEffect(() => {
    onRuntime(runtime);
  }, [onRuntime, runtime]);
  return null;
}

describe("useElileaiExternalRuntime title generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should trigger generateTitle immediately on first user message", async () => {
    let captured: any = null;
    await act(async () => {
      render(<Harness onRuntime={(rt) => (captured = rt)} />);
    });

    const onNew = captured?.onNew as (msg: any) => Promise<void>;
    expect(typeof onNew).toBe("function");

    await act(async () => {
      const p = onNew({
        content: [{ type: "text", text: "Hello there" }],
      });

      // IMPORTANT: don't trigger title generation before the message is in the UI store.
      await Promise.resolve();
      await Promise.resolve();
      expect(generateTitle).toHaveBeenCalledTimes(0);

      // Unblock so the async task can finish cleanly within act().
      streamGate.resolve();
      await p;
    });

    // Now that React has committed, the effect-triggered title generation should have fired.
    await Promise.resolve();
    await Promise.resolve();
    expect(generateTitle).toHaveBeenCalledTimes(1);
  });
});

