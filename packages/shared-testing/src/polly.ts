import path from "path";
import { fileURLToPath } from "url";
import { Polly } from "@pollyjs/core";
import FetchAdapter from "@pollyjs/adapter-fetch";
import FSPersister from "@pollyjs/persister-fs";

let didRegister = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function registerPollyOnce() {
  if (didRegister) return;
  // Polly.register expects a constructable Adapter/Persister class.
  // With ESM + the Polly v6 type surface, TS can see these default exports as a
  // module namespace instead of a `new (...) => ...` constructor. Runtime is fine,
  // so we cast to an explicit "registerable constructor" type here.
  type Registerable = Parameters<typeof Polly.register>[0];
  Polly.register(FetchAdapter as unknown as Registerable);
  Polly.register(FSPersister as unknown as Registerable);
  didRegister = true;
}

export function sanitizeRecordingName(name: string, options?: { maxLen?: number }) {
  const maxLen = options?.maxLen ?? 180;
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, maxLen);
}

export function getPollyRecordingBaseName(currentTestName: string) {
  return sanitizeRecordingName(currentTestName || "test");
}

export function normalizeHeaderNames(headers: string[] = []) {
  return Array.from(
    new Set(
      headers
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function createPollyForTest(
  currentTestName: string,
  options?: {
    recordingsDir?: string;
    mode?: "record" | "replay";
    recordIfMissing?: boolean;
    recordFailedRequests?: boolean;
    sensitiveHeaders?: string[];
  },
) {
  registerPollyOnce();

  const recordingsDir =
    options?.recordingsDir ?? path.resolve(__dirname, "../../test-recordings");

  const mode = options?.mode ?? "replay";
  const recordIfMissing = options?.recordIfMissing ?? false;
  const recordFailedRequests = options?.recordFailedRequests ?? false;

  const sensitiveHeaders = normalizeHeaderNames([
    "authorization",
    "x-api-key",
    ...(options?.sensitiveHeaders ?? []),
  ]);

  const polly = new Polly(getPollyRecordingBaseName(currentTestName || "http-recording"), {
    adapters: ["fetch"],
    persister: "fs",
    mode,
    recordIfMissing,
    recordFailedRequests,
    matchRequestsBy: {
      // Avoid coupling to auth headers & transient headers.
      headers: false,
      method: true,
      url: true,
      body: true,
    },
    persisterOptions: {
      fs: { recordingsDir },
    },
  });

  type HarHeader = { name?: unknown; value?: unknown };
  type PollyRecordingLike = {
    request?: { headers?: unknown };
    response?: { headers?: unknown };
  };

  type PollyServer = {
    any: (url?: string) => {
      on: (
        event: "beforePersist" | "request",
        handler: (req: unknown, recording: PollyRecordingLike) => void,
      ) => void;
      passthrough: () => void;
    };
  };

  const server = (polly as unknown as { server: PollyServer }).server;

  // Passthrough Clerk Backend API calls — these must always be live so that
  // fetchClerkSessionToken gets a real JWT; the token itself is redacted before
  // the cassette is persisted anyway.
  server.any("https://api.clerk.com/*").passthrough();

  // Redact secrets before writing cassettes.
  server.any().on("beforePersist", (_req, recording) => {
    const shouldRedactHeaderName = (name: string) =>
      sensitiveHeaders.includes(name.toLowerCase());

    const headers = recording?.request?.headers;
    // HAR stores headers as an array: [{ name, value }, ...]
    if (Array.isArray(headers)) {
      for (const h of headers) {
        if (h && typeof h === "object") {
          const name = String((h as { name?: unknown }).name ?? "");
          if (name && shouldRedactHeaderName(name)) {
            // Match our nock wrapper convention.
            (h as { value?: string }).value = "**REDACTED**";
          }
        }
      }
    } else if (headers && typeof headers === "object") {
      // Fallback for non-HAR shapes.
      const headerObj = headers as Record<string, unknown>;
      for (const k of Object.keys(headerObj)) {
        if (shouldRedactHeaderName(k)) headerObj[k] = "**REDACTED**";
      }
    }

    const responseHeaders = recording?.response?.headers;
    if (Array.isArray(responseHeaders)) {
      // HAR array form: drop set-cookie entries entirely.
      for (let i = responseHeaders.length - 1; i >= 0; i--) {
        const h = responseHeaders[i];
        const name =
          h && typeof h === "object" ? String((h as HarHeader).name ?? "") : "";
        if (name.toLowerCase() === "set-cookie") {
          responseHeaders.splice(i, 1);
        }
      }
    } else if (responseHeaders && typeof responseHeaders === "object") {
      // Avoid persisting cookies that can churn between runs.
      const headerObj = responseHeaders as Record<string, unknown>;
      for (const k of Object.keys(headerObj)) {
        if (String(k).toLowerCase() === "set-cookie") delete headerObj[k];
      }
    }
  });

  return polly;
}

