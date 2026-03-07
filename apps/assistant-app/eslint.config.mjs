import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { baseConfig } from "../../eslint.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Extend base monorepo config
  ...baseConfig,

  // Add Next.js specific rules
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Enable type-aware linting
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
    ignores: ["lib/generated/**/*", "next-env.d.ts"],
  },
];

export default eslintConfig;
