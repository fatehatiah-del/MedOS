import { readFileSync } from "node:fs";
import path from "node:path";

import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";

import { MIGRATIONS_FOLDER } from "../migrate";

import * as schema from "./index";

interface Journal {
  entries: { idx: number; tag: string }[];
}

type Snapshot = Parameters<typeof generateMigration>[0];

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, ...segments), "utf8")) as T;
}

describe("schema and migrations", () => {
  it("are in step: the schema has no change that lacks a migration", async () => {
    const journal = readJson<Journal>("meta", "_journal.json");
    const latest = journal.entries.at(-1);
    expect(latest, "no migrations found").toBeDefined();
    if (!latest) return;

    const prefix = String(latest.idx).padStart(4, "0");
    const recorded = readJson<Snapshot>("meta", `${prefix}_snapshot.json`);
    const current = generateDrizzleJson(schema, recorded.id);

    // Any statement here means `npm run db:generate` has not been run after a schema edit.
    expect(await generateMigration(recorded, current)).toEqual([]);
  });

  it("have a SQL file for every journal entry", () => {
    const journal = readJson<Journal>("meta", "_journal.json");
    for (const entry of journal.entries) {
      const sqlFile = readFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
      expect(sqlFile.length).toBeGreaterThan(0);
    }
  });
});
