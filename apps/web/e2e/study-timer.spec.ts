import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 13: the study timer. A user has one open timer at a time, so every
 * test signs up its own account rather than sharing one with tests running
 * alongside it. Idle and background pauses and the interrupted-timer rules
 * are covered by unit tests; they depend on minutes passing.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const pill = (page: Page) => page.getByRole("button", { name: /^Study timer:/ });
const startMenu = (page: Page) => page.getByRole("button", { name: "Start a study timer" });

async function startRevision(page: Page) {
  await startMenu(page).click();
  await page.getByRole("menuitem", { name: "Revision" }).click();
  await expect(pill(page)).toHaveAccessibleName(/Revision.*Running/);
}

test.describe("Study timer", () => {
  test.use({ storageState: SIGNED_OUT });

  test("starts, pauses, resumes and finishes from the top bar", async ({ page }) => {
    await signUp(page, uniqueUser("timer-basic"));
    await startRevision(page);
    await expect(page.getByRole("status").filter({ hasText: "Timer started." })).toBeAttached();

    await page.getByRole("button", { name: "Pause timer" }).click();
    await expect(pill(page)).toHaveAccessibleName(/Paused/);
    const paused = await pill(page).textContent();
    await page.waitForTimeout(1500);
    // Paused time is not counted: the clock does not move.
    expect(await pill(page).textContent()).toBe(paused);

    await page.getByRole("button", { name: "Resume timer" }).click();
    await expect(pill(page)).toHaveAccessibleName(/Running/);

    await pill(page).click();
    await page.getByRole("menuitem", { name: "Finish and save" }).click();
    await expect(startMenu(page)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Timer finished/ })).toBeAttached();
  });

  test("keeps a running timer across navigation and a reload", async ({ page }) => {
    await signUp(page, uniqueUser("timer-reload"));
    await startRevision(page);

    // Moving between pages never interrupts it.
    await page.goto("/courses");
    await expect(pill(page)).toHaveAccessibleName(/Revision.*Running/);

    // Leaving while timing asks first; the session is kept on the server either way.
    await page.mouse.click(5, 300);
    const asked = new Promise<string>((resolve) => {
      page.once("dialog", async (dialog) => {
        resolve(dialog.type());
        await dialog.accept();
      });
    });
    await page.reload();
    expect(await asked).toBe("beforeunload");
    await expect(pill(page)).toHaveAccessibleName(/Revision.*Running/);
  });

  test("allows only one timer and offers to replace it", async ({ page }) => {
    await signUp(page, uniqueUser("timer-one"));
    await startRevision(page);

    await page.goto("/flashcards/pharmacology/review");
    await page.getByRole("button", { name: "Start timer" }).click();
    const dialog = page.getByRole("dialog", { name: "A timer is already running" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Keep the current timer" }).click();
    await expect(pill(page)).toHaveAccessibleName(/Revision/);

    await page.getByRole("button", { name: "Start timer" }).click();
    await dialog.getByRole("button", { name: "Finish it and start" }).click();
    await expect(pill(page)).toHaveAccessibleName(/Flashcards.*Running/);
    // The page now shows the timer for this place instead of a start button.
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start timer" })).toHaveCount(0);
  });

  test("passes an accessibility scan with a timer running", async ({ page }) => {
    await signUp(page, uniqueUser("timer-a11y"));
    await startRevision(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);

    // Keyboard: the controls are reachable and work without a pointer.
    await page.getByRole("button", { name: "Pause timer" }).focus();
    await page.keyboard.press("Enter");
    await expect(pill(page)).toHaveAccessibleName(/Paused/);
  });
});
