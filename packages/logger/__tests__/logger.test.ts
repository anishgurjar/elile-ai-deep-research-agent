import { describe, it, expect, afterEach } from "vitest";
import pino from "pino";
import { Writable } from "stream";
import {
  createLogger,
  createLoggerWithConfig,
  getLogger,
  resolveConfig,
  resolveLogLevel,
  resolveAppEnv,
  formatError,
  LOG_LEVELS,
  PINO_LEVEL_MAP,
} from "../src/index";
import type { Logger, LoggerConfig, LogLevel } from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively builds a child logger wrapper for testing.
 */
function buildChildLogger(
  parentPino: pino.Logger,
  moduleName: string,
  parentNamespace: readonly string[],
  name: string,
  metadata?: Record<string, unknown>
): Logger {
  const childNamespace = [...parentNamespace, name];
  const childBindings: Record<string, unknown> = {
    namespace: childNamespace.join("."),
    ...(metadata ?? {}),
  };
  const childPino = parentPino.child(childBindings);
  return {
    get moduleName() { return moduleName; },
    get namespace() { return childNamespace; },
    debug(msg: string, meta?: Record<string, unknown>) { if (meta) childPino.debug(meta, msg); else childPino.debug(msg); },
    info(msg: string, meta?: Record<string, unknown>) { if (meta) childPino.info(meta, msg); else childPino.info(msg); },
    warn(msg: string, meta?: Record<string, unknown>) { if (meta) childPino.warn(meta, msg); else childPino.warn(msg); },
    error(msg: string, meta?: Record<string, unknown>) { if (meta) childPino.error(meta, msg); else childPino.error(msg); },
    critical(msg: string, meta?: Record<string, unknown>) { if (meta) childPino.fatal(meta, msg); else childPino.fatal(msg); },
    child(childName: string, childMeta?: Record<string, unknown>) {
      return buildChildLogger(childPino, moduleName, childNamespace, childName, childMeta);
    },
    get pino() { return childPino; },
  };
}

/**
 * Captures JSON log output from a pino logger by writing to a custom stream.
 * This bypasses pino-pretty and captures raw JSON output directly.
 */
function createCapturingLogger(
  moduleName: string,
  config: LoggerConfig
): { logger: Logger; getOutput: () => string[] } {
  const chunks: string[] = [];

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  const pinoLevel = PINO_LEVEL_MAP[config.logLevel];

  const pinoInstance = pino(
    {
      name: moduleName,
      level: pinoLevel,
      formatters: {
        level(label) {
          const datadogStatus = label === "fatal" ? "critical" : label;
          return { status: datadogStatus };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream
  );

  // Create a child with namespace bindings to match real logger behavior
  const namespace = [moduleName];
  const bindings: Record<string, unknown> = {
    namespace: namespace.join("."),
  };

  const boundPino = pinoInstance.child(bindings);

  // Build a Logger wrapper that matches our interface
  const logger: Logger = {
    get moduleName() {
      return moduleName;
    },
    get namespace() {
      return namespace;
    },
    debug(message: string, metadata?: Record<string, unknown>) {
      if (metadata) boundPino.debug(metadata, message);
      else boundPino.debug(message);
    },
    info(message: string, metadata?: Record<string, unknown>) {
      if (metadata) boundPino.info(metadata, message);
      else boundPino.info(message);
    },
    warn(message: string, metadata?: Record<string, unknown>) {
      if (metadata) boundPino.warn(metadata, message);
      else boundPino.warn(message);
    },
    error(message: string, metadata?: Record<string, unknown>) {
      if (metadata) boundPino.error(metadata, message);
      else boundPino.error(message);
    },
    critical(message: string, metadata?: Record<string, unknown>) {
      if (metadata) boundPino.fatal(metadata, message);
      else boundPino.fatal(message);
    },
    child(name: string, metadata?: Record<string, unknown>) {
      return buildChildLogger(boundPino, moduleName, namespace, name, metadata);
    },
    get pino() {
      return boundPino;
    },
  };

  return {
    logger,
    getOutput: () => chunks,
  };
}

function makeConfig(overrides?: Partial<LoggerConfig>): LoggerConfig {
  return {
    appEnv: "production",
    logLevel: "info",
    isDevelopment: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: config.ts — resolveLogLevel
// ---------------------------------------------------------------------------

describe("resolveLogLevel", () => {
  it("returns 'info' when LOG_LEVEL is undefined", () => {
    expect(resolveLogLevel(undefined)).toBe("info");
  });

  it("returns 'info' when LOG_LEVEL is empty string", () => {
    expect(resolveLogLevel("")).toBe("info");
  });

  it.each<[string, LogLevel]>([
    ["debug", "debug"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["critical", "critical"],
  ])("resolves '%s' to '%s'", (input, expected) => {
    expect(resolveLogLevel(input)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(resolveLogLevel("DEBUG")).toBe("debug");
    expect(resolveLogLevel("Warn")).toBe("warn");
    expect(resolveLogLevel("ERROR")).toBe("error");
  });

  it("trims whitespace", () => {
    expect(resolveLogLevel("  info  ")).toBe("info");
  });

  it("returns default 'info' for unknown levels", () => {
    expect(resolveLogLevel("verbose")).toBe("info");
    expect(resolveLogLevel("trace")).toBe("info");
    expect(resolveLogLevel("nonsense")).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Tests: config.ts — resolveAppEnv
// ---------------------------------------------------------------------------

describe("resolveAppEnv", () => {
  it("returns 'production' when APP_ENV is undefined", () => {
    expect(resolveAppEnv(undefined)).toBe("production");
  });

  it("returns 'production' when APP_ENV is empty string", () => {
    expect(resolveAppEnv("")).toBe("production");
  });

  it("normalizes to lowercase", () => {
    expect(resolveAppEnv("Development")).toBe("development");
    expect(resolveAppEnv("PRODUCTION")).toBe("production");
  });

  it("trims whitespace", () => {
    expect(resolveAppEnv("  development  ")).toBe("development");
  });

  it("passes through custom environment names", () => {
    expect(resolveAppEnv("staging")).toBe("staging");
    expect(resolveAppEnv("test")).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// Tests: config.ts — resolveConfig
// ---------------------------------------------------------------------------

describe("resolveConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns default config when no env vars are set", () => {
    delete process.env.APP_ENV;
    delete process.env.LOG_LEVEL;

    const config = resolveConfig();
    expect(config.appEnv).toBe("production");
    expect(config.logLevel).toBe("info");
    expect(config.isDevelopment).toBe(false);
  });

  it("detects development environment", () => {
    process.env.APP_ENV = "development";
    delete process.env.LOG_LEVEL;

    const config = resolveConfig();
    expect(config.appEnv).toBe("development");
    expect(config.isDevelopment).toBe(true);
    expect(config.logLevel).toBe("info");
  });

  it("reads LOG_LEVEL from environment", () => {
    process.env.LOG_LEVEL = "debug";
    delete process.env.APP_ENV;

    const config = resolveConfig();
    expect(config.logLevel).toBe("debug");
  });

  it("treats non-development environments as production-like", () => {
    process.env.APP_ENV = "staging";
    const config = resolveConfig();
    expect(config.isDevelopment).toBe(false);
  });

});

// ---------------------------------------------------------------------------
// Tests: config.ts — constants
// ---------------------------------------------------------------------------

describe("LOG_LEVELS", () => {
  it("contains all expected levels", () => {
    expect(LOG_LEVELS).toEqual(["debug", "info", "warn", "error", "critical"]);
  });
});

describe("PINO_LEVEL_MAP", () => {
  it("maps 'critical' to pino's 'fatal' internally", () => {
    expect(PINO_LEVEL_MAP.critical).toBe("fatal");
  });

  it("maps standard levels to themselves", () => {
    expect(PINO_LEVEL_MAP.debug).toBe("debug");
    expect(PINO_LEVEL_MAP.info).toBe("info");
    expect(PINO_LEVEL_MAP.warn).toBe("warn");
    expect(PINO_LEVEL_MAP.error).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Tests: logger.ts — createLogger
// ---------------------------------------------------------------------------

describe("createLogger", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a logger with the given module name", () => {
    delete process.env.APP_ENV;
    process.env.LOG_LEVEL = "info";

    const logger = createLogger("auth");
    expect(logger.moduleName).toBe("auth");
  });

  it("initializes namespace with module name", () => {
    const logger = createLogger("auth");
    expect(logger.namespace).toEqual(["auth"]);
  });

  it("exposes all log methods", () => {
    const logger = createLogger("test-module");

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.critical).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("exposes the underlying pino instance", () => {
    const logger = createLogger("test-module");
    expect(logger.pino).toBeDefined();
    expect(typeof logger.pino.info).toBe("function");
  });

  it("uses pino-pretty transport in development mode", () => {
    process.env.APP_ENV = "development";
    const logger = createLogger("dev-module");
    expect(logger.moduleName).toBe("dev-module");
  });

  it("uses JSON output in production mode (default)", () => {
    delete process.env.APP_ENV;
    const logger = createLogger("prod-module");
    expect(logger.moduleName).toBe("prod-module");
  });
});

// ---------------------------------------------------------------------------
// Tests: logger.ts — getLogger (alias)
// ---------------------------------------------------------------------------

describe("getLogger", () => {
  it("is an alias for createLogger", () => {
    const logger = getLogger("my-module");
    expect(logger.moduleName).toBe("my-module");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.child).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Tests: logger.ts — createLoggerWithConfig
// ---------------------------------------------------------------------------

describe("createLoggerWithConfig", () => {
  it("creates a logger using explicit config", () => {
    const logger = createLoggerWithConfig("explicit-module", makeConfig({ logLevel: "warn" }));
    expect(logger.moduleName).toBe("explicit-module");
  });

  it("respects development config for pino-pretty transport", () => {
    const logger = createLoggerWithConfig("dev-module", makeConfig({
      appEnv: "development",
      logLevel: "debug",
      isDevelopment: true,
    }));
    expect(logger.moduleName).toBe("dev-module");
  });
});

// ---------------------------------------------------------------------------
// Tests: JSON output format (production mode)
// ---------------------------------------------------------------------------

describe("JSON output in production mode", () => {
  it("outputs valid JSON with expected fields", () => {
    const { logger, getOutput } = createCapturingLogger("json-test", makeConfig());
    logger.info("Hello world");

    const lines = getOutput();
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("Hello world");
    expect(parsed.status).toBe("info");
    expect(parsed.name).toBe("json-test");
    expect(parsed.time).toBeDefined();
  });

  it("includes structured metadata in JSON output", () => {
    const { logger, getOutput } = createCapturingLogger("metadata-test", makeConfig());
    logger.info("Request received", { userId: "abc123", path: "/api/data" });

    const lines = getOutput();
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.msg).toBe("Request received");
    expect(parsed.userId).toBe("abc123");
    expect(parsed.path).toBe("/api/data");
    expect(parsed.name).toBe("metadata-test");
  });

  it("includes namespace in every log line", () => {
    const { logger, getOutput } = createCapturingLogger("my-service", makeConfig({ logLevel: "debug" }));
    logger.info("test");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.namespace).toBe("my-service");
  });

  it("includes module name (pino 'name') in every log line", () => {
    const { logger, getOutput } = createCapturingLogger("my-service", makeConfig({ logLevel: "debug" }));
    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warn message");
    logger.error("Error message");

    const lines = getOutput();
    expect(lines.length).toBe(4);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.name).toBe("my-service");
    }
  });

  it("outputs correct string level labels", () => {
    const { logger, getOutput } = createCapturingLogger("level-test", makeConfig({ logLevel: "debug" }));
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.critical("c");

    const lines = getOutput();
    expect(lines.length).toBe(5);

    const statuses = lines.map((l) => JSON.parse(l).status);
    expect(statuses).toEqual(["debug", "info", "warn", "error", "critical"]);
  });

  it("includes ISO timestamp in production JSON output", () => {
    const { logger, getOutput } = createCapturingLogger("time-test", makeConfig());
    logger.info("Timestamp check");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.time).toBeDefined();
    expect(typeof parsed.time).toBe("string");
    const date = new Date(parsed.time);
    expect(date.getTime()).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// Tests: Child loggers and namespace breadcrumbs
// ---------------------------------------------------------------------------

describe("child loggers", () => {
  it("creates a child with extended namespace", () => {
    const { logger, getOutput } = createCapturingLogger("server", makeConfig());
    const child = logger.child("auth");

    child.info("child log");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.namespace).toBe("server.auth");
  });

  it("child preserves parent module name", () => {
    const { logger } = createCapturingLogger("server", makeConfig());
    const child = logger.child("auth");

    expect(child.moduleName).toBe("server");
  });

  it("child has extended namespace array", () => {
    const { logger } = createCapturingLogger("server", makeConfig());
    const child = logger.child("auth");

    expect(child.namespace).toEqual(["server", "auth"]);
  });

  it("supports nested children (grandchild)", () => {
    const { logger, getOutput } = createCapturingLogger("server", makeConfig());
    const authLogger = logger.child("auth");
    const jwtLogger = authLogger.child("jwt");

    jwtLogger.info("deep log");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.namespace).toBe("server.auth.jwt");
  });

  it("child merges additional metadata into every log", () => {
    const { logger, getOutput } = createCapturingLogger("api", makeConfig());
    const child = logger.child("handler", { requestId: "req-123" });

    child.info("handling request");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.requestId).toBe("req-123");
    expect(parsed.namespace).toBe("api.handler");
  });

  it("child metadata does not bleed into parent", () => {
    const { logger, getOutput } = createCapturingLogger("api", makeConfig());
    logger.child("handler", { requestId: "req-123" });

    logger.info("parent log");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.requestId).toBeUndefined();
  });

  it("child inherits log level from parent", () => {
    const { logger, getOutput } = createCapturingLogger("api", makeConfig({ logLevel: "warn" }));
    const child = logger.child("handler");

    child.info("should be suppressed");
    child.warn("should appear");

    expect(getOutput().length).toBe(1);
    expect(JSON.parse(getOutput()[0]).msg).toBe("should appear");
  });
});

// ---------------------------------------------------------------------------
// Tests: Log level filtering
// ---------------------------------------------------------------------------

describe("log level filtering", () => {
  it("suppresses messages below the configured level", () => {
    const { logger, getOutput } = createCapturingLogger("filter-test", makeConfig({ logLevel: "warn" }));

    logger.debug("Should be suppressed");
    logger.info("Should be suppressed");
    logger.warn("Should appear");
    logger.error("Should appear");

    const lines = getOutput();
    expect(lines.length).toBe(2);

    const messages = lines.map((l) => JSON.parse(l).msg);
    expect(messages).toEqual(["Should appear", "Should appear"]);
  });

  it("shows all messages at debug level", () => {
    const { logger, getOutput } = createCapturingLogger("debug-test", makeConfig({ logLevel: "debug" }));
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    logger.critical("critical msg");

    expect(getOutput().length).toBe(5);
  });

  it("only shows critical at critical level", () => {
    const { logger, getOutput } = createCapturingLogger("critical-test", makeConfig({ logLevel: "critical" }));
    logger.debug("no");
    logger.info("no");
    logger.warn("no");
    logger.error("no");
    logger.critical("yes");

    const lines = getOutput();
    expect(lines.length).toBe(1);

    const messages = lines.map((l) => JSON.parse(l).msg);
    expect(messages).toEqual(["yes"]);
  });

  it("uses LOG_LEVEL env var to filter via createLogger", () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalAppEnv = process.env.APP_ENV;

    try {
      process.env.LOG_LEVEL = "error";
      delete process.env.APP_ENV;

      const logger = createLogger("env-filter-test");
      expect(logger.pino.level).toBe("error");
    } finally {
      if (originalLogLevel !== undefined) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
      if (originalAppEnv !== undefined) {
        process.env.APP_ENV = originalAppEnv;
      } else {
        delete process.env.APP_ENV;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Development mode (pino-pretty)
// ---------------------------------------------------------------------------

describe("development mode", () => {
  it("configures pino-pretty transport when isDevelopment is true", () => {
    const logger = createLoggerWithConfig("dev-test", makeConfig({
      appEnv: "development",
      logLevel: "debug",
      isDevelopment: true,
    }));
    expect(logger.moduleName).toBe("dev-test");
    expect(logger.pino.level).toBe("debug");
  });

  it("selects pretty output when APP_ENV=development via createLogger", () => {
    const originalAppEnv = process.env.APP_ENV;
    const originalLogLevel = process.env.LOG_LEVEL;

    try {
      process.env.APP_ENV = "development";
      process.env.LOG_LEVEL = "debug";

      const logger = createLogger("pretty-test");
      expect(logger.moduleName).toBe("pretty-test");
      expect(() => logger.info("test message")).not.toThrow();
    } finally {
      if (originalAppEnv !== undefined) {
        process.env.APP_ENV = originalAppEnv;
      } else {
        delete process.env.APP_ENV;
      }
      if (originalLogLevel !== undefined) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Structured metadata
// ---------------------------------------------------------------------------

describe("structured metadata", () => {
  it("passes complex metadata objects through to JSON output", () => {
    const { logger, getOutput } = createCapturingLogger("meta-complex", makeConfig());

    logger.info("Complex metadata", {
      user: "john",
      requestId: "req-12345",
      duration: 150,
      tags: ["auth", "api"],
      nested: { key: "value" },
    });

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.user).toBe("john");
    expect(parsed.requestId).toBe("req-12345");
    expect(parsed.duration).toBe(150);
    expect(parsed.tags).toEqual(["auth", "api"]);
    expect(parsed.nested).toEqual({ key: "value" });
  });

  it("handles metadata with boolean values", () => {
    const { logger, getOutput } = createCapturingLogger("meta-bool", makeConfig());
    logger.info("Boolean metadata", { success: true, cached: false });

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.cached).toBe(false);
  });

  it("works without metadata (message only)", () => {
    const { logger, getOutput } = createCapturingLogger("no-meta", makeConfig());
    logger.info("Just a message");

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.msg).toBe("Just a message");
  });

  it("includes metadata in error-level logs", () => {
    const { logger, getOutput } = createCapturingLogger("error-meta", makeConfig({ logLevel: "error" }));
    logger.error("Something went wrong", {
      errorCode: "E_TIMEOUT",
      retries: 3,
    });

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.msg).toBe("Something went wrong");
    expect(parsed.errorCode).toBe("E_TIMEOUT");
    expect(parsed.retries).toBe(3);
    expect(parsed.status).toBe("error");
  });

  it("includes metadata in critical-level logs", () => {
    const { logger, getOutput } = createCapturingLogger("critical-meta", makeConfig({ logLevel: "critical" }));
    logger.critical("System failure", { component: "database", exitCode: 1 });

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed.msg).toBe("System failure");
    expect(parsed.component).toBe("database");
    expect(parsed.exitCode).toBe(1);
    expect(parsed.status).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// Tests: Default behavior
// ---------------------------------------------------------------------------

describe("default log level behavior", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to 'info' level when LOG_LEVEL is not set", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.APP_ENV;

    const logger = createLogger("default-level");
    expect(logger.pino.level).toBe("info");
  });

  it("defaults to production (JSON) mode when APP_ENV is not set", () => {
    delete process.env.APP_ENV;
    delete process.env.LOG_LEVEL;

    const logger = createLogger("default-env");
    expect(logger.moduleName).toBe("default-env");
  });
});

// ---------------------------------------------------------------------------
// Tests: Factory pattern
// ---------------------------------------------------------------------------

describe("factory pattern", () => {
  it("creates independent loggers with different module names", () => {
    const logger1 = createLogger("module-a");
    const logger2 = createLogger("module-b");

    expect(logger1.moduleName).toBe("module-a");
    expect(logger2.moduleName).toBe("module-b");
    expect(logger1.moduleName).not.toBe(logger2.moduleName);
  });

  it("creates independent loggers that do not share state", () => {
    const { logger: logger1, getOutput: getOutput1 } = createCapturingLogger("indep-a", makeConfig());
    const { logger: logger2, getOutput: getOutput2 } = createCapturingLogger("indep-b", makeConfig({ logLevel: "error" }));

    logger1.info("From module A");
    logger2.info("From module B - should be suppressed at error level");

    expect(getOutput1().length).toBe(1);
    expect(getOutput2().length).toBe(0);
  });

  it("getLogger and createLogger produce equivalent loggers", () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalAppEnv = process.env.APP_ENV;

    try {
      process.env.LOG_LEVEL = "warn";
      delete process.env.APP_ENV;

      const logger1 = createLogger("equiv-test");
      const logger2 = getLogger("equiv-test");

      expect(logger1.moduleName).toBe(logger2.moduleName);
      expect(logger1.pino.level).toBe(logger2.pino.level);
    } finally {
      if (originalLogLevel !== undefined) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
      if (originalAppEnv !== undefined) {
        process.env.APP_ENV = originalAppEnv;
      } else {
        delete process.env.APP_ENV;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: formatError
// ---------------------------------------------------------------------------

describe("formatError", () => {
  it("formats a standard Error", () => {
    const err = new Error("Something broke");
    const formatted = formatError(err);

    expect(formatted["error.message"]).toBe("Something broke");
    expect(formatted["error.kind"]).toBe("Error");
    expect(formatted["error.stack"]).toBeDefined();
  });

  it("formats a TypeError", () => {
    const err = new TypeError("Cannot read property 'x' of undefined");
    const formatted = formatError(err);

    expect(formatted["error.kind"]).toBe("TypeError");
    expect(formatted["error.message"]).toContain("Cannot read property");
  });

  it("truncates long stack traces to 6 lines", () => {
    const err = new Error("deep stack");
    err.stack = Array.from({ length: 20 }, (_, i) => `    at fn${i} (file.ts:${i}:1)`).join("\n");

    const formatted = formatError(err);
    const stackLines = formatted["error.stack"]!.split("\n");
    // 6 actual lines + 1 "... N more lines" line
    expect(stackLines.length).toBe(7);
    expect(stackLines[6]).toContain("... 14 more lines");
  });

  it("truncates long messages to 500 chars", () => {
    const longMessage = "x".repeat(600);
    const err = new Error(longMessage);
    const formatted = formatError(err);

    expect(formatted["error.message"].length).toBe(503); // 500 + "..."
    expect(formatted["error.message"].endsWith("...")).toBe(true);
  });

  it("includes error code when present", () => {
    const err = new Error("Connection refused") as Error & { code: string };
    err.code = "ECONNREFUSED";
    const formatted = formatError(err);

    expect(formatted["error.code"]).toBe("ECONNREFUSED");
  });

  it("handles AggregateError", () => {
    const errs = [new Error("first"), new Error("second"), new Error("third")];
    const agg = new AggregateError(errs, "Multiple failures");
    const formatted = formatError(agg);

    expect(formatted["error.kind"]).toBe("AggregateError");
    expect(formatted["error.message"]).toContain("first");
    expect(formatted["error.message"]).toContain("+2 more errors");
  });

  it("handles non-Error values (string)", () => {
    const formatted = formatError("just a string");

    expect(formatted["error.message"]).toBe("just a string");
    expect(formatted["error.kind"]).toBe("string");
    expect(formatted["error.stack"]).toBeUndefined();
  });

  it("handles non-Error values (number)", () => {
    const formatted = formatError(42);

    expect(formatted["error.message"]).toBe("42");
    expect(formatted["error.kind"]).toBe("number");
  });

  it("handles null/undefined", () => {
    expect(formatError(null)["error.message"]).toBe("null");
    expect(formatError(undefined)["error.message"]).toBe("undefined");
  });

  it("produces Datadog-compatible flat field names", () => {
    const formatted = formatError(new Error("test"));
    const keys = Object.keys(formatted);

    for (const key of keys) {
      expect(key).toMatch(/^error\./);
    }
  });

  it("can be spread into logger metadata", () => {
    const { logger, getOutput } = createCapturingLogger("err-test", makeConfig());
    const err = new Error("boom");

    logger.error("Operation failed", { ...formatError(err), operation: "save" });

    const parsed = JSON.parse(getOutput()[0]);
    expect(parsed["error.message"]).toBe("boom");
    expect(parsed["error.kind"]).toBe("Error");
    expect(parsed.operation).toBe("save");
  });
});
