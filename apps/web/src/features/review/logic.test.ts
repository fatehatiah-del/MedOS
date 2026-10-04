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
import type { McqSet, QuestionBank } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MESSAGES, hubItemHref, practiseQuestion, removeHubItem, setQuestionReview } from "./logic";

/* Review Later and hub actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;

const quiz: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [
    {
      key: "q1",
      number: 1,
      fingerprint: "a".repeat(16),
      stem: [{ type: "text", text: "Stem one" }],
      options: [
        { label: "A", text: [{ type: "text", text: "Yes" }], explanation: null },
        { label: "B", text: [{ type: "text", text: "No" }], explanation: null },
      ],
      answer: { status: "resolved", optionIndex: 0 },
      explanation: null,
      topic: null,
      questionType: null,
      sourceRef: null,
      image: null,
      revealImage: null,
    },
  ],
};

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
      .values({ email: `review-${sequence}@example.test`, displayName: "Q" })
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
  const quizHash = hash.replace(/^./, "f");
  const mcq = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "mcq",
        originalFilename: "Quiz.html",
        mimeType: "text/html",
        sizeBytes: 1,
        contentHash: quizHash,
        storageKey: `sha256/${quizHash}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: mcq.id,
    format: "mcq-set",
    parser: "html-mcq",
    parserVersion: 1,
    sourceContentHash: quizHash,
    content: quiz,
    extractedAt: new Date(),
  });
  return { user, lecture, qb, mcq, scope: createUserScope(db, user.id) };
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

describe("marking a question Review Later", () => {
  it("adds and removes the mark on MCQs and Question Bank items", async () => {
    for (const resourceId of [a.mcq.id, a.qb.id]) {
      expect(
        await setQuestionReview(a.scope, { resourceId, questionKey: "q1", marked: true }),
      ).toEqual({ ok: true, value: { marked: true } });
      expect(await a.scope.review.questions.list(resourceId)).toHaveLength(1);
      expect(
        await setQuestionReview(a.scope, { resourceId, questionKey: "q1", marked: false }),
      ).toEqual({ ok: true, value: { marked: false } });
      expect(await a.scope.review.questions.list(resourceId)).toEqual([]);
    }
  });

  it("rejects malformed input, unknown questions and other users' resources", async () => {
    expect(
      await setQuestionReview(a.scope, { resourceId: "x", questionKey: "q1", marked: true }),
    ).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
    expect(
      await setQuestionReview(a.scope, { resourceId: a.mcq.id, questionKey: "q1'", marked: true }),
    ).toEqual({ ok: false, error: MESSAGES.invalid });
    expect(
      await setQuestionReview(a.scope, { resourceId: a.mcq.id, questionKey: "q7", marked: true }),
    ).toEqual({ ok: false, error: MESSAGES.notFound });
    expect(
      await setQuestionReview(b.scope, { resourceId: a.mcq.id, questionKey: "q1", marked: true }),
    ).toEqual({ ok: false, error: MESSAGES.notFound });
    expect(
      await setQuestionReview(a.scope, {
        resourceId: a.mcq.id,
        questionKey: "q1",
        marked: true,
        note: "x".repeat(10_001),
      }),
    ).toEqual({ ok: false, error: MESSAGES.tooLong });
  });
});

describe("removing an item from the hub", () => {
  it("removes the user's own item only", async () => {
    const item = await a.scope.review.questions.add(a.qb.id, "q1");
    expect(await removeHubItem(b.scope, { source: "question-bank", id: item!.id })).toEqual({
      ok: false,
      error: MESSAGES.itemMissing,
    });
    expect(await removeHubItem(a.scope, { source: "question-bank", id: item!.id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await removeHubItem(a.scope, { source: "study-guide", id: item!.id })).toEqual({
      ok: false,
      error: MESSAGES.itemMissing,
    });
    expect(await removeHubItem(a.scope, { source: "elsewhere", id: item!.id })).toEqual({
      ok: false,
      error: MESSAGES.invalid,
    });
  });
});

describe("practising an MCQ from Review Later", () => {
  it("starts a one-question Learn session for the owner only", async () => {
    const result = await practiseQuestion(a.scope, { resourceId: a.mcq.id, questionKey: "q1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const view = await a.scope.mcq.sessions.get(result.value.sessionId);
    expect(view?.session).toMatchObject({
      mode: "learn",
      timeLimitSeconds: null,
      questions: [{ key: "q1" }],
    });
    expect(await practiseQuestion(b.scope, { resourceId: a.mcq.id, questionKey: "q1" })).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
  });
});

describe("hub links", () => {
  it("go to the exact place, and nowhere for an orphan", async () => {
    await a.scope.review.questions.add(a.qb.id, "q1");
    const [item] = await a.scope.review.hub();
    expect(hubItemHref(item!)).toBe(
      `/courses/pharmacology/lectures/${a.lecture.id}/question-bank/${a.qb.id}?item=q1`,
    );
    expect(hubItemHref({ ...item!, target: { kind: "study-guide", annotationId: "abc" } })).toBe(
      `/courses/pharmacology/lectures/${a.lecture.id}/study-guide/${a.qb.id}?annotation=abc`,
    );
    expect(hubItemHref({ ...item!, target: { kind: "original-lecture", page: 4 } })).toBe(
      `/courses/pharmacology/lectures/${a.lecture.id}/original/${a.qb.id}?page=4`,
    );
    expect(hubItemHref({ ...item!, target: null })).toBeNull();
  });
});

describe("lecture completion", () => {
  it("is never changed by Review Later or the hub", async () => {
    expect(
      await db.select().from(lectureProgress).where(eq(lectureProgress.userId, a.user.id)),
    ).toEqual([]);
  });
});
