import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/next-env.d.ts",
  ]),
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      next: { rootDir: "apps/web/" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The web app reaches data only through the user-scoped helpers in
    // src/server/session.ts. Nothing outside src/server may open the database.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/server/**", "apps/web/src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/database",
              message:
                "Use getUserScope() from @/server/session so queries are bound to the signed-in user.",
            },
            {
              name: "@medos/database",
              importNames: ["connect"],
              message:
                "Use getUserScope() from @/server/session so queries are bound to the signed-in user.",
            },
          ],
        },
      ],
    },
  },
  prettier,
]);
