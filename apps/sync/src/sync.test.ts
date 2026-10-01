import { chmodSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type Database,
  type DatabaseConnection,
  createUserScope,
  ensureWorkspace,
  lectureProgress,
  lectures,
  resources,
  syncFiles,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SyncError } from "./state";
import { LocalObjectStore } from "./store";
import { runSync } from "./sync";
import { createScratchFolder, createSourceTree, removeFolder, snapshotTree } from "./test-support";

/*
 * Full syncs against synthetic study folders and an in-memory PostgreSQL
 * database with the real migrations. These are the Phase 5 acceptance tests.
 */

const FIXTURE: Record<string, string> = {
  "Pathology/w1/study-guide.docx": "pathology week 1 study guide",
  "Pathology/w1/lecture.pdf": "pathology week 1 slides",
  "Pathology/w1/mcq.html": "<html><script>alert('never run')</script>quiz</html>",
  "Pathology/w2/": "",
  "Pharma/w4/lecture-1/study-guide.docx": "pharma 4.1 guide",
  "Pharma/w4/lecture-1/mcq.html": "pharma 4.1 mcq",
  "Pharma/w4/lecture-2/study-guide.docx": "pharma 4.2 guide",
  "Pharma/w4/lecture-2/mcq.html": "pharma 4.2 mcq",
  "Pharma/w4/lecture-2/Question Bank.docx": "pharma 4.2 question bank",
  "Microbiology/w3/unknown-file.txt": "what is this",
  "Public Health/week 1/Study Guide.docx": "public health guide",
  "Communication Skills/Week 01/Study Guide.docx": "communication guide",
  "Anatomy/w1/notes.pdf": "not a semester 5 course",
};

let connection: DatabaseConnection;
let db: Database;
const folders: string[] = [];

beforeAll(async () => {
  connection = await createTestDatabase();
  db = connection.db;
});

afterAll(async () => {
  await connection.close();
});

afterEach(() => {
  for (const folder of folders.splice(0)) {
    // Undo read-only flags so the temporary folder can be removed.
    makeWritable(folder);
    removeFolder(folder);
  }
});

function makeWritable(folder: string) {
  for (const name of readdirSync(folder)) {
    const absolute = path.join(folder, name);
    chmodSync(absolute, 0o755);
    if (statSync(absolute).isDirectory()) makeWritable(absolute);
  }
}

let sequence = 0;
async function setup(entries: Record<string, string> = FIXTURE) {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `sync-${sequence}@example.test`, displayName: `Sync ${sequence}` })
    .returning();
  if (!user) throw new Error("expected a user");
  const source = createSourceTree(entries);
  const storage = createScratchFolder("objects");
  folders.push(source, storage);
  const store = new LocalObjectStore(storage);
  const sync = (dryRun = false, options: { removePlaceholders?: boolean } = {}) =>
    runSync(db, user.id, source, { store, dryRun, ...options });
  return { user, source, storage, store, sync };
}

/** Every row of every table, as text: the whole database state. */
async function databaseSnapshot(): Promise<string> {
  const result: unknown = await db.execute(sql`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const tables = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    name: string;
  }[];
  const parts: string[] = [];
  for (const { name } of tables) {
    const rows: unknown = await db.execute(sql.raw(`select * from "${name}" order by 1`));
    parts.push(name, JSON.stringify(Array.isArray(rows) ? rows : (rows as { rows: unknown }).rows));
  }
  return parts.join("\n");
}

const manifestOf = (userId: string) =>
  db.select().from(syncFiles).where(eq(syncFiles.userId, userId));
const resourcesOf = (userId: string) =>
  db.select().from(resources).where(eq(resources.userId, userId));
const lecturesOf = (userId: string) =>
  db.select().from(lectures).where(eq(lectures.userId, userId));

describe("A. the source folder is never modified", () => {
  it("is byte-for-byte identical after a scan, a dry run and two real syncs", async () => {
    const { source, sync } = await setup();
    const before = snapshotTree(source);

    await sync(true);
    await sync();
    await sync();

    expect(snapshotTree(source)).toEqual(before);
  });

  it("syncs a source whose files are all read-only", async () => {
    const { source, sync, user } = await setup();
    for (const entry of snapshotTree(source)) {
      if (entry.type === "file") chmodSync(path.join(source, ...entry.path.split("/")), 0o444);
    }

    await sync();

    expect((await resourcesOf(user.id)).length).toBeGreaterThan(0);
  });
});

describe("B–F, G. mapping and classification", () => {
  it("builds the course, week and lecture structure and attaches each kind", async () => {
    const { user, sync } = await setup();

    const run = await sync();
    const scope = createUserScope(db, user.id);
    const semester = await ensureWorkspace(db, user.id);
    const overview = await scope.courses.overview(semester.id);
    const counts = Object.fromEntries(
      overview.map((entry) => [entry.course.slug, [entry.weekCount, entry.lectureCount]]),
    );

    expect(counts).toEqual({
      pathology: [2, 1],
      pathophysiology: [0, 0],
      microbiology: [1, 1],
      pharmacology: [1, 2],
      "public-health": [1, 1],
      "communication-skills": [1, 1],
    });
    expect(run.result?.lecturesCreated).toBe(6);

    // Two lectures in one week stay two lectures, each with its own material.
    const pharma = await scope.courses.getBySlug(semester.id, "pharmacology");
    const outline = pharma ? await scope.courses.outline(pharma.id) : null;
    expect(
      outline?.[0]?.lectures.map((lecture) => [lecture.number, lecture.resourceKinds.sort()]),
    ).toEqual([
      [1, ["mcq", "study-guide"]],
      [2, ["mcq", "question-bank", "study-guide"]],
    ]);

    const kinds = (await resourcesOf(user.id)).map((resource) => resource.kind).sort();
    expect(kinds).toEqual([
      "mcq",
      "mcq",
      "mcq",
      "original-lecture",
      "question-bank",
      "study-guide",
      "study-guide",
      "study-guide",
      "study-guide",
      "study-guide",
    ]);
  });

  it("keeps unknown files on record for review instead of discarding them", async () => {
    const { user, sync } = await setup();

    await sync();
    const manifest = await manifestOf(user.id);
    const review = manifest.filter((row) => row.status === "needs-review");

    expect(manifest).toHaveLength(Object.keys(FIXTURE).filter((key) => !key.endsWith("/")).length);
    expect(review.map((row) => row.relativePath).sort()).toEqual([
      "Anatomy/w1/notes.pdf",
      "Microbiology/w3/unknown-file.txt",
    ]);
    expect(review.every((row) => row.resourceId === null && row.classificationReason)).toBe(true);
  });
});

describe("H. a dry run changes nothing", () => {
  it("leaves every table and the object store exactly as they were", async () => {
    const { sync, storage } = await setup();
    const before = await databaseSnapshot();

    const run = await sync(true);

    expect(await databaseSnapshot()).toBe(before);
    expect(readdirSync(storage)).toEqual([]);
    expect(run.result).toBeUndefined();
    expect(run.plan.files.filter((file) => file.change === "new")).toHaveLength(12);
  });

  it("predicts exactly what the real sync then does", async () => {
    const { sync } = await setup();

    const dry = await sync(true);
    const real = await sync();

    const summary = (run: typeof dry) =>
      run.plan.files.map((file) => [file.file.relativePath, file.change, file.status, file.kind]);
    expect(summary(real)).toEqual(summary(dry));
  });
});

describe("I. repeating a sync is idempotent", () => {
  it("creates nothing new and reports everything unchanged", async () => {
    const { user, sync } = await setup();
    await sync();
    const before = {
      lectures: await lecturesOf(user.id),
      resources: await resourcesOf(user.id),
      manifest: (await manifestOf(user.id)).map(
        ({ lastSyncedAt: _time, updatedAt: _updated, ...row }) => row,
      ),
    };

    const second = await sync();

    expect(second.plan.files.every((file) => file.change === "unchanged")).toBe(true);
    expect(second.result).toMatchObject({
      lecturesCreated: 0,
      weeksCreated: 0,
      resourcesCreated: 0,
      resourcesUpdated: 0,
      objectsStored: 0,
    });
    expect(await lecturesOf(user.id)).toEqual(before.lectures);
    expect(await resourcesOf(user.id)).toEqual(before.resources);
    expect(
      (await manifestOf(user.id)).map(
        ({ lastSyncedAt: _time, updatedAt: _updated, ...row }) => row,
      ),
    ).toEqual(before.manifest);
  });

  it("stores identical content once", async () => {
    const { storage, sync } = await setup({
      "Pharma/w1/study-guide.docx": "same bytes",
      "Pathology/w1/study-guide.docx": "same bytes",
    });

    const run = await sync();

    expect(run.result).toMatchObject({ objectsStored: 1, objectsExisting: 1, resourcesCreated: 2 });
    const shards = readdirSync(path.join(storage, "sha256"));
    expect(shards).toHaveLength(1);
  });
});

describe("J. a changed source file is detected", () => {
  it("updates the same material record and keeps the earlier original", async () => {
    const { user, source, storage, sync } = await setup();
    await sync();
    const guide = "Pharma/w4/lecture-1/study-guide.docx";
    const [before] = (await resourcesOf(user.id)).filter((row) => row.sourcePath === guide);

    writeFileSync(path.join(source, ...guide.split("/")), "pharma 4.1 guide, revised");
    const dry = await sync(true);
    const run = await sync();

    expect(dry.plan.files.find((file) => file.file.relativePath === guide)?.change).toBe("changed");
    expect(run.result?.resourcesUpdated).toBe(1);
    const [after] = (await resourcesOf(user.id)).filter((row) => row.sourcePath === guide);
    expect(after?.id).toBe(before?.id);
    expect(after?.contentHash).not.toBe(before?.contentHash);
    // The new version is processed again in the same sync (Phase 6). This fixture is not a real
    // DOCX, so it is reported as unreadable, with the original kept.
    expect(run.processing.processed.map((entry) => entry.label)).toContain(guide);
    expect(after?.status).toBe("failed");
    expect(after?.processingError).toMatch(/not a valid Word document/);
    // Both versions remain in the store.
    const stored = readdirSync(path.join(storage, "sha256")).flatMap((shard) =>
      readdirSync(path.join(storage, "sha256", shard)),
    );
    expect(stored).toContain(before?.contentHash);
    expect(stored).toContain(after?.contentHash);
  });
});

describe("K. a missing source file is handled without deleting anything", () => {
  it("marks it missing, keeps its material, and recognises it when it returns", async () => {
    const { user, source, sync } = await setup();
    await sync();
    const quiz = "Pathology/w1/mcq.html";
    const absolute = path.join(source, ...quiz.split("/"));
    const contents = "<html><script>alert('never run')</script>quiz</html>";
    const resourceCount = (await resourcesOf(user.id)).length;

    rmSync(absolute);
    const run = await sync();

    expect(run.plan.missing.map((row) => row.relativePath)).toEqual([quiz]);
    const [row] = (await manifestOf(user.id)).filter((entry) => entry.relativePath === quiz);
    expect(row?.status).toBe("missing");
    expect(row?.resourceId).not.toBeNull();
    expect(await resourcesOf(user.id)).toHaveLength(resourceCount);

    const again = await sync();
    expect(again.plan.missing).toEqual([]);
    expect(again.plan.stillMissing.map((entry) => entry.relativePath)).toEqual([quiz]);

    writeFileSync(absolute, contents);
    const back = await sync();
    expect(back.plan.files.find((file) => file.file.relativePath === quiz)?.change).toBe(
      "reappeared",
    );
    const [restored] = (await manifestOf(user.id)).filter((entry) => entry.relativePath === quiz);
    expect(restored?.status).toBe("synced");
    expect(restored?.resourceId).toBe(row?.resourceId);
  });
});

describe("L. study data survives resyncs", () => {
  it("keeps lecture completion and renamed titles through changes and resyncs", async () => {
    const { user, source, sync } = await setup();
    await sync();
    const scope = createUserScope(db, user.id);
    const [lecture] = (await lecturesOf(user.id)).filter((row) => row.title === "Lecture 2");
    if (!lecture) throw new Error("expected Pharma week 4 lecture 2");
    await scope.lectures.setCompleted(lecture.id, true, new Date("2026-10-20T10:00:00Z"));
    await db.update(lectures).set({ title: "Renamed by me" }).where(eq(lectures.id, lecture.id));

    writeFileSync(path.join(source, "Pharma", "w4", "lecture-2", "mcq.html"), "changed quiz");
    rmSync(path.join(source, "Pharma", "w4", "lecture-2", "Question Bank.docx"));
    await sync();
    await sync();

    const detail = await scope.lectures.detail(lecture.id);
    expect(detail?.completedAt).toEqual(new Date("2026-10-20T10:00:00Z"));
    expect(detail?.lecture.title).toBe("Renamed by me");
    const progress = await db
      .select()
      .from(lectureProgress)
      .where(eq(lectureProgress.lectureId, lecture.id));
    expect(progress).toHaveLength(1);
  });
});

describe("M. ownership", () => {
  it("never reads or writes another user's data", async () => {
    const other = await setup();
    await other.sync();
    const otherBefore = {
      lectures: await lecturesOf(other.user.id),
      resources: await resourcesOf(other.user.id),
      manifest: await manifestOf(other.user.id),
    };

    // Same folder layout, different user: nothing is shared or touched.
    const mine = await setup();
    const run = await mine.sync();

    expect(run.plan.files.every((file) => file.change === "new")).toBe(true);
    expect(await lecturesOf(other.user.id)).toEqual(otherBefore.lectures);
    expect(await resourcesOf(other.user.id)).toEqual(otherBefore.resources);
    expect(await manifestOf(other.user.id)).toEqual(otherBefore.manifest);
    const mineResources = await resourcesOf(mine.user.id);
    expect(mineResources.every((row) => row.userId === mine.user.id)).toBe(true);
  });
});

describe("N. local absolute paths are not stored", () => {
  it("records only paths relative to the source folder", async () => {
    const { source, sync } = await setup();
    await sync();

    const everything = await databaseSnapshot();
    const variants = [source, source.replaceAll("\\", "/"), source.replaceAll("\\", "\\\\")];
    for (const variant of variants) expect(everything).not.toContain(variant);
    expect(everything).toContain("Pharma/w4/lecture-1/study-guide.docx");
  });
});

describe("manual overrides", () => {
  it("are honoured on the next sync and never overwritten by it", async () => {
    const { user, sync } = await setup();
    await sync();
    const quiz = "Pathology/w1/mcq.html";
    const unknown = "Microbiology/w3/unknown-file.txt";
    await db
      .update(syncFiles)
      .set({ overrideKind: "question-bank" })
      .where(and(eq(syncFiles.userId, user.id), eq(syncFiles.relativePath, quiz)));
    await db
      .update(syncFiles)
      .set({ ignored: true })
      .where(and(eq(syncFiles.userId, user.id), eq(syncFiles.relativePath, unknown)));

    const run = await sync();
    await sync();

    expect(run.plan.files.find((file) => file.file.relativePath === quiz)).toMatchObject({
      change: "reclassified",
      kind: "question-bank",
    });
    const rows = await manifestOf(user.id);
    const quizRow = rows.find((row) => row.relativePath === quiz);
    expect(quizRow?.overrideKind).toBe("question-bank");
    expect(rows.find((row) => row.relativePath === unknown)).toMatchObject({
      status: "ignored",
      ignored: true,
    });
    const resource = (await resourcesOf(user.id)).find((row) => row.id === quizRow?.resourceId);
    expect(resource?.kind).toBe("question-bank");
  });
});

describe("development placeholders", () => {
  it("block a real sync until explicitly removed, and never block a dry run", async () => {
    const { user, sync } = await setup();
    await ensureWorkspace(db, user.id, { fixtureLectures: true });

    const dry = await sync(true);
    expect(dry.plan.placeholderLectures).toBe(24);
    await expect(sync()).rejects.toThrow(SyncError);
    expect((await lecturesOf(user.id)).every((row) => row.title.startsWith("Sample lecture"))).toBe(
      true,
    );

    const run = await sync(false, { removePlaceholders: true });
    expect(run.result?.placeholdersRemoved).toBe(24);
    expect((await lecturesOf(user.id)).some((row) => row.title.startsWith("Sample lecture"))).toBe(
      false,
    );
  });
});
