import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { READER_STATE } from "./support/reader";
import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 15: the Study Plan. Tests that change a plan sign up their own
 * account; the suggestion test only reads the reader account's plan.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const planItems = (page: Page) =>
  page.getByRole("list", { name: "Plan items" }).getByRole("listitem");

async function addItem(page: Page, title: string, minutes = 30) {
  await page.getByRole("button", { name: "Add item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add to the plan" });
  await dialog.getByLabel("What").fill(title);
  await dialog.getByLabel("Minutes").fill(String(minutes));
  await dialog.getByRole("button", { name: "Add to plan" }).click();
  await expect(planItems(page).filter({ hasText: title })).toBeVisible();
}

/** Runs a change and waits for its save to reach the server. */
async function saved(page: Page, change: () => Promise<void>) {
  const response = page.waitForResponse((r) => r.request().method() === "POST");
  await change();
  expect((await response).ok()).toBe(true);
}

/** Sets every suggestion aside, as a user overriding the plan entirely would. */
async function clearSuggestions(page: Page) {
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Clear suggestions" }).click();
  await expect(page.getByText("Nothing planned")).toBeVisible();
}

test.describe("Study Plan: suggestions", () => {
  test.use({ storageState: READER_STATE });

  test("suggests unfinished lectures and explains why", async ({ page }) => {
    await page.goto("/study-plan");
    const first = planItems(page).first();
    await expect(first).toBeVisible();
    await first.getByRole("button", { name: "Why?" }).click();
    await expect(first).toContainText("Not marked complete");
    await expect(first).toContainText(/Priority \d+: the sum of the reasons above/);
    await expect(page.getByText(/planned of 2h 30m|planned of 4h/)).toBeVisible();
  });
});

test.describe("Study Plan: the user's own plan", () => {
  test.use({ storageState: SIGNED_OUT });

  test("adds, resizes, reorders and ticks off items, and keeps them", async ({ page }) => {
    await signUp(page, uniqueUser("plan-edit"));
    await page.goto("/study-plan");
    // New accounts have placeholder lectures, so the day starts with suggestions.
    await expect(planItems(page).first()).toBeVisible();
    await clearSuggestions(page);

    await addItem(page, "Anatomy atlas");
    await addItem(page, "Write summary");
    await expect(planItems(page)).toHaveCount(2);

    // Reorder from the keyboard: pick up, move up, drop.
    await page.getByRole("button", { name: /^Move Write summary/ }).focus();
    // dnd-kit measures positions between frames; a person never presses this fast.
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
    // Each change is saved in order; wait for each save so the next wait matches its own.
    await saved(page, () => page.keyboard.press("Space"));
    await expect(planItems(page).first()).toContainText("Write summary");

    await saved(page, () =>
      page
        .getByLabel("Minutes for Anatomy atlas")
        .selectOption("45")
        .then(() => undefined),
    );
    await saved(page, () => page.getByRole("checkbox", { name: "Write summary" }).check());

    await page.reload();
    await expect(planItems(page).first()).toContainText("Write summary");
    await expect(page.getByRole("checkbox", { name: "Write summary" })).toBeChecked();
    await expect(page.getByLabel("Minutes for Anatomy atlas")).toHaveValue("45");
    await expect(page.getByText(/^1h 15m planned of/)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  test("postpones to tomorrow and removes items", async ({ page }) => {
    await signUp(page, uniqueUser("plan-move"));
    await page.goto("/study-plan");
    await clearSuggestions(page);
    await addItem(page, "Kinetics problems");
    await addItem(page, "Old notes");

    await page.getByRole("button", { name: "Postpone Kinetics problems to tomorrow" }).click();
    await expect(planItems(page).filter({ hasText: "Kinetics problems" })).toHaveCount(0);
    await page.getByRole("button", { name: "Remove Old notes" }).click();
    await expect(planItems(page)).toHaveCount(0);

    await page.getByRole("link", { name: "Next day" }).click();
    const moved = planItems(page).filter({ hasText: "Kinetics problems" });
    await expect(moved).toBeVisible();
    await expect(moved).toContainText("Added by you");
  });

  test("changes the study time and shows the plan on Today", async ({ page }) => {
    await signUp(page, uniqueUser("plan-time"));
    await page.goto("/study-plan");
    // Whatever the day suggests (it depends on the date), only the item added below counts here.
    await clearSuggestions(page);
    await page.getByLabel("Weekdays (hours)").fill("1");
    await page.getByLabel("Weekends (hours)").fill("2");
    await page.getByRole("button", { name: "Save study time" }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();
    await expect(page.getByText(/planned of (1h|2h)$/)).toBeVisible();

    await addItem(page, "Receptor table", 25);
    await page.goto("/today");
    const plan = page.getByRole("region", { name: "Recommended study plan" });
    await expect(plan).toContainText("Receptor table");
    await expect(plan).toContainText("25m planned");
  });
});
