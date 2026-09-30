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
        },
      },
    ],
  },
});
