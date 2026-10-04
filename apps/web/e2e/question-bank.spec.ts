import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { READER_STATE, questionBankUrl, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 10: Question Bank active recall, against the synthetic two-item bank
 * imported through MedOS Sync (one item with choices, one open question).
 * Desktop and mobile share the account, so the practice order can differ:
 * the tests work with whichever question is shown.
 */

const fixture = readerFixture();
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const ANSWERS = ["They open within milliseconds.", "Affinity is how tightly a drug binds."];

async function openBank(page: Page) {
  await page.goto(questionBankUrl(fixture));
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice Questions");
}

const revealButton = (page: Page) => page.getByRole("button", { name: "Reveal answer" });

test.describe("Question Bank recall", () => {
  test.use({ storageState: READER_STATE });

  test("lists the bank on the Question Bank page and opens it", async ({ page }) => {
    await page.goto("/question-bank");
    const bank = page.getByRole("link", { name: /Practice Questions/ });
    await expect(page.getByRole("heading", { name: "Pharmacology I" })).toBeVisible();
    await expect(bank).toContainText("of 2 practised");
    await bank.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice Questions");
  });

  test("opens from the lecture page", async ({ page }) => {
    await page.goto(`/courses/pharmacology/lectures/${fixture.lectureId}`);
    await page.getByRole("link", { name: "Practise recall: QuestionBank.docx" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice Questions");
  });

  test("reveals the answer without typing, and only on Reveal", async ({ page }) => {
    await openBank(page);
    const html = await page.content();
    for (const answer of ANSWERS) expect(html).not.toContain(answer);

    await revealButton(page).click();
    await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
    await expect(
      page.getByText(/They open within milliseconds\.|Affinity is how tightly a drug binds\./),
    ).toBeVisible();
    await expect(page.getByText("You answered in your head.")).toBeVisible();
    await page.getByRole("button", { name: /^Good/ }).click();
    await expect(page.getByText("1 of 2 rated this session")).toBeVisible();
  });

  test("keeps a typed answer and the rating across a reload", async ({ page }) => {
    const note = `Typed recall from ${page.viewportSize()!.width < 768 ? "mobile" : "desktop"}`;
    await openBank(page);
    await page.getByLabel(/Your answer/).fill(note);
    await page.getByLabel(/Your answer/).press("Control+Enter");
    await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.getByText("1 of 2 rated this session")).toBeVisible();

    await page.reload();
    const record = page.getByRole("region", { name: "Your record" });
    await page.waitForLoadState("networkidle");
    // Other tests share this account: open every question's record.
    await record
      .locator("details")
      .evaluateAll((all) =>
        all.forEach((details) => ((details as HTMLDetailsElement).open = true)),
      );
    await expect(record.getByText(`“${note}”`)).toBeVisible();
    await expect(record.getByText(/Hard/).first()).toBeVisible();
  });

  test("hides the options until asked, then finishes a session", async ({ page }) => {
    await openBank(page);
    for (let round = 0; round < 2; round++) {
      const options = page.getByRole("button", { name: /^Show options/ });
      if (await options.isVisible()) {
        await options.click();
        await expect(page.getByRole("list", { name: "Options" })).toContainText("Ion channel");
      }
      await revealButton(page).click();
      await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
      await page.getByRole("button", { name: /^Easy/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Session finished" })).toBeVisible();
    await expect(page.getByText("Easy: 2")).toBeVisible();
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
      const scan = async () =>
        (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
        );
      await page.goto("/question-bank");
      expect(await scan()).toEqual([]);
      await openBank(page);
      expect(await scan()).toEqual([]);
      await revealButton(page).click();
      await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
      expect(await scan()).toEqual([]);
    });
  }

  test("does not overflow horizontally", async ({ page }) => {
    await openBank(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("Question Bank privacy", () => {
  test("another user's bank is not found, and they see no banks", async ({ page }) => {
    await page.goto(questionBankUrl(fixture));
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/question-bank");
    await expect(page.getByRole("heading", { name: "No question banks yet" })).toBeVisible();
  });

  test.describe("signed out", () => {
    test.use({ storageState: SIGNED_OUT });
    test("is sent to the login screen", async ({ page }) => {
      await page.goto(questionBankUrl(fixture));
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("for the owner", () => {
    test.use({ storageState: READER_STATE });
    test("addresses that are not a bank of that lecture are not found", async ({ page }) => {
      const base = `/courses/pharmacology/lectures/${fixture.lectureId}/question-bank`;
      for (const path of [
        `/courses/pharmacology/lectures/${fixture.otherLectureId}/question-bank/${fixture.questionBankId}`,
        questionBankUrl(fixture).replace("/pharmacology/", "/pathology/"),
        `${base}/${fixture.mcqId}`,
        `${base}/not-an-id`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
      }
    });
  });
});
