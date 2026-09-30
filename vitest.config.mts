import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          environment: "node",
          include: ["packages/shared/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "database",
          environment: "node",
          include: ["packages/database/src/**/*.test.ts"],
          // Each file starts an embedded PostgreSQL instance and applies the migrations.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["packages/ui/src/**/*.test.{ts,tsx}"],
          setupFiles: [fromRoot("./vitest.setup.ts")],
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: { "@": fromRoot("./apps/web/src") },
        },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
          setupFiles: [fromRoot("./vitest.setup.ts")],
          // The authentication and privacy tests start an embedded PostgreSQL instance.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
