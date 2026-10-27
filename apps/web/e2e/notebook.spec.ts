import type { Page } from "@playwright/test";

import { READER_STATE, guideUrl, readerFixture } from "./support/reader";
import { expect, test } from "./support/test";

/*
 * The lecture notebook beside the Study Guide, against the synthetic reader
 * guide. Desktop and mobile share one account and so one notebook: only the
 * desktop project writes to it; mobile checks that it opens as a sheet.
 */

const fixture = readerFixture();
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function openGuide(page: Page) {
  await page.goto(guideUrl(fixture));
  await expect(page.locator("[data-reader-ready]")).toBeAttached();
}

const editor = (page: Page) =>
  page.locator('[contenteditable="true"][aria-label="Lecture notebook"]');

async function selectText(page: Page, needle: string) {
  await page.evaluate((text) => {
    const root = document.getElementById("study-guide-text");
    const walker = document.createTreeWalker(root!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const at = node.data.indexOf(text);
      if (at < 0) continue;
      node.parentElement?.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      return;
    }
    throw new Error(`Text not found: ${text}`);
  }, needle);
}

test.describe("the lecture notebook", () => {
  test.use({ storageState: READER_STATE });

  test("is written beside the guide, saved, and kept across a reload", async ({ page }) => {
    test.skip(isMobile(page), "Only the desktop project writes to the shared notebook.");
    await openGuide(page);
    await page.getByRole("button", { name: "Open notebook" }).click();

    const pane = page.getByRole("complementary", { name: "Notebook" });
    await expect(pane).toBeVisible();
    // Docked beside the guide, which stays visible.
    await expect(page.getByRole("article", { name: "Study Guide" })).toBeInViewport();

    await editor(page).click();
    await page.keyboard.type("# Neutrophils");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Neutropenia is an ANC below 1500 per microlitre.");
    await expect(editor(page).locator("h1")).toHaveText("Neutrophils");
    await expect(pane.getByText(/^Saved \d{2}:\d{2}$/)).toBeVisible();

    // The Study Guide's selection toolbar sends a passage to the notebook.
    await selectText(page, "Highlightable sentence");
    await page
      .getByRole("toolbar", { name: "Selected text" })
      .getByRole("button", { name: "To notebook" })
      .click();
    await expect(editor(page).locator("blockquote")).toContainText("Highlightable sentence");
    await expect(pane.getByText(/^Saved \d{2}:\d{2}$/)).toBeVisible();

    await page.reload();
    await expect(page.locator("[data-reader-ready]")).toBeAttached();
    // The notebook stays open across visits, with its notes.
    await expect(editor(page).locator("h1")).toHaveText("Neutrophils");
    await expect(editor(page)).toContainText("Neutropenia is an ANC below 1500");
    await expect(editor(page).locator("blockquote")).toContainText("Highlightable sentence");

    // A callout box in the Study Guide's own style.
    await editor(page).locator("p").last().click();
    await page.keyboard.type("Do not confuse with agranulocytosis.");
    await pane.getByRole("button", { name: "Box" }).click();
    await page.getByRole("menuitem", { name: "Exam trap" }).click();
    await expect(editor(page).locator('[data-callout="exam-trap"]')).toContainText(
      "Do not confuse with agranulocytosis.",
    );
    await expect(pane.getByText(/^Saved \d{2}:\d{2}$/)).toBeVisible();

    // Listed with its lecture on the Notebooks page, and open on its own page.
    await page.goto("/notebooks");
    const card = page.getByRole("link", { name: /Neutrophils/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { level: 1, name: "Notebook" })).toBeVisible();
    await expect(editor(page).locator('[data-callout="exam-trap"]')).toBeVisible();

    // Closing the pane leaves the guide full width again.
    await openGuide(page);
    await page.getByRole("button", { name: "Close the notebook" }).click();
    await expect(page.getByRole("complementary", { name: "Notebook" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Open notebook" }).first()).toBeVisible();
  });

  test("opens as a sheet on a phone", async ({ page }) => {
    test.skip(!isMobile(page), "Phone layout only.");
    await openGuide(page);
    await page.getByRole("button", { name: "Notebook", exact: true }).click();
    const pane = page.getByRole("complementary", { name: "Notebook" });
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    const box = await pane.boundingBox();
    expect(box?.width).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 2);
    await pane.getByRole("button", { name: "Close the notebook" }).click();
    await expect(pane).toBeHidden();
  });
});
