import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseConnection } from "./client";
import { migrate } from "./migrate";
import { createTestDatabase } from "./testing";

let connection: DatabaseConnection;

beforeAll(async () => {
  // A brand-new, empty PostgreSQL database with the tracked migrations applied.
  connection = await createTestDatabase();
});

afterAll(async () => {
  await connection.close();
});

async function names(query: ReturnType<typeof sql>): Promise<string[]> {
  // The two drivers shape raw results differently: an array, or an object with `rows`.
  const result: unknown = await connection.db.execute(query);
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
  return (rows as { name: string }[]).map((row) => row.name).sort();
}

describe("migrations", () => {
  it("create every table from an empty database", async () => {
    const tables = await names(
      sql`select table_name as name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(tables).toEqual([
      "auth_accounts",
      "auth_rate_limits",
      "auth_sessions",
      "auth_verifications",
      "calendar_events",
      "courses",
      "exam_events",
      "lecture_progress",
      "lectures",
      "original_lecture_annotations",
      "original_lecture_positions",
      "resource_contents",
      "resource_media",
      "resources",
      "semesters",
      "study_guide_annotations",
      "study_guide_progress",
      "study_sessions",
      "sync_files",
      "users",
      "weeks",
    ]);
  });

  it("create the course_progress view", async () => {
    const views = await names(
      sql`select table_name as name from information_schema.views where table_schema = 'public'`,
    );
    expect(views).toEqual(["course_progress"]);
  });

  it("give every study-data table an owner and audit timestamps", async () => {
    const owned = await names(
      sql`select table_name as name from information_schema.columns
          where table_schema = 'public' and column_name = 'user_id'
            and left(table_name, 5) <> 'auth_'`,
    );
    // Every domain table except `users` itself (the view exposes user_id too).
    expect(owned).toHaveLength(17);
    expect(owned).not.toContain("users");

    const audited = await names(
      sql`select table_name as name from information_schema.columns
          where table_schema = 'public' and column_name = 'updated_at'
            and data_type = 'timestamp with time zone' and left(table_name, 5) <> 'auth_'`,
    );
    expect(audited).toHaveLength(17);
  });

  it("never delete study data as a side effect", async () => {
    const cascading = await names(
      sql`select conname as name from pg_constraint
          where contype = 'f' and confdeltype <> 'r'`,
    );
    // Only sign-in records follow their user. Every study-data key is RESTRICT.
    expect(cascading).toEqual([
      "auth_accounts_user_id_users_id_fk",
      "auth_sessions_user_id_users_id_fk",
    ]);
  });

  it("are recorded, so applying them again changes nothing", async () => {
    const applied = () =>
      names(sql`select hash as name from drizzle.__drizzle_migrations order by id`);
    const before = await applied();
    expect(before.length).toBeGreaterThan(0);

    await migrate(connection);

    expect(await applied()).toEqual(before);
  });
});
