import type { UserConfig } from "vitest/config";

type TestConfig = NonNullable<UserConfig["test"]>;

export function createBaseTestConfig(projectName: string): TestConfig & {
  include: string[];
  exclude: string[];
} {
  return {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20_000,
    passWithNoTests: true,
    include: [
      "**/__tests__/**/*.(test|spec).[jt]s?(x)",
      "**/?(*.)+(spec|test).[jt]s?(x)",
      "**/*.int.test.[jt]s?(x)",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: `../../coverage/apps/${projectName}/html`,
      reporter: ["html", "text", "cobertura"],
    },
    reporters: [
      "default",
      [
        "junit",
        {
          outputFile: `../../reports/apps/${projectName}/unittests/junit.xml`,
        },
      ],
    ],
  };
}
