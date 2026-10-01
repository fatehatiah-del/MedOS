import type { PdfDocument } from "@medos/parsers/model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database, DatabaseConnection } from "../client";
import { resourceContents, resourceMedia, resources } from "../schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "../test-support";
import { createTestDatabase } from "../testing";

import { createUserScope } from "./user-scope";

/*
 * Parsed content (Phase 6) at the trusted boundary: it is private to the owner
 * of its resource, validated when read, and says whether it is current.
 */

let connection: DatabaseConnection;
let db: Database;

const HASH = "a".repeat(64);

const pdf: PdfDocument = {
  format: "pdf",
  pageCount: 1,
  metadata: { title: "Week 1", author: null, creator: null, producer: null, createdAt: null },
  pages: [{ number: 1, text: "Receptors" }],
};

async function createOwner() {
  const { user, course } = await createCourseForNewUser(db);
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);
  const resource = first(
    await db
      .insert(resources)
      .values({
        userId: user.id,
        lectureId: lecture.id,
        kind: "original-lecture",
        originalFilename: "Lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        contentHash: HASH,
        sourcePath: "Pharma/w1/Lecture.pdf",
        storageKey: `sha256/${HASH}`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    userId: user.id,
    resourceId: resource.id,
    format: "pdf",
    parser: "pdf-registration",
    parserVersion: 1,
    sourceContentHash: HASH,
    content: pdf,
    stats: { pages: 1 },
    issues: [{ code: "no-text", message: "A note." }],
    searchText: "Receptors",
    extractedAt: new Date("2026-10-01T09:00:00Z"),
  });
  return { user, lecture, resource, scope: createUserScope(db, user.id) };
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

describe("parsed content", () => {
  it("is readable by its owner, validated, with what the parser reported", async () => {
    const view = await a.scope.resources.content(a.resource.id);
    expect(view?.content).toEqual(pdf);
    expect(view?.issues).toEqual([{ code: "no-text", message: "A note." }]);
    expect(view?.resource).toMatchObject({ id: a.resource.id, status: "parsed" });
  });

  it("is summarised with every resource, without hashes or storage locations", async () => {
    const summary = await a.scope.resources.get(a.resource.id);
    expect(summary?.content).toEqual({
      format: "pdf",
      stats: { pages: 1 },
      issueCount: 1,
      current: true,
      extractedAt: new Date("2026-10-01T09:00:00Z"),
    });
    const json = JSON.stringify(summary);
    expect(json).not.toContain(HASH);
    expect(json).not.toContain("storageKey");
    expect(json).not.toContain("sourcePath");

    const detail = await a.scope.lectures.detail(a.lecture.id);
    expect(detail?.resources[0]?.content?.current).toBe(true);
    expect(JSON.stringify(detail?.resources)).not.toContain(HASH);
  });

  it("is never readable by another user, who cannot tell it exists", async () => {
    expect(await b.scope.resources.content(a.resource.id)).toBeNull();
    expect(await b.scope.resources.content("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await b.scope.resources.content("../etc/passwd")).toBeNull();
  });

  it("cannot be attached to another user's resource", async () => {
    await expect(
      db.insert(resourceContents).values({
        userId: b.user.id,
        resourceId: a.resource.id,
        format: "pdf",
        parser: "pdf-registration",
        parserVersion: 1,
        sourceContentHash: HASH,
        content: pdf,
        extractedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("is one row per resource: processing again replaces, never duplicates", async () => {
    await expect(
      db.insert(resourceContents).values({
        userId: a.user.id,
        resourceId: a.resource.id,
        format: "pdf",
        parser: "pdf-registration",
        parserVersion: 1,
        sourceContentHash: HASH,
        content: pdf,
        extractedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("is marked out of date when the resource's file has changed since it was parsed", async () => {
    const owner = await createOwner();
    await db
      .update(resources)
      .set({ contentHash: "b".repeat(64), status: "stored" })
      .where(eq(resources.id, owner.resource.id));
    expect((await owner.scope.resources.get(owner.resource.id))?.content?.current).toBe(false);
  });

  it("refuses to hand out content that breaks its schema", async () => {
    const owner = await createOwner();
    await db
      .update(resourceContents)
      .set({ content: { ...pdf, pageCount: 5 } })
      .where(eq(resourceContents.resourceId, owner.resource.id));
    await expect(owner.scope.resources.content(owner.resource.id)).rejects.toThrow();
  });
});

describe("extracted media", () => {
  it("accepts raster images and refuses anything else", async () => {
    const values = {
      userId: a.user.id,
      resourceId: a.resource.id,
      contentHash: "e".repeat(64),
      storageKey: `sha256/${"e".repeat(64)}`,
      sizeBytes: 10,
    };
    await db.insert(resourceMedia).values({ ...values, mimeType: "image/png" });
    await expect(
      db
        .insert(resourceMedia)
        .values({ ...values, contentHash: "f".repeat(64), mimeType: "image/svg+xml" }),
    ).rejects.toThrow();
  });
});
