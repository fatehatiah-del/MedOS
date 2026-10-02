import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type Database, resourceMedia, resources, users } from "@medos/database";
import {
  buildDocx,
  buildPdf,
  heading,
  imageParagraph,
  paragraph,
  pngBytes,
  run,
  table,
} from "@medos/parsers/testing";
import { LocalObjectStore } from "@medos/storage";
import { runSync } from "@medos/sync/sync";
import { and, eq } from "drizzle-orm";

import { resolveAuthConfig } from "../../src/server/auth/config";
import { createAuth } from "../../src/server/auth/create-auth";

import { LECTURE_PAGES, READER_USER, type ReaderFixture } from "./reader";

/*
 * The Study Guide reader's E2E material: a synthetic study folder (invented
 * text, structure only) imported into the scratch E2E database through the
 * real MedOS Sync pipeline, for an account created through the real sign-up
 * API. Tests then sign in through the login screen as usual.
 *
 * Nothing here touches the user's real study folder or database.
 */

const box = (label: string, ...lines: string[]) =>
  table([[paragraph(label) + lines.map((line) => paragraph(line)).join("")]]);

/** A long synthetic guide using every structure the reader shows. */
function readerGuide(): Uint8Array {
  const filler = (section: number) =>
    Array.from({ length: 6 }, (_, index) =>
      paragraph(
        `Synthetic paragraph ${index + 1} of section ${section}. It exists to give the page length ` +
          "so that navigation and reading progress can be exercised across a long document.",
      ),
    ).join("");

  const body = [
    paragraph("Synthetic Reader Guide", { style: "Title" }),
    paragraph([run("CONTENTS", { bold: true })]),
    paragraph("1 Overview"),
    paragraph("2 Tables"),
    heading("1 Overview"),
    box("THE BIG PICTURE", "A synthetic overview statement."),
    paragraph([
      run("A synthetic "),
      run("receptor", { bold: true }),
      run(" binds a "),
      run("ligand", { italic: true }),
      run(" in this sentence."),
    ]),
    heading("Subsection with slides", 2, [run("  S12")]),
    paragraph("Highlightable sentence for the end-to-end test."),
    box("⚠ EXAM TRAP", "Synthetic trap text."),
    box("Unlabelled box text without any label line that is longer than forty characters."),
    filler(1),
    heading("2 Tables"),
    table(
      [
        [
          "Item",
          "First column",
          "Second column",
          "Third column",
          "Fourth column",
          "Fifth column",
        ].map((text) => paragraph([run(text, { bold: true })])),
        ...[1, 2, 3].map((row) =>
          [
            `Row ${row}`,
            "Long synthetic cell text",
            "More text",
            "Even more text",
            "Text",
            "End",
          ].map((text) => paragraph(text)),
        ),
      ],
      { headerRow: true },
    ),
    filler(2),
    heading("3 Figures"),
    table([
      [
        imageParagraph("rIdImg1"),
        paragraph([run("Figure 1. A synthetic diagram", { bold: true })]) +
          paragraph("WHAT TO SEE") +
          paragraph("• A synthetic observation"),
      ],
    ]),
    table([
      [paragraph("Step one")],
      [paragraph("→")],
      [paragraph("Step two")],
      [paragraph("→")],
      [paragraph("Step three")],
    ]),
    filler(3),
    heading("4 Clinical"),
    box("CLINICAL LINK", "Synthetic clinical text."),
    box("MEMORY HOOK", "Synthetic memory text."),
    box("EXAM SNAPSHOT", "Synthetic snapshot text."),
    box("HOW IT'S TESTED", "Synthetic testing text."),
    filler(4),
    heading("5 Golden Points"),
    paragraph("1.\tFirst synthetic point."),
    paragraph("2.\tSecond synthetic point."),
    filler(5),
  ].join("");
  return buildDocx(body, { images: { rIdImg1: { name: "image1.png", bytes: pngBytes(301) } } });
}

/** A second, small guide in the same lecture, with its own image. */
function secondGuide(): Uint8Array {
  const body = [
    paragraph("Second Synthetic Guide", { style: "Title" }),
    heading("Only section"),
    imageParagraph("rIdImg2"),
    paragraph("Figure 1. Another synthetic diagram"),
  ].join("");
  return buildDocx(body, { images: { rIdImg2: { name: "image2.png", bytes: pngBytes(302) } } });
}

export async function prepareReaderFixture(db: Database, e2eDir: string): Promise<void> {
  const source = path.join(e2eDir, "source");
  const storage = path.join(e2eDir, "objects");
  rmSync(source, { recursive: true, force: true });
  rmSync(storage, { recursive: true, force: true });
  const week = path.join(source, "Pharma", "w1");
  mkdirSync(week, { recursive: true });
  writeFileSync(path.join(week, "Reader StudyGuide.docx"), readerGuide());
  writeFileSync(path.join(week, "Second StudyGuide.docx"), secondGuide());
  // A long lecture PDF for the viewer; page 5 has no text, like a scanned slide.
  writeFileSync(
    path.join(week, "Lecture.pdf"),
    buildPdf(
      Array.from({ length: LECTURE_PAGES }, (_, index) =>
        index === 4 ? "" : `Synthetic lecture page ${index + 1}`,
      ),
    ),
  );
  // Another lecture of the same user, for addressing a guide through the wrong lecture.
  const week2 = path.join(source, "Pharma", "w2");
  mkdirSync(week2, { recursive: true });
  writeFileSync(path.join(week2, "Lecture W2.pdf"), buildPdf(["Another synthetic page"]));

  const auth = createAuth(db, resolveAuthConfig(process.env));
  await auth.api.signUpEmail({
    body: { name: READER_USER.name, email: READER_USER.email, password: READER_USER.password },
  });
  const [user] = await db.select().from(users).where(eq(users.email, READER_USER.email));
  if (!user) throw new Error("The reader test account was not created.");

  const sync = await runSync(db, user.id, source, {
    store: new LocalObjectStore(storage),
    dryRun: false,
  });
  const failed = sync.processing.processed.filter((resource) => resource.outcome !== "parsed");
  if (failed.length > 0) throw new Error(`Reader fixture did not parse: ${JSON.stringify(failed)}`);

  const rows = await db.select().from(resources).where(eq(resources.userId, user.id));
  const byName = (name: string) => {
    const row = rows.find((resource) => resource.originalFilename === name);
    if (!row) throw new Error(`Reader fixture is missing ${name}.`);
    return row;
  };
  const guide = byName("Reader StudyGuide.docx");
  const second = byName("Second StudyGuide.docx");
  const pdf = byName("Lecture.pdf");
  const otherLecture = byName("Lecture W2.pdf");
  const mediaOf = async (resourceId: string) =>
    (
      await db
        .select({ hash: resourceMedia.contentHash })
        .from(resourceMedia)
        .where(and(eq(resourceMedia.resourceId, resourceId), eq(resourceMedia.userId, user.id)))
    ).map((row) => row.hash);

  const fixture: ReaderFixture = {
    lectureId: guide.lectureId,
    guideId: guide.id,
    secondGuideId: second.id,
    pdfId: pdf.id,
    otherLectureId: otherLecture.lectureId,
    guideImages: await mediaOf(guide.id),
    secondGuideImages: await mediaOf(second.id),
  };
  writeFileSync(path.join(e2eDir, "reader.json"), JSON.stringify(fixture, null, 2));
}
