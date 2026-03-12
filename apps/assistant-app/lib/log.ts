export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMetadata = Record<string, unknown>;

function serializeError(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;

  const rec = error as Record<string, unknown>;
  const message = typeof rec.message === "string" ? rec.message : undefined;
  const name = typeof rec.name === "string" ? rec.name : undefined;
  const stack = typeof rec.stack === "string" ? rec.stack : undefined;

  if (!message && !name && !stack) return undefined;

  return {
    "error.name": name,
    "error.message": message,
    "error.stack": stack,
  };
}

function emit(level: LogLevel, message: string, metadata?: LogMetadata) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    app: "assistant-app",
    message,
    ...(metadata ?? {}),
  };

  // Keep the surface area consistent and avoid scattered console usage.
  // In a production app, you'd route this to a backend sink (e.g. Datadog).
  (console[level] ?? console.log)(payload);
}

export const log = {
  debug(message: string, metadata?: LogMetadata) {
    emit("debug", message, metadata);
  },
  info(message: string, metadata?: LogMetadata) {
    emit("info", message, metadata);
  },
  warn(message: string, metadata?: LogMetadata) {
    emit("warn", message, metadata);
  },
  error(message: string, metadata?: LogMetadata) {
    emit("error", message, metadata);
  },
  errorWithCause(message: string, error: unknown, metadata?: LogMetadata) {
    emit("error", message, {
      ...serializeError(error),
      ...(metadata ?? {}),
    });
  },
} as const;

