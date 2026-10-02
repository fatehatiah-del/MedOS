import type { StudyGuideDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import {
  lectureProgress,
  resourceContents,
  resourceMedia,
  resources,
  studyGuideAnnotations,
} from "../schema";
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
 * The study guide reader's data at the trusted boundary: a guide and the
 * user's annotations and progress on it are private, anchored to the guide's
 * own text, separate from the parsed content, and never touch completion.
 */

let connection: DatabaseConnection;
let db: Database;

const FILE_HASH = "d".repeat(64);
const IMAGE_HASH = "e".repeat(64);
const OTHER_IMAGE_HASH = "f".repeat(64);

/* Invented content: structure only. */
const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic guide",
  subtitle: null,
  preamble: [{ type: "paragraph", inlines: [{ type: "text", text: "CONTENTS" }] }],
  sections: [
    {
      id: "1-alpha",
      level: 1,
      heading: [{ type: "text", text: "1 Alpha" }],
      semanticKind: null,
      blocks: [{ type: "paragraph", inlines: [{ type: "text", text: "Ligand binds receptor." }] }],
    },
    {
      id: "beta",
      level: 2,
      heading: [{ type: "text", text: "Beta" }],
      semanticKind: null,
      blocks: [
        {
          type: "list",
          ordered: false,
          items: [{ level: 0, inlines: [{ type: "text", text: "An item" }] }],
        },
      ],
    },
    {
      id: "2-gamma",
      level: 1,
      heading: [{ type: "text", text: "2 Gamma" }],
      semanticKind: null,
      blocks: [],
    },
  ],
};

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  const base = {
    userId: user.id,
    lectureId: lecture.id,
    sizeBytes: 100,
    status: "parsed" as const,
  };
  const studyGuide = first(
    await db
      .insert(resources)
      .values({
        ...base,
        kind: "study-guide",
        originalFilename: "StudyGuide.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contentHash: FILE_HASH,
        storageKey: `sha256/${FILE_HASH}`,
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    userId: user.id,
    resourceId: studyGuide.id,
    format: "study-guide",
    parser: "docx-study-guide",
    parserVersion: 1,
    sourceContentHash: FILE_HASH,
    content: guide,
    stats: { sections: 3 },
    extractedAt: new Date("2026-10-01T09:00:00Z"),
  });
  await db.insert(resourceMedia).values({
    userId: user.id,
    resourceId: studyGuide.id,
    contentHash: IMAGE_HASH,
    storageKey: `sha256/${IMAGE_HASH}`,
    mimeType: "image/png",
    sizeBytes: 10,
  });
  // A second resource of the same lecture with its own image, and the wrong kind for the reader.
  const quiz = first(
    await db
      .insert(resources)
      .values({
        ...base,
        kind: "mcq",
        originalFilename: "Quiz.html",
        mimeType: "text/html",
        contentHash: "1".repeat(64),
        storageKey: `sha256/${"1".repeat(64)}`,
      })
      .returning(),
  );
  await db.insert(resourceMedia).values({
    userId: user.id,
    resourceId: quiz.id,
    contentHash: OTHER_IMAGE_HASH,
    storageKey: `sha256/${OTHER_IMAGE_HASH}`,
    mimeType: "image/png",
    sizeBytes: 10,
  });
  return { user, lecture, studyGuide, quiz, scope: createUserScope(db, user.id) };
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

const highlight = (start: number, end: number, quote: string) => ({
  kind: "highlight" as const,
  sectionId: "1-alpha",
  unitPath: "0",
  start,
  end,
  quote,
});

describe("a study guide", () => {
  it("is loaded for its owner with its content", async () => {
    const view = await a.scope.studyGuides.get(a.studyGuide.id);
    expect(view).toMatchObject({
      resourceId: a.studyGuide.id,
      lectureId: a.lecture.id,
      originalFilename: "StudyGuide.docx",
      current: true,
    });
    expect(view?.content).toEqual(guide);
    expect(JSON.stringify(view)).not.toContain(FILE_HASH);
  });

  it("is not found for anyone else, for the wrong kind, or for a malformed id", async () => {
    expect(await b.scope.studyGuides.get(a.studyGuide.id)).toBeNull();
    expect(await a.scope.studyGuides.get(a.quiz.id)).toBeNull();
    expect(await a.scope.studyGuides.get("not-an-id")).toBeNull();
    expect(await a.scope.studyGuides.get("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("images", () => {
  it("are found only through the resource that uses them, by its owner", async () => {
    expect(await a.scope.resources.media(a.studyGuide.id, IMAGE_HASH)).toEqual({
      contentHash: IMAGE_HASH,
      storageKey: `sha256/${IMAGE_HASH}`,
      mimeType: "image/png",
      sizeBytes: 10,
    });
    // Another resource's image, even the same user's.
    expect(await a.scope.resources.media(a.studyGuide.id, OTHER_IMAGE_HASH)).toBeNull();
    // Another user's resource.
    expect(await b.scope.resources.media(a.studyGuide.id, IMAGE_HASH)).toBeNull();
    // Malformed input.
    expect(await a.scope.resources.media(a.studyGuide.id, "../../etc/passwd")).toBeNull();
    expect(await a.scope.resources.media("x", IMAGE_HASH)).toBeNull();
  });
});

describe("annotations", () => {
  it("anchor a highlight to the guide's own text, with context", async () => {
    const result = await a.scope.studyGuides.annotations.create(
      a.studyGuide.id,
      highlight(7, 12, "binds"),
    );
    expect(result).toMatchObject({
      ok: true,
      annotation: {
        kind: "highlight",
        sectionId: "1-alpha",
        unitPath: "0",
        startOffset: 7,
        endOffset: 12,
        quote: "binds",
        prefix: "Ligand ",
        suffix: " receptor.",
        note: null,
      },
    });
    const [row] = await db
      .select()
      .from(studyGuideAnnotations)
      .where(eq(studyGuideAnnotations.userId, a.user.id));
    expect(row?.sourceContentHash).toBe(FILE_HASH);
  });

  it("return the existing highlight when the same one is made twice", async () => {
    const again = await a.scope.studyGuides.annotations.create(
      a.studyGuide.id,
      highlight(7, 12, "binds"),
    );
    const highlights = (await a.scope.studyGuides.annotations.list(a.studyGuide.id)).filter(
      (row) => row.kind === "highlight",
    );
    expect(highlights).toHaveLength(1);
    expect(again.ok && again.annotation.id).toBe(highlights[0]?.id);
  });

  it("refuse text that is not the source at those offsets", async () => {
    const create = (input: Parameters<typeof a.scope.studyGuides.annotations.create>[1]) =>
      a.scope.studyGuides.annotations.create(a.studyGuide.id, input);
    expect(await create(highlight(7, 12, "BINDS"))).toEqual({ ok: false, reason: "text-mismatch" });
    expect(await create(highlight(7, 99, "binds"))).toEqual({ ok: false, reason: "invalid" });
    expect(await create(highlight(5, 5, ""))).toEqual({ ok: false, reason: "invalid" });
    expect(await create(highlight(-1, 3, "Lig"))).toEqual({ ok: false, reason: "invalid" });
    expect(await create({ ...highlight(0, 3, "Lig"), unitPath: "7" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await create({ ...highlight(0, 3, "Lig"), unitPath: "0;drop" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await create({ ...highlight(0, 3, "Lig"), sectionId: "missing" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    // A highlight needs a passage, not a whole section.
    expect(
      await create({
        kind: "highlight",
        sectionId: "1-alpha",
        unitPath: null,
        start: null,
        end: null,
        quote: null,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("can mark a whole section, quoting its heading", async () => {
    const section = {
      sectionId: "beta",
      unitPath: null,
      start: null,
      end: null,
      quote: "ignored",
    };
    const bookmark = await a.scope.studyGuides.annotations.create(a.studyGuide.id, {
      kind: "bookmark",
      ...section,
    });
    expect(bookmark).toMatchObject({
      ok: true,
      annotation: { kind: "bookmark", sectionId: "beta", unitPath: null, quote: "Beta" },
    });
    const later = await a.scope.studyGuides.annotations.create(a.studyGuide.id, {
      kind: "review-later",
      ...section,
    });
    expect(later.ok).toBe(true);
    // The preamble has no heading to mark.
    expect(
      await a.scope.studyGuides.annotations.create(a.studyGuide.id, {
        kind: "bookmark",
        ...section,
        sectionId: null,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("keep notes as the user's own words, several per place, editable", async () => {
    const note = (text: string | null) =>
      a.scope.studyGuides.annotations.create(a.studyGuide.id, {
        ...highlight(0, 6, "Ligand"),
        kind: "note",
        note: text,
      });
    const first = await note("  Check the definition.  ");
    const second = await note("Second thought");
    expect(first).toMatchObject({ ok: true, annotation: { note: "Check the definition." } });
    expect(second.ok).toBe(true);
    expect(await note("   ")).toEqual({ ok: false, reason: "invalid" });
    expect(await note(null)).toEqual({ ok: false, reason: "invalid" });
    // Only notes carry words.
    expect(
      await a.scope.studyGuides.annotations.create(a.studyGuide.id, {
        ...highlight(0, 6, "Ligand"),
        note: "words",
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    if (!first.ok) throw new Error("expected a note");
    const edited = await a.scope.studyGuides.annotations.updateNote(first.annotation.id, "Edited");
    expect(edited?.note).toBe("Edited");
    expect(await a.scope.studyGuides.annotations.updateNote(first.annotation.id, " ")).toBeNull();
  });

  it("can be removed by their owner only", async () => {
    const created = await a.scope.studyGuides.annotations.create(
      a.studyGuide.id,
      highlight(13, 21, "receptor"),
    );
    if (!created.ok) throw new Error("expected a highlight");
    const id = created.annotation.id;

    expect(await b.scope.studyGuides.annotations.remove(id)).toBe(false);
    expect(await b.scope.studyGuides.annotations.updateNote(id, "x")).toBeNull();
    expect(await a.scope.studyGuides.annotations.remove(id)).toBe(true);
    expect(await a.scope.studyGuides.annotations.remove(id)).toBe(false);
    expect(await a.scope.studyGuides.annotations.remove("not-an-id")).toBe(false);
  });

  it("are invisible to other users, who cannot add any to the guide", async () => {
    expect(await b.scope.studyGuides.annotations.list(a.studyGuide.id)).toEqual([]);
    expect(
      await b.scope.studyGuides.annotations.create(a.studyGuide.id, highlight(7, 12, "binds")),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await a.scope.studyGuides.annotations.create(a.quiz.id, highlight(7, 12, "binds")),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("cannot be attached to another user's resource, even directly", async () => {
    const message = await violation(() =>
      db.insert(studyGuideAnnotations).values({
        userId: b.user.id,
        resourceId: a.studyGuide.id,
        kind: "highlight",
        sectionId: "1-alpha",
        unitPath: "0",
        startOffset: 0,
        endOffset: 3,
        quote: "Lig",
        sourceContentHash: FILE_HASH,
      }),
    );
    expect(message).toContain("study_guide_annotations_resource_fk");
  });

  it("never change the parsed content", async () => {
    const [stored] = await db
      .select({ content: resourceContents.content })
      .from(resourceContents)
      .where(eq(resourceContents.resourceId, a.studyGuide.id));
    expect(stored?.content).toEqual(guide);
  });
});

describe("reading progress", () => {
  it("starts at nothing read", async () => {
    expect(await a.scope.studyGuides.progress.get(a.studyGuide.id)).toMatchObject({
      sectionsRead: 0,
      sectionCount: 3,
      percent: 0,
      furthestSectionId: null,
    });
  });

  it("moves forward only, and remembers where the reader was last", async () => {
    const progress = a.scope.studyGuides.progress;
    expect(await progress.record(a.studyGuide.id, "beta")).toMatchObject({
      sectionsRead: 2,
      percent: 66,
      furthestSectionId: "beta",
      lastSectionId: "beta",
    });
    // Scrolling back keeps how far they got.
    expect(await progress.record(a.studyGuide.id, "1-alpha")).toMatchObject({
      sectionsRead: 2,
      furthestSectionId: "beta",
      lastSectionId: "1-alpha",
    });
    // 100% only at the end of the last section.
    expect(await progress.record(a.studyGuide.id, "2-gamma")).toMatchObject({
      sectionsRead: 3,
      percent: 100,
    });
    expect((await progress.forLecture(a.lecture.id)).get(a.studyGuide.id)).toBe(100);
  });

  it("ignores unknown sections and other users", async () => {
    expect(await a.scope.studyGuides.progress.record(a.studyGuide.id, "missing")).toBeNull();
    expect(await a.scope.studyGuides.progress.record(a.studyGuide.id, "Bad Id")).toBeNull();
    expect(await b.scope.studyGuides.progress.record(a.studyGuide.id, "beta")).toBeNull();
    expect(await b.scope.studyGuides.progress.get(a.studyGuide.id)).toBeNull();
    expect((await b.scope.studyGuides.progress.forLecture(a.lecture.id)).size).toBe(0);
    expect((await b.scope.studyGuides.progress.get(b.studyGuide.id))?.percent).toBe(0);
  });
});

describe("lecture completion", () => {
  it("is untouched by reading to the end and annotating", async () => {
    // Everything above read the whole guide and annotated it; completion is still the user's call.
    const rows = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, a.lecture.id));
    expect(rows.every((row) => row.completedAt === null)).toBe(true);
    expect((await a.scope.lectures.detail(a.lecture.id))?.completedAt).toBeNull();
  });
});
