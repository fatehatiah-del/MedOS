import { type ExportSnapshot, exportFile, toCsvFiles } from "@medos/export";
import {
  type McqSet,
  type QuestionBank,
  type StudyGuideDocument,
  blockPath,
} from "@medos/parsers/model";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { resourceContents, resources } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Export: a user's snapshot holds all of their own records and none of anyone
 * else's, every lecture item names its course, week, lecture and file, and
 * questions are read from the file (or exported without text once gone).
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

const quiz: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [1, 2].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    stem: text(`Synthetic MCQ ${number}`),
    options: ["A", "B"].map((label) => ({
      label,
      text: text(`Option ${label}`),
      explanation: null,
    })),
    answer: { status: "resolved" as const, optionIndex: 0 },
    explanation: null,
    topic: "Receptors",
    questionType: null,
    sourceRef: "S3",
    image: null,
    revealImage: null,
  })),
};

const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic bank",
  items: [
    {
      key: "q1",
      number: 1,
      fingerprint: "7".repeat(16),
      prompt: [paragraph("Synthetic recall 1")],
      choices: [],
      answer: {
        status: "paired",
        blocks: [paragraph("Model answer")],
        correctLabel: null,
        choiceNotes: [],
      },
    },
  ],
};

let sequence = 0;

async function createOwner(slug: string) {
  const { user, course } = await createCourseForNewUser(db, slug);
  const week = await createWeek(db, course, 3);
  const lecture = await createLecture(db, week, 2);
  async function resource(
    kind: "study-guide" | "mcq" | "question-bank",
    filename: string,
    content: StudyGuideDocument | McqSet | QuestionBank,
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
          originalFilename: filename,
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
    guide: await resource("study-guide", "StudyGuide.docx", guide),
    quiz: await resource("mcq", "Quiz.html", quiz),
    bank: await resource("question-bank", "QuestionBank.docx", bank),
    scope: createUserScope(db, user.id),
  };
}

/** Records one of everything for a user. */
async function study(owner: Awaited<ReturnType<typeof createOwner>>, words: string) {
  const { scope } = owner;
  const highlight = await scope.studyGuides.annotations.create(owner.guide.id, {
    kind: "note",
    sectionId: "alpha",
    unitPath: blockPath(null, 0),
    start: 0,
    end: 6,
    quote: "Ligand",
    note: words,
  });
  expect(highlight).toMatchObject({ ok: true });
  const card = await scope.flashcards.cards.createFromStudyGuide(owner.guide.id, {
    front: `=${words}?`,
    back: "binds receptor",
    sectionId: "alpha",
    unitPath: blockPath(null, 0),
    start: 7,
    end: 21,
    quote: "binds receptor",
  });
  if (!card.ok) throw new Error("expected a card");
  await scope.flashcards.review.rate(card.card.id, "good", {
    now: new Date("2026-10-05T08:00:00Z"),
  });

  const session = await scope.mcq.sessions.start(owner.quiz.id, {
    mode: "learn",
    keys: ["q1", "q2"],
    shuffled: false,
    timeLimitSeconds: null,
  });
  if (!session) throw new Error("expected a session");
  await scope.mcq.sessions.answer(session.id, { key: "q1", optionIndex: 1, timeMs: 4_000 });
  await scope.mcq.sessions.answer(session.id, { key: "q2", optionIndex: 0, timeMs: 2_000 });

  const reveal = await scope.questionBanks.reveal(owner.bank.id, {
    key: "q1",
    typedAnswer: words,
    timeMs: 1_000,
  });
  if (!reveal.ok) throw new Error("expected an attempt");
  await scope.questionBanks.rate(reveal.attempt.id, "hard");
  await scope.review.questions.add(owner.quiz.id, "q2", "Revisit");

  await scope.lectures.setCompleted(owner.lecture.id, true, new Date("2026-10-04T18:00:00Z"));
  await scope.studySessions.start({ activity: "study-guide", lectureId: owner.lecture.id });
  const exam = await scope.calendar.exams.add({
    courseId: owner.course.id,
    kind: "midterm",
    startsAt: new Date("2026-11-12T08:00:00Z"),
    endsAt: new Date("2026-11-12T10:00:00Z"),
    timezone: "Europe/Berlin",
  });
  expect(exam.ok).toBe(true);
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;
let snapshot: ExportSnapshot;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  a = await createOwner("pharmacology");
  b = await createOwner("pathology");
  await study(a, "Alice's note");
  await study(b, "Bob's secret");
  snapshot = await a.scope.export.snapshot(new Date("2026-10-05T09:00:00Z"));
});

afterAll(async () => {
  await connection.close();
});

describe("an export snapshot", () => {
  it("is stamped with its format, version and time", () => {
    expect(snapshot).toMatchObject({
      format: "medos-export",
      schemaVersion: 1,
      exportedAt: "2026-10-05T09:00:00.000Z",
      generator: "MedOS",
      user: { email: a.user.email },
    });
  });

  it("holds the user's records and nothing of another user's", () => {
    const json = JSON.stringify(snapshot);
    expect(json).toContain("Alice's note");
    expect(json).not.toContain("Bob's secret");
    for (const id of [b.user.id, b.course.id, b.lecture.id, b.guide.id, b.quiz.id, b.bank.id]) {
      expect(json).not.toContain(id);
    }
    expect(snapshot.courses.map((course) => course.slug)).toEqual(["pharmacology"]);
  });

  it("names course, week, lecture and file for every lecture item", () => {
    const [note] = snapshot.annotations;
    expect(note).toMatchObject({
      on: "study-guide",
      kind: "note",
      quote: "Ligand",
      section: "Alpha",
      note: "Alice's note",
      source: {
        courseId: a.course.id,
        courseSlug: "pharmacology",
        week: 3,
        lectureId: a.lecture.id,
        lecture: 2,
        resourceId: a.guide.id,
        resourceKind: "study-guide",
        file: "StudyGuide.docx",
        fileContentHash: a.guide.contentHash,
      },
    });
    expect(snapshot.courses[0]?.weeks[0]?.lectures[0]).toMatchObject({
      id: a.lecture.id,
      completedAt: "2026-10-04T18:00:00.000Z",
    });
  });

  it("keeps a flashcard's Study Guide source, FSRS state and review history", () => {
    const [card] = snapshot.flashcards.cards;
    expect(card).toMatchObject({
      origin: "study-guide",
      sourceSection: "Alpha",
      sourceQuote: "binds receptor",
      source: { file: "StudyGuide.docx", week: 3, lecture: 2 },
      fsrs: { reps: 1, lastReview: "2026-10-05T08:00:00.000Z" },
      deletedAt: null,
    });
    expect(snapshot.flashcards.decks).toHaveLength(1);
    expect(snapshot.flashcards.reviews).toEqual([
      expect.objectContaining({ cardId: card?.id, rating: "good" }),
    ]);
  });

  it("reads each attempt's question from the file", () => {
    const attempts = snapshot.mcq.attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      questionKey: "q1",
      selectedOption: "B",
      correct: false,
      question: {
        number: 1,
        stem: "Synthetic MCQ 1",
        correctOption: "A",
        topic: "Receptors",
        options: [
          { label: "A", text: "Option A" },
          { label: "B", text: "Option B" },
        ],
      },
      source: { file: "Quiz.html" },
    });
    expect(snapshot.mcq.sessions[0]).toMatchObject({ mode: "learn", questionCount: 2 });
    expect(snapshot.questionBank.attempts[0]).toMatchObject({
      question: "Synthetic recall 1",
      modelAnswer: "Model answer",
      typedAnswer: "Alice's note",
      rating: "hard",
      source: { file: "QuestionBank.docx" },
    });
    expect(snapshot.reviewLater[0]).toMatchObject({ question: "Synthetic MCQ 2", note: "Revisit" });
  });

  it("includes study sessions and calendar exams with their course", () => {
    expect(snapshot.studySessions[0]).toMatchObject({
      activity: "study-guide",
      endedAt: null,
      source: { lectureId: a.lecture.id, file: null },
    });
    expect(snapshot.calendar).toEqual([
      expect.objectContaining({
        exam: "midterm",
        timeZone: "Europe/Berlin",
        source: expect.objectContaining({ courseSlug: "pharmacology" }),
      }),
    ]);
  });

  it("exports a question that left the file without guessing its text", async () => {
    // A re-import replaced both questions with a different one in the same place.
    const replacement = { ...quiz.questions[0]!, fingerprint: "9".repeat(16), stem: text("New") };
    await db
      .update(resourceContents)
      .set({ content: { ...quiz, questions: [replacement] } })
      .where(eq(resourceContents.resourceId, a.quiz.id));
    const later = await a.scope.export.snapshot();
    expect(later.mcq.attempts[0]).toMatchObject({ question: null, selectedOption: "2" });
    expect(later.reviewLater[0]).toMatchObject({ question: null, note: "Revisit" });

    // A parsed file that no longer reads does not hold the export back.
    await db
      .update(resourceContents)
      .set({ content: sql`'{"format":"mcq-set","broken":true}'::jsonb` })
      .where(eq(resourceContents.resourceId, a.quiz.id));
    const unreadable = await a.scope.export.snapshot();
    expect(unreadable.mcq.attempts).toHaveLength(2);
    expect(unreadable.mcq.attempts[0]?.question).toBeNull();
    await db
      .update(resourceContents)
      .set({ content: quiz })
      .where(eq(resourceContents.resourceId, a.quiz.id));
  });

  it("round-trips through every format", () => {
    const json = new TextDecoder().decode(exportFile(snapshot, "json").body);
    expect(JSON.parse(json)).toEqual(snapshot);
    const csv = toCsvFiles(snapshot);
    // The card front starts with "=", so the spreadsheet sees text, not a formula.
    expect(csv["flashcards.csv"]).toContain(",'=Alice's note?,");
    expect(csv["mcq_attempts.csv"]).toContain("Synthetic MCQ 1");
  });

  it("is empty but valid for a user with no records", async () => {
    const { user } = await createCourseForNewUser(db, "public-health");
    const empty = await createUserScope(db, user.id).export.snapshot();
    expect(empty.annotations).toEqual([]);
    expect(empty.flashcards.cards).toEqual([]);
    expect(empty.courses).toHaveLength(1);
  });
});
