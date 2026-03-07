import { defineConfig } from "vitest/config";
import path from "path";
import { createBaseTestConfig } from "@elileai/shared-testing";

const base = createBaseTestConfig("assistant-app");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    ...base,
    include: [...base.include, "**/*.endpoint-test.ts"],
    exclude: [...base.exclude, "**/.next/**"],
    reporters: ["default"],
  },
});
