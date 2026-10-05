// @vitest-environment node
import {
  type Database,
  type DatabaseConnection,
  courses,
  createUserScope,
  semesters,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportResponse } from "./export-response";

/*
 * The export download: only for a signed-in user, only their own data, as an
 * attachment that is never cached.
 */

let connection: DatabaseConnection;
let db: Database;
let userId: string;

const NOW = new Date("2026-10-05T09:00:00Z");

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
  const [user] = await db
    .insert(users)
    .values({ email: "export@example.test", displayName: "Owner" })
    .returning();
  if (!user) throw new Error("expected a user");
  userId = user.id;
  const [semester] = await db
    .insert(semesters)
    .values({
      userId,
      slug: "2026-fall",
      name: "Fall 2026",
      label: "Semester 5",
      startsOn: "2026-09-28",
      endsOn: "2027-01-29",
    })
    .returning();
  if (!semester) throw new Error("expected a semester");
  await db.insert(courses).values({
    userId,
    semesterId: semester.id,
    slug: "pharmacology",
    name: "Pharmacology I",
    shortName: "Pharma",
  });
});

afterAll(async () => {
  await connection.close();
});

describe("the export download", () => {
  it("requires a session", async () => {
    const response = await exportResponse(null, "json");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects an unknown format", async () => {
    const response = await exportResponse(createUserScope(db, userId), "xml");
    expect(response.status).toBe(400);
    expect(await exportResponse(createUserScope(db, userId), null)).toHaveProperty("status", 400);
  });

  it("sends JSON as a private attachment", async () => {
    const response = await exportResponse(createUserScope(db, userId), "json", NOW);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="medos-export-2026-10-05.json"',
    );
    const body = await response.json();
    expect(body).toMatchObject({
      format: "medos-export",
      schemaVersion: 1,
      user: { email: "export@example.test" },
      courses: [{ slug: "pharmacology" }],
    });
  });

  it("sends everything as a zip that unpacks", async () => {
    const response = await exportResponse(createUserScope(db, userId), "all", NOW);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(JSON.parse(strFromU8(files["medos-export.json"]!))).toMatchObject({ schemaVersion: 1 });
    expect(Number(response.headers.get("Content-Length"))).toBeGreaterThan(0);
  });
});
