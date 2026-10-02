import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

import { READER_STATE, guideUrl, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 7: the Study Guide reader, against a synthetic guide imported through
 * MedOS Sync into the scratch database (see support/reader-fixture.ts).
 * Desktop and mobile run in parallel on the same account, so each project
 * annotates different text and assertions look for specific items.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** Selects `needle` in the guide's text, as a reader would. */
async function selectText(page: Page, needle: string) {
  await page.evaluate((text) => {
    const root = document.getElementById("study-guide-text");
    if (!root) throw new Error("No guide on the page.");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const at = node.data.indexOf(text);
      if (at < 0) continue;
      node.parentElement?.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`Text not found: ${text}`);
  }, needle);
}

/** Opens a guide and waits until its controls are interactive. */
async function openGuide(page: Page, url = guideUrl(fixture)) {
  await page.goto(url);
  await expect(page.locator("[data-reader-ready]")).toBeAttached();
}

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selected text" });

/** The context panel: in place on wide screens, in a sheet on narrow ones. */
async function openPanel(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Notes & progress" });
  if (await button.isVisible()) {
    await button.click();
    return page.getByRole("dialog", { name: "Notes & progress" });
  }
  return page.getByRole("region", { name: "Your progress and notes" });
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("the Study Guide reader", () => {
  test.use({ storageState: READER_STATE });

  test("opens from the lecture page", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await page.getByRole("link", { name: "Open Study Guide: Reader StudyGuide.docx" }).click();
    await expect(page).toHaveURL(guideUrl(fixture));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Synthetic Reader Guide");
  });

  test("renders the guide's structure in source order", async ({ page }) => {
    await openGuide(page);
    const article = page.getByRole("article", { name: "Study Guide" });

    // The source's own contents page stays, as source text.
    await expect(article.getByText("From the document")).toBeVisible();
    await expect(article.getByText("CONTENTS", { exact: true })).toBeVisible();

    const headings = article.getByRole("heading");
    await expect(headings).toHaveText([
      "1 Overview",
      "Subsection with slidesS12",
      "2 Tables",
      "3 Figures",
      "4 Clinical",
      "5 Golden Points",
    ]);
    await expect(article.getByRole("heading", { level: 3 })).toHaveText(
      "Subsection with slidesS12",
    );
    await expect(article.locator(".sg-slide-ref")).toHaveText(["S12"]);

    for (const label of [
      "THE BIG PICTURE",
      "EXAM TRAP",
      "CLINICAL LINK",
      "MEMORY HOOK",
      "EXAM SNAPSHOT",
      "HOW IT'S TESTED",
      "WHAT TO SEE",
    ]) {
      await expect(article.getByRole("note", { name: label })).toBeVisible();
    }
    // The unlabelled box gets no invented heading.
    const unlabelled = article.locator('[data-callout="plain"]').first();
    await expect(unlabelled).not.toHaveAttribute("aria-labelledby");

    const table = article.getByRole("region", { name: "Table in 2 Tables" });
    await expect(table.getByRole("columnheader")).toHaveCount(6);
    await expect(article.getByRole("list", { name: "Sequence" }).getByRole("listitem")).toHaveText([
      "Step one",
      "Step two",
      "Step three",
    ]);
    await expect(article.getByText("1.", { exact: true })).toBeVisible();
  });

  test("shows the guide's images privately, in place, and full size", async ({ page }) => {
    await openGuide(page);
    const image = page.getByRole("img", { name: "Figure 1. A synthetic diagram" });
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(image).toHaveAttribute(
      "src",
      `/api/resources/${fixture.guideId}/media/${fixture.guideImages[0]}`,
    );

    const response = await page.request.get(
      `/api/resources/${fixture.guideId}/media/${fixture.guideImages[0]}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });

    await page
      .getByRole("button", { name: "View full size: Figure 1. A synthetic diagram" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Figure 1. A synthetic diagram" });
    await expect(dialog.getByRole("img")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("navigates with its contents", async ({ page }) => {
    await openGuide(page);
    if (isMobile(page)) {
      await page.getByRole("button", { name: "Contents" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "4 Clinical" }).click();
    } else {
      await page
        .getByRole("navigation", { name: "Study Guide contents" })
        .getByRole("link", { name: "4 Clinical" })
        .click();
    }
    const heading = page.getByRole("heading", { name: "4 Clinical" });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(page).toHaveURL(/#4-clinical$/);
    if (!isMobile(page)) {
      // The contents mark where the reader is.
      await expect(
        page
          .getByRole("navigation", { name: "Study Guide contents" })
          .getByRole("link", { name: "4 Clinical" }),
      ).toHaveAttribute("aria-current", "location");
    }

    // Deep links open at their section.
    await openGuide(page, `${guideUrl(fixture)}#3-figures`);
    await expect(page.getByRole("heading", { name: "3 Figures" })).toBeInViewport();
  });

  test("keeps highlights, notes, bookmarks and Review Later across a reload", async ({ page }) => {
    const mobile = isMobile(page);
    // Each project works on its own text, so they can run side by side.
    const highlightText = mobile ? "Synthetic trap text" : "Highlightable sentence";
    const noteText = mobile ? "Synthetic clinical text" : "Synthetic memory text";
    const section = mobile ? "3 Figures" : "2 Tables";
    const note = `Private note from ${mobile ? "mobile" : "desktop"}`;

    await openGuide(page);

    await selectText(page, highlightText);
    await toolbar(page).getByRole("button", { name: "Highlight" }).click();
    await expect(page.locator("mark.sg-mark", { hasText: highlightText })).toBeVisible();

    await selectText(page, noteText);
    await toolbar(page).getByRole("button", { name: "Add note" }).click();
    const dialog = page.getByRole("dialog", { name: "Add note" });
    await dialog.getByLabel("Note").fill(note);
    await dialog.getByRole("button", { name: "Save note" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: `Bookmark section: ${section}` }).click();
    await expect(
      page.getByRole("button", { name: `Bookmark section: ${section}` }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: `Review later: ${section}` }).click();
    await expect(page.getByRole("button", { name: `Review later: ${section}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();

    await expect(page.locator("mark.sg-mark", { hasText: highlightText })).toHaveAttribute(
      "data-kinds",
      "highlight",
    );
    await expect(page.locator("mark.sg-mark", { hasText: noteText })).toHaveAttribute(
      "data-kinds",
      "note",
    );
    await expect(
      page.getByRole("button", { name: `Bookmark section: ${section}` }),
    ).toHaveAttribute("aria-pressed", "true");
    const panel = await openPanel(page);
    await expect(panel.getByText(note)).toBeVisible();
    await expect(
      panel.getByRole("button", { name: `Go to highlight: ${highlightText}` }),
    ).toBeVisible();

    // The source text is unchanged by the marks.
    await expect(page.getByText("Highlightable sentence for the end-to-end test.")).toHaveCount(1);
  });

  test("offers the selection actions to the keyboard", async ({ page }) => {
    test.skip(isMobile(page), "Keyboard use is tested on desktop.");
    await openGuide(page);
    await selectText(page, "receptor");
    await expect(toolbar(page)).toBeVisible();
    await page.keyboard.press("Alt+a");
    await expect(toolbar(page).getByRole("button", { name: "Highlight" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar(page).getByRole("button", { name: "Add note" })).toBeFocused();
    await expect(toolbar(page).getByRole("button", { name: "Create flashcard" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(toolbar(page)).toBeHidden();
  });

  test("records reading progress without completing the lecture", async ({ page }) => {
    await openGuide(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const panel = await openPanel(page);
    await expect(panel.getByText("6 of 6 sections read")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(/does not complete the lecture/)).toBeVisible();

    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await expect(page.getByText("100% read")).toBeVisible();
    // Completion is still the user's decision.
    await expect(page.getByRole("button", { name: "Mark lecture complete" })).toBeVisible();
  });

  test("does not overflow horizontally, even with a wide table", async ({ page }) => {
    await openGuide(page);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    const region = page.getByRole("region", { name: "Table in 2 Tables" });
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    if (isMobile(page)) expect(scrolls).toBe(true);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no detectable accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openGuide(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map((violation) => ({
          rule: violation.id,
          targets: violation.nodes.map((node) => node.target.join(" ")),
        })),
      ).toEqual([]);
    });
  }

  test("its sheets and dialogs are accessible when open", async ({ page }) => {
    await openGuide(page);
    await selectText(page, "Highlightable sentence");
    await toolbar(page).getByRole("button", { name: "Add note" }).click();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    await page.keyboard.press("Escape");

    if (isMobile(page)) {
      await page.getByRole("button", { name: "Notes & progress" }).click();
      const sheet = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(WCAG_TAGS)
        .analyze();
      expect(sheet.violations.map((violation) => violation.id)).toEqual([]);
    }
  });
});

test.describe("Study Guide privacy", () => {
  // Signed in as the ordinary test account, which does not own the guide.
  test("another user's guide and images are not found", async ({ page }) => {
    await page.goto(guideUrl(fixture));
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByText("Synthetic Reader Guide")).toHaveCount(0);

    const image = await page.request.get(
      `/api/resources/${fixture.guideId}/media/${fixture.guideImages[0]}`,
    );
    const missing = await page.request.get(
      `/api/resources/00000000-0000-4000-8000-000000000000/media/${fixture.guideImages[0]}`,
    );
    expect(image.status()).toBe(404);
    expect(await image.text()).toBe(await missing.text());
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });

    test("sees neither the guide nor its images", async ({ page }) => {
      const image = await page.request.get(
        `/api/resources/${fixture.guideId}/media/${fixture.guideImages[0]}`,
      );
      expect(image.status()).toBe(401);
      await page.goto(guideUrl(fixture));
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("for the owner", () => {
    test.use({ storageState: READER_STATE });

    test("addresses that are not a Study Guide of that lecture are not found", async ({ page }) => {
      const lecture = `/courses/pharmacology/lectures/${fixture.lectureId}/study-guide`;
      for (const path of [
        // Another lecture of the same user.
        `/courses/pharmacology/lectures/${fixture.otherLectureId}/study-guide/${fixture.guideId}`,
        // Another course in the address.
        guideUrl(fixture).replace("/pharmacology/", "/pathology/"),
        // Material that is not a Study Guide.
        `${lecture}/${fixture.pdfId}`,
        // Malformed and unknown ids.
        `${lecture}/not-an-id`,
        `${lecture}/00000000-0000-4000-8000-000000000000`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
      }
      // The second guide of the same lecture opens normally.
      await page.goto(guideUrl(fixture, fixture.secondGuideId));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Second Synthetic Guide");
    });

    test("an image is served only through the resource it belongs to", async ({ page }) => {
      const own = `/api/resources/${fixture.secondGuideId}/media/${fixture.secondGuideImages[0]}`;
      expect((await page.request.get(own)).status()).toBe(200);
      for (const path of [
        `/api/resources/${fixture.guideId}/media/${fixture.secondGuideImages[0]}`,
        `/api/resources/${fixture.guideId}/media/not-a-hash`,
        `/api/resources/not-an-id/media/${fixture.guideImages[0]}`,
      ]) {
        expect((await page.request.get(path)).status(), path).toBe(404);
      }
    });
  });
});
