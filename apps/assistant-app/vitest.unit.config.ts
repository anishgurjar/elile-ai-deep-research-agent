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
    exclude: [...base.exclude, "**/.next/**", "**/*.endpoint-test.*", "**/*.int.test.*"],
  },
});
