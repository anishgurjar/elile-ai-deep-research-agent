import fs from "fs";
import path from "path";
import { afterEach, beforeEach, expect } from "vitest";
import type { Polly } from "@pollyjs/core";
import {
  createPollyForTest,
  getPollyRecordingBaseName,
  normalizeHeaderNames,
} from "./polly";

const defaultSensitiveHeaders = ["authorization", "x-api-key"];

export interface SensitiveDataConfig {
  sensitiveHeaders?: string[];
  recordingsDir?: string;
  recordFailedRequests?: boolean;
}

export function setupPollyRecording(config: SensitiveDataConfig = {}) {
  const recordingsDir = config.recordingsDir ?? path.resolve(process.cwd(), "test-recordings");
  const sensitiveHeaders = normalizeHeaderNames([
    ...defaultSensitiveHeaders,
    ...(config.sensitiveHeaders ?? []),
  ]);
  const recordFailedRequests = config.recordFailedRequests ?? true;

  const generateTestName = () => {
    const state = expect.getState();
    let testName = state.currentTestName ?? "";
    if (!testName) throw new Error("Unable to determine current test name.");

    const testPath = state.testPath;
    if (testPath) {
      const fileName = path.basename(testPath).replace(/\.(int\.)?test\.(t|j)sx?$/, "");
      testName = `${fileName}-${testName}`;
    }

    return testName;
  };

  let polly: Polly | undefined;

  beforeEach(() => {
    const fullName = generateTestName();

    const baseName = getPollyRecordingBaseName(fullName);
    const hasCassette =
      fs.existsSync(recordingsDir) &&
      fs
        .readdirSync(recordingsDir)
        .some((entry) => {
          const onDiskPrefix = entry.split("_")[0] ?? "";
          if (!onDiskPrefix) return false;
          return (
            onDiskPrefix === baseName ||
            onDiskPrefix.startsWith(baseName) ||
            baseName.startsWith(onDiskPrefix)
          );
        });

    const shouldRecord = !hasCassette;

    polly = createPollyForTest(fullName, {
      recordingsDir,
      mode: shouldRecord ? "record" : "replay",
      recordIfMissing: shouldRecord,
      recordFailedRequests,
      sensitiveHeaders,
    });
  });

  afterEach(async () => {
    await polly?.stop();
    polly = undefined;
  });
}

