import type { FormattedError } from "./types";

const MAX_STACK_LINES = 6;
const MAX_MESSAGE_LENGTH = 500;

/**
 * Truncates a stack trace to a maximum number of lines.
 */
function truncateStack(stack: string | undefined, maxLines: number): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n");
  if (lines.length <= maxLines) return stack;
  return lines.slice(0, maxLines).join("\n") + `\n    ... ${lines.length - maxLines} more lines`;
}

/**
 * Truncates a message to a maximum length.
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + "...";
}

/**
 * Formats an Error into a flat structure suitable for structured logging
 * and Datadog Error Tracking. Uses dot-notation field names so Datadog
 * can automatically group and track errors.
 *
 * Stack traces are truncated to 6 lines, messages to 500 chars.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   logger.error("Operation failed", formatError(err));
 * }
 * ```
 */
export function formatError(err: unknown): FormattedError {
  if (err instanceof AggregateError && err.errors?.length > 0) {
    const first = err.errors[0] as Error;
    const remaining = err.errors.length - 1;
    const suffix = remaining > 0 ? ` (+${remaining} more errors)` : "";
    return {
      "error.message": truncateMessage(`${first.message || String(first)}${suffix}`, MAX_MESSAGE_LENGTH),
      "error.stack": truncateStack(first.stack, MAX_STACK_LINES),
      "error.kind": "AggregateError",
    };
  }

  if (err instanceof Error) {
    const result: FormattedError = {
      "error.message": truncateMessage(err.message, MAX_MESSAGE_LENGTH),
      "error.stack": truncateStack(err.stack, MAX_STACK_LINES),
      "error.kind": err.constructor.name,
    };
    if ("code" in err && err.code !== undefined) {
      result["error.code"] = err.code as string | number;
    }
    return result;
  }

  return {
    "error.message": truncateMessage(String(err), MAX_MESSAGE_LENGTH),
    "error.kind": typeof err,
  };
}
