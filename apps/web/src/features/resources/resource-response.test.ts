// @vitest-environment node
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resourceContentResponse, resourceResponse } from "./resource-response";

let connection: DatabaseConnection;
let db: Database;

async function only<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (row === undefined) throw new Error("expected a row");
  return row;
}

/** A user who owns one resource, built through the full hierarchy. */
async function createOwner(label: string) {
  const user = await only(
    db
      .insert(users)
      .values({ email: `${label}@example.test`, displayName: label })
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
      .values({ ...owned, courseId: course.id, number: 4 })
      .returning(),
  );
  const lecture = await only(
    db
      .insert(lectures)
      .values({ ...owned, courseId: course.id, weekId: week.id, number: 1, title: "Test lecture" })
      .returning(),
  );
  const resource = await only(
    db
      .insert(resources)
      .values({
        ...owned,
        lectureId: lecture.id,
        kind: "original-lecture",
        originalFilename: "Lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        contentHash: "d".repeat(64),
        storageKey: `originals/${user.id}/lecture.pdf`,
        status: "parsed",
      })
      .returning(),
  );
  await db.insert(resourceContents).values({
    ...owned,
    resourceId: resource.id,
    format: "pdf",
    parser: "pdf-registration",
    parserVersion: 1,
    sourceContentHash: "d".repeat(64),
    content: {
      format: "pdf",
      pageCount: 1,
      metadata: {
        title: `${label} lecture`,
        author: null,
        creator: null,
        producer: null,
        createdAt: null,
      },
      pages: [{ number: 1, text: `Private notes of ${label}` }],
    },
    extractedAt: new Date(),
  });
  return { user, resource, scope: createUserScope(db, user.id) };
}

let a: Awaited<ReturnType<typeof createOwner>>;
let b: Awaited<ReturnType<typeof createOwner>>;

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  a = await createOwner("a");
  b = await createOwner("b");
});

afterAll(async () => {
  await connection.close();
});

describe("private resource addresses", () => {
  it("require a session", async () => {
    const response = await resourceResponse(null, a.resource.id);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Lecture.pdf");
  });

  it("serve the owner, without exposing where the file is stored", async () => {
    const response = await resourceResponse(a.scope, a.resource.id);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ id: a.resource.id, originalFilename: "Lecture.pdf" });
    expect(body).not.toContain("originals/");
    expect(body).not.toContain("storageKey");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answer another user exactly as if the resource did not exist", async () => {
    const others = await resourceResponse(b.scope, a.resource.id);
    const missing = await resourceResponse(b.scope, "00000000-0000-4000-8000-000000000000");
    const malformed = await resourceResponse(b.scope, "1");

    expect(others.status).toBe(404);
    expect(await others.text()).toBe(await missing.text());
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
  });

  it("cannot be enumerated: identifiers are random, not sequential", () => {
    expect(a.resource.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
    expect(a.resource.id).not.toBe(b.resource.id);
  });
});

describe("private parsed content", () => {
  it("requires a session", async () => {
    const response = await resourceContentResponse(null, a.resource.id);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Private notes");
  });

  it("serves the owner the validated content, without storage details", async () => {
    const response = await resourceContentResponse(a.scope, a.resource.id);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      resource: { id: a.resource.id, status: "parsed", content: { format: "pdf", current: true } },
      content: { format: "pdf", pages: [{ number: 1, text: "Private notes of a" }] },
    });
    expect(body).not.toContain("originals/");
    expect(body).not.toContain("d".repeat(64));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers another user exactly as if the resource did not exist", async () => {
    const others = await resourceContentResponse(b.scope, a.resource.id);
    const missing = await resourceContentResponse(b.scope, "00000000-0000-4000-8000-000000000000");
    const malformed = await resourceContentResponse(b.scope, "../../a");

    expect(others.status).toBe(404);
    expect(await others.text()).toBe(await missing.text());
    expect(malformed.status).toBe(404);
  });
});
