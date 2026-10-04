import type { McqSet, QuestionBank, StudyGuideDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { type Lecture, type User, resourceContents, resources, searchEntries } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { queryTerms, rank, snippetOf } from "./search";
import { createUserScope } from "./user-scope";

/*
 * Search across the study environment: each kind of material is found with
 * its course and lecture and where to open it; every word must match; the
 * index follows changes to parsed content; nothing of another user's appears.
 */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;

const text = (value: string) => [{ type: "text" as const, text: value }];
const paragraph = (value: string) => ({ type: "paragraph" as const, inlines: text(value) });

/* Invented content: structure only. */
const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic guide",
  subtitle: null,
  preamble: [],
  sections: [
    {
      id: "gpcr-signalling",
      level: 1,
      heading: text("GPCR signalling"),
      semanticKind: null,
      blocks: [paragraph("Agonists stabilise the active receptor conformation.")],
    },
    {
      id: "kinetics",
      level: 1,
      heading: text("Kinetics"),
      semanticKind: null,
      blocks: [paragraph("Clearance and half-life.")],
    },
  ],
};

const quiz: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [
    {
      key: "q1",
      number: 1,
      fingerprint: "1".repeat(16),
      stem: text("Which receptor family couples to G proteins?"),
      options: ["Ion channels", "GPCRs"].map((option, index) => ({
        label: "AB"[index]!,
        text: text(option),
        explanation: null,
      })),
      answer: { status: "resolved" as const, optionIndex: 1 },
      explanation: text("Seven transmembrane receptors."),
      topic: "Receptors",
      questionType: null,
      sourceRef: null,
      image: null,
      revealImage: null,
    },
  ],
};

const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic bank",
  items: [
    {
      key: "q1",
      number: 1,
      fingerprint: "2".repeat(16),
      prompt: [paragraph("Explain tachyphylaxis.")],
      choices: [],
      answer: {
        status: "paired",
        blocks: [paragraph("Rapidly diminishing response to repeated doses.")],
        correctLabel: null,
        choiceNotes: [],
      },
    },
  ],
};

async function addContent(
  user: User,
  lecture: Lecture,
  kind: "study-guide" | "mcq" | "question-bank",
  content: StudyGuideDocument | McqSet | QuestionBank,
) {
  sequence += 1;
  const hash = sequence.toString(16).padStart(64, "0");
  const resource = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind,
        originalFilename: `${kind}.docx`,
        mimeType: "application/octet-stream",
        sizeBytes: 1,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    userId: user.id,
    resourceId: resource.id,
    format: content.format,
    parser: "test",
    parserVersion: 1,
    sourceContentHash: hash,
    content,
    extractedAt: new Date(),
  });
  return resource;
}

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db, "pharmacology");
  const lecture = await createLecture(db, await createWeek(db, course, 2), 1);
  const scope = createUserScope(db, user.id);
  const guideResource = await addContent(user, lecture, "study-guide", guide);
  const quizResource = await addContent(user, lecture, "mcq", quiz);
  const bankResource = await addContent(user, lecture, "question-bank", bank);
  const deck = await scope.flashcards.decks.create(course.id, "Pharmacology");
  await scope.flashcards.cards.create(deck!.id, {
    front: "Define an agonist",
    back: "Activates the receptor",
  });
  await scope.studyGuides.annotations.create(guideResource.id, {
    kind: "note",
    sectionId: "kinetics",
    unitPath: null,
    start: null,
    end: null,
    quote: null,
    note: "Remember the loading dose formula",
  });
  await scope.studyGuides.annotations.create(guideResource.id, {
    kind: "bookmark",
    sectionId: "gpcr-signalling",
    unitPath: null,
    start: null,
    end: null,
    quote: null,
  });
  return { user, course, lecture, scope, guideResource, quizResource, bankResource };
}

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("search helpers", () => {
  it("splits a query into distinct lower-case words", () => {
    expect(queryTerms("  GPCR  signalling gpcr ")).toEqual(["gpcr", "signalling"]);
    expect(queryTerms("   ")).toEqual([]);
  });

  it("ranks a title match above a body match, and cuts a snippet around the first match", () => {
    expect(rank("GPCR signalling", "", "gpcr", ["gpcr"])).toBeGreaterThan(
      rank("Kinetics", "gpcr in passing", "gpcr", ["gpcr"]),
    );
    const snippet = snippetOf(`${"x ".repeat(60)}the receptor binds ${"y ".repeat(80)}`, [
      "receptor",
    ]);
    expect(snippet).toMatch(/^….*receptor.*…$/);
    // A snippet starts on a whole word.
    expect(snippetOf(`${"abcdefghij".repeat(10)} THE receptor`, ["receptor"])).toBe(
      "…THE receptor",
    );
  });
});

describe("searching", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;

  beforeAll(async () => {
    owner = await createOwner();
  });

  it("finds each kind of material with its course, lecture and place", async () => {
    const results = await owner.scope.search.query("receptor");
    const kinds = results.map((result) => result.kind);
    expect(kinds).toEqual(expect.arrayContaining(["study-guide", "mcq", "flashcard"]));

    const section = results.find((result) => result.kind === "study-guide");
    expect(section).toMatchObject({
      title: "GPCR signalling",
      course: { slug: "pharmacology" },
      lecture: { id: owner.lecture.id, weekNumber: 2 },
      target: {
        kind: "study-guide",
        resourceId: owner.guideResource.id,
        sectionId: "gpcr-signalling",
      },
    });
    expect(section?.snippet).toContain("receptor");

    expect(results.find((result) => result.kind === "mcq")?.target).toEqual({
      kind: "mcq",
      resourceId: owner.quizResource.id,
    });
  });

  it("finds Question Bank answers, courses, lectures, notes and bookmarks", async () => {
    const recall = await owner.scope.search.query("repeated doses");
    expect(recall[0]).toMatchObject({
      kind: "question-bank",
      title: "Explain tachyphylaxis.",
      target: { kind: "question-bank", resourceId: owner.bankResource.id, itemKey: "q1" },
    });
    expect((await owner.scope.search.query("pharmacology"))[0]).toMatchObject({ kind: "course" });
    expect((await owner.scope.search.query("test lecture"))[0]).toMatchObject({ kind: "lecture" });

    const note = (await owner.scope.search.query("loading dose")).find(
      (result) => result.kind === "note",
    );
    expect(note).toMatchObject({
      title: "Remember the loading dose formula",
      target: { kind: "study-guide", sectionId: "kinetics" },
    });
    const bookmark = (await owner.scope.search.query("gpcr")).find(
      (result) => result.kind === "bookmark",
    );
    expect(bookmark?.target).toMatchObject({ kind: "study-guide", sectionId: "gpcr-signalling" });
  });

  it("requires every word, and treats wildcards as plain characters", async () => {
    expect(await owner.scope.search.query("receptor kinetics zzz")).toEqual([]);
    expect(await owner.scope.search.query("%")).toEqual([]);
    expect(await owner.scope.search.query("   ")).toEqual([]);
  });

  it("indexes new content and follows a re-import", async () => {
    await owner.scope.search.query("x");
    const before = await db
      .select()
      .from(searchEntries)
      .where(eq(searchEntries.userId, owner.user.id));
    expect(before).toHaveLength(4);
    // The guide is read again with a new section.
    await db
      .update(resourceContents)
      .set({
        sourceContentHash: "f".repeat(64),
        content: {
          ...guide,
          sections: [
            ...guide.sections,
            {
              id: "antagonists",
              level: 1,
              heading: text("Antagonists"),
              semanticKind: null,
              blocks: [],
            },
          ],
        },
      })
      .where(eq(resourceContents.resourceId, owner.guideResource.id));
    const found = await owner.scope.search.query("antagonists");
    expect(found.map((result) => result.title)).toEqual(["Antagonists"]);
  });

  it("never shows another user's material", async () => {
    const other = await createOwner();
    const mine = await owner.scope.search.query("tachyphylaxis");
    expect(
      mine.every(
        (result) =>
          result.target.kind !== "question-bank" ||
          result.target.resourceId === owner.bankResource.id,
      ),
    ).toBe(true);
    expect(
      mine.some(
        (result) =>
          "resourceId" in result.target && result.target.resourceId === other.bankResource.id,
      ),
    ).toBe(false);
  });
});
