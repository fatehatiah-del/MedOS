import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { LECTURE_PAGES, READER_STATE, lectureUrl, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 8: the original lecture viewer, against a synthetic 40-page PDF
 * imported through MedOS Sync into the scratch database. Desktop and mobile
 * share the account, so each project marks its own pages.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function openViewer(page: Page, url = lectureUrl(fixture)) {
  await page.goto(url);
  await expect(page.locator("[data-viewer-ready]")).toBeAttached({ timeout: 15_000 });
  await expect(page.locator("[data-drawn]").first()).toBeAttached({ timeout: 15_000 });
}

const pageInput = (page: Page) => page.getByLabel("Page number");
const pageBox = (page: Page, number: number) => page.locator(`[data-page="${number}"]`);

async function openPanel(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Pages and notes" });
  if (await button.isVisible()) {
    await button.click();
    return page.getByRole("dialog", { name: "Pages and notes" });
  }
  return page.getByRole("complementary", { name: "Pages and notes" });
}

test.describe("the lecture viewer", () => {
  test.use({ storageState: READER_STATE });

  test("opens from the lecture page", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await page.getByRole("link", { name: "Open lecture: Lecture.pdf" }).click();
    await expect(page).toHaveURL(new RegExp(`${lectureUrl(fixture)}(\\?page=\\d+)?$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lecture.pdf");
    await expect(page.getByText(`${LECTURE_PAGES} pages`)).toBeVisible();
  });

  test("draws only the pages near the screen", async ({ page }) => {
    await openViewer(page);
    await expect(page.locator("[data-page]")).toHaveCount(LECTURE_PAGES);
    const drawn = await page.locator("[data-drawn]").count();
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(8);
    // The page's text is selectable, read from the PDF itself.
    await expect(pageBox(page, 1).getByText("Synthetic lecture page 1")).toBeAttached();
    // A page without text says so.
    await expect(page.getByText("5 · This page has no selectable text")).toBeAttached();
  });

  test("navigates by button, page number, keyboard and address", async ({ page }) => {
    await openViewer(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(pageInput(page)).toHaveValue("2");

    await pageInput(page).fill("30");
    await pageInput(page).press("Enter");
    await expect(pageInput(page)).toHaveValue("30");
    await expect(pageBox(page, 30)).toHaveAttribute("data-drawn", "");
    await expect(page).toHaveURL(/\?page=30$/);
    // Far-away pages are released again.
    await expect(pageBox(page, 1)).not.toHaveAttribute("data-drawn", "");

    await page.getByRole("region", { name: "Pages of Lecture.pdf" }).focus();
    await page.keyboard.press("End");
    await expect(pageInput(page)).toHaveValue(String(LECTURE_PAGES));
    await page.keyboard.press("Home");
    await expect(pageInput(page)).toHaveValue("1");

    await openViewer(page, `${lectureUrl(fixture)}?page=12`);
    await expect(pageInput(page)).toHaveValue("12");
    await expect(pageBox(page, 12)).toHaveAttribute("data-drawn", "");
  });

  test("zooms and goes fullscreen", async ({ page }) => {
    await openViewer(page);
    const before = await pageBox(page, 1).evaluate((element) => element.clientWidth);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByLabel("Zoom", { exact: true })).not.toHaveValue("fit");
    await expect
      .poll(() => pageBox(page, 1).evaluate((element) => element.clientWidth))
      .toBeGreaterThan(before);
    await page.getByLabel("Zoom", { exact: true }).selectOption("fit");

    await page.getByRole("button", { name: "Fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await page.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(page.getByRole("button", { name: "Fullscreen" })).toBeVisible();
  });

  test("keeps page bookmarks, notes and Review Later across a reload", async ({ page }) => {
    const target = isMobile(page) ? 8 : 7;
    const note = `Page note from ${isMobile(page) ? "mobile" : "desktop"}`;
    await openViewer(page, `${lectureUrl(fixture)}?page=${target}`);
    await expect(pageInput(page)).toHaveValue(String(target));

    await page.getByRole("button", { name: `Bookmark page ${target}` }).click();
    await expect(page.getByRole("button", { name: `Bookmark page ${target}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: `Review page ${target} later` }).click();
    await expect(page.getByRole("button", { name: `Review page ${target} later` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: `Add note to page ${target}` }).click();
    const dialog = page.getByRole("dialog", { name: `Add note · page ${target}` });
    await dialog.getByLabel("Note").fill(note);
    await dialog.getByRole("button", { name: "Save note" }).click();
    await expect(dialog).toBeHidden();

    await openViewer(page, `${lectureUrl(fixture)}?page=${target}`);
    await expect(page.getByRole("button", { name: `Bookmark page ${target}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const panel = await openPanel(page);
    await expect(panel.getByText(note)).toBeVisible();
    await expect(panel.getByRole("button", { name: `Page ${target}` }).first()).toBeVisible();
  });

  test("offers to resume at the page the reader was on", async ({ page }) => {
    const target = isMobile(page) ? 21 : 20;
    // Moving to a page (not merely opening one) is what is remembered.
    await openViewer(page, `${lectureUrl(fixture)}?page=${target - 1}`);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(pageInput(page)).toHaveValue(String(target));
    // The position is saved shortly after the reader settles on a page.
    await page.waitForTimeout(2500);
    await openViewer(page);
    await expect(page.getByRole("button", { name: /^Resume at page \d+$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Resume at page \d+$/ }).click();
    await expect(pageInput(page)).not.toHaveValue("1");
  });

  test("never completes the lecture", async ({ page }) => {
    await openViewer(page, `${lectureUrl(fixture)}?page=${LECTURE_PAGES}`);
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await expect(page.getByRole("button", { name: "Mark lecture complete" })).toBeVisible();
  });

  test("downloads the original privately", async ({ page }) => {
    const response = await page.request.get(`/api/resources/${fixture.pdfId}/file?download=1`);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    expect(response.headers()["content-disposition"]).toMatch(
      /^attachment; filename="Lecture\.pdf"/,
    );
  });

  test("does not overflow horizontally", async ({ page }) => {
    await openViewer(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no detectable accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openViewer(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map((violation) => ({
          rule: violation.id,
          targets: violation.nodes.map((node) => node.target.join(" ")),
        })),
      ).toEqual([]);
    });
  }
});

test.describe("lecture viewer privacy", () => {
  test("another user's lecture and its file are not found", async ({ page }) => {
    await page.goto(lectureUrl(fixture));
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const file = await page.request.get(`/api/resources/${fixture.pdfId}/file`);
    const missing = await page.request.get(
      "/api/resources/00000000-0000-4000-8000-000000000000/file",
    );
    expect(file.status()).toBe(404);
    expect(await file.text()).toBe(await missing.text());
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });

    test("sees neither the viewer nor the file", async ({ page }) => {
      expect((await page.request.get(`/api/resources/${fixture.pdfId}/file`)).status()).toBe(401);
      await page.goto(lectureUrl(fixture));
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("for the owner", () => {
    test.use({ storageState: READER_STATE });

    test("addresses that are not a lecture PDF of that lecture are not found", async ({ page }) => {
      const base = `/courses/pharmacology/lectures/${fixture.lectureId}/original`;
      for (const path of [
        `/courses/pharmacology/lectures/${fixture.otherLectureId}/original/${fixture.pdfId}`,
        lectureUrl(fixture).replace("/pharmacology/", "/pathology/"),
        `${base}/${fixture.guideId}`,
        `${base}/not-an-id`,
        `${base}/00000000-0000-4000-8000-000000000000`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
      }
      for (const path of [
        `/api/resources/${fixture.guideId}/file`,
        "/api/resources/not-an-id/file",
      ]) {
        expect((await page.request.get(path)).status(), path).toBe(404);
      }
    });
  });
});
