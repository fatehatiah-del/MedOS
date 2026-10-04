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
import type { StudyGuideDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MESSAGES,
  cardFromStudyGuide,
  createCard,
  createDeck,
  deleteCard,
  openLectureDeck,
  rateCard,
  startOfDay,
  updateCard,
} from "./logic";

/* Flashcard actions as the browser calls them: untrusted input, the user's scope. */

let connection: DatabaseConnection;
let db: Database;

const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic",
  subtitle: null,
  preamble: [],
  sections: [
    {
      id: "1-alpha",
      level: 1,
      heading: [{ type: "text", text: "1 Alpha" }],
      semanticKind: null,
      blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Ligand binds receptor." }] }],
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
      .values({ email: `fc-${sequence}@example.test`, displayName: "F" })
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
  const studyGuide = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "study-guide",
        originalFilename: "StudyGuide.docx",
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
    resourceId: studyGuide.id,
    format: "study-guide",
    parser: "docx-study-guide",
    parserVersion: 1,
    sourceContentHash: hash,
    content: guide,
    extractedAt: new Date(),
  });
  return { user, course, lecture, studyGuide, scope: createUserScope(db, user.id) };
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

describe("the day the new-card limit counts from", () => {
  it("starts at local midnight in the semester's time zone", () => {
    // 01:30 in Frankfurt (CEST, UTC+2) on 5 October is 23:30 UTC on 4 October.
    expect(startOfDay(new Date("2026-10-04T23:30:00Z"), "Europe/Berlin").toISOString()).toBe(
      "2026-10-04T22:00:00.000Z",
    );
    expect(startOfDay(new Date("2026-12-15T12:00:00Z"), "Europe/Berlin").toISOString()).toBe(
      "2026-12-14T23:00:00.000Z",
    );
    expect(startOfDay(new Date("2026-10-05T10:00:00Z"), "UTC").toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });
});

describe("flashcard actions", () => {
  it("open a lecture's deck, add, edit, rate and delete cards for the signed-in user", async () => {
    const deck = await openLectureDeck(a.scope, { lectureId: a.lecture.id });
    if (!deck.ok) throw new Error(deck.error);
    const made = await createCard(a.scope, {
      deckId: deck.value.deckId,
      front: "Q",
      back: "A",
      userId: b.user.id,
    });
    if (!made.ok) throw new Error(made.error);
    expect(
      (await updateCard(a.scope, { cardId: made.value.cardId, front: "Q2", back: "A2" })).ok,
    ).toBe(true);
    const rated = await rateCard(a.scope, {
      cardId: made.value.cardId,
      rating: "good",
      durationMs: 3000,
    });
    expect(rated).toMatchObject({ ok: true, value: { state: expect.any(String) } });
    if (rated.ok)
      expect(Object.keys(rated.value.intervals)).toEqual(["again", "hard", "good", "easy"]);
    expect((await deleteCard(a.scope, { cardId: made.value.cardId })).ok).toBe(true);
    expect(await a.scope.flashcards.review.history(made.value.cardId)).toHaveLength(1);
  });

  it("make a card from a Study Guide passage, which must match the guide", async () => {
    const input = {
      resourceId: a.studyGuide.id,
      sectionId: "1-alpha",
      unitPath: "0",
      start: 7,
      end: 21,
      quote: "binds receptor",
      front: "What does a ligand do?",
      back: "binds receptor",
    };
    expect(await cardFromStudyGuide(a.scope, input)).toMatchObject({
      ok: true,
      value: { deckName: "Week 1 · Lecture 1" },
    });
    expect(await cardFromStudyGuide(a.scope, { ...input, quote: "something else" })).toEqual({
      ok: false,
      error: MESSAGES.mismatch,
    });
    expect(await cardFromStudyGuide(b.scope, input)).toEqual({
      ok: false,
      error: MESSAGES.notFound,
    });
  });

  it("refuse empty cards, nameless decks and other users' decks and cards", async () => {
    const deck = await createDeck(a.scope, { courseId: a.course.id, name: "Mine" });
    if (!deck.ok) throw new Error(deck.error);
    expect(await createCard(a.scope, { deckId: deck.value.deckId, front: " ", back: "A" })).toEqual(
      {
        ok: false,
        error: MESSAGES.invalid,
      },
    );
    expect(await createDeck(a.scope, { courseId: a.course.id, name: "" })).toEqual({
      ok: false,
      error: MESSAGES.deckName,
    });
    expect(await createDeck(b.scope, { courseId: a.course.id, name: "Theirs" })).toEqual({
      ok: false,
      error: MESSAGES.deckName,
    });
    expect(await createCard(b.scope, { deckId: deck.value.deckId, front: "Q", back: "A" })).toEqual(
      {
        ok: false,
        error: MESSAGES.notFound,
      },
    );
    expect(await openLectureDeck(b.scope, { lectureId: a.lecture.id })).toEqual({
      ok: false,
      error: MESSAGES.lecture,
    });
  });

  it("never complete the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
