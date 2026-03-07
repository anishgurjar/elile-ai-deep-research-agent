import { defineConfig } from "vitest/config";
import { createBaseTestConfig } from "@elileai/shared-testing";

const base = createBaseTestConfig("langsmith");

export default defineConfig({
  test: {
    ...base,
    include: ["src/**/*.int.test.ts"],
    reporters: ["default"],
  },
});
