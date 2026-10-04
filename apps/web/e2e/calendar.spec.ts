import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 14: the calendar. Reading tests use the shared account; tests that
 * change the calendar sign up their own account, so desktop and mobile runs
 * never see each other's events.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const eventButtons = (page: Page, name: RegExp) => page.getByRole("button", { name });

test.describe("Calendar: the university timetable", () => {
  test("shows Group A's labs and the shared lectures, and no other group", async ({ page }) => {
    await page.goto("/calendar?view=week&date=2026-10-05");
    await expect(page.getByRole("heading", { name: "5 Oct – 11 Oct 2026" })).toBeVisible();

    await expect(eventButtons(page, /, Lecture, /)).toHaveCount(6);
    await expect(eventButtons(page, /, Lab, .*group A$/)).toHaveCount(12);
    await expect(eventButtons(page, /group [B-F]$/)).toHaveCount(0);
    await expect(
      eventButtons(page, /^Pathology Lab, Lab, 14:45 to 15:30, .*room Sectra, group A$/),
    ).toHaveCount(1);
    await expect(
      eventButtons(page, /^Last day to add\/drop a course, Academic date, all day/),
    ).toBeVisible();
  });

  test("teaches nothing in the midterm period, and resumes after it", async ({ page }) => {
    // Monday 16 to Wednesday 18 November are midterm days; Thursday 19 is teaching again.
    for (const date of ["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18"]) {
      await page.goto(`/calendar?view=day&date=${date}`);
      await expect(eventButtons(page, /^Midterm period, Midterm, all day/)).toBeVisible();
      await expect(eventButtons(page, /, (Lecture|Lab), /)).toHaveCount(0);
    }
    await page.goto("/calendar?view=day&date=2026-11-19");
    await expect(eventButtons(page, /^Medical Microbiology I, Lecture/)).toBeVisible();
  });

  test("shows the term week by week with the academic periods", async ({ page }) => {
    await page.goto("/calendar?view=semester");
    const weeks = page.getByRole("list", { name: "Weeks of the semester" });
    await expect(weeks.getByRole("link", { name: /^Week 1( \(this week\))?$/ })).toBeVisible();
    await expect(weeks.getByRole("link", { name: /^Week 14( \(this week\))?$/ })).toBeVisible();
    await expect(weeks.getByRole("link", { name: "Winter holidays" })).toHaveCount(2);
    await expect(weeks.getByRole("link", { name: "Final exams" })).toHaveCount(2);
    await expect(
      page
        .getByRole("region", { name: "Academic calendar" })
        .getByText("Midterm period", { exact: true }),
    ).toBeVisible();
  });

  test("moves between periods and views", async ({ page }) => {
    await page.goto("/calendar?view=month&date=2026-12-10");
    await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
    await expect(eventButtons(page, /^Winter holidays, Holiday/).first()).toBeVisible();
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page.getByRole("heading", { name: "January 2027" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Calendar view" })
      .getByRole("link", { name: "Day" })
      .click();
    await expect(page).toHaveURL(/view=day&date=2027-01-01/);
  });

  test("passes an accessibility scan with an event open", async ({ page }) => {
    await page.goto("/calendar?view=week&date=2026-10-05");
    await eventButtons(page, /^Pharmacology I, Lecture/).click();
    await expect(page.getByRole("dialog", { name: "Pharmacology I" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

test.describe("Calendar: changes", () => {
  test.use({ storageState: SIGNED_OUT });

  test("keeps notes on a timetable event, which cannot be edited", async ({ page }) => {
    await signUp(page, uniqueUser("calendar-notes"));
    await page.goto("/calendar?view=day&date=2026-10-06");
    await eventButtons(page, /^Pharmacology I, Lecture/).click();
    const dialog = page.getByRole("dialog", { name: "Pharmacology I" });
    await expect(dialog.getByText("From the university timetable.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await dialog.getByLabel("Notes").fill("Sit near the front");
    await dialog.getByRole("button", { name: "Save notes" }).click();
    await expect(dialog.getByText("Notes saved.")).toBeVisible();

    await page.reload();
    await eventButtons(page, /^Pharmacology I, Lecture/).click();
    await expect(page.getByRole("dialog").getByLabel("Notes")).toHaveValue("Sit near the front");
  });

  test("adds, edits and deletes an event of the user's own", async ({ page }) => {
    await signUp(page, uniqueUser("calendar-own"));
    await page.goto("/calendar?view=day&date=2026-10-10");
    await page.getByRole("button", { name: "New event" }).click();
    const form = page.getByRole("dialog", { name: "New event" });
    await form.getByLabel("Title").fill("Revise receptors");
    await form.getByLabel("Type").selectOption("revision");
    await form.getByLabel("Course").selectOption({ label: "Pharmacology I" });
    await form.getByLabel("Date").fill("2026-10-10");
    await form.getByLabel("Start").fill("10:00");
    await form.getByLabel("End").fill("11:30");
    await form.getByRole("button", { name: "Add event" }).click();

    const own = eventButtons(page, /^Revise receptors, Revision, 10:00 to 11:30, .*your event$/);
    await expect(own).toBeVisible();

    await own.click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit event" });
    await edit.getByLabel("Title").fill("Revise agonists");
    await edit.getByRole("button", { name: "Save changes" }).click();
    const renamed = eventButtons(page, /^Revise agonists, Revision/);
    await expect(renamed).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await renamed.click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(renamed).toHaveCount(0);
  });

  test("adds a course exam by hand", async ({ page }) => {
    await signUp(page, uniqueUser("calendar-exam"));
    await page.goto("/calendar?view=week&date=2027-01-18");
    await page.getByRole("button", { name: "Add exam" }).click();
    const form = page.getByRole("dialog", { name: "Add exam" });
    await form.getByLabel("Course").selectOption({ label: "Pharmacology I" });
    await form.getByLabel("Exam", { exact: true }).selectOption("final");
    await form.getByLabel("Date").fill("2027-01-20");
    await form.getByLabel("Start").fill("09:00");
    await form.getByLabel("End").fill("11:00");
    await form.getByLabel("Place").fill("Sigma");
    await form.getByRole("button", { name: "Add exam" }).click();

    await expect(
      eventButtons(page, /^Pharmacology I — Final exam, Final exam, 09:00 to 11:00/),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Course exams" }).getByText("Pharmacology I — Final exam"),
    ).toBeVisible();
  });
});
