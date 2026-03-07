import { defineConfig } from "vitest/config";
import { createBaseTestConfig } from "@elileai/shared-testing";

const base = createBaseTestConfig("langsmith");

export default defineConfig({
  test: {
    ...base,
    include: ["src/**/*.test.ts"],
    exclude: [
      ...base.exclude,
      "**/*.int.test.ts",
      "**/*.cloud-experiment.test.ts",
    ],
  },
});
