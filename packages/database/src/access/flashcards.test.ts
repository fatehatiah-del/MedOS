import type { StudyGuideDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import {
  flashcardDecks,
  flashcards,
  lectureProgress,
  resourceContents,
  resources,
} from "../schema";
import {
  createCourse,
  createCourseForNewUser,
  createLecture,
  createWeek,
  first,
  violation,
} from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Flashcards at the trusted boundary: decks belong to one course, reviews never
 * mix courses, FSRS scheduling persists, every review is kept, and cards made
 * from a Study Guide point at the exact passage.
 */

let connection: DatabaseConnection;
let db: Database;

/* Invented content: structure only. */
const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic guide",
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

let sequence = 0;

async function createOwner() {
  sequence += 1;
  const { user, semester, course } = await createCourseForNewUser(db);
  const otherCourse = await createCourse(db, semester, "pathology");
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  const otherWeek = await createWeek(db, otherCourse, 1);
  const otherLecture = await createLecture(db, otherWeek, 1);
  const hash = String(sequence).repeat(64).slice(0, 64);
  const studyGuide = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
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
    userId: user.id,
    resourceId: studyGuide.id,
    format: "study-guide",
    parser: "docx-study-guide",
    parserVersion: 1,
    sourceContentHash: hash,
    content: guide,
    extractedAt: new Date(),
  });
  return {
    user,
    course,
    otherCourse,
    lecture,
    otherLecture,
    studyGuide,
    scope: createUserScope(db, user.id),
  };
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

const day = new Date("2026-10-05T00:00:00Z");
const at = (hours: number) => new Date(day.getTime() + hours * 3_600_000);

describe("decks", () => {
  it("give each lecture one deck of its own course, made when first needed", async () => {
    const deck = await a.scope.flashcards.decks.forLecture(a.lecture.id);
    expect(deck).toMatchObject({
      courseId: a.course.id,
      lectureId: a.lecture.id,
      name: "Week 1 · Test lecture 1",
    });
    expect((await a.scope.flashcards.decks.forLecture(a.lecture.id))?.id).toBe(deck?.id);
    expect(await b.scope.flashcards.decks.forLecture(a.lecture.id)).toBeNull();
  });

  it("can be made for a course, by name", async () => {
    const deck = await a.scope.flashcards.decks.create(a.course.id, "  High-yield  ");
    expect(deck).toMatchObject({ courseId: a.course.id, lectureId: null, name: "High-yield" });
    expect(await a.scope.flashcards.decks.create(a.course.id, " ")).toBeNull();
    expect(await b.scope.flashcards.decks.create(a.course.id, "Mine")).toBeNull();
  });

  it("cannot pair a lecture with another course", async () => {
    const message = await violation(() =>
      db.insert(flashcardDecks).values({
        userId: a.user.id,
        courseId: a.course.id,
        lectureId: a.otherLecture.id,
        name: "Wrong",
      }),
    );
    expect(message).toContain("flashcard_decks_lecture_fk");
  });
});

describe("cards", () => {
  it("are written by the user, edited, and deleted without losing their history", async () => {
    const deck = (await a.scope.flashcards.decks.forLecture(a.lecture.id))!;
    const created = await a.scope.flashcards.cards.create(
      deck.id,
      { front: " Q? ", back: " A. " },
      at(0),
    );
    if (!created.ok) throw new Error("expected a card");
    expect(created.card).toMatchObject({
      front: "Q?",
      back: "A.",
      origin: "manual",
      state: "new",
      reps: 0,
    });
    expect(await a.scope.flashcards.cards.create(deck.id, { front: "", back: "A" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      (await a.scope.flashcards.cards.update(created.card.id, { front: "Q2?", back: "A2." }))
        ?.front,
    ).toBe("Q2?");

    await a.scope.flashcards.review.rate(created.card.id, "good", { now: at(1) });
    expect(await a.scope.flashcards.cards.remove(created.card.id)).toBe(true);
    expect(await a.scope.flashcards.cards.get(created.card.id)).toBeNull();
    expect(await a.scope.flashcards.review.history(created.card.id)).toHaveLength(1);
    expect(await a.scope.flashcards.cards.remove(created.card.id)).toBe(false);
  });

  it("from a Study Guide keep the exact passage, checked against the guide", async () => {
    const card = await a.scope.flashcards.cards.createFromStudyGuide(a.studyGuide.id, {
      front: "What does a ligand do?",
      back: "binds receptor",
      sectionId: "1-alpha",
      unitPath: "0",
      start: 7,
      end: 21,
      quote: "binds receptor",
    });
    expect(card).toMatchObject({
      ok: true,
      card: {
        origin: "study-guide",
        sourceResourceId: a.studyGuide.id,
        sourceSectionId: "1-alpha",
        sourceUnitPath: "0",
        sourceQuote: "binds receptor",
      },
    });
    if (!card.ok) throw new Error("expected a card");
    const deck = await a.scope.flashcards.decks.forLecture(a.lecture.id);
    expect(card.card.deckId).toBe(deck?.id);
    expect(
      await a.scope.flashcards.cards.createFromStudyGuide(a.studyGuide.id, {
        front: "Q",
        back: "A",
        sectionId: "1-alpha",
        unitPath: "0",
        start: 7,
        end: 21,
        quote: "BINDS RECEPTOR",
      }),
    ).toEqual({ ok: false, reason: "text-mismatch" });
    expect(
      await b.scope.flashcards.cards.createFromStudyGuide(a.studyGuide.id, {
        front: "Q",
        back: "A",
        sectionId: "1-alpha",
        unitPath: "0",
        start: 7,
        end: 21,
        quote: "binds receptor",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("review", () => {
  it("schedules with FSRS, keeps every review, and only shows due cards", async () => {
    const deck = (await a.scope.flashcards.decks.create(a.course.id, "Schedule"))!;
    const made = await a.scope.flashcards.cards.create(deck.id, { front: "F", back: "B" }, at(0));
    if (!made.ok) throw new Error("expected a card");
    const first = await a.scope.flashcards.review.rate(made.card.id, "good", {
      now: at(1),
      durationMs: 4000,
    });
    expect(first?.card.state).not.toBe("new");
    expect(first?.card.reps).toBe(1);
    expect(first?.review).toMatchObject({ rating: "good", stateBefore: "new", durationMs: 4000 });

    const notYet = await a.scope.flashcards.review.queue(
      { deckId: deck.id },
      { now: at(1), dayStart: day },
    );
    expect(notYet?.cards.map((card) => card.id)).not.toContain(made.card.id);
    const later = new Date(first!.card.due.getTime() + 1000);
    const dueNow = await a.scope.flashcards.review.queue(
      { deckId: deck.id },
      { now: later, dayStart: day },
    );
    expect(dueNow?.cards.map((card) => card.id)).toContain(made.card.id);

    await a.scope.flashcards.review.rate(made.card.id, "again", { now: later });
    const history = await a.scope.flashcards.review.history(made.card.id);
    expect(history.map((row) => row.rating)).toEqual(["good", "again"]);
    expect((await a.scope.flashcards.cards.get(made.card.id))?.lapses).toBeGreaterThanOrEqual(0);
  });

  it("never mixes courses", async () => {
    const other = (await a.scope.flashcards.decks.forLecture(a.otherLecture.id))!;
    const made = await a.scope.flashcards.cards.create(
      other.id,
      { front: "Other course", back: "X" },
      at(0),
    );
    if (!made.ok) throw new Error("expected a card");
    const queue = await a.scope.flashcards.review.queue(
      { courseId: a.course.id },
      { now: at(30), dayStart: day },
    );
    expect(queue?.cards.every((card) => card.front !== "Other course")).toBe(true);
    const otherQueue = await a.scope.flashcards.review.queue(
      { courseId: a.otherCourse.id },
      { now: at(30), dayStart: day },
    );
    expect(otherQueue?.cards.map((card) => card.front)).toEqual(["Other course"]);
  });

  it("introduces at most the day's new cards per course", async () => {
    const deck = (await a.scope.flashcards.decks.create(a.otherCourse.id, "Limit"))!;
    for (const front of ["N1", "N2", "N3"]) {
      await a.scope.flashcards.cards.create(deck.id, { front, back: "B" }, at(0));
    }
    const queue = await a.scope.flashcards.review.queue(
      { courseId: a.otherCourse.id },
      { now: at(2), dayStart: day, newPerDay: 2 },
    );
    expect(queue).toMatchObject({ newAvailable: 2, newIntroducedToday: 0 });
    expect(queue?.cards).toHaveLength(2);
    await a.scope.flashcards.review.rate(queue!.cards[0]!.id, "good", { now: at(3) });
    await a.scope.flashcards.review.rate(queue!.cards[1]!.id, "good", { now: at(3) });
    const after = await a.scope.flashcards.review.queue(
      { courseId: a.otherCourse.id },
      { now: at(3), dayStart: day, newPerDay: 2 },
    );
    expect(after).toMatchObject({ newAvailable: 0, newIntroducedToday: 2 });
    expect(after?.cards.every((card) => card.state !== "new")).toBe(true);
  });

  it("summarises decks with due and new counts", async () => {
    const decks = await a.scope.flashcards.decks.list(a.otherCourse.id, at(3));
    const limit = decks.find((deck) => deck.deck.name === "Limit");
    // The earlier "Other course" card was introduced first (same course), so two stay new.
    expect(limit).toMatchObject({ total: 3, fresh: 2 });
    expect((await a.scope.flashcards.decks.list(null, at(3))).every((deck) => deck.course.id)).toBe(
      true,
    );
  });
});

describe("privacy", () => {
  it("keeps decks, cards and reviews private", async () => {
    const [deck] = await a.scope.flashcards.decks.list(a.course.id);
    const [card] = await a.scope.flashcards.cards.list(deck!.deck.id);
    expect(await b.scope.flashcards.decks.get(deck!.deck.id)).toBeNull();
    expect(await b.scope.flashcards.cards.list(deck!.deck.id)).toEqual([]);
    expect(await b.scope.flashcards.cards.create(deck!.deck.id, { front: "x", back: "y" })).toEqual(
      {
        ok: false,
        reason: "not-found",
      },
    );
    expect(await b.scope.flashcards.review.rate(card!.id, "easy")).toBeNull();
    expect(await b.scope.flashcards.cards.update(card!.id, { front: "x", back: "y" })).toBeNull();
    expect(await b.scope.flashcards.cards.remove(card!.id)).toBe(false);
    expect(await b.scope.flashcards.review.history(card!.id)).toEqual([]);
    expect(
      await b.scope.flashcards.review.queue(
        { courseId: a.course.id },
        { now: at(5), dayStart: day },
      ),
    ).toBeNull();
  });

  it("cannot put a card in another user's deck, even directly", async () => {
    const [deck] = await a.scope.flashcards.decks.list(a.course.id);
    const message = await violation(() =>
      db.insert(flashcards).values({
        userId: b.user.id,
        deckId: deck!.deck.id,
        front: "x",
        back: "y",
        due: new Date(),
      }),
    );
    expect(message).toContain("flashcards_deck_fk");
  });

  it("never completes the lecture", async () => {
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
  });
});
