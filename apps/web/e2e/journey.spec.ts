import { readFileSync } from "node:fs";

import { strFromU8, unzipSync } from "fflate";
import type { Locator, Page } from "@playwright/test";

import { JOURNEY_USERS, type JourneyProject, journeyFixture } from "./support/reader";
import { SIGNED_OUT, expect, signIn, test } from "./support/test";

/*
 * Phase 21: the complete student workflow, end to end, as one person would
 * use MedOS in a session:
 *
 * Login → Today → Course → Week → Lecture → Study Guide → annotation →
 * flashcard → MCQ → Question Bank → timer → completion → planner → statistics
 *
 * Each step's result is then checked where it should show up elsewhere
 * (Review, the deck, Statistics, the export), so the parts are proven to work
 * together, not only on their own. Desktop and mobile each use their own
 * account and lecture (see reader-fixture.ts), so the two runs never meet.
 */

const PASSAGE = "Agonists activate receptors";
const CARD_BACK = "block them";

/** Selects a passage of the Study Guide, as a reader dragging over it would. */
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

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Selected text" });
const timerPill = (page: Page) => page.getByRole("button", { name: /^Study timer:/ });

/** On narrow screens the guide's context panel is a sheet: opens it. Null on wide screens. */
async function openPanelIfSheet(page: Page): Promise<Locator | null> {
  const button = page.getByRole("button", { name: "Notes & progress" });
  if (!(await button.isVisible())) return null;
  await button.click();
  return page.getByRole("dialog");
}

test.use({ storageState: SIGNED_OUT });

test("a study session runs through every part of MedOS and shows up everywhere", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const project = testInfo.project.name as JourneyProject;
  const account = JOURNEY_USERS[project];
  const fixture = journeyFixture(project);
  const lectureUrl = `/courses/pharmacology/lectures/${fixture.lectureId}`;
  // Leaving a page while the timer runs asks first; this student always stays timed.
  page.on("dialog", (dialog) => void dialog.accept());

  await test.step("Login → Today", async () => {
    await signIn(page, account);
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^Good (morning|afternoon|evening), Journey$/,
    );
  });

  await test.step("Today → Course → Week → Lecture", async () => {
    await page
      .getByRole("region", { name: "Courses" })
      .getByRole("link", { name: "Pharmacology" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Pharmacology I" })).toBeVisible();
    const week1 = page
      .getByRole("region", { name: "Weeks" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Week 1" }) });
    await week1.getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`${lectureUrl}$`));
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Week 1");
    await expect(page.getByRole("region", { name: "Completion" })).toContainText("Not complete");
  });

  await test.step("Study Guide: timer, highlight and a flashcard from the text", async () => {
    await page.getByRole("link", { name: "Open Study Guide: StudyGuide.docx" }).click();
    await expect(page.locator("[data-reader-ready]")).toBeAttached();

    // The guide's own timer, in its context panel (a sheet on narrow screens).
    const sheet = await openPanelIfSheet(page);
    await page.getByRole("button", { name: "Start timer" }).click();
    if (sheet) {
      await expect(sheet.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
    await expect(timerPill(page)).toHaveAccessibleName(/Study Guide.*Running/);

    await selectText(page, PASSAGE);
    await toolbar(page).getByRole("button", { name: "Highlight" }).click();
    await expect(page.locator("mark.sg-mark", { hasText: PASSAGE })).toBeVisible();

    await selectText(page, CARD_BACK);
    await toolbar(page).getByRole("button", { name: "Create flashcard" }).click();
    const dialog = page.getByRole("dialog", { name: "Create flashcard" });
    await expect(dialog.getByLabel("Back (answer)")).toHaveValue(CARD_BACK);
    await dialog.getByLabel("Front (question)").fill("What do antagonists do?");
    await dialog.getByRole("button", { name: "Save flashcard" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Flashcard saved to Week 1/)).toBeVisible();
  });

  await test.step("MCQ: answer in Learn mode", async () => {
    await page.goto(lectureUrl);
    await page.getByRole("link", { name: "Practise MCQ: Quiz.html" }).click();
    await page.getByRole("radio", { name: /^Learn/ }).check({ force: true });
    await page.getByRole("button", { name: "Start learning" }).click();
    await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}$/);
    await page
      .getByRole("group", { name: "Options" })
      .getByRole("radio", { name: /^A\./ })
      .check({ force: true });
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("Correct: A.")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page.getByRole("heading", { name: "Learn results" })).toBeVisible();
  });

  await test.step("Question Bank: reveal and rate", async () => {
    await page.goto(lectureUrl);
    await page.getByRole("link", { name: "Practise recall: QuestionBank.docx" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice Questions");
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(page.getByRole("heading", { name: "Model answer" })).toBeVisible();
    await page.getByRole("button", { name: /^Good/ }).click();
    await expect(page.getByText("1 of 2 rated this session")).toBeVisible();
  });

  await test.step("Timer: finish and save, recorded on the lecture", async () => {
    await timerPill(page).click();
    await page.getByRole("menuitem", { name: "Finish and save" }).click();
    await expect(page.getByRole("button", { name: "Start a study timer" })).toBeVisible();
    await page.goto(lectureUrl);
    await expect(page.getByRole("region", { name: "Study time" })).toContainText("of active study");
  });

  await test.step("Completion: only by hand", async () => {
    const completion = page.getByRole("region", { name: "Completion" });
    // Reading, practising and timing never completed the lecture.
    await expect(completion).toContainText("Not complete");
    await completion.getByRole("button", { name: "Mark lecture complete" }).click();
    await expect(completion).toContainText("You marked this lecture complete on");
  });

  await test.step("Planner: the completed lecture is no longer suggested", async () => {
    await page.goto("/study-plan");
    const items = page.getByRole("list", { name: "Plan items" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Study Plan");
    // Today's plan was suggested at sign-in; the planner never rewrites it on its own.
    await expect(items).toContainText("Study Guide: Lecture 1");
    const refreshed = page.waitForResponse((r) => r.request().method() === "POST");
    await page.getByRole("button", { name: "Refresh suggestions" }).click();
    expect((await refreshed).ok()).toBe(true);
    // The flashcard made from the guide is new, so reviewing it is on the plan now.
    await expect(items).toContainText(/flashcard/i);
    for (const why of await items.getByRole("button", { name: "Why?" }).all()) await why.click();
    await expect(items).not.toContainText("Not marked complete");
  });

  await test.step("Statistics: the lecture's real activity", async () => {
    await page.goto("/statistics?course=pharmacology");
    await page.getByRole("region", { name: "Lectures" }).getByRole("link").first().click();
    const performance = page.getByRole("region", { name: "Performance" });
    await expect(performance).toContainText("MCQ accuracy");
    await expect(performance).toContainText("100%");
  });

  await test.step("Everything is where it should be: Review, the deck, the export", async () => {
    await page.goto("/review?tab=highlight");
    await expect(page.getByRole("tabpanel")).toContainText(PASSAGE);
    await expect(page.getByRole("tabpanel")).toContainText("Pharmacology");

    await page.goto("/flashcards");
    await expect(page.getByRole("main")).toContainText("Pharmacology I");
    await expect(page.getByRole("main")).toContainText(/1 (new|card)/);

    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Everything (.zip)", exact: true }).click(),
    ]);
    const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
    const snapshot = JSON.parse(strFromU8(files["medos-export.json"]!));
    const lecture = snapshot.courses
      .flatMap((course: ExportedCourse) => course.weeks)
      .flatMap((week: ExportedWeek) => week.lectures)
      .find((candidate: { id: string }) => candidate.id === fixture.lectureId);
    expect(lecture.completedAt).not.toBeNull();
    expect(snapshot.annotations).toEqual([
      expect.objectContaining({
        kind: "highlight",
        quote: PASSAGE,
        source: expect.objectContaining({ file: "StudyGuide.docx", week: 1 }),
      }),
    ]);
    expect(snapshot.flashcards.cards).toEqual([
      expect.objectContaining({ front: "What do antagonists do?", origin: "study-guide" }),
    ]);
    expect(snapshot.mcq.attempts).toEqual([expect.objectContaining({ correct: true })]);
    expect(snapshot.questionBank.attempts).toEqual([expect.objectContaining({ rating: "good" })]);
    expect(snapshot.studySessions).toEqual([
      expect.objectContaining({ activity: "study-guide", endedAt: expect.any(String) }),
    ]);
  });
});

type ExportedWeek = { lectures: { id: string; completedAt: string | null }[] };
type ExportedCourse = { weeks: ExportedWeek[] };
