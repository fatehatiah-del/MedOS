import {
  type McqSet,
  type ParsedContent,
  type PdfDocument,
  type QuestionBank,
  type StudyGuideDocument,
  blockPath,
} from "@medos/parsers/model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectureProgress, questionReviewItems, resourceContents, resources } from "../schema";
import {
  createCourseForNewUser,
  createLecture,
  createWeek,
  first,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Review Later on questions and the annotation hub: items are private, follow
 * a question renumbered by a re-import, are reported (not re-attached) when
 * their source is gone, and never touch lecture completion.
 */

let connection: DatabaseConnection;
let db: Database;

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
      id: "alpha",
      level: 1,
      heading: text("Alpha"),
      semanticKind: null,
      blocks: [paragraph("Ligand binds receptor.")],
    },
  ],
};

const pdf: PdfDocument = {
  format: "pdf",
  pageCount: 3,
  metadata: { title: null, author: null, creator: null, producer: null, createdAt: null },
  pages: [1, 2, 3].map((number) => ({ number, text: "" })),
};

const mcq: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [1, 2].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    stem: text(`Synthetic MCQ ${number}`),
    options: ["A", "B"].map((label) => ({ label, text: text(label), explanation: null })),
    answer: { status: "resolved" as const, optionIndex: 0 },
    explanation: null,
    topic: null,
    questionType: null,
    sourceRef: null,
    image: null,
    revealImage: null,
  })),
};

const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic bank",
  items: [1, 2].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number + 4}`.repeat(16),
    prompt: [paragraph(`Synthetic recall ${number}`)],
    choices: [],
    answer: { status: "missing" as const, reason: "None" },
  })),
};

let sequence = 0;

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  async function resource(
    kind: "study-guide" | "original-lecture" | "mcq" | "question-bank",
    content: StudyGuideDocument | PdfDocument | McqSet | QuestionBank,
  ) {
    sequence += 1;
    const hash = sequence.toString(16).padStart(64, "0");
    const row = first(
      await db
        .insert(resources)
        .values({
          userId: user.id,
          lectureId: lecture.id,
          kind,
          originalFilename: `${kind}.bin`,
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
      resourceId: row.id,
      format: content.format,
      parser: "synthetic",
      parserVersion: 1,
      sourceContentHash: hash,
      content,
      extractedAt: new Date(),
    });
    return row;
  }
  return {
    user,
    course,
    lecture,
    guide: await resource("study-guide", guide),
    pdf: await resource("original-lecture", pdf),
    quiz: await resource("mcq", mcq),
    qb: await resource("question-bank", bank),
    scope: createUserScope(db, user.id),
  };
}

async function replaceContent(resourceId: string, content: ParsedContent) {
  await db
    .update(resourceContents)
    .set({ content })
    .where(eq(resourceContents.resourceId, resourceId));
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  a = await createOwner();
  b = await createOwner();
});

afterAll(async () => {
  await connection.close();
});

describe("Review Later on a question", () => {
  it("is added once per question, with an optional note, and removed", async () => {
    expect(await a.scope.review.questions.add(a.quiz.id, "q1")).toMatchObject({
      questionKey: "q1",
      note: null,
    });
    expect(await a.scope.review.questions.add(a.quiz.id, "q1", "  Why B?  ")).toMatchObject({
      note: "Why B?",
    });
    expect(await a.scope.review.questions.list(a.quiz.id)).toHaveLength(1);
    expect(await a.scope.review.questions.remove(a.quiz.id, "q1")).toBe(true);
    expect(await a.scope.review.questions.remove(a.quiz.id, "q1")).toBe(false);
    expect(await a.scope.review.questions.list(a.quiz.id)).toEqual([]);
  });

  it("works on Question Bank items too", async () => {
    expect(await a.scope.review.questions.add(a.qb.id, "q2")).toMatchObject({ questionKey: "q2" });
    await a.scope.review.questions.remove(a.qb.id, "q2");
  });

  it("is refused for a question that does not exist, a non-question resource or a bad note", async () => {
    expect(await a.scope.review.questions.add(a.quiz.id, "q9")).toBeNull();
    expect(await a.scope.review.questions.add(a.quiz.id, "1; drop")).toBeNull();
    expect(await a.scope.review.questions.add(a.guide.id, "q1")).toBeNull();
    expect(await a.scope.review.questions.add(a.quiz.id, "q1", "x".repeat(10_001))).toBeNull();
  });

  it("is private: another user can neither add, see nor remove it", async () => {
    await a.scope.review.questions.add(a.quiz.id, "q2");
    expect(await b.scope.review.questions.add(a.quiz.id, "q2")).toBeNull();
    expect(await b.scope.review.questions.list(a.quiz.id)).toEqual([]);
    expect(await b.scope.review.questions.remove(a.quiz.id, "q2")).toBe(false);
    const [item] = await a.scope.review.questions.list(a.quiz.id);
    expect(await b.scope.review.questions.removeById(item!.id)).toBe(false);
    expect((await b.scope.review.hub()).some((entry) => entry.id === item!.id)).toBe(false);
    expect(await a.scope.review.questions.removeById(item!.id)).toBe(true);
  });

  it("cannot be stored against another user's resource", async () => {
    expect(
      await violation(() =>
        db.insert(questionReviewItems).values({
          userId: b.user.id,
          resourceId: a.quiz.id,
          questionKey: "q1",
          questionFingerprint: "1".repeat(16),
        }),
      ),
    ).toContain("question_review_items_resource_fk");
  });
});

describe("the annotation hub", () => {
  it("lists every kind of item with its course, week and lecture, newest first", async () => {
    const owner = await createOwner();
    const { scope } = owner;
    const highlight = await scope.studyGuides.annotations.create(owner.guide.id, {
      kind: "highlight",
      sectionId: "alpha",
      unitPath: blockPath(null, 0),
      start: 0,
      end: 6,
      quote: "Ligand",
    });
    expect(highlight.ok).toBe(true);
    await scope.originalLectures.annotations.create(owner.pdf.id, {
      kind: "note",
      page: 2,
      note: "Slide note",
    });
    await scope.review.questions.add(owner.quiz.id, "q2", "Revisit");
    await scope.review.questions.add(owner.qb.id, "q1");

    const hub = await scope.review.hub();
    expect(hub.map((item) => [item.source, item.kind])).toEqual([
      ["question-bank", "review-later"],
      ["mcq", "review-later"],
      ["original-lecture", "note"],
      ["study-guide", "highlight"],
    ]);
    const [recall, question, page, passage] = hub;
    expect(passage).toMatchObject({
      excerpt: "Ligand",
      location: "Alpha",
      target: { kind: "study-guide" },
      lecture: { id: owner.lecture.id },
      course: { slug: owner.course.slug },
      week: { number: 1 },
    });
    expect(page).toMatchObject({
      note: "Slide note",
      target: { kind: "original-lecture", page: 2 },
    });
    expect(question).toMatchObject({
      excerpt: "Synthetic MCQ 2",
      location: "Question 2",
      note: "Revisit",
      target: { kind: "mcq", questionKey: "q2" },
    });
    expect(recall).toMatchObject({
      excerpt: "Synthetic recall 1",
      target: { kind: "question-bank", questionKey: "q1" },
    });
    // No storage detail reaches the hub.
    expect(JSON.stringify(hub)).not.toMatch(/sha256\/|storageKey|contentHash/);
  });

  it("follows a renumbered question and labels items whose source is gone", async () => {
    const owner = await createOwner();
    const { scope } = owner;
    await scope.studyGuides.annotations.create(owner.guide.id, {
      kind: "bookmark",
      sectionId: "alpha",
      unitPath: blockPath(null, 0),
      start: 7,
      end: 12,
      quote: "binds",
    });
    await scope.originalLectures.annotations.create(owner.pdf.id, { kind: "bookmark", page: 3 });
    await scope.review.questions.add(owner.quiz.id, "q1");
    await scope.review.questions.add(owner.qb.id, "q1");

    // A re-import: the passage is rewritten, the PDF loses a page, the quiz
    // gains a question before the marked one, and the bank's item is gone.
    await replaceContent(owner.guide.id, {
      ...guide,
      sections: [{ ...guide.sections[0]!, blocks: [paragraph("Entirely different words.")] }],
    });
    await replaceContent(owner.pdf.id, { ...pdf, pageCount: 2, pages: pdf.pages.slice(0, 2) });
    await replaceContent(owner.quiz.id, {
      ...mcq,
      questions: [
        { ...mcq.questions[1]!, key: "q1", number: 1 },
        { ...mcq.questions[0]!, key: "q2", number: 2 },
      ],
    });
    await replaceContent(owner.qb.id, { ...bank, items: [bank.items[1]!] });

    const hub = await scope.review.hub();
    const by = (source: string) => hub.find((item) => item.source === source)!;
    expect(by("study-guide")).toMatchObject({ target: null, excerpt: "binds" });
    expect(by("original-lecture")).toMatchObject({ target: null });
    expect(by("mcq")).toMatchObject({
      target: { kind: "mcq", questionKey: "q2" },
      excerpt: "Synthetic MCQ 1",
    });
    expect(by("question-bank")).toMatchObject({ target: null });
    expect(await scope.review.questions.list(owner.quiz.id)).toMatchObject([{ questionKey: "q2" }]);

    // An orphan can still be removed.
    expect(await scope.review.questions.removeById(by("question-bank").id)).toBe(true);
  });

  it("never marks a lecture complete", async () => {
    const progress = await db
      .select()
      .from(lectureProgress)
      .where(and(eq(lectureProgress.userId, a.user.id)));
    expect(progress).toEqual([]);
  });
});
