import js from "@eslint/js";
import globals from "globals";

// Flat config: export an array. Use @eslint/js recommended base, then project tweaks.
export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Project preferences (tweak as you like)
      "no-undef": "error",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      // Safer JS defaults
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-return-assign": ["error", "except-parens"],
      "no-shadow": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-var": "error",
      "prefer-const": "warn",
      "object-shorthand": "warn",
      "prefer-template": "warn",
      "arrow-parens": ["warn", "as-needed"],
      "no-unsafe-negation": "error",
      // Allowed for performance-oriented math in this project
      "no-bitwise": "off",
      "no-magic-numbers": "off",
    },
  },
  // Optional: ignore generated folders
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "**/*.min.js",
      // ignore old prototype files at repo root if present
      "doom_raycaster_*.js",
    ],
  },
];
