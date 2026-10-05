import { readFileSync } from "node:fs";

import type { Download, Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { READER_STATE, readerFixture } from "./support/reader";
import { SIGNED_OUT, expect, test } from "./support/test";

/*
 * Phase 20: export and backup. Every format downloads from Settings and opens
 * without MedOS: the JSON parses, the zips unpack, the CSV has its header and
 * the Anki file its import headers. Signed out, nothing is sent. Read-only.
 */

const fixture = readerFixture();

async function download(page: Page, name: string): Promise<{ file: Download; bytes: Buffer }> {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name, exact: true }).click(),
  ]);
  const saved = await file.path();
  return { file, bytes: readFileSync(saved) };
}

test.describe("signed in", () => {
  test.use({ storageState: READER_STATE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Export and backup" })).toBeVisible();
  });

  test("JSON holds the user's courses and names its format", async ({ page }) => {
    const { file, bytes } = await download(page, "JSON");
    expect(file.suggestedFilename()).toMatch(/^medos-export-\d{4}-\d{2}-\d{2}\.json$/);
    const snapshot = JSON.parse(bytes.toString("utf8"));
    expect(snapshot).toMatchObject({
      format: "medos-export",
      schemaVersion: 1,
      generator: "MedOS",
      user: { email: "reader@e2e.test" },
    });
    const lectureIds = snapshot.courses.flatMap(
      (course: { weeks: { lectures: { id: string }[] }[] }) =>
        course.weeks.flatMap((week) => week.lectures.map((lecture) => lecture.id)),
    );
    expect(lectureIds).toContain(fixture.lectureId);
  });

  test("everything comes as one zip of every format", async ({ page }) => {
    const { file, bytes } = await download(page, "Everything (.zip)");
    expect(file.suggestedFilename()).toMatch(/^medos-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const files = unzipSync(new Uint8Array(bytes));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "README.txt",
        "medos-export.json",
        "medos-notes.md",
        "flashcards-anki.txt",
        "csv/annotations.csv",
        "csv/flashcards.csv",
        "csv/study_sessions.csv",
      ]),
    );
    expect(JSON.parse(strFromU8(files["medos-export.json"]!))).toHaveProperty("schemaVersion", 1);
    const csv = files["csv/annotations.csv"]!;
    // UTF-8 byte order mark, so spreadsheet apps read accents correctly.
    expect([...csv.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(strFromU8(csv)).toMatch(/^﻿?id,on,kind,course,week,/);
  });

  test("CSV, Markdown and Anki download on their own", async ({ page }) => {
    const csv = await download(page, "CSV (.zip)");
    expect(Object.keys(unzipSync(new Uint8Array(csv.bytes)))).toContain("csv/mcq_attempts.csv");

    const markdown = await download(page, "Markdown");
    expect(markdown.file.suggestedFilename()).toMatch(/\.md$/);
    expect(markdown.bytes.toString("utf8")).toMatch(/^# MedOS export/);

    const anki = await download(page, "Anki (.txt)");
    expect(anki.file.suggestedFilename()).toMatch(/^medos-flashcards-anki-.*\.txt$/);
    expect(anki.bytes.toString("utf8")).toMatch(/^#separator:tab\n#html:true\n#notetype:Basic\n/);
  });
});

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("the export sends nothing", async ({ request }) => {
    const response = await request.get("/api/export?format=json");
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("medos-export");
  });
});
