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
    include: [
      "**/__tests__/**/*.(test|spec|endpoint-test).[jt]s?(x)",
      "**/?(*.)+(spec|test|endpoint-test).[jt]s?(x)",
    ],
    exclude: [...base.exclude, "**/.next/**"],
  },
});
