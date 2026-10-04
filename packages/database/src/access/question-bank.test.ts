import type { QuestionBank } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { lectureProgress, questionBankAttempts, resourceContents, resources } from "../schema";
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
 * Question Bank recall at the trusted boundary: a model answer is handed out
 * only with a recorded attempt, ratings are the user's own and persist, every
 * reveal is its own attempt, and nothing touches lecture completion.
 */

let connection: DatabaseConnection;
let db: Database;

const paragraph = (text: string) => ({
  type: "paragraph" as const,
  inlines: [{ type: "text" as const, text }],
});

/* Invented items: structure only. */
const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic bank",
  items: [1, 2].map((number) => ({
    key: `q${number}`,
    number,
    fingerprint: `${number}`.repeat(16),
    prompt: [paragraph(`Synthetic question ${number}`)],
    choices: [],
    answer: {
      status: "paired" as const,
      blocks: [paragraph("Model answer")],
      correctLabel: null,
      choiceNotes: [],
    },
  })),
};

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  const hash = String(sequence).repeat(64).slice(0, 64);
  const qb = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
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
    userId: user.id,
    resourceId: qb.id,
    format: "question-bank",
    parser: "docx-question-bank",
    parserVersion: 1,
    sourceContentHash: hash,
    content: bank,
    extractedAt: new Date(),
  });
  return { user, course, lecture, qb, scope: createUserScope(db, user.id) };
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

describe("a question bank", () => {
  it("is loaded for its owner only", async () => {
    expect((await a.scope.questionBanks.get(a.qb.id))?.bank.items).toHaveLength(2);
    expect(await b.scope.questionBanks.get(a.qb.id)).toBeNull();
    expect(await a.scope.questionBanks.get("not-an-id")).toBeNull();
  });
});

describe("recall", () => {
  it("records an attempt when the answer is revealed, with or without typing", async () => {
    const silent = await a.scope.questionBanks.reveal(a.qb.id, {
      key: "q1",
      typedAnswer: null,
      timeMs: 1500,
    });
    expect(silent).toMatchObject({
      ok: true,
      attempt: {
        itemKey: "q1",
        typedAnswer: null,
        rating: null,
        attemptNumber: 1,
        timeSpentMs: 1500,
      },
    });
    const typed = await a.scope.questionBanks.reveal(a.qb.id, {
      key: "q1",
      typedAnswer: "  my own words  ",
      timeMs: 10,
    });
    expect(typed).toMatchObject({
      ok: true,
      attempt: { typedAnswer: "my own words", attemptNumber: 2 },
    });
    // Whitespace alone is not an answer.
    expect(
      await a.scope.questionBanks.reveal(a.qb.id, { key: "q2", typedAnswer: "   ", timeMs: 0 }),
    ).toMatchObject({ ok: true, attempt: { typedAnswer: null } });
  });

  it("refuses items that are not in the bank, and over-long answers", async () => {
    expect(
      await a.scope.questionBanks.reveal(a.qb.id, { key: "q9", typedAnswer: null, timeMs: 0 }),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await a.scope.questionBanks.reveal(a.qb.id, {
        key: "q1",
        typedAnswer: "x".repeat(10_001),
        timeMs: 0,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("keeps the user's ratings, which they can change", async () => {
    const revealed = await a.scope.questionBanks.reveal(a.qb.id, {
      key: "q2",
      typedAnswer: null,
      timeMs: 0,
    });
    if (!revealed.ok) throw new Error("expected an attempt");
    expect((await a.scope.questionBanks.rate(revealed.attempt.id, "hard"))?.rating).toBe("hard");
    expect((await a.scope.questionBanks.rate(revealed.attempt.id, "good"))?.rating).toBe("good");
    const history = await a.scope.questionBanks.history(a.qb.id);
    expect(history.find((row) => row.id === revealed.attempt.id)?.rating).toBe("good");
    expect(history.length).toBeGreaterThanOrEqual(4);
  });

  it("lists the user's banks with where they belong and how much is practised", async () => {
    const [overview] = await a.scope.questionBanks.banks();
    expect(overview).toMatchObject({
      resourceId: a.qb.id,
      itemCount: 2,
      practised: 2,
      lecture: { id: a.lecture.id, number: 1 },
      week: { number: 1 },
      course: { slug: a.course.slug },
    });
  });
});

describe("privacy", () => {
  it("keeps banks, attempts and ratings private", async () => {
    const [mine] = await a.scope.questionBanks.history(a.qb.id);
    expect(await b.scope.questionBanks.history(a.qb.id)).toEqual([]);
    expect(
      await b.scope.questionBanks.reveal(a.qb.id, { key: "q1", typedAnswer: null, timeMs: 0 }),
    ).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await b.scope.questionBanks.rate(mine!.id, "easy")).toBeNull();
    expect((await b.scope.questionBanks.banks()).map((row) => row.resourceId)).toEqual([b.qb.id]);
    expect((await b.scope.questionBanks.banks())[0]?.practised).toBe(0);
  });

  it("cannot attach an attempt to another user's bank, even directly", async () => {
    const message = await violation(() =>
      db.insert(questionBankAttempts).values({
        userId: b.user.id,
        resourceId: a.qb.id,
        itemKey: "q1",
        itemFingerprint: "1".repeat(16),
        revealedAt: new Date(),
        attemptNumber: 1,
      }),
    );
    expect(message).toContain("question_bank_attempts_resource_fk");
  });

  it("refuses unknown ratings and a rating without its time", async () => {
    const [mine] = await a.scope.questionBanks.history(a.qb.id);
    expect(
      await violation(() =>
        db
          .update(questionBankAttempts)
          .set({ rating: "perfect" as never })
          .where(eq(questionBankAttempts.id, mine!.id)),
      ),
    ).toMatch(/question_bank_attempts_(rating_valid|rated_consistent)/);
  });

  it("never completes the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
