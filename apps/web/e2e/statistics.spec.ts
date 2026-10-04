import AxeBuilder from "@axe-core/playwright";

import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 16: statistics and weak spots. Each test signs up its own account, so
 * what it sees is exactly what it did: empty data first, then a concept it
 * marked difficult. Detailed figures are covered by the database tests.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

test.describe("Statistics", () => {
  test.use({ storageState: SIGNED_OUT });

  test("handles a semester with no activity", async ({ page }) => {
    await signUp(page, uniqueUser("stats-empty"));
    await page.goto("/statistics");
    await expect(page.getByRole("heading", { level: 1, name: "Statistics" })).toBeVisible();
    await expect(page.getByText("No study recorded yet.")).toBeVisible();
    await expect(page.getByText("Nothing stands out yet.", { exact: false })).toBeVisible();
    // Measures without data say so; none shows a made-up 0%.
    await expect(page.getByText("No data yet").first()).toBeAttached();
    await expect(page.getByText(/^0%$/)).toHaveCount(0);
    const courses = page.getByRole("region", { name: "Courses" }).getByRole("row");
    await expect(courses).toHaveCount(7);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  test("marks a concept difficult and shows it as a weak spot with its evidence", async ({
    page,
  }) => {
    await signUp(page, uniqueUser("stats-concept"));
    await page.goto("/statistics?course=pharmacology");
    const levels = page.getByRole("navigation", { name: "Statistics level" });
    await expect(levels.getByRole("link", { name: "Pharmacology", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByLabel("Mark a concept difficult").fill("Tachyphylaxis");
    await page.getByRole("button", { name: "Mark", exact: true }).click();

    const weakSpots = page.getByRole("region", { name: "Weak spots" });
    await expect(weakSpots.getByText("Tachyphylaxis")).toBeVisible();
    await expect(weakSpots.getByRole("list", { name: "Evidence for Tachyphylaxis" })).toContainText(
      "Marked difficult by you",
    );

    // It shows across the semester too, with its course.
    await levels.getByRole("link", { name: "Semester", exact: true }).click();
    await expect(page.getByRole("region", { name: "Weak spots" })).toContainText(
      "Concept · Pharmacology",
    );

    await page.goto("/statistics?course=pharmacology");
    await page.getByRole("button", { name: "Unmark difficult" }).click();
    await expect(page.getByText("Nothing stands out yet in this course.")).toBeVisible();
  });

  test("lists a course's lectures and shows a lecture's performance", async ({ page }) => {
    await signUp(page, uniqueUser("stats-lecture"));
    await page.goto("/statistics?course=pathology");
    const lectures = page.getByRole("region", { name: "Lectures" });
    await expect(lectures).toBeVisible();
    // Wide tables scroll inside their frame; the page itself never scrolls sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const first = lectures.getByRole("link").first();
    await expect(first).toBeVisible();
    await first.click();
    const performance = page.getByRole("region", { name: "Performance" });
    await expect(performance).toContainText("MCQ accuracy");
    await expect(performance).toContainText("No weak spots in this lecture.");
  });
});
