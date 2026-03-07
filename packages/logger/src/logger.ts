import pino from "pino";
import type { Logger as PinoLogger } from "pino";
import { resolveConfig, PINO_LEVEL_MAP } from "./config";
import type { DestinationStream, Logger, LogMetadata, LoggerConfig } from "./types";

// ---------------------------------------------------------------------------
// Global destination override (used by @elileai/logger/testing)
// ---------------------------------------------------------------------------

let _destinationOverride: DestinationStream | null = null;

/** @internal Set a global destination stream. All loggers created after this call write here. */
export function _setDestinationOverride(dest: DestinationStream): void {
  _destinationOverride = dest;
}

/** @internal Clear the global destination override. */
export function _clearDestinationOverride(): void {
  _destinationOverride = null;
}

/**
 * Builds the base bindings (fields included in every log entry)
 * from the namespace.
 */
function buildBaseBindings(
  namespace: readonly string[]
): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};

  if (namespace.length > 0) {
    bindings.namespace = namespace.join(".");
  }

  return bindings;
}

/**
 * Pino's native highest level is "fatal", but Datadog's standard statuses
 * use "critical". This map ensures the emitted "status" field always
 * matches a Datadog-recognised severity.
 */
const PINO_LABEL_TO_DATADOG_STATUS: Record<string, string> = {
  fatal: "critical",
};

/**
 * Pino level formatter that emits a "status" field with string labels.
 * Datadog natively auto-detects log severity from the "status" field,
 * so no pipeline remapper or category processor is needed.
 */
const levelFormatter = {
  level(label: string) {
    return { status: PINO_LABEL_TO_DATADOG_STATUS[label] ?? label };
  },
};

/**
 * Builds pino options based on the resolved config.
 *
 * - Development: Uses pino-pretty for human-readable colored output.
 * - Production/other: No transport (pino's default JSON output to stdout).
 */
function buildPinoOptions(
  moduleName: string,
  config: LoggerConfig
): pino.LoggerOptions {
  const pinoLevel = PINO_LEVEL_MAP[config.logLevel];
  const baseBindings = buildBaseBindings([]);

  const baseOptions: pino.LoggerOptions = {
    name: moduleName,
    level: pinoLevel,
    formatters: levelFormatter,
    base: { ...baseBindings },
  };

  if (config.isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    };
  }

  return {
    ...baseOptions,
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/**
 * Wraps a pino instance into our public Logger interface,
 * with child logger and namespace support.
 */
function wrapPinoLogger(
  pinoInstance: PinoLogger,
  moduleName: string,
  namespace: readonly string[]
): Logger {
  return {
    get moduleName() {
      return moduleName;
    },

    get namespace() {
      return namespace;
    },

    debug(message: string, metadata?: LogMetadata): void {
      if (metadata) {
        pinoInstance.debug(metadata, message);
      } else {
        pinoInstance.debug(message);
      }
    },

    info(message: string, metadata?: LogMetadata): void {
      if (metadata) {
        pinoInstance.info(metadata, message);
      } else {
        pinoInstance.info(message);
      }
    },

    warn(message: string, metadata?: LogMetadata): void {
      if (metadata) {
        pinoInstance.warn(metadata, message);
      } else {
        pinoInstance.warn(message);
      }
    },

    error(message: string, metadata?: LogMetadata): void {
      if (metadata) {
        pinoInstance.error(metadata, message);
      } else {
        pinoInstance.error(message);
      }
    },

    critical(message: string, metadata?: LogMetadata): void {
      if (metadata) {
        pinoInstance.fatal(metadata, message);
      } else {
        pinoInstance.fatal(message);
      }
    },

    child(name: string, metadata?: LogMetadata): Logger {
      const childNamespace = [...namespace, name];
      const childBindings: Record<string, unknown> = {
        namespace: childNamespace.join("."),
        ...(metadata ?? {}),
      };
      const childPino = pinoInstance.child(childBindings);
      return wrapPinoLogger(childPino, moduleName, childNamespace);
    },

    get pino() {
      return pinoInstance;
    },
  };
}

/**
 * Creates a logger for the given module name.
 *
 * The logger reads environment variables at creation time:
 * - APP_ENV — determines formatting (development=colored, other=JSON)
 * - LOG_LEVEL — minimum level to emit (defaults to "info")
 *
 * @param moduleName - A descriptive name for the module (e.g., "auth", "api-gateway")
 * @returns A Logger instance
 *
 * @example
 * ```typescript
 * import { createLogger } from "@elileai/logger";
 *
 * const logger = createLogger("auth");
 * logger.info("User authenticated", { userId: "abc123" });
 *
 * const jwtLogger = logger.child("jwt-verify");
 * jwtLogger.error("Token expired", { tokenAge: 3600 });
 * // namespace: "auth.jwt-verify"
 * ```
 */
export function createLogger(moduleName: string): Logger {
  const config = resolveConfig();

  const pinoInstance = _destinationOverride
    ? pino(
        {
          name: moduleName,
          level: PINO_LEVEL_MAP[config.logLevel],
          formatters: levelFormatter,
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        _destinationOverride as pino.DestinationStream,
      )
    : pino(buildPinoOptions(moduleName, config));

  const namespace = [moduleName];
  const rootBindings = buildBaseBindings(namespace);
  const boundPino = pinoInstance.child(rootBindings);
  return wrapPinoLogger(boundPino, moduleName, namespace);
}

/**
 * Creates a logger with an explicit configuration override.
 * Useful for testing or advanced use cases where you need to bypass
 * environment variable resolution.
 */
export function createLoggerWithConfig(
  moduleName: string,
  config: LoggerConfig
): Logger {
  const pinoInstance = _destinationOverride
    ? pino(
        {
          name: moduleName,
          level: PINO_LEVEL_MAP[config.logLevel],
          formatters: levelFormatter,
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        _destinationOverride as pino.DestinationStream,
      )
    : pino(buildPinoOptions(moduleName, config));

  const namespace = [moduleName];
  const rootBindings = buildBaseBindings(namespace);
  const boundPino = pinoInstance.child(rootBindings);
  return wrapPinoLogger(boundPino, moduleName, namespace);
}

/**
 * Alias for createLogger. Provided for convenience and familiarity
 * with Python's logging.getLogger() pattern.
 */
export function getLogger(moduleName: string): Logger {
  return createLogger(moduleName);
}
