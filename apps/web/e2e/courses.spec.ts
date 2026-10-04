import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { SIGNED_OUT, expect, signUp, test } from "./support/test";
import { uniqueUser } from "./support/users";

/*
 * Phase 4: Course → Week → Lecture, and manual completion.
 *
 * Every test account starts with the six courses and the placeholder weeks
 * (1, 1, 0 and 2 lectures), so each course has four lectures.
 */

const COURSE_NAMES = [
  "Pathology I",
  "Pathophysiology I",
  "Medical Microbiology I",
  "Pharmacology I",
  "Public & Global Health",
  "Communication Skills",
];

const LECTURE_URL = /\/courses\/pharmacology\/lectures\/[0-9a-f-]{36}$/;

/** Lecture links inside the course outline (the "Continue with" link is outside it). */
const outlineLink = (page: Page, name: RegExp) =>
  page.getByRole("region", { name: "Weeks" }).getByRole("link", { name });

const weekSection = (page: Page, number: number) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `Week ${number}` }) });

async function openPharmacologyLecture(page: Page, title: RegExp) {
  await page.goto("/courses/pharmacology");
  await outlineLink(page, title).click();
  await expect(page).toHaveURL(LECTURE_URL);
}

test.describe("courses", () => {
  test("lists the six courses, each with its lectures", async ({ page }) => {
    await page.goto("/courses");

    const cards = page.getByRole("main").getByRole("listitem").getByRole("heading", { level: 2 });
    await expect(cards).toHaveText(COURSE_NAMES);
    await expect(page.getByText("4 lectures · through week 4")).toHaveCount(6);
    // Placeholder lectures are labelled as such.
    await expect(page.getByRole("note")).toContainText("placeholders created for development");
  });

  test("keeps Public & Global Health and Communication Skills apart", async ({ page }) => {
    await page.goto("/courses");
    await page.getByRole("link", { name: /Public & Global Health/ }).click();
    await expect(page).toHaveURL(/\/courses\/public-health$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Public & Global Health");

    await page.goto("/courses");
    await page
      .getByRole("link", { name: /Communication Skills/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/courses\/communication-skills$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Communication Skills");
  });
});

test.describe("a course", () => {
  test("shows its weeks in order, including an empty week and a week with two lectures", async ({
    page,
  }) => {
    await page.goto("/courses/pharmacology");

    await expect(page.getByRole("heading", { level: 2, name: /^Week \d+$/ })).toHaveText([
      "Week 1",
      "Week 2",
      "Week 3",
      "Week 4",
    ]);
    await expect(weekSection(page, 3)).toContainText("No lectures yet");
    await expect(weekSection(page, 3).getByRole("link")).toHaveCount(0);

    const week4 = weekSection(page, 4).getByRole("link");
    await expect(week4).toHaveCount(2);
    await expect(week4.nth(0)).toContainText("Sample lecture 4.1");
    await expect(week4.nth(1)).toContainText("Sample lecture 4.2");
    await expect(weekSection(page, 4)).toContainText("2 lectures");
    await expect(weekSection(page, 1)).toContainText("28 Sept – 4 Oct");
  });

  test("offers the first unfinished lecture and shows neutral progress", async ({ page }) => {
    await page.goto("/courses/pharmacology");

    await expect(page.getByText("of 4 lectures complete")).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue with/ })).toContainText(
      "Week 1 · Sample lecture 1.1",
    );
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Courses" }),
    ).toBeVisible();
  });

  test("an unknown course is not found", async ({ page }) => {
    await page.goto("/courses/anatomy");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("a lecture", () => {
  test("is a hub with its place in the hierarchy and five kinds of material", async ({ page }) => {
    await openPharmacologyLecture(page, /Sample lecture 4\.2/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sample lecture 4.2 (development data)",
    );
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("listitem")).toHaveText(["Courses", "Pharmacology", "Week 4"]);
    await expect(page.getByText("Lecture 2 of 2")).toBeVisible();

    const material = page.getByRole("region", { name: "Study material" });
    await expect(material.getByRole("heading", { level: 3 })).toHaveText([
      "Study Guide",
      "Original Lecture",
      "MCQ",
      "Question Bank",
      "Flashcards",
    ]);
    await expect(material.getByText("No material imported yet")).toHaveCount(4);
    // Flashcards are written in MedOS: the lecture offers to start its deck.
    await expect(material.getByRole("button", { name: "Start this lecture's deck" })).toBeVisible();
    // Nothing to open yet, so nothing pretends to be a link.
    await expect(material.getByRole("link")).toHaveCount(0);

    // The other lecture of the same week is one step away.
    await page.getByRole("region", { name: "Week 4" }).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sample lecture 4.1 (development data)",
    );
  });

  test("breadcrumbs and browser history lead back up the hierarchy", async ({ page }) => {
    await openPharmacologyLecture(page, /Sample lecture 2\.1/);

    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Pharmacology" })
      .click();
    await expect(page).toHaveURL(/\/courses\/pharmacology$/);
    await page.goBack();
    await expect(page).toHaveURL(LECTURE_URL);
    await page.goForward();
    await expect(page).toHaveURL(/\/courses\/pharmacology$/);
  });

  test("addresses that do not name a real lecture of that course are not found", async ({
    page,
  }) => {
    await openPharmacologyLecture(page, /Sample lecture 1\.1/);
    const lectureId = page.url().split("/").at(-1);

    for (const path of [
      "/courses/pharmacology/lectures/not-a-lecture",
      "/courses/pharmacology/lectures/00000000-0000-4000-8000-000000000000",
      `/courses/pathology/lectures/${lectureId}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    }
  });
});

test.describe("marking a lecture complete", () => {
  // A fresh account per test: completion must not leak between tests (or users).
  test.use({ storageState: SIGNED_OUT });

  test("is a deliberate, reversible action that updates progress everywhere", async ({ page }) => {
    await signUp(page, uniqueUser("completion"));

    // Courses → course → lecture.
    await page.goto("/courses");
    await page.getByRole("link", { name: /Pharmacology I/ }).click();
    await outlineLink(page, /Sample lecture 1\.1/).click();
    await expect(page).toHaveURL(LECTURE_URL);

    // Opening the lecture completed nothing.
    const completion = page.getByRole("region", { name: "Completion" });
    await expect(completion).toContainText("Not complete");

    // Keyboard works as well as a pointer.
    await completion.getByRole("button", { name: "Mark lecture complete" }).focus();
    await page.keyboard.press("Enter");
    await expect(completion).toContainText("You marked this lecture complete on");
    await expect(completion.getByRole("button", { name: "Mark as incomplete" })).toBeVisible();

    // It survives a reload: it is stored, not just shown.
    await page.reload();
    await expect(completion).toContainText("You marked this lecture complete on");

    // The course reflects it: one of four, week 1 done, the next lecture offered.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Pharmacology" })
      .click();
    await expect(page.getByText("of 4 lectures complete")).toContainText("1");
    await expect(weekSection(page, 1)).toContainText("Complete");
    await expect(page.getByRole("link", { name: /Continue with/ })).toContainText(
      "Sample lecture 2.1",
    );

    // So does the course list, and only for this course.
    await page.goto("/courses");
    await expect(page.getByText("1 of 4 lectures complete · through week 4")).toHaveCount(1);
    await expect(page.getByText("4 lectures · through week 4")).toHaveCount(5);

    // Reversing it restores the neutral state.
    await page.goto("/courses/pharmacology");
    await outlineLink(page, /Sample lecture 1\.1/).click();
    await completion.getByRole("button", { name: "Mark as incomplete" }).click();
    await expect(completion).toContainText("Not complete");
    await page.goto("/courses");
    await expect(page.getByText("4 lectures · through week 4")).toHaveCount(6);
  });

  test("a week with two lectures counts each one", async ({ page }) => {
    await signUp(page, uniqueUser("week-progress"));
    await openPharmacologyLecture(page, /Sample lecture 4\.2/);
    await page.getByRole("button", { name: "Mark lecture complete" }).click();
    await expect(page.getByRole("region", { name: "Completion" })).toContainText(
      "You marked this lecture complete",
    );

    await page.goto("/courses/pharmacology");
    const week4 = weekSection(page, 4);
    await expect(week4).toContainText("1 of 2 complete");
    await expect(week4.getByRole("link").nth(0)).toContainText("Not complete");
    await expect(week4.getByRole("link").nth(1)).toContainText("Complete");
    // The empty week neither counts nor distorts the total.
    await expect(page.getByText("of 4 lectures complete")).toContainText("1");
  });

  test("belongs to one account: another user cannot see or change it", async ({
    page,
    browser,
  }) => {
    await signUp(page, uniqueUser("owner"));
    await openPharmacologyLecture(page, /Sample lecture 1\.1/);
    await page.getByRole("button", { name: "Mark lecture complete" }).click();
    await expect(page.getByRole("region", { name: "Completion" })).toContainText(
      "You marked this lecture complete",
    );
    const ownersLecture = page.url();

    const other = await browser.newContext({ storageState: SIGNED_OUT });
    const otherPage = await other.newPage();
    await signUp(otherPage, uniqueUser("other"));

    // The owner's lecture does not exist for anyone else.
    await otherPage.goto(ownersLecture);
    await expect(otherPage.getByRole("heading", { name: "Page not found" })).toBeVisible();

    // The other user's identical course is untouched.
    await otherPage.goto("/courses");
    await expect(otherPage.getByText("4 lectures · through week 4")).toHaveCount(6);
    await other.close();
  });
});

test.describe("without a session", () => {
  test.use({ storageState: SIGNED_OUT });

  test("course and lecture addresses lead to the login screen", async ({ request }) => {
    for (const path of [
      "/courses/pharmacology",
      "/courses/pharmacology/lectures/00000000-0000-4000-8000-000000000000",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers().location, path).toContain("/login?next=");
    }
  });
});

test.describe("accessibility and layout", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`course and lecture pages have no violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      for (const open of [
        () => page.goto("/courses/pharmacology"),
        () => openPharmacologyLecture(page, /Sample lecture 4\.1/),
      ]) {
        await open();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
          .analyze();
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
      }
    });
  }

  test("the lecture page does not overflow horizontally", async ({ page }) => {
    await openPharmacologyLecture(page, /Sample lecture 4\.2/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
