import { type Page, test as base, expect } from "@playwright/test";

import type { TestUser } from "./users";

let sequence = 0;

/**
 * The project's `test`. Every test presents itself as a different client
 * address, the way separate visitors would. The server's sign-in rate limit
 * is per address, so tests do not throttle one another, and the limiter stays
 * fully enabled (one test exercises it on purpose).
 */
export const test = base.extend({
  // Playwright requires the first argument to be a destructuring pattern, even when empty.
  extraHTTPHeaders: async ({}, provide, testInfo) => {
    sequence += 1;
    const address = `10.${testInfo.workerIndex % 250}.${Math.floor(sequence / 250)}.${(sequence % 250) + 1}`;
    await provide({ "x-forwarded-for": address });
  },
});

export { expect };

/** A browser state with no session. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/** The sign-in form's error message. (Next.js renders an alert of its own: the route announcer.) */
export function formError(page: Page) {
  return page.locator("form").getByRole("alert");
}

export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

export async function signIn(page: Page, user: TestUser, path = "/login"): Promise<void> {
  await page.goto(path);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
