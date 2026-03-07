import { defineConfig } from "vitest/config";
import { createBaseTestConfig } from "@elileai/shared-testing";

const base = createBaseTestConfig("logger");

export default defineConfig({
  test: {
    ...base,
    include: ["__tests__/**/*.test.ts"],
  },
});
