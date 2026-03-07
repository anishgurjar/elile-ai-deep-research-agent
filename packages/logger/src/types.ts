import type { Logger as PinoLogger } from "pino";

/**
 * A writable stream that pino can send log lines to.
 * Used by the test-logger override to capture output.
 */
export interface DestinationStream {
  write(chunk: string): void;
}

/**
 * Valid log levels for the logger, ordered by severity.
 * "critical" maps to pino's "fatal" under the hood, but is emitted as
 * "critical" in JSON output so Datadog recognises it as a standard status.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

/**
 * The application environment, used to determine output formatting.
 * - "development": Human-readable colored console output via pino-pretty.
 * - All other values: Structured JSON output to stdout (for CloudWatch/Datadog).
 */
export type AppEnvironment = "development" | "production" | "staging" | "test" | string;

/**
 * Configuration resolved from environment variables.
 */
export interface LoggerConfig {
  /** The application environment (from APP_ENV). Defaults to "production". */
  appEnv: AppEnvironment;
  /** The minimum log level to output (from LOG_LEVEL). Defaults to "info". */
  logLevel: LogLevel;
  /** Whether the environment is considered development. */
  isDevelopment: boolean;
}

/**
 * Structured metadata that can be passed alongside log messages.
 */
export type LogMetadata = Record<string, unknown>;

/**
 * A formatted error suitable for structured logging.
 * Uses dot-notation-friendly flat fields for Datadog Error Tracking compatibility.
 */
export interface FormattedError {
  "error.message": string;
  "error.stack"?: string;
  "error.kind": string;
  "error.code"?: string | number;
}

/**
 * The logger interface exposed by this package.
 * Wraps pino but provides a stable public API.
 */
export interface Logger {
  /** The module name this logger was created for. */
  readonly moduleName: string;

  /** The namespace breadcrumb trail (e.g., ["server", "auth", "jwt"]). */
  readonly namespace: readonly string[];

  /** Log a debug-level message. */
  debug(message: string, metadata?: LogMetadata): void;

  /** Log an info-level message. */
  info(message: string, metadata?: LogMetadata): void;

  /** Log a warn-level message. */
  warn(message: string, metadata?: LogMetadata): void;

  /** Log an error-level message. */
  error(message: string, metadata?: LogMetadata): void;

  /** Log a critical-level message (highest severity). */
  critical(message: string, metadata?: LogMetadata): void;

  /**
   * Create a child logger that inherits this logger's config and namespace.
   * The child's name is appended to the namespace breadcrumb trail,
   * and any additional metadata is merged into every log entry.
   *
   * @param name - Name appended to the namespace (e.g., "jwt-verify")
   * @param metadata - Additional default metadata for the child
   */
  child(name: string, metadata?: LogMetadata): Logger;

  /** Access the underlying pino instance for advanced use cases. */
  readonly pino: PinoLogger;
}
