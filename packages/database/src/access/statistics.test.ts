import type { McqSet } from "@medos/parsers/model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { flashcardDecks, flashcards, resourceContents, resources } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Statistics and weaknesses from real activity only: empty data stays empty
 * (never a made-up zero percentage), weak topics carry the signals behind
 * them, and nothing is a mastery score.
 */

let connection: DatabaseConnection;
let db: Database;
let sequence = 0;

const text = (value: string) => [{ type: "text" as const, text: value }];

/* Invented questions: structure only. The correct option is always the second. */
const set: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [1, 2, 3, 4].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    stem: text(`Question ${number}`),
    options: ["A", "B"].map((label) => ({ label, text: text(label), explanation: null })),
    answer: { status: "resolved" as const, optionIndex: 1 },
    explanation: null,
    topic: number <= 2 ? "Receptors" : "Kinetics",
    questionType: "mechanism",
    sourceRef: null,
    image: null,
    revealImage: null,
  })),
};

async function createOwner() {
  sequence += 1;
  const { user, course } = await createCourseForNewUser(db);
  const lecture = await createLecture(db, await createWeek(db, course, 1), 1);
  const hash = String(sequence).repeat(64).slice(0, 64);
  const quiz = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind: "mcq",
        originalFilename: "Quiz.html",
        mimeType: "text/html",
        sizeBytes: 1,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    userId: user.id,
    resourceId: quiz.id,
    format: "mcq-set",
    parser: "html-mcq",
    parserVersion: 1,
    sourceContentHash: hash,
    content: set,
    extractedAt: new Date(),
  });
  return { user, course, lecture, quiz, scope: createUserScope(db, user.id) };
}

/** Answers in a Learn session: `true` picks the correct option. */
async function practise(
  owner: Awaited<ReturnType<typeof createOwner>>,
  answers: Record<string, boolean>,
) {
  const keys = Object.keys(answers);
  const session = await owner.scope.mcq.sessions.start(owner.quiz.id, {
    mode: "learn",
    keys,
    shuffled: false,
    timeLimitSeconds: null,
  });
  if (!session) throw new Error("no session");
  for (const key of keys) {
    await owner.scope.mcq.sessions.answer(session.id, {
      key,
      optionIndex: answers[key] ? 1 : 0,
      timeMs: 1000,
    });
  }
}

const NOW = new Date("2026-10-07T12:00:00Z");

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

describe("empty data", () => {
  it("reports nothing as measured rather than zero results", async () => {
    const { scope, course } = await createOwner();
    const semester = await scope.statistics.semester(NOW);
    expect(semester.metrics.mcq).toMatchObject({ answered: 0, accuracy: null });
    expect(semester.metrics.flashcards.retention30).toBeNull();
    expect(semester.streakDays).toBe(0);
    expect(semester.weekly).toHaveLength(18);
    expect(semester.weekly.every((week) => week.minutes === 0)).toBe(true);
    expect(await scope.statistics.weaknesses()).toEqual([]);
    const stats = await scope.statistics.course(course.id, NOW);
    expect(stats?.topics).toEqual([]);
    expect(stats?.lectures[0]).toMatchObject({ mcqAccuracy: null, studyMinutes: 0 });
  });
});

describe("with activity", () => {
  let owner: Awaited<ReturnType<typeof createOwner>>;

  beforeAll(async () => {
    owner = await createOwner();
    // Receptors: q1 wrong twice, q2 wrong then right. Kinetics: right.
    await practise(owner, { q1: false, q2: false, q3: true, q4: true });
    await practise(owner, { q1: false, q2: true });

    // A lecture deck with lapsed cards.
    const deck = first(
      await db
        .insert(flashcardDecks)
        .values({
          userId: owner.user.id,
          courseId: owner.course.id,
          lectureId: owner.lecture.id,
          name: "L1",
        })
        .returning(),
    );
    await db.insert(flashcards).values(
      [3, 2].map((lapses, index) => ({
        userId: owner.user.id,
        deckId: deck.id,
        front: `F${index}`,
        back: `B${index}`,
        due: NOW,
        reps: 4,
        lapses,
        state: "review" as const,
      })),
    );

    await owner.scope.review.questions.add(owner.quiz.id, "q1", null);
    await owner.scope.review.questions.add(owner.quiz.id, "q2", null);

    // Ten minutes of study on each of the two days before NOW.
    for (const day of ["2026-10-05", "2026-10-06"]) {
      const started = await owner.scope.studySessions.start(
        { activity: "mcq", lectureId: owner.lecture.id },
        new Date(`${day}T08:00:00Z`),
      );
      if (!started.ok) throw new Error("not started");
      await owner.scope.studySessions.heartbeat(started.session.id, new Date(`${day}T08:05:00Z`));
      await owner.scope.studySessions.finish(started.session.id, new Date(`${day}T08:10:00Z`));
    }

    await owner.scope.statistics.difficult.add(owner.course.id, "  receptors ");
    await owner.scope.statistics.difficult.add(owner.course.id, "Tachyphylaxis");
  });

  it("measures the course from real counts", async () => {
    const stats = await owner.scope.statistics.course(owner.course.id, NOW);
    expect(stats?.metrics).toMatchObject({
      lectures: 1,
      completedLectures: 0,
      studySeconds: 1200,
      mcq: { answered: 6, correct: 3, accuracy: 50, questions: 4, repeatedErrors: 1 },
      flashcards: { cards: 2, reviewed: 2, lapses: 5, reviews30: 0, retention30: null },
      reviewLater: 2,
    });
    expect(stats?.topics).toEqual([
      { topic: "Receptors", answered: 4, correct: 1, accuracy: 25 },
      { topic: "Kinetics", answered: 2, correct: 2, accuracy: 100 },
    ]);
    expect(stats?.lectures[0]).toMatchObject({ studyMinutes: 20, mcqAccuracy: 50, lapses: 5 });
    expect(stats?.weekly[1]?.minutes).toBe(20);
  });

  it("explains each weakness with the signals behind it", async () => {
    const weaknesses = await owner.scope.statistics.weaknesses(owner.course.id);
    expect(
      weaknesses.map((weakness) => [
        weakness.kind,
        weakness.label,
        weakness.evidence.map((e) => e.text),
      ]),
    ).toEqual([
      [
        "topic",
        "Receptors",
        [
          "MCQ accuracy: 25% (4 answers)",
          "Repeated errors: 1 question answered wrong more than once",
          "Marked difficult by you",
        ],
      ],
      ["lecture", "Test lecture 1", ["Flashcard lapses: 5", "Review Later items: 2"]],
      ["concept", "Tachyphylaxis", ["Marked difficult by you"]],
    ]);
  });

  it("measures a lecture, and the semester's streak and consistency", async () => {
    const lecture = await owner.scope.statistics.lecture(owner.lecture.id, NOW);
    expect(lecture?.metrics.mcq.accuracy).toBe(50);
    expect(lecture?.weaknesses.map((weakness) => weakness.label)).toEqual([
      "Receptors",
      "Test lecture 1",
    ]);

    const semester = await owner.scope.statistics.semester(NOW);
    expect(semester.streakDays).toBe(2);
    expect(semester.daysStudiedLast7).toBe(2);
    expect(semester.courses).toEqual([
      expect.objectContaining({ mcqAnswered: 6, mcqAccuracy: 50, studyMinutes: 20 }),
    ]);
    expect(semester.upcoming.flashcardsDue7).toBe(2);
  });

  it("marks a concept once, whatever its spelling, and unmarks it", async () => {
    const again = await owner.scope.statistics.difficult.add(owner.course.id, "TACHYPHYLAXIS");
    const stats = await owner.scope.statistics.course(owner.course.id, NOW);
    expect(stats?.difficult.map((concept) => concept.label)).toEqual([
      "receptors",
      "Tachyphylaxis",
    ]);
    expect(await owner.scope.statistics.difficult.remove(again!.id)).toBe(true);
    expect(
      (await owner.scope.statistics.weaknesses(owner.course.id)).some((w) => w.kind === "concept"),
    ).toBe(false);
  });

  it("treats another user's course and concepts as missing", async () => {
    const other = await createOwner();
    expect(await other.scope.statistics.course(owner.course.id, NOW)).toBeNull();
    expect(await other.scope.statistics.lecture(owner.lecture.id, NOW)).toBeNull();
    expect(await other.scope.statistics.difficult.add(owner.course.id, "x")).toBeNull();
    const [concept] = (await owner.scope.statistics.course(owner.course.id, NOW))!.difficult;
    expect(await other.scope.statistics.difficult.remove(concept!.id)).toBe(false);
  });
});
