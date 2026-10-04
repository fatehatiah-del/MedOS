import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 18: restrained progress. The weekly target is the user's own study
 * time; streaks are covered by unit tests (they need days to pass).
 */

test.use({ storageState: SIGNED_OUT });

test("the weekly target follows the study time you set", async ({ page }) => {
  await signUp(page, uniqueUser("progress-week"));
  await page.goto("/today");
  const progress = page.getByRole("region", { name: "Today's progress" });
  // Defaults: 2h 30m on five weekdays and 4h on two weekend days.
  await expect(progress).toContainText("0m of 20h 30m this week");
  await expect(progress).toContainText("No study streak yet.");
  await expect(progress.getByRole("progressbar", { name: "Study time this week" })).toBeVisible();

  await page.goto("/study-plan");
  await page.getByLabel("Weekdays (hours)").fill("1");
  await page.getByLabel("Weekends (hours)").fill("2");
  await page.getByRole("button", { name: "Save study time" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.goto("/today");
  await expect(progress).toContainText("0m of 9h this week");
  await page.goto("/statistics");
  await expect(page.getByText("0m / 9h")).toBeVisible();
  // Nothing childish: no badges, points or levels anywhere.
  await expect(page.getByText(/badge|level up|points/i)).toHaveCount(0);
});
