// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  lectureProgress,
  lectures,
  resourceContents,
  resources,
  semesters,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import type { McqSet } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MESSAGES,
  answerLearnQuestion,
  discardSession,
  finishSession,
  saveExamAnswer,
  startSession,
} from "./logic";

/* MCQ practice actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;

const text = (value: string) => [{ type: "text" as const, text: value }];
const set: McqSet = {
  format: "mcq-set",
  title: "Synthetic",
  subtitle: null,
  questions: [1, 2, 3, 4].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    stem: text(`Stem ${number}`),
    options: ["A", "B", "C"].map((label) => ({ label, text: text(label), explanation: null })),
    answer: { status: "resolved" as const, optionIndex: 0 },
    explanation: text("Because."),
    topic: number <= 2 ? "Alpha" : "Beta",
    questionType: number === 1 ? "vignette" : "recall",
    sourceRef: null,
    image: null,
    revealImage: null,
  })),
};

async function only<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (row === undefined) throw new Error("expected a row");
  return row;
}

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const user = await only(
    db
      .insert(users)
      .values({ email: `mcq-${sequence}@example.test`, displayName: "M" })
      .returning(),
  );
  const owned = { userId: user.id };
  const semester = await only(
    db
      .insert(semesters)
      .values({
        ...owned,
        slug: "2026-fall",
        name: "Fall 2026",
        label: "Semester 5",
        startsOn: "2026-09-28",
        endsOn: "2027-01-29",
      })
      .returning(),
  );
  const course = await only(
    db
      .insert(courses)
      .values({
        ...owned,
        semesterId: semester.id,
        slug: "pharmacology",
        name: "Pharmacology I",
        shortName: "Pharmacology",
      })
      .returning(),
  );
  const week = await only(
    db
      .insert(weeks)
      .values({ ...owned, courseId: course.id, number: 1 })
      .returning(),
  );
  const lecture = await only(
    db
      .insert(lectures)
      .values({ ...owned, courseId: course.id, weekId: week.id, number: 1, title: "Lecture 1" })
      .returning(),
  );
  const hash = String(sequence).repeat(64).slice(0, 64);
  const quiz = await only(
    db
      .insert(resources)
      .values({
        ...owned,
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
    ...owned,
    resourceId: quiz.id,
    format: "mcq-set",
    parser: "html-mcq",
    parserVersion: 1,
    sourceContentHash: hash,
    content: set,
    extractedAt: new Date(),
  });
  return { user, lecture, quiz, scope: createUserScope(db, user.id) };
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

const start = (scope: typeof a.scope, overrides: Record<string, unknown> = {}) =>
  startSession(scope, {
    resourceId: a.quiz.id,
    mode: "learn",
    topic: null,
    count: null,
    shuffle: false,
    timing: "default",
    minutes: null,
    ...overrides,
  });

describe("MCQ actions", () => {
  it("start sessions for the signed-in user only, with the questions chosen", async () => {
    const learn = await start(a.scope, { userId: b.user.id });
    if (!learn.ok) throw new Error(learn.error);
    expect((await a.scope.mcq.sessions.get(learn.value.sessionId))?.session).toMatchObject({
      mode: "learn",
      timeLimitSeconds: null,
    });
    const usmle = await start(a.scope, { mode: "usmle" });
    if (!usmle.ok) throw new Error(usmle.error);
    const usmleSession = await a.scope.mcq.sessions.get(usmle.value.sessionId);
    expect(usmleSession?.session.questions.map((q) => q.key)).toEqual(["q1"]);
    expect(usmleSession?.session.timeLimitSeconds).toBe(90);
    expect(await start(b.scope)).toEqual({ ok: false, error: MESSAGES.notFound });
    expect(await start(a.scope, { mode: "usmle", topic: "Beta" })).toEqual({
      ok: false,
      error: MESSAGES.noQuestions,
    });
    expect(await start(a.scope, { mode: "quiz" })).toEqual({ ok: false, error: MESSAGES.invalid });
  });

  it("mark Learn answers and return feedback only after answering", async () => {
    const learn = await start(a.scope);
    if (!learn.ok) throw new Error(learn.error);
    const result = await answerLearnQuestion(a.scope, {
      sessionId: learn.value.sessionId,
      key: "q2",
      optionIndex: 1,
      timeMs: 900,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { selected: 1, feedback: { correct: false, correctIndex: 0 } },
    });
    expect(
      await answerLearnQuestion(b.scope, {
        sessionId: learn.value.sessionId,
        key: "q2",
        optionIndex: 0,
        timeMs: 0,
      }),
    ).toEqual({ ok: false, error: MESSAGES.sessionNotFound });
  });

  it("save exam answers without marking, then submit, discard only unfinished exams", async () => {
    const exam = await start(a.scope, { mode: "exam" });
    if (!exam.ok) throw new Error(exam.error);
    const { sessionId } = exam.value;
    expect(
      await saveExamAnswer(a.scope, {
        sessionId,
        key: "q1",
        optionIndex: 0,
        flagged: true,
        timeMs: 10,
      }),
    ).toEqual({ ok: true, value: { expired: false } });
    expect(
      await saveExamAnswer(b.scope, {
        sessionId,
        key: "q1",
        optionIndex: 0,
        flagged: false,
        timeMs: 0,
      }),
    ).toEqual({ ok: false, error: MESSAGES.sessionNotFound });
    expect((await finishSession(a.scope, { sessionId })).ok).toBe(true);
    const view = await a.scope.mcq.sessions.get(sessionId);
    expect(view?.attempts).toHaveLength(4);
    expect(await discardSession(a.scope, { sessionId })).toEqual({
      ok: false,
      error: MESSAGES.closed,
    });

    const other = await start(a.scope, { mode: "exam" });
    if (!other.ok) throw new Error(other.error);
    expect(await discardSession(b.scope, { sessionId: other.value.sessionId })).toEqual({
      ok: false,
      error: MESSAGES.closed,
    });
    expect((await discardSession(a.scope, { sessionId: other.value.sessionId })).ok).toBe(true);
  });

  it("never complete the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
