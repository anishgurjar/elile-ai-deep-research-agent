import type { LogLevel, LoggerConfig } from "./types";

/**
 * All valid log levels in order of increasing severity.
 */
export const LOG_LEVELS: readonly LogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
  "critical",
] as const;

/**
 * Map from our public LogLevel names to pino's native level names.
 * "critical" maps to pino's "fatal" internally; the level formatter
 * remaps the output label back to "critical" for Datadog compatibility.
 */
export const PINO_LEVEL_MAP: Record<LogLevel, string> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  critical: "fatal",
};

/** The default log level when LOG_LEVEL is not set. */
const DEFAULT_LOG_LEVEL: LogLevel = "info";

/** The default application environment when APP_ENV is not set. */
const DEFAULT_APP_ENV = "production";

/**
 * Validates and normalizes a log level string.
 * Returns the normalized LogLevel, or the default if invalid.
 */
export function resolveLogLevel(raw: string | undefined): LogLevel {
  if (!raw) {
    return DEFAULT_LOG_LEVEL;
  }

  const normalized = raw.toLowerCase().trim();

  if (LOG_LEVELS.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }

  // Unknown level: fall back to default
  return DEFAULT_LOG_LEVEL;
}

/**
 * Resolves the application environment from APP_ENV.
 */
export function resolveAppEnv(raw: string | undefined): string {
  return (raw || DEFAULT_APP_ENV).toLowerCase().trim();
}

/**
 * Reads environment variables and returns a resolved LoggerConfig.
 * This is called at logger creation time so environment changes
 * after creation are not reflected.
 */
export function resolveConfig(): LoggerConfig {
  const appEnv = resolveAppEnv(process.env.APP_ENV);
  const logLevel = resolveLogLevel(process.env.LOG_LEVEL);
  const isDevelopment = appEnv === "development";

  return {
    appEnv,
    logLevel,
    isDevelopment,
  };
}
