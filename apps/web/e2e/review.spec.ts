import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import {
  READER_STATE,
  guideUrl,
  lectureUrl,
  mcqUrl,
  questionBankUrl,
  readerFixture,
} from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 12: Review Later on questions and the Review page (the annotation
 * hub), on the reader account. Desktop and mobile share the account, so each
 * test works on its own question, page or note text.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;
const run = (page: Page) => `${isMobile(page) ? "mobile" : "desktop"}-${Date.now()}`;

async function openReview(page: Page, tab?: string) {
  await page.goto(tab ? `/review?tab=${tab}` : "/review");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
}

const entry = (page: Page, text: string | RegExp): Locator =>
  page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: text });

const reviewLater = (page: Page) => page.getByRole("button", { name: "Review later" });

test.describe("Review Later on questions", () => {
  test.use({ storageState: READER_STATE });

  test("an MCQ marked in Learn mode is listed, practised on its own and marked done", async ({
    page,
  }) => {
    // Desktop marks question 1, mobile question 2.
    const number = isMobile(page) ? 2 : 1;
    await page.goto(mcqUrl(fixture));
    await page.getByRole("radio", { name: /^Learn/ }).check({ force: true });
    await page.getByRole("button", { name: "Start learning" }).click();
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    for (let question = 1; question <= number; question++) {
      await page
        .getByRole("group", { name: "Options" })
        .getByRole("radio", { name: /^A\./ })
        .check({ force: true });
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(page.getByText("Correct: A.")).toBeVisible();
      if (question < number) await page.getByRole("button", { name: "Next question" }).click();
    }
    await expect(reviewLater(page)).toHaveAttribute("aria-pressed", "false");
    await reviewLater(page).click();
    await expect(reviewLater(page)).toHaveAttribute("aria-pressed", "true");

    // Kept across a reload (which resumes at the next unanswered question).
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(reviewLater(page)).toHaveAttribute("aria-pressed", "true");

    await openReview(page);
    const item = entry(page, `Synthetic question ${number} about`);
    await expect(item).toContainText("MCQ");
    await expect(item).toContainText("Week 1");
    await item.getByRole("button", { name: /^Practise MCQ/ }).click();
    await expect(page).toHaveURL(/\/mcq\/[0-9a-f-]{36}\/session\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Question 1 of 1").first()).toBeVisible();
    await expect(page.getByText(`Synthetic question ${number} about`)).toBeVisible();

    await openReview(page);
    await entry(page, `Synthetic question ${number} about`)
      .getByRole("button", { name: /^Done with/ })
      .click();
    await expect(entry(page, `Synthetic question ${number} about`)).toHaveCount(0);
  });

  test("a Question Bank question marked after reveal opens first from Review", async ({ page }) => {
    const key = isMobile(page) ? "q1" : "q2";
    const label = `Question ${key.slice(1)}`;
    await page.goto(`${questionBankUrl(fixture)}?item=${key}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^${label}`) }),
    ).toBeVisible();
    await expect(reviewLater(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
    await reviewLater(page).click();
    await expect(reviewLater(page)).toHaveAttribute("aria-pressed", "true");

    await openReview(page);
    const item = entry(page, new RegExp(`Question Bank · ${label} ·`));
    await item.getByRole("link", { name: /^Open Question Bank/ }).click();
    await expect(page).toHaveURL(new RegExp(`/question-bank/[0-9a-f-]{36}\\?item=${key}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^${label}`) }),
    ).toBeVisible();

    await openReview(page);
    await entry(page, new RegExp(`Question Bank · ${label} ·`))
      .getByRole("button", { name: /^Done with/ })
      .click();
    await expect(entry(page, new RegExp(`Question Bank · ${label} ·`))).toHaveCount(0);
  });
});

test.describe("the Review page", () => {
  test.use({ storageState: READER_STATE });

  test("opens a Study Guide note at its passage, and removes it", async ({ page }) => {
    const note = `Hub note ${run(page)}`;
    await page.goto(guideUrl(fixture));
    await expect(page.locator("[data-reader-ready]")).toBeAttached();
    await page.evaluate(() => {
      const root = document.getElementById("study-guide-text")!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const at = node.data.indexOf("Synthetic trap text");
        if (at < 0) continue;
        node.parentElement!.scrollIntoView({ block: "center" });
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + "Synthetic trap text".length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        return;
      }
    });
    await page
      .getByRole("toolbar", { name: "Selected text" })
      .getByRole("button", { name: "Add note" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Add note" });
    await dialog.getByLabel("Note").fill(note);
    await dialog.getByRole("button", { name: "Save note" }).click();
    await expect(dialog).toBeHidden();

    await openReview(page, "note");
    const item = entry(page, note);
    await expect(item).toContainText("Synthetic trap text");
    await expect(item).toContainText("Study Guide");
    await item.getByRole("link", { name: /^Open Study Guide/ }).click();
    await expect(page.locator("[data-reader-ready]")).toBeAttached();
    // The passage is brought into view and focused; the address no longer asks to jump.
    await expect(page.locator("mark.sg-mark:focus")).toBeInViewport();
    await expect(page).not.toHaveURL(/annotation=/);

    await openReview(page, "note");
    page.once("dialog", (confirm) => void confirm.accept());
    await entry(page, note)
      .getByRole("button", { name: /^Remove/ })
      .click();
    await expect(entry(page, note)).toHaveCount(0);
  });

  test("opens a lecture page bookmark at that page", async ({ page }) => {
    const target = isMobile(page) ? 31 : 30;
    await page.goto(`${lectureUrl(fixture)}?page=${target}`);
    await expect(page.locator("[data-viewer-ready]")).toBeAttached({ timeout: 15_000 });
    const bookmark = page.getByRole("button", { name: `Bookmark page ${target}` });
    if ((await bookmark.getAttribute("aria-pressed")) !== "true") await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");

    await openReview(page, "bookmark");
    const item = entry(page, `Page ${target}`).first();
    await expect(item).toContainText("Lecture");
    await item.getByRole("link", { name: /^Open Lecture/ }).click();
    await expect(page).toHaveURL(new RegExp(`/original/[0-9a-f-]{36}\\?page=${target}$`));
    await expect(page.locator("[data-viewer-ready]")).toBeAttached({ timeout: 15_000 });
    await expect(page.getByLabel("Page number")).toHaveValue(String(target));
  });

  test("filters by course", async ({ page }) => {
    // A bookmark of this run in Pharmacology, so the filter has something to hide.
    const target = isMobile(page) ? 33 : 32;
    await page.goto(`${lectureUrl(fixture)}?page=${target}`);
    await expect(page.locator("[data-viewer-ready]")).toBeAttached({ timeout: 15_000 });
    const bookmark = page.getByRole("button", { name: `Bookmark page ${target}` });
    if ((await bookmark.getAttribute("aria-pressed")) !== "true") await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");

    await openReview(page, "bookmark");
    const filter = page.getByRole("combobox", { name: "Course" });
    await expect(entry(page, `Page ${target}`).first()).toBeVisible();
    await filter.selectOption({ label: "Pathology I" });
    await expect(entry(page, `Page ${target}`)).toHaveCount(0);
    await expect(page.getByRole("tabpanel").getByText("Pharmacology")).toHaveCount(0);
    await filter.selectOption({ label: "Pharmacology I" });
    await expect(entry(page, `Page ${target}`).first()).toBeVisible();
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
      for (const tab of ["review-later", "note", "highlight", "bookmark"]) {
        await openReview(page, tab);
        const violations = (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze())
          .violations;
        expect(
          violations.map(
            (violation) =>
              `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      }
    });
  }

  test("does not overflow horizontally", async ({ page }) => {
    await openReview(page, "bookmark");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("the Review page of another user", () => {
  test("shows none of the reader's items", async ({ page }) => {
    // This test runs as the ordinary test account.
    await openReview(page, "bookmark");
    await expect(page.getByText("No bookmarks yet.", { exact: false })).toBeVisible();
    await expect(page.getByText("Synthetic")).toHaveCount(0);
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });
    test("is sent to the login screen", async ({ page }) => {
      await page.goto("/review");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
