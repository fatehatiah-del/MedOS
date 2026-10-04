import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { READER_STATE } from "./support/reader";
import { expect, test } from "./support/test";

/*
 * Phase 17: search, against the reader account's synced material (a Study
 * Guide, a quiz and a Question Bank in Pharmacology, week 1). Read-only.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const field = (page: Page) => page.getByRole("searchbox", { name: "Search your study library" });
const group = (page: Page, name: string) =>
  page.getByRole("region", { name: new RegExp(`^${name} [(]`) });

test.use({ storageState: READER_STATE });

test("finds a Study Guide section with its context and opens it there", async ({ page }) => {
  await page.goto("/search");
  await field(page).fill("memory text");
  const guides = group(page, "Study Guides");
  const result = guides.getByRole("link", { name: /4 Clinical/ });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Study Guide");
  await expect(result).toContainText("Pharmacology");
  await expect(result).toContainText("Week 1");
  // The search's own announcement (the study timer has one too).
  await expect(page.getByRole("status").filter({ hasText: /results? for/ })).toContainText(
    /\d+ results? for memory text/,
  );

  await result.click();
  await expect(page).toHaveURL(/\/study-guide\/[^/]+#4-clinical$/);
  await expect(page.getByRole("heading", { name: /4 Clinical/ })).toBeVisible();
});

test("finds a Question Bank answer and opens that question", async ({ page }) => {
  await page.goto("/search");
  await field(page).fill("milliseconds");
  const result = group(page, "Question Bank").getByRole("link").first();
  await expect(result).toContainText("Question Bank");
  await result.click();
  await expect(page).toHaveURL(/\/question-bank\/[^/]+\?item=q\d+$/);
});

test("finds courses, keeps the query in the address, and reports no results", async ({ page }) => {
  await page.goto("/search?q=pharmacology");
  await expect(field(page)).toHaveValue("pharmacology");
  await expect(group(page, "Courses").getByRole("link", { name: /Pharmacology I/ })).toBeVisible();

  await field(page).fill("zzqx nothing");
  await expect(page.getByRole("heading", { name: "No results for “zzqx nothing”" })).toBeVisible();
  await expect(page).toHaveURL(/\?q=zzqx\+nothing$/);
});

test("moves from the field through the results with the arrow keys", async ({ page, isMobile }) => {
  test.skip(isMobile, "Arrow-key navigation is a desktop interaction.");
  await page.goto("/search");
  await field(page).fill("synthetic");
  const links = page.locator("[data-search-result]");
  await expect(links.first()).toBeVisible();
  await field(page).press("ArrowDown");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(field(page)).toBeFocused();

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
