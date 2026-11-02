import {
  type Database,
  type DatabaseConnection,
  lectureProgress,
  lectures,
  resourceContents,
  resourceMedia,
  resources,
  syncFiles,
  users,
  weeks,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { LocalObjectStore } from "@medos/storage";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { formatMirrorReport, mirrorLibrary, otherAccounts } from "./mirror";
import { SyncError } from "./state";
import { runSync } from "./sync";
import { createScratchFolder, createSourceTree, removeFolder } from "./test-support";

/*
 * Mirroring one account's imported material into another, against an
 * in-memory PostgreSQL database with the real migrations and synthetic
 * study folders.
 */

const FIXTURE: Record<string, string> = {
  "Pathology/w1/study-guide.docx": "pathology week 1 study guide",
  "Pathology/w1/lecture.pdf": "pathology week 1 slides",
  "Pharma/w4/lecture-1/study-guide.docx": "pharma 4.1 guide",
  "Pharma/w4/lecture-2/mcq.html": "pharma 4.2 mcq",
  "Microbiology/w3/unknown-file.txt": "what is this",
};

const HASH = (n: number) => n.toString(16).padStart(64, "0");

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
  for (const folder of folders.splice(0)) removeFolder(folder);
});

let sequence = 0;
async function account(label: string) {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `${label}-${sequence}@example.test`, displayName: label })
    .returning();
  if (!user) throw new Error("expected a user");
  return user;
}

/** An owner with the fixture synced in, one resource given parsed content and an image, and some study data. */
async function setup(entries: Record<string, string> = FIXTURE) {
  const owner = await account("owner");
  const friend = await account("friend");
  const source = createSourceTree(entries);
  const storage = createScratchFolder("objects");
  folders.push(source, storage);
  const store = new LocalObjectStore(storage);
  const sync = () => runSync(db, owner.id, source, { store, dryRun: false });
  await sync();

  const [guide] = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.userId, owner.id),
        eq(resources.sourcePath, "Pathology/w1/study-guide.docx"),
      ),
    );
  if (!guide) throw new Error("expected the study guide");
  await giveContent(owner.id, guide.id, guide.contentHash, 1);
  await db.insert(resourceMedia).values({
    userId: owner.id,
    resourceId: guide.id,
    contentHash: HASH(7),
    storageKey: `objects/${HASH(7)}`,
    mimeType: "image/png",
    sizeBytes: 10,
  });
  await db.insert(lectureProgress).values({
    userId: owner.id,
    lectureId: guide.lectureId,
    completedAt: new Date(),
  });

  return { owner, friend, source, store, guide, sync };
}

async function giveContent(userId: string, resourceId: string, hash: string, version: number) {
  const values = {
    format: "study-guide" as const,
    parser: "docx-study-guide",
    parserVersion: version,
    sourceContentHash: hash,
    content: { format: "study-guide", version } as never,
    stats: { sections: version },
    searchText: `guide v${version}`,
    extractedAt: new Date("2026-10-01T00:00:00Z"),
  };
  await db
    .insert(resourceContents)
    .values({ userId, resourceId, ...values })
    .onConflictDoUpdate({ target: resourceContents.resourceId, set: values });
  await db.update(resources).set({ status: "parsed" }).where(eq(resources.id, resourceId));
}

const rowsOf = async (userId: string) => ({
  weeks: await db.select().from(weeks).where(eq(weeks.userId, userId)),
  lectures: await db.select().from(lectures).where(eq(lectures.userId, userId)),
  resources: await db.select().from(resources).where(eq(resources.userId, userId)),
  contents: await db.select().from(resourceContents).where(eq(resourceContents.userId, userId)),
  media: await db.select().from(resourceMedia).where(eq(resourceMedia.userId, userId)),
  manifest: await db.select().from(syncFiles).where(eq(syncFiles.userId, userId)),
  progress: await db.select().from(lectureProgress).where(eq(lectureProgress.userId, userId)),
});

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

describe("mirror", () => {
  it("copies the owner's material, content and images, and none of their study data", async () => {
    const { owner, friend } = await setup();
    const ownerBefore = await rowsOf(owner.id);

    const report = await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    const ownerAfter = await rowsOf(owner.id);
    expect(ownerAfter).toEqual(ownerBefore);

    const copy = await rowsOf(friend.id);
    const attached = ownerBefore.manifest.filter((row) => row.resourceId !== null);
    expect(report.files.filter((file) => file.action === "new")).toHaveLength(attached.length);
    expect(copy.resources).toHaveLength(ownerBefore.resources.length);
    expect(copy.lectures.map((row) => row.title).sort()).toEqual(
      ownerBefore.lectures.map((row) => row.title).sort(),
    );
    expect(copy.weeks).toHaveLength(ownerBefore.weeks.length);

    // Same stored objects: nothing uploaded again.
    expect(copy.resources.map((row) => row.storageKey).sort()).toEqual(
      ownerBefore.resources.map((row) => row.storageKey).sort(),
    );
    expect(copy.contents).toHaveLength(1);
    expect(copy.contents[0]?.searchText).toBe("guide v1");
    expect(copy.media.map((row) => row.storageKey)).toEqual([`objects/${HASH(7)}`]);

    // The friend's rows are the friend's: no row points at the owner.
    expect(
      copy.resources.every((row) => !ownerBefore.lectures.some((l) => l.id === row.lectureId)),
    ).toBe(true);

    // Study data stays with its owner.
    expect(copy.progress).toEqual([]);
    expect(copy.manifest.every((row) => row.resourceId !== null)).toBe(true);
  });

  it("a dry run changes nothing and reports what the real run does", async () => {
    const { owner, friend } = await setup();
    const before = await databaseSnapshot();

    const dry = await mirrorLibrary(db, owner.id, friend.id, { dryRun: true });
    expect(await databaseSnapshot()).toBe(before);

    const real = await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });
    expect(dry.files).toEqual(real.files);
    expect(dry.weeksCreated).toBe(real.weeksCreated);
    expect(dry.lecturesCreated).toBe(real.lecturesCreated);
  });

  it("running it again adds nothing", async () => {
    const { owner, friend } = await setup();
    await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });
    const after = await rowsOf(friend.id);

    const again = await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    expect(again.files).toEqual([]);
    expect(again.unchanged).toBe(after.manifest.length);
    const { manifest: _a, ...rest } = await rowsOf(friend.id);
    const { manifest: _b, ...expected } = after;
    expect(rest).toEqual(expected);
  });

  it("keeps the friend's own edits and adds new material next to them", async () => {
    const entries = { ...FIXTURE };
    const { owner, friend, source, store } = await setup(entries);
    await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    const [pathology] = await db
      .select()
      .from(resources)
      .where(
        and(eq(resources.userId, friend.id), eq(resources.sourcePath, "Pathology/w1/lecture.pdf")),
      );
    if (!pathology) throw new Error("expected the copy");
    await db
      .update(lectures)
      .set({ title: "My own title" })
      .where(eq(lectures.id, pathology.lectureId));

    // The owner gets a new file in the same lecture.
    const { writeFileSync } = await import("node:fs");
    const path = await import("node:path");
    writeFileSync(path.join(source, "Pathology", "w1", "mcq.html"), "pathology week 1 mcq");
    await runSync(db, owner.id, source, { store, dryRun: false });

    const report = await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    expect(report.files).toEqual([{ path: "Pathology/w1/mcq.html", action: "new" }]);
    const [renamed] = await db.select().from(lectures).where(eq(lectures.id, pathology.lectureId));
    expect(renamed?.title).toBe("My own title");
    const [added] = await db
      .select()
      .from(resources)
      .where(
        and(eq(resources.userId, friend.id), eq(resources.sourcePath, "Pathology/w1/mcq.html")),
      );
    expect(added?.lectureId).toBe(pathology.lectureId);
  });

  it("brings content the owner re-parsed up to date", async () => {
    const { owner, friend, guide } = await setup();
    await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    await giveContent(owner.id, guide.id, guide.contentHash, 2);
    const report = await mirrorLibrary(db, owner.id, friend.id, { dryRun: false });

    expect(report.files).toEqual([{ path: "Pathology/w1/study-guide.docx", action: "updated" }]);
    const copy = await rowsOf(friend.id);
    expect(copy.contents.map((row) => row.parserVersion)).toEqual([2]);
    expect(copy.media).toHaveLength(1);
  });

  it("refuses to mirror an account into itself, and lists the other accounts", async () => {
    const { owner, friend } = await setup();
    await expect(mirrorLibrary(db, owner.id, owner.id, { dryRun: true })).rejects.toThrow(
      SyncError,
    );
    const others = await otherAccounts(db, owner.id);
    expect(others).toContain(friend.email);
    expect(others).not.toContain(owner.email);
  });

  it("reports in plain words", async () => {
    const { owner, friend } = await setup();
    const report = await mirrorLibrary(db, owner.id, friend.id, { dryRun: true });
    const text = formatMirrorReport(owner.email, friend.email, report);
    expect(text).toContain("dry run (nothing is changed)");
    expect(text).toContain("[new] Pathology/w1/study-guide.docx");
  });
});
