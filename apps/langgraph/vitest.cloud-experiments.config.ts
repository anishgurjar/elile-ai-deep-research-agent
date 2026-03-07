import { defineConfig } from "vitest/config";
import { createBaseTestConfig } from "@elileai/shared-testing";

const base = createBaseTestConfig("langsmith");

export default defineConfig({
  test: {
    ...base,
    include: ["src/**/*.cloud-experiment.test.ts"],
    reporters: ["langsmith/vitest/reporter"],
    testTimeout: 120_000,
    maxConcurrency: 4,
  },
});
