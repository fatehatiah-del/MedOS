// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  lectures,
  resourceContents,
  resources,
  semesters,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { buildPdf } from "@medos/parsers/testing";
import { LocalObjectStore, contentKey } from "@medos/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contentDisposition, resourceFileResponse } from "./file-response";

/*
 * The private original-file route: a lecture PDF is served only to its owner,
 * only as an original lecture, and only when its bytes are what was imported.
 */

let connection: DatabaseConnection;
let db: Database;
let root: string;
let store: LocalObjectStore;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

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
      .values({ email: `file-${sequence}@example.test`, displayName: "Owner" })
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

  const bytes = buildPdf([`Synthetic page of owner ${sequence}`, "Second page"]);
  const hash = sha256(bytes);
  await store.putBytes(contentKey(hash), bytes);
  const pdf = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "original-lecture",
        originalFilename: "Lecture Ω 1.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        contentHash: hash,
        storageKey: contentKey(hash),
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: pdf.id,
    format: "pdf",
    parser: "pdf-registration",
    parserVersion: 1,
    sourceContentHash: hash,
    content: {
      format: "pdf",
      pageCount: 2,
      metadata: { title: null, author: null, creator: null, producer: null, createdAt: null },
      pages: [
        { number: 1, text: "Synthetic" },
        { number: 2, text: "Second" },
      ],
    },
    extractedAt: new Date(),
  });
  // Another kind of material in the same lecture, stored the same way.
  const guideBytes = new TextEncoder().encode(`guide ${sequence}`);
  const guideHash = sha256(guideBytes);
  await store.putBytes(contentKey(guideHash), guideBytes);
  const guide = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "study-guide",
        originalFilename: "Guide.docx",
        mimeType: "application/octet-stream",
        sizeBytes: guideBytes.byteLength,
        contentHash: guideHash,
        storageKey: contentKey(guideHash),
      })
      .returning(),
  );
  return { pdf, bytes, hash, guide, scope: createUserScope(db, user.id) };
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "medos-file-"));
  store = new LocalObjectStore(root);
  connection = await createTestDatabase();
  db = connection.db;
  a = await createOwner();
  b = await createOwner();
});

afterAll(async () => {
  await connection.close();
  rmSync(root, { recursive: true, force: true });
});

describe("original lecture files", () => {
  it("require a session", async () => {
    expect((await resourceFileResponse(null, a.pdf.id, store)).status).toBe(401);
  });

  it("are served to their owner, privately, exactly as imported", async () => {
    const response = await resourceFileResponse(a.scope, a.pdf.id, store);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(a.bytes);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-length": String(a.bytes.byteLength),
    });
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    const download = await resourceFileResponse(a.scope, a.pdf.id, store, { download: true });
    expect(download.headers.get("content-disposition")).toBe(
      `attachment; filename="Lecture _ 1.pdf"; filename*=UTF-8''Lecture%20%CE%A9%201.pdf`,
    );
  });

  it("answer anything that is not the owner's lecture PDF with the same 404", async () => {
    const missing = await resourceFileResponse(
      a.scope,
      "00000000-0000-4000-8000-000000000000",
      store,
    );
    const expected = await missing.text();
    for (const response of await Promise.all([
      resourceFileResponse(b.scope, a.pdf.id, store),
      resourceFileResponse(a.scope, a.guide.id, store),
      resourceFileResponse(a.scope, "not-an-id", store),
      resourceFileResponse(a.scope, "../../etc/passwd", store),
      resourceFileResponse(a.scope, a.pdf.id, new LocalObjectStore(path.join(root, "empty"))),
    ])) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(expected);
    }
  });

  it("are not served when the stored bytes are not what was imported", async () => {
    writeFileSync(path.join(root, "sha256", b.hash.slice(0, 2), b.hash), buildPdf(["Tampered"]));
    const response = await resourceFileResponse(b.scope, b.pdf.id, store);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(root);
  });

  it("name any file safely in the download header", () => {
    expect(contentDisposition("inline", 'a"b\\c.pdf')).toBe(
      `inline; filename="a_b_c.pdf"; filename*=UTF-8''a%22b%5Cc.pdf`,
    );
  });
});
