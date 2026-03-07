import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import noInstanceofPlugin from "eslint-plugin-no-instanceof";
import prettierConfig from "eslint-config-prettier";
import nxPlugin from "@nx/eslint-plugin";

/**
 * Base ESLint configuration for TypeScript projects in the monorepo.
 * Apps should import and extend this config.
 */
export const baseConfig = [
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-cjs/**",
      "**/.next/**",
      "**/coverage/**",
    ],
  },

  // Base config for all TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      "no-instanceof": noInstanceofPlugin,
      "@nx": nxPlugin,
    },
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,

      // TypeScript rules
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-use-before-define": ["error", "nofunc"],
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Import rules
      "import/extensions": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*.js", "**/*.js"],
              message:
                "Do not import paths with a .js extension. Omit the extension instead (e.g. './foo' not './foo.js').",
            },
            {
              group: ["*.ts", "**/*.ts"],
              message:
                "Do not import paths with a .ts extension. Omit the extension instead (e.g. './foo' not './foo.ts').",
            },
          ],
        },
      ],

      // Nx module boundary rules
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              // Libraries can only depend on other libraries
              sourceTag: "type:lib",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              // Apps can only depend on libraries
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              // Pipelines can only depend on libraries
              sourceTag: "type:pipeline",
              onlyDependOnLibsWithTags: ["type:lib"],
            },
            {
              // Infrastructure has no restrictions (it's standalone)
              sourceTag: "type:infra",
              onlyDependOnLibsWithTags: [],
            },
          ],
        },
      ],

      // General rules
      "no-instanceof/no-instanceof": "error",
      "no-process-env": "off",
      camelcase: "off",
      "class-methods-use-this": "off",
      "keyword-spacing": "error",
      "max-classes-per-file": "off",
      "max-len": "off",
      "no-await-in-loop": "off",
      "no-bitwise": "off",
      "no-console": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration[source.value=/\\.(js|ts)$/]",
          message:
            "Do not use .js/.ts extensions in re-exports. Use extensionless paths (e.g. './foo' instead of './foo.js').",
        },
        {
          selector: "ExportNamedDeclaration[source.value=/\\.(js|ts)$/]",
          message:
            "Do not use .js/.ts extensions in re-exports. Use extensionless paths (e.g. './foo' instead of './foo.js').",
        },
        {
          selector: "ImportExpression[source.value=/\\.(js|ts)$/]",
          message:
            "Do not use .js/.ts extensions in dynamic imports. Use extensionless paths instead.",
        },
      ],
      "no-shadow": "off",
      "no-continue": "off",
      "no-underscore-dangle": "off",
      "no-use-before-define": "off",
      "no-useless-constructor": "off",
      "no-return-await": "off",
      "consistent-return": "off",
      "no-else-return": "off",
      "new-cap": ["error", { properties: false, capIsNew: false }],
    },
  },
];

export default baseConfig;
