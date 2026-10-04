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
import type { QuestionBank } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MESSAGES, rateAttempt, revealItem } from "./logic";

/* Question Bank actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;

const paragraph = (text: string) => ({
  type: "paragraph" as const,
  inlines: [{ type: "text" as const, text }],
});
const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic",
  items: [
    {
      key: "q1",
      number: 1,
      fingerprint: "1".repeat(16),
      prompt: [paragraph("Question one")],
      choices: [],
      answer: {
        status: "paired",
        blocks: [paragraph("Answer one")],
        correctLabel: null,
        choiceNotes: [],
      },
    },
  ],
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
      .values({ email: `qb-${sequence}@example.test`, displayName: "Q" })
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
  const qb = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "question-bank",
        originalFilename: "QuestionBank.docx",
        mimeType: "application/octet-stream",
        sizeBytes: 1,
        contentHash: hash,
        storageKey: `sha256/${hash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: qb.id,
    format: "question-bank",
    parser: "docx-question-bank",
    parserVersion: 1,
    sourceContentHash: hash,
    content: bank,
    extractedAt: new Date(),
  });
  return { user, lecture, qb, scope: createUserScope(db, user.id) };
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

describe("Question Bank actions", () => {
  it("reveal without typing, for the signed-in user only, ignoring any user id sent", async () => {
    const result = await revealItem(a.scope, {
      resourceId: a.qb.id,
      key: "q1",
      typedAnswer: null,
      timeMs: 2000,
      userId: b.user.id,
    });
    expect(result).toMatchObject({ ok: true, value: { answer: { status: "paired" } } });
    expect(await a.scope.questionBanks.history(a.qb.id)).toHaveLength(1);
    expect(await b.scope.questionBanks.history(a.qb.id)).toHaveLength(0);
  });

  it("keep a typed answer and the rating, and refuse others' attempts", async () => {
    const result = await revealItem(a.scope, {
      resourceId: a.qb.id,
      key: "q1",
      typedAnswer: "My recall",
      timeMs: 10,
    });
    if (!result.ok) throw new Error(result.error);
    expect(
      await rateAttempt(a.scope, { attemptId: result.value.attemptId, rating: "hard" }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await rateAttempt(b.scope, { attemptId: result.value.attemptId, rating: "easy" }),
    ).toEqual({
      ok: false,
      error: MESSAGES.attemptMissing,
    });
    const latest = (await a.scope.questionBanks.history(a.qb.id)).at(-1);
    expect(latest).toMatchObject({ typedAnswer: "My recall", rating: "hard", attemptNumber: 2 });
  });

  it("refuse malformed input, unknown ratings and other users' banks", async () => {
    expect(
      await revealItem(a.scope, { resourceId: "x", key: "q1", typedAnswer: null, timeMs: 0 }),
    ).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
    expect(
      await revealItem(b.scope, { resourceId: a.qb.id, key: "q1", typedAnswer: null, timeMs: 0 }),
    ).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
    expect(
      await revealItem(a.scope, {
        resourceId: a.qb.id,
        key: "q1",
        typedAnswer: "x".repeat(10_001),
        timeMs: 0,
      }),
    ).toEqual({ ok: false, error: MESSAGES.tooLong });
    expect(
      await rateAttempt(a.scope, {
        attemptId: "00000000-0000-4000-8000-000000000000",
        rating: "perfect",
      }),
    ).toEqual({ ok: false, error: MESSAGES.invalid });
  });

  it("never complete the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
