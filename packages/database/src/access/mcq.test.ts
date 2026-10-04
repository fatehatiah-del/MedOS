import type { McqSet } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectureProgress, mcqAttempts, resourceContents, resources } from "../schema";
import {
  createCourseForNewUser,
  createLecture,
  createWeek,
  first,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import { TIME_LIMIT_GRACE_SECONDS } from "./mcq";
import { createUserScope } from "./user-scope";

/*
 * MCQ practice at the trusted boundary: marking happens on the server against
 * the imported answer, every answer is its own attempt, exams respect their
 * time limit, and nothing touches lecture completion.
 */

let connection: DatabaseConnection;
let db: Database;

const text = (value: string) => [{ type: "text" as const, text: value }];

/* Invented questions: structure only. */
const set: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [1, 2, 3].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    stem: text(`Synthetic question ${number}`),
    options: ["A", "B", "C", "D"].map((label) => ({
      label,
      text: text(`Option ${label}`),
      explanation: null,
    })),
    answer:
      number === 3
        ? { status: "unresolved" as const, reason: "No answer stated." }
        : { status: "resolved" as const, optionIndex: 1 },
    explanation: text("Because."),
    topic: "Topic",
    questionType: "mechanism",
    sourceRef: "S1",
    image: null,
    revealImage: null,
  })),
};

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
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

const learn = {
  mode: "learn" as const,
  keys: ["q1", "q2", "q3"],
  shuffled: false,
  timeLimitSeconds: null,
};

describe("an MCQ quiz", () => {
  it("is loaded for its owner only", async () => {
    expect((await a.scope.mcq.get(a.quiz.id))?.set.questions).toHaveLength(3);
    expect(await b.scope.mcq.get(a.quiz.id)).toBeNull();
    expect(await a.scope.mcq.get("not-an-id")).toBeNull();
  });
});

describe("learn mode", () => {
  it("marks each answer on the server, once per session", async () => {
    const session = await a.scope.mcq.sessions.start(a.quiz.id, learn);
    if (!session) throw new Error("expected a session");
    const right = await a.scope.mcq.sessions.answer(session.id, {
      key: "q1",
      optionIndex: 1,
      timeMs: 4200,
    });
    expect(right).toMatchObject({
      ok: true,
      attempt: { correct: true, selectedOption: 1, attemptNumber: 1, timeSpentMs: 4200 },
    });
    const wrong = await a.scope.mcq.sessions.answer(session.id, {
      key: "q2",
      optionIndex: 0,
      timeMs: 10,
    });
    expect(wrong).toMatchObject({ ok: true, attempt: { correct: false } });
    // Answering again in the same session returns the first answer.
    const again = await a.scope.mcq.sessions.answer(session.id, {
      key: "q2",
      optionIndex: 1,
      timeMs: 10,
    });
    expect(again).toMatchObject({ ok: true, attempt: { selectedOption: 0, correct: false } });
    // No stated answer: recorded, not scored.
    expect(
      await a.scope.mcq.sessions.answer(session.id, { key: "q3", optionIndex: 2, timeMs: 10 }),
    ).toMatchObject({ ok: true, attempt: { correct: null, selectedOption: 2 } });
  });

  it("refuses options and questions that are not in the session", async () => {
    const session = await a.scope.mcq.sessions.start(a.quiz.id, { ...learn, keys: ["q1"] });
    if (!session) throw new Error("expected a session");
    for (const input of [
      { key: "q1", optionIndex: 4, timeMs: 0 },
      { key: "q1", optionIndex: -1, timeMs: 0 },
      { key: "q2", optionIndex: 1, timeMs: 0 },
      { key: "q99", optionIndex: 1, timeMs: 0 },
    ]) {
      expect(await a.scope.mcq.sessions.answer(session.id, input)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("keeps repeat attempts as separate records, numbered", async () => {
    const session = await a.scope.mcq.sessions.start(a.quiz.id, learn);
    if (!session) throw new Error("expected a session");
    const result = await a.scope.mcq.sessions.answer(session.id, {
      key: "q1",
      optionIndex: 1,
      timeMs: 1,
    });
    expect(result).toMatchObject({ ok: true, attempt: { attemptNumber: 2 } });
    const rows = await db.select().from(mcqAttempts).where(eq(mcqAttempts.questionKey, "q1"));
    expect(rows.filter((row) => row.userId === a.user.id)).toHaveLength(2);
  });
});

describe("exam mode", () => {
  const exam = {
    mode: "exam" as const,
    keys: ["q2", "q1", "q3"],
    shuffled: true,
    timeLimitSeconds: 60,
  };

  it("saves answers and flags without marking, then marks everything on submission", async () => {
    const start = new Date("2026-10-02T10:00:00Z");
    const session = await a.scope.mcq.sessions.start(a.quiz.id, exam, start);
    if (!session) throw new Error("expected a session");
    const at = new Date("2026-10-02T10:00:20Z");
    expect(
      await a.scope.mcq.sessions.saveDraft(
        session.id,
        { key: "q2", optionIndex: 1, flagged: true, timeMs: 5000 },
        at,
      ),
    ).toMatchObject({ ok: true, draft: { answers: { q2: 1 }, flagged: ["q2"] } });
    await a.scope.mcq.sessions.saveDraft(
      session.id,
      { key: "q1", optionIndex: 3, flagged: false, timeMs: 2000 },
      at,
    );
    // Nothing is recorded as an attempt before submission.
    expect((await a.scope.mcq.sessions.get(session.id))?.attempts).toHaveLength(0);

    const submitted = await a.scope.mcq.sessions.submit(
      session.id,
      new Date("2026-10-02T10:00:40Z"),
    );
    expect(submitted?.session).toMatchObject({ status: "submitted", elapsedSeconds: 40 });
    const byKey = Object.fromEntries(
      (submitted?.attempts ?? []).map((row) => [row.questionKey, row]),
    );
    expect(byKey.q2).toMatchObject({
      selectedOption: 1,
      correct: true,
      flagged: true,
      timeSpentMs: 5000,
      mode: "exam",
    });
    expect(byKey.q1).toMatchObject({ selectedOption: 3, correct: false, flagged: false });
    expect(byKey.q3).toMatchObject({ selectedOption: null, correct: null });

    // Submitting again changes nothing; drafts are refused once submitted.
    expect((await a.scope.mcq.sessions.submit(session.id))?.attempts).toHaveLength(3);
    expect(
      await a.scope.mcq.sessions.saveDraft(session.id, {
        key: "q1",
        optionIndex: 1,
        flagged: false,
        timeMs: 0,
      }),
    ).toEqual({ ok: false, reason: "closed" });
    // Learn-style answers are refused in an exam.
    expect(
      await a.scope.mcq.sessions.answer(session.id, { key: "q1", optionIndex: 1, timeMs: 0 }),
    ).toEqual({
      ok: false,
      reason: "closed",
    });
  });

  it("keeps every change when saves arrive at the same time", async () => {
    const session = await a.scope.mcq.sessions.start(a.quiz.id, {
      ...exam,
      timeLimitSeconds: null,
    });
    if (!session) throw new Error("expected a session");
    await Promise.all([
      a.scope.mcq.sessions.saveDraft(session.id, {
        key: "q1",
        optionIndex: 2,
        flagged: false,
        timeMs: 100,
      }),
      a.scope.mcq.sessions.saveDraft(session.id, {
        key: "q2",
        optionIndex: null,
        flagged: true,
        timeMs: 200,
      }),
      a.scope.mcq.sessions.saveDraft(session.id, {
        key: "q3",
        optionIndex: 0,
        flagged: true,
        timeMs: 300,
      }),
    ]);
    const { draft } = (await a.scope.mcq.sessions.get(session.id))!.session;
    expect(draft.answers).toEqual({ q1: 2, q3: 0 });
    expect([...draft.flagged].sort()).toEqual(["q2", "q3"]);
    expect(draft.timeMs).toEqual({ q1: 100, q2: 200, q3: 300 });
    // Clearing an answer and unflagging remove just that question's entries.
    await a.scope.mcq.sessions.saveDraft(session.id, {
      key: "q3",
      optionIndex: null,
      flagged: false,
      timeMs: 400,
    });
    const after = (await a.scope.mcq.sessions.get(session.id))!.session.draft;
    expect(after).toEqual({
      answers: { q1: 2 },
      flagged: ["q2"],
      timeMs: { q1: 100, q2: 200, q3: 400 },
    });
  });

  it("refuses answers after the time limit", async () => {
    const start = new Date("2026-10-02T11:00:00Z");
    const session = await a.scope.mcq.sessions.start(a.quiz.id, exam, start);
    if (!session) throw new Error("expected a session");
    const late = new Date(start.getTime() + (60 + TIME_LIMIT_GRACE_SECONDS + 1) * 1000);
    expect(
      await a.scope.mcq.sessions.saveDraft(
        session.id,
        { key: "q1", optionIndex: 1, flagged: false, timeMs: 0 },
        late,
      ),
    ).toEqual({ ok: false, reason: "expired" });
    const submitted = await a.scope.mcq.sessions.submit(session.id, late);
    expect(submitted?.session.elapsedSeconds).toBe(60);
  });

  it("can be discarded while unfinished, and then never counts", async () => {
    const session = await a.scope.mcq.sessions.start(a.quiz.id, exam);
    if (!session) throw new Error("expected a session");
    expect(await b.scope.mcq.sessions.discard(session.id)).toBe(false);
    expect(await a.scope.mcq.sessions.discard(session.id)).toBe(true);
    expect((await a.scope.mcq.sessions.get(session.id))?.session.status).toBe("discarded");
    expect(await a.scope.mcq.sessions.discard(session.id)).toBe(false);
  });

  it("reports the latest exam score for the lecture page", async () => {
    // The first exam above: q2 right, q1 wrong, q3 unanswered.
    const scores = await a.scope.mcq.latestScores(a.lecture.id);
    expect(scores.get(a.quiz.id)).toBeDefined();
  });
});

describe("starting a session", () => {
  it("accepts only the quiz's own questions, each once", async () => {
    for (const keys of [[], ["q1", "q1"], ["q1", "q9"]]) {
      expect(await a.scope.mcq.sessions.start(a.quiz.id, { ...learn, keys })).toBeNull();
    }
    expect(
      await a.scope.mcq.sessions.start(a.quiz.id, { ...learn, timeLimitSeconds: 60 }),
    ).toBeNull();
    expect(
      await a.scope.mcq.sessions.start(a.quiz.id, { ...learn, mode: "exam", timeLimitSeconds: 0 }),
    ).toBeNull();
  });
});

describe("privacy", () => {
  it("keeps sessions and attempts private", async () => {
    const [mine] = await a.scope.mcq.sessions.list(a.quiz.id);
    expect(mine).toBeDefined();
    expect(await b.scope.mcq.sessions.get(mine!.id)).toBeNull();
    expect(await b.scope.mcq.sessions.list(a.quiz.id)).toEqual([]);
    expect(await b.scope.mcq.sessions.start(a.quiz.id, learn)).toBeNull();
    expect(
      await b.scope.mcq.sessions.answer(mine!.id, { key: "q1", optionIndex: 1, timeMs: 0 }),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await b.scope.mcq.sessions.submit(mine!.id)).toBeNull();
    expect((await b.scope.mcq.latestScores(a.lecture.id)).size).toBe(0);
  });

  it("cannot attach an attempt to another user's session, even directly", async () => {
    // A fresh session of user A, with no attempts yet.
    const mine = await a.scope.mcq.sessions.start(a.quiz.id, learn);
    const message = await violation(() =>
      db.insert(mcqAttempts).values({
        userId: b.user.id,
        sessionId: mine!.id,
        resourceId: a.quiz.id,
        mode: "learn",
        questionKey: "q1",
        questionFingerprint: "1".repeat(16),
        selectedOption: 1,
        correct: true,
        attemptNumber: 1,
        answeredAt: new Date(),
      }),
    );
    expect(message).toMatch(/mcq_attempts_(session|resource)_fk/);
  });

  it("never completes the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
