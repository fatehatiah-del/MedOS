import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { READER_STATE, guideUrl, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 11: flashcards with FSRS, on the reader account (Pharmacology and
 * Pathology courses). Desktop and mobile share the account, so each test
 * writes cards with text unique to its project and run.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const tag = (page: Page) =>
  `${page.viewportSize()!.width < 768 ? "mobile" : "desktop"}-${Date.now()}`;

async function openLectureDeck(page: Page) {
  await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^(Open deck|Start this lecture's deck)$/ }).click();
  await expect(page).toHaveURL(/\/flashcards\/pharmacology\/decks\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
}

async function addCard(page: Page, front: string, back: string) {
  const form = page.getByRole("region", { name: "Add a card" });
  await form.getByLabel("Front (question)").fill(front);
  await form.getByLabel("Back (answer)").fill(back);
  await form.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText(front, { exact: true })).toBeVisible();
}

test.describe("flashcards", () => {
  test.use({ storageState: READER_STATE });

  test("are written, edited and deleted in a lecture's deck", async ({ page }) => {
    const id = tag(page);
    await openLectureDeck(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Week 1");
    await addCard(page, `Front ${id}`, `Back ${id}`);

    await page.getByRole("button", { name: `Edit card: Front ${id}` }).click();
    await page.getByLabel("Front (question)").last().fill(`Edited ${id}`);
    await page.getByRole("button", { name: "Save card" }).click();
    await expect(page.getByText(`Edited ${id}`, { exact: true })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: `Delete card: Edited ${id}` }).click();
    await expect(page.getByText(`Edited ${id}`, { exact: true })).toHaveCount(0);
  });

  test("are created from selected Study Guide text, prefilled but written by the user", async ({
    page,
  }) => {
    const id = tag(page);
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
      .getByRole("button", { name: "Create flashcard" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Create flashcard" });
    await expect(dialog.getByLabel("Back (answer)")).toHaveValue("Synthetic trap text");
    await expect(dialog.getByLabel("Front (question)")).toHaveValue("");
    await dialog.getByLabel("Front (question)").fill(`What is the trap? ${id}`);
    await dialog.getByRole("button", { name: "Save flashcard" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Flashcard saved to Week 1/)).toBeVisible();

    await openLectureDeck(page);
    const card = page.getByRole("listitem").filter({ hasText: `What is the trap? ${id}` });
    await expect(card.getByRole("link", { name: "From the Study Guide" })).toHaveAttribute(
      "href",
      new RegExp(`/study-guide/${fixture.guideId}#`),
    );
  });

  test("are reviewed with FSRS, one course at a time", async ({ page }) => {
    const id = tag(page);
    // A card in Pharmacology, and one in Pathology that must never appear with it.
    await openLectureDeck(page);
    await addCard(page, `Pharma ${id}`, "Answer");
    await page.goto("/flashcards");
    await page.waitForLoadState("networkidle");
    const pathology = page.getByRole("region", { name: "Pathology I" });
    await pathology.getByLabel(/New deck for/).fill(`Path deck ${id}`);
    await pathology.getByRole("button", { name: "Create deck" }).click();
    await pathology.getByRole("link", { name: new RegExp(`Path deck ${id}`) }).click();
    await page.waitForLoadState("networkidle");
    await addCard(page, `Pathology ${id}`, "Other answer");

    await page.goto("/flashcards/pharmacology/review");
    await page.waitForLoadState("networkidle");
    // Other tests add cards to this course too, so the session can be long.
    test.setTimeout(120_000);
    const done = page.getByRole("heading", { name: /^(Done for now|Nothing to review)$/ });
    const seen: string[] = [];
    for (let step = 0; step < 80; step++) {
      if (await done.isVisible()) break;
      const progress = page.getByText(/^\d+ reviewed · \d+ to go$/);
      const reviewed = Number((await progress.innerText()).split(" ")[0]);
      seen.push(await page.getByRole("region", { name: "Card" }).locator("p").first().innerText());
      await page.keyboard.press(" ");
      const good = page
        .getByRole("group", { name: "Rate your recall" })
        .getByRole("button", { name: /^Good/ });
      await expect(good).toContainText(/\d+ (min|h|d|mo|y)/);
      await page.keyboard.press("4");
      // Wait until the rating is saved and the next card (or the end) is shown.
      await expect(
        page.getByText(new RegExp(`^${reviewed + 1} reviewed ·`)).or(done),
      ).toBeVisible();
    }
    expect(seen).toContain(`Pharma ${id}`);
    expect(seen.some((front) => front.startsWith("Pathology "))).toBe(false);
    await expect(page.getByRole("heading", { name: "Done for now" })).toBeVisible();

    // Rated Easy, so it is no longer due: a new session does not show it.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(`Pharma ${id}`)).toHaveCount(0);
  });

  test("never complete the lecture", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await expect(page.getByRole("button", { name: "Mark lecture complete" })).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`have no detectable accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const scan = async () =>
        (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        );
      await page.goto("/flashcards");
      expect(await scan()).toEqual([]);
      await openLectureDeck(page);
      await addCard(page, `A11y ${tag(page)}`, "Answer");
      expect(await scan()).toEqual([]);
      await page.goto("/flashcards/pharmacology/review");
      await page.waitForLoadState("networkidle");
      await page.keyboard.press(" ");
      expect(await scan()).toEqual([]);
    });
  }

  test("do not overflow horizontally", async ({ page }) => {
    await page.goto("/flashcards");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("flashcard privacy", () => {
  test.use({ storageState: READER_STATE });

  test("a deck of one course is not found under another", async ({ page }) => {
    await openLectureDeck(page);
    const deckPath = new URL(page.url()).pathname;
    await page.goto(deckPath.replace("/pharmacology/", "/pathology/"));
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const deckId = deckPath.split("/").pop();
    await page.goto(`/flashcards/pathology/review?deck=${deckId}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/flashcards/pharmacology/decks/not-an-id");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("flashcards of another user", () => {
  test("are not found", async ({ page, browser }) => {
    const reader = await browser.newContext({ storageState: READER_STATE });
    const readerPage = await reader.newPage();
    await openLectureDeck(readerPage);
    const deckPath = new URL(readerPage.url()).pathname;
    await reader.close();
    // This test runs as the ordinary test account.
    await page.goto(deckPath);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });
    test("is sent to the login screen", async ({ page }) => {
      await page.goto("/flashcards/pharmacology/review");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
