import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import {
  QUIZ_QUESTIONS,
  QUIZ_USMLE_COUNT,
  READER_STATE,
  mcqUrl,
  readerFixture,
} from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 9: the MCQ engine, against a synthetic six-question quiz imported
 * through MedOS Sync. In every question the first option is correct.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function startMode(
  page: Page,
  mode: "Learn" | "Exam" | "USMLE",
  setup?: () => Promise<void>,
) {
  await page.goto(mcqUrl(fixture));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic Practice Quiz");
  await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).check({ force: true });
  if (setup) await setup();
  await page
    .getByRole("button", { name: mode === "Learn" ? "Start learning" : "Start exam" })
    .click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
}

const option = (page: Page, label: string) =>
  page
    .getByRole("group", { name: "Options" })
    .getByRole("radio", { name: new RegExp(`^${label}\\.`) });

test.describe("MCQ practice", () => {
  test.use({ storageState: READER_STATE });

  test("opens from the lecture page", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await page.getByRole("link", { name: "Practise MCQ: Quiz.html" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic Practice Quiz");
  });

  test("Learn mode gives feedback after each answer, and resumes", async ({ page }) => {
    await startMode(page, "Learn");
    await expect(page.getByText("Question 1 of 6").first()).toBeVisible();
    // Nothing about the answer is on the page before answering.
    expect(await page.content()).not.toContain("Synthetic explanation 1");

    await option(page, "B").check({ force: true });
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("Incorrect. The answer is A.")).toBeVisible();
    await expect(page.getByText("Synthetic explanation 1.")).toBeVisible();
    await expect(
      page.getByText("Synthetic reason the second option of question 1 is wrong."),
    ).toBeVisible();
    await expect(page.getByText("Source: S1")).toBeVisible();

    await page.getByRole("button", { name: "Next question" }).click();
    await page.keyboard.press("a");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Correct: A.")).toBeVisible();

    // The session keeps its answers across a reload.
    await page.reload();
    await expect(page.getByText("2 of 6 answered · 1 correct")).toBeVisible();

    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page.getByRole("heading", { name: "Learn results" })).toBeVisible();
    await expect(page.getByText("2 of 6").first()).toBeVisible();
  });

  test("Exam mode hides feedback until submission, then gives results", async ({ page }) => {
    await startMode(page, "Exam");
    await expect(page.getByText(/Time left: \d+:\d\d/)).toBeVisible();
    await option(page, "A").check({ force: true });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await option(page, "C").check({ force: true });
    await page.getByRole("button", { name: "Flag" }).click();
    await expect(page.getByRole("button", { name: "Flagged", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Question navigator" })
        .getByRole("button", { name: "Question 2, answered, flagged" }),
    ).toBeVisible();
    // No correctness, explanation or answer anywhere before submitting.
    const html = await page.content();
    expect(html).not.toContain("Synthetic explanation");
    expect(html).not.toContain("The answer is");

    // Answers survive a reload (once saved).
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(
      page
        .getByRole("navigation", { name: "Question navigator" })
        .getByRole("button", { name: "Question 2, answered, flagged" }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Question navigator" })
      .getByRole("button", { name: /^Question 2,/ })
      .click();
    await expect(option(page, "C")).toBeChecked();

    await page.getByRole("button", { name: "Submit exam" }).click();
    const dialog = page.getByRole("dialog", { name: "Submit the exam?" });
    await expect(dialog).toContainText("4 questions are unanswered");
    await dialog.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("heading", { name: "Exam results" })).toBeVisible();
    await expect(page.getByText("1 / 6")).toBeVisible();
    await expect(page.getByText("17%")).toBeVisible();
    await expect(page.getByRole("region", { name: "Performance by topic" })).toContainText(
      "Receptors",
    );
    await expect(page.getByRole("region", { name: "Performance by question type" })).toContainText(
      "vignette",
    );
    await expect(page.getByRole("heading", { name: "Flagged (1)" })).toBeVisible();
    await expect(page.getByText("Synthetic explanation 2.")).toBeVisible();
  });

  test("USMLE mode uses only USMLE-type questions, vignettes first", async ({ page }) => {
    await startMode(page, "USMLE");
    await expect(page.getByText(`Question 1 of ${QUIZ_USMLE_COUNT}`).first()).toBeVisible();
    await expect(page.getByText(QUIZ_QUESTIONS[0].type).first()).toBeVisible();
    const navigator = page.getByRole("navigation", { name: "Question navigator" });
    await expect(navigator.getByRole("button")).toHaveCount(QUIZ_USMLE_COUNT);
  });

  test("submits an exam when its time runs out", async ({ page }) => {
    await page.clock.install();
    await startMode(page, "Exam", async () => {
      await page.getByRole("radio", { name: "Custom" }).check();
      await page.getByLabel("Minutes").fill("1");
    });
    await option(page, "A").check({ force: true });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.clock.fastForward(65_000);
    await expect(page.getByRole("heading", { name: "Exam results" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keeps every session, and discards an unfinished exam on request", async ({ page }) => {
    await startMode(page, "Exam");
    const sessionPath = new URL(page.url()).pathname;
    await page.goto(mcqUrl(fixture));
    // Wait until the page is interactive before using its buttons.
    await page.waitForLoadState("networkidle");
    // Other tests share this account, so act only on this test's own session.
    const mine = page
      .getByRole("region", { name: "Your sessions" })
      .getByRole("listitem")
      .filter({ has: page.locator(`a[href="${sessionPath}"]`) });
    await expect(mine.getByText("In progress")).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await mine.getByRole("button", { name: "Discard" }).click();
    const discarded = page
      .getByRole("region", { name: "Your sessions" })
      .getByRole("listitem")
      .filter({ hasText: "Discarded" });
    await expect(discarded.first()).toBeVisible();
    await page.goto(sessionPath);
    await expect(page.getByText("This exam was discarded.")).toBeVisible();
  });

  test("never completes the lecture", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await expect(page.getByRole("button", { name: "Mark lecture complete" })).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no detectable accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(mcqUrl(fixture));
      const scan = async () =>
        (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        );
      expect(await scan()).toEqual([]);
      await startMode(page, "Exam");
      expect(await scan()).toEqual([]);
      await page.getByRole("button", { name: "Submit exam" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
      await expect(page.getByRole("heading", { name: "Exam results" })).toBeVisible();
      await expect(page).toHaveTitle(/MCQ/);
      expect(await scan()).toEqual([]);
    });
  }

  test("does not overflow horizontally", async ({ page }) => {
    await startMode(page, "Learn");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("MCQ privacy", () => {
  test("another user's quiz is not found", async ({ page }) => {
    await page.goto(mcqUrl(fixture));
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });
    test("is sent to the login screen", async ({ page }) => {
      await page.goto(mcqUrl(fixture));
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("for the owner", () => {
    test.use({ storageState: READER_STATE });
    test("addresses that are not a quiz of that lecture are not found", async ({ page }) => {
      const base = `/courses/pharmacology/lectures/${fixture.lectureId}/mcq`;
      for (const path of [
        `/courses/pharmacology/lectures/${fixture.otherLectureId}/mcq/${fixture.mcqId}`,
        mcqUrl(fixture).replace("/pharmacology/", "/pathology/"),
        `${base}/${fixture.guideId}`,
        `${base}/not-an-id`,
        `${mcqUrl(fixture)}/session/00000000-0000-4000-8000-000000000000`,
        `${mcqUrl(fixture)}/session/not-an-id`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
      }
    });
  });
});
