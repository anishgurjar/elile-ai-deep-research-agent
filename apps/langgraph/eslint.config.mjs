import { baseConfig } from "../../eslint.config.mjs";

export default [
  // Extend base monorepo config
  ...baseConfig,

  // App-specific overrides for type-aware linting
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
      },
    },
  },

  // App-specific ignores
  {
    ignores: [
      "**/*.js",
      "**/*.cjs",
      "**/*.d.ts",
      ".eslintrc.cjs",
      "scripts/**",
    ],
  },
];
