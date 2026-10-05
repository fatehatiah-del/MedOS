import { randomBytes } from "node:crypto";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE } from "./e2e/support/users";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const isCI = Boolean(process.env.CI);

/**
 * E2E tests run against the production build (`npm run test:e2e` builds
 * first), so they exercise what would actually be deployed, including real
 * authentication: there is no test-only way in.
 *
 * Each run gets an empty scratch database and a throwaway signing secret. The
 * `setup` project creates an account through the sign-up screen and saves its
 * session; the browser projects start from that signed-in state.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  // The server under test uses one embedded database, which answers one query at a time.
  // With every browser project running in parallel, a save can wait its turn for several
  // seconds, so assertions that follow a server round trip get 10 s instead of 5 s.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE,
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: STORAGE_STATE },
    },
  ],
  webServer: {
    command: `npm run e2e:serve -- --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: `pglite:${path.join(__dirname, ".e2e", "pgdata")}`,
      // Images extracted from the synthetic Study Guide (see e2e/support/reader-fixture.ts).
      MEDOS_STORAGE_DIR: path.join(__dirname, ".e2e", "objects"),
      // Generated per run and never written anywhere.
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      APP_URL: baseURL,
      // Google is deliberately left unconfigured: it cannot be exercised without real credentials.
      AUTH_GOOGLE_CLIENT_ID: "",
      AUTH_GOOGLE_CLIENT_SECRET: "",
      AUTH_ALLOWED_EMAILS: "",
      // Every new test account gets the placeholder weeks: 1, 1, 0 and 2 lectures per course.
      DEV_FIXTURE_LECTURES: "true",
    },
  },
});
