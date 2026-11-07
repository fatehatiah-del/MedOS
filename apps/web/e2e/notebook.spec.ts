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
    test.setTimeout(60_000); // one long journey through every notebook feature
    // A stand-in for the browser's speech recognition, which needs a microphone.
    await page.addInitScript(() => {
      class FakeRecognition {
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onaudiostart: (() => void) | null = null;
        start() {
          (window as unknown as { fakeSpeech: unknown }).fakeSpeech = this;
          setTimeout(() => this.onaudiostart?.(), 0);
        }
        stop() {
          setTimeout(() => this.onend?.(), 0);
        }
        abort() {
          this.stop();
        }
        hear(transcript: string, isFinal: boolean) {
          const result = Object.assign([{ transcript }], { isFinal });
          this.onresult?.({ resultIndex: 0, results: [result] });
        }
      }
      Object.assign(window, { SpeechRecognition: FakeRecognition });
    });
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

    // Formulas: written in LaTeX with a live preview, typeset in the notes, changed by a click.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Buffer: ");
    await pane.getByRole("button", { name: "Insert formula" }).click();
    const dialog = page.getByRole("dialog", { name: "Insert formula" });
    await dialog.getByRole("button", { name: "Henderson–Hasselbalch" }).click();
    await expect(dialog.locator(".katex")).toBeVisible();
    await dialog.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(editor(page).locator('[data-type="inline-math"] .katex')).toBeVisible();
    await editor(page).locator('[data-type="inline-math"] .katex-html').click();
    const edit = page.getByRole("dialog", { name: "Edit formula" });
    await edit.getByRole("textbox", { name: "Formula in LaTeX" }).fill("\\frac{U \\times V}{P}");
    await edit.getByRole("button", { name: "Update" }).click();
    await expect(editor(page).locator('[data-type="inline-math"]')).toHaveAttribute(
      "data-latex",
      "\\frac{U \\times V}{P}",
    );
    // It sits in the sentence it was written in.
    await expect(
      editor(page).locator("p", { hasText: "Buffer:" }).locator('[data-type="inline-math"]'),
    ).toBeVisible();

    // Autocorrect while typing; Backspace straight after a correction undoes it.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("teh pateint -> better adn ");
    await expect(editor(page).locator("p").last()).toHaveText("The patient → better and ");
    await page.keyboard.press("Backspace");
    await expect(editor(page).locator("p").last()).toHaveText("The patient → better adn ");

    // Any misspelt word once the dictionary is in, with no red underlines meanwhile.
    await expect(editor(page)).toHaveAttribute("spellcheck", "false");
    await page.waitForLoadState("networkidle");
    await page.keyboard.type("thw kidnye ");
    await expect(editor(page).locator("p").last()).toHaveText(
      "The patient → better adn the kidney ",
    );

    // Alt alone no longer starts dictation; the microphone button does.
    await page.keyboard.press("Alt");
    const listening = pane.getByRole("status").filter({ hasText: "Listening" });
    await expect(listening).toBeHidden();
    const mic = pane.getByRole("button", { name: "Dictate" });
    await mic.click();
    await expect(listening).toBeVisible();
    const hear = (text: string, isFinal: boolean) =>
      page.evaluate(
        ([t, f]) =>
          (
            window as unknown as { fakeSpeech: { hear(t: string, f: boolean): void } }
          ).fakeSpeech.hear(t, f),
        [text, isFinal] as const,
      );
    await hear("neutrophils rise", false);
    await expect(listening).toContainText("neutrophils rise");
    await hear("neutrophils rise comma then fall full stop", true);
    await expect(editor(page).locator("p").last()).toHaveText(
      "The patient → better adn the kidney neutrophils rise, then fall.",
    );
    await pane.getByRole("button", { name: "Stop dictation" }).click();
    await expect(listening).toBeHidden();
    // The real recogniser needs the microphone, which MedOS's own pages may use.
    const headers = (await page.request.get("/login")).headers();
    expect(headers["permissions-policy"]).toContain("microphone=(self)");
    // Escape stops it too.
    await mic.click();
    await expect(listening).toBeVisible();
    await hear("then recover", true);
    await page.keyboard.press("Escape");
    await expect(listening).toBeHidden();
    await expect(editor(page).locator("p").last()).toHaveText(
      "The patient → better adn the kidney neutrophils rise, then fall. Then recover",
    );

    // Images: uploaded from the device, kept privately in MedOS.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
      "base64",
    );
    await pane
      .locator('input[type="file"]')
      .setInputFiles({ name: "smear.png", mimeType: "image/png", buffer: png });
    const image = editor(page).locator('img[src^="/api/notebook-images/"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("alt", "smear");
    const src = await image.getAttribute("src");
    const served = await page.request.get(src!);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/png");

    // Colour, alignment and subscript, as in a word processor.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("CO2 rises");
    await page.keyboard.press("Shift+Home");
    await pane.getByRole("button", { name: "Text colour" }).click();
    await page.getByRole("menuitem", { name: "Red" }).click();
    await pane.getByRole("button", { name: "Align" }).click();
    await page.getByRole("menuitem", { name: "Centre" }).click();
    await expect(editor(page).locator('p[style*="text-align: center"]')).toContainText("CO2 rises");
    await expect(editor(page).locator('span[style*="color"]')).toContainText("CO2 rises");
    await expect(pane.getByText(/^Saved \d{2}:\d{2}$/)).toBeVisible();

    await page.reload();
    await expect(page.locator("[data-reader-ready]")).toBeAttached();
    await expect(editor(page).locator('[data-type="inline-math"] .katex')).toBeVisible();
    await expect(editor(page).locator('img[src^="/api/notebook-images/"]')).toBeVisible();
    await expect(editor(page).locator('p[style*="text-align: center"]')).toContainText("CO2 rises");
    await page
      .getByRole("complementary", { name: "Notebook" })
      .screenshot({ path: test.info().outputPath("notebook.png") });

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
