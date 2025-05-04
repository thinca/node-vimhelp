// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.eslintRecommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },

      ecmaVersion: 2018,
      sourceType: "module",
    },
    rules: {
      indent: ["error", 2, {
        SwitchCase: 1,
      }],

      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double"],
      semi: ["error", "always"],

      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
      }],
    },
  }
);
