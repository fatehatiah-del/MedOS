// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  lectures,
  resourceMedia,
  resources,
  semesters,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { pngBytes } from "@medos/parsers/testing";
import { LocalObjectStore, contentKey } from "@medos/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resourceMediaResponse } from "./media-response";

/*
 * The private image route: an image is served only to the owner of the
 * resource it belongs to, only through that resource, and only when the
 * stored bytes are exactly what was extracted.
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

/** A user with a study guide and a quiz in one lecture, each with its own stored image. */
async function createOwner() {
  sequence += 1;
  const user = await only(
    db
      .insert(users)
      .values({ email: `media-${sequence}@example.test`, displayName: "Owner" })
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

  const addResource = async (kind: "study-guide" | "mcq", variant: number) => {
    const image = pngBytes(variant + sequence * 10);
    const imageHash = sha256(image);
    await store.putBytes(contentKey(imageHash), image);
    const fileHash = sha256(new TextEncoder().encode(`${kind}-${sequence}`));
    const resource = await only(
      db
        .insert(resources)
        .values({
          ...owned,
          lectureId: lecture.id,
          kind,
          originalFilename: kind === "mcq" ? "Quiz.html" : "StudyGuide.docx",
          mimeType: "application/octet-stream",
          sizeBytes: 1,
          contentHash: fileHash,
          storageKey: contentKey(fileHash),
          status: "parsed",
        })
        .returning(),
    );
    await db.insert(resourceMedia).values({
      ...owned,
      resourceId: resource.id,
      contentHash: imageHash,
      storageKey: contentKey(imageHash),
      mimeType: "image/png",
      sizeBytes: image.byteLength,
    });
    return { resource, image, imageHash };
  };

  const guide = await addResource("study-guide", 1);
  const quiz = await addResource("mcq", 2);
  return { user, guide, quiz, scope: createUserScope(db, user.id) };
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "medos-media-"));
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

const serve = (scope: typeof a.scope | null, resourceId: string, hash: string) =>
  resourceMediaResponse(scope, resourceId, hash, store);

describe("study guide images", () => {
  it("require a session", async () => {
    const response = await serve(null, a.guide.resource.id, a.guide.imageHash);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("are served to their owner, privately, exactly as extracted", async () => {
    const response = await serve(a.scope, a.guide.resource.id, a.guide.imageHash);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(a.guide.image);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "content-length": String(a.guide.image.byteLength),
    });
  });

  it("answer everything that is not the owner's image of that resource with the same 404", async () => {
    const missing = await serve(a.scope, "00000000-0000-4000-8000-000000000000", a.guide.imageHash);
    const expected = await missing.text();
    expect(missing.status).toBe(404);

    const cases = [
      // Another user's study guide, with its real image.
      serve(b.scope, a.guide.resource.id, a.guide.imageHash),
      // The owner's own image, asked for through a resource it does not belong to.
      serve(a.scope, a.guide.resource.id, a.quiz.imageHash),
      // Another user's image through the owner's resource.
      serve(a.scope, a.guide.resource.id, b.guide.imageHash),
      // Malformed addresses.
      serve(a.scope, "not-an-id", a.guide.imageHash),
      serve(a.scope, a.guide.resource.id, "../../etc/passwd"),
      serve(a.scope, a.guide.resource.id, a.guide.imageHash.toUpperCase()),
      serve(a.scope, a.guide.resource.id, "0".repeat(64)),
    ];
    for (const response of await Promise.all(cases)) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(expected);
    }
  });

  it("are not served when the stored bytes are not what was extracted", async () => {
    // Tamper with the stored file behind the store's back.
    const target = path.join(root, "sha256", a.quiz.imageHash.slice(0, 2), a.quiz.imageHash);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, pngBytes(999));

    const response = await serve(a.scope, a.quiz.resource.id, a.quiz.imageHash);
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain(root);
    expect(body).not.toContain("sha256/");
  });

  it("are not found when the stored file is missing", async () => {
    const response = await resourceMediaResponse(
      a.scope,
      a.guide.resource.id,
      a.guide.imageHash,
      new LocalObjectStore(path.join(root, "empty")),
    );
    expect(response.status).toBe(404);
  });
});
