import { Writable } from "stream";
import { _setDestinationOverride, _clearDestinationOverride } from "./logger";
import type { DestinationStream } from "./types";

/**
 * Parsed log entry from captured JSON output.
 * Includes standard pino fields plus any custom metadata.
 */
export type ParsedLogEntry = Record<string, unknown>;

/**
 * Lifecycle hooks required by setupTestLogger.
 * Both Vitest and Jest provide these with compatible signatures.
 */
export interface TestLifecycleHooks {
  beforeAll: (fn: () => void) => void;
  afterEach: (fn: () => void) => void;
  afterAll: (fn: () => void) => void;
}

let _chunks: string[] = [];

/**
 * Registers test lifecycle hooks to capture all log output produced by
 * loggers created with `createLogger` / `createLoggerWithConfig`.
 *
 * Call once at the `describe` level — mirrors the `setupPollyRecording()` pattern.
 *
 * @example
 * ```typescript
 * import { setupTestLogger, getTestLogs } from "@elileai/logger/testing";
 * import { beforeAll, afterEach, afterAll } from "vitest";
 *
 * describe("MyService", () => {
 *   setupTestLogger({ beforeAll, afterEach, afterAll });
 *
 *   test("logs something useful", () => {
 *     const svc = new MyService(); // creates logger internally
 *     svc.doWork();
 *
 *     const logs = getTestLogs();
 *     expect(logs[0].msg).toBe("work done");
 *   });
 * });
 * ```
 */
export function setupTestLogger(hooks: TestLifecycleHooks): void {
  const stream: DestinationStream = new Writable({
    write(chunk: Buffer | string, _encoding: string, callback: () => void) {
      _chunks.push(chunk.toString());
      callback();
    },
  });

  hooks.beforeAll(() => {
    _setDestinationOverride(stream);
  });

  hooks.afterEach(() => {
    _chunks = [];
  });

  hooks.afterAll(() => {
    _clearDestinationOverride();
  });
}

/**
 * Returns all log entries captured since the last `afterEach` reset,
 * parsed from JSON into objects.
 */
export function getTestLogs(): ParsedLogEntry[] {
  return _chunks
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ParsedLogEntry);
}

/**
 * Returns all raw JSON strings captured since the last `afterEach` reset.
 */
export function getTestLogsRaw(): string[] {
  return _chunks
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
