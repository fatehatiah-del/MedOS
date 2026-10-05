import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type McqSet,
  type QuestionBank,
  type StudyGuideDocument,
  blockPath,
} from "@medos/parsers/model";
import { LocalObjectStore, contentKey } from "@medos/storage";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createUserScope } from "./access/user-scope";
import { type DatabaseConnection, connect } from "./client";
import { migrate } from "./migrate";
import {
  authAccounts,
  authSessions,
  resourceContents,
  resourceMedia,
  resources,
  users,
} from "./schema";
import { createCourseForNewUser, createLecture, createWeek, first } from "./test-support";
import { createTestDatabase } from "./testing";
import { EXCLUDED_TABLES, TransferError, planTransfer, runTransfer } from "./transfer";
import { referencedObjects, transferFiles } from "./transfer-files";

/*
 * db:transfer: an exact, verified copy of a MedOS database into an empty one.
 * The source is a migrated database holding one of everything a student
 * makes; the target is a new embedded database, as a hosted PostgreSQL server
 * would be. The test proves the copy by what the student sees: the full
 * export of the account is identical on both sides.
 */

const text = (value: string) => [{ type: "text" as const, text: value }];
const paragraph = (value: string) => ({ type: "paragraph" as const, inlines: text(value) });

/* Invented content: structure only. */
const guide: StudyGuideDocument = {
  format: "study-guide",
  title: "Synthetic guide",
  subtitle: null,
  preamble: [],
  sections: [
    {
      id: "alpha",
      level: 1,
      heading: text("Alpha"),
      semanticKind: null,
      blocks: [paragraph("Ligand binds receptor.")],
    },
  ],
};
const quiz: McqSet = {
  format: "mcq-set",
  title: "Synthetic quiz",
  subtitle: null,
  questions: [
    {
      key: "q1",
      number: 1,
      fingerprint: "1".repeat(16),
      stem: text("Synthetic MCQ"),
      options: ["A", "B"].map((label) => ({ label, text: text(label), explanation: null })),
      answer: { status: "resolved", optionIndex: 0 },
      explanation: null,
      topic: "Receptors",
      questionType: null,
      sourceRef: null,
      image: null,
      revealImage: null,
    },
  ],
};
const bank: QuestionBank = {
  format: "question-bank",
  title: "Synthetic bank",
  items: [
    {
      key: "q1",
      number: 1,
      fingerprint: "7".repeat(16),
      prompt: [paragraph("Synthetic recall")],
      choices: [],
      answer: { status: "missing", reason: "None" },
    },
  ],
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const NOW = new Date("2026-10-05T09:00:00Z");

let source: DatabaseConnection;
let userId: string;
let objects: { root: string; keys: string[] };

/** A student who has done one of everything, with the files their resources name. */
async function seedSource() {
  const db = source.db;
  const { user, course } = await createCourseForNewUser(db, "pharmacology");
  userId = user.id;
  const week = await createWeek(db, course, 1);
  const lecture = await createLecture(db, week, 1);

  const root = mkdtempSync(path.join(tmpdir(), "medos-transfer-objects-"));
  const store = new LocalObjectStore(root);
  const keys: string[] = [];
  async function resource(
    kind: "study-guide" | "mcq" | "question-bank",
    filename: string,
    content: StudyGuideDocument | McqSet | QuestionBank,
  ) {
    const bytes = new TextEncoder().encode(`synthetic ${filename}`);
    const hash = sha256(bytes);
    const key = contentKey(hash);
    await store.putBytes(key, bytes);
    keys.push(key);
    const row = first(
      await db
        .insert(resources)
        .values({
          userId,
          lectureId: lecture.id,
          kind,
          originalFilename: filename,
          mimeType: "application/octet-stream",
          sizeBytes: bytes.length,
          contentHash: hash,
          storageKey: key,
          status: "parsed",
        })
        .returning(),
    );
    await db.insert(resourceContents).values({
      userId,
      resourceId: row.id,
      format: content.format,
      parser: "synthetic",
      parserVersion: 1,
      sourceContentHash: hash,
      content,
      extractedAt: NOW,
    });
    return row;
  }
  const guideRow = await resource("study-guide", "StudyGuide.docx", guide);
  const quizRow = await resource("mcq", "Quiz.html", quiz);
  const bankRow = await resource("question-bank", "QuestionBank.docx", bank);

  const image = new TextEncoder().encode("synthetic image");
  const imageKey = contentKey(sha256(image));
  await store.putBytes(imageKey, image);
  keys.push(imageKey);
  await db.insert(resourceMedia).values({
    userId,
    resourceId: guideRow.id,
    contentHash: sha256(image),
    storageKey: imageKey,
    mimeType: "image/png",
    sizeBytes: image.length,
  });

  // Sign-in: a password account (kept) and a device session (left behind).
  await db.insert(authAccounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    password: "scrypt-hash-of-a-synthetic-password",
  });
  await db.insert(authSessions).values({
    userId,
    token: "synthetic-session-token",
    expiresAt: new Date("2026-11-01T00:00:00Z"),
  });

  const scope = createUserScope(db, userId);
  const note = await scope.studyGuides.annotations.create(guideRow.id, {
    kind: "note",
    sectionId: "alpha",
    unitPath: blockPath(null, 0),
    start: 0,
    end: 6,
    quote: "Ligand",
    note: "Ask about «agonists» — and ümlauts",
  });
  expect(note.ok).toBe(true);
  const card = await scope.flashcards.cards.createFromStudyGuide(guideRow.id, {
    front: "What binds?",
    back: "Ligand",
    sectionId: "alpha",
    unitPath: blockPath(null, 0),
    start: 0,
    end: 6,
    quote: "Ligand",
  });
  if (!card.ok) throw new Error("expected a card");
  await scope.flashcards.review.rate(card.card.id, "good", { now: NOW, durationMs: 4_321 });
  const session = await scope.mcq.sessions.start(quizRow.id, {
    mode: "learn",
    keys: ["q1"],
    shuffled: false,
    timeLimitSeconds: null,
  });
  await scope.mcq.sessions.answer(session!.id, { key: "q1", optionIndex: 1, timeMs: 2_000 });
  const reveal = await scope.questionBanks.reveal(bankRow.id, {
    key: "q1",
    typedAnswer: "my answer",
    timeMs: 1_000,
  });
  if (!reveal.ok) throw new Error("expected an attempt");
  await scope.questionBanks.rate(reveal.attempt.id, "hard");
  await scope.review.questions.add(quizRow.id, "q1", "Revisit");
  await scope.lectures.setCompleted(lecture.id, true, NOW);
  await scope.studySessions.start({ activity: "study-guide", lectureId: lecture.id });

  objects = { root, keys };
}

beforeAll(async () => {
  source = await createTestDatabase();
  await seedSource();
});

let targets: DatabaseConnection[] = [];
afterEach(async () => {
  for (const target of targets) await target.close();
  targets = [];
});

/** A brand-new, empty database, like a new hosted PostgreSQL server. */
async function emptyTarget(): Promise<DatabaseConnection> {
  const target = await connect("pglite:memory");
  targets.push(target);
  return target;
}

async function count(connection: DatabaseConnection, table: string): Promise<number> {
  const result = (await connection.db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)}`,
  )) as unknown as { rows: { n: number }[] };
  return result.rows[0]!.n;
}

describe("planTransfer", () => {
  it("lists every table to copy and what stays behind, and writes nothing", async () => {
    const target = await emptyTarget();
    const plan = await planTransfer(source, target);
    expect(plan.problems).toEqual([]);
    expect(plan.targetMigrations).toBe(0);
    expect(plan.excluded.map((table) => table.name).sort()).toEqual(
      Object.keys(EXCLUDED_TABLES).sort(),
    );
    expect(plan.excluded.find((table) => table.name === "auth_sessions")?.rows).toBe(1);
    const names = plan.tables.map((table) => table.name);
    // Parents before children.
    expect(names.indexOf("users")).toBeLessThan(names.indexOf("courses"));
    expect(names.indexOf("flashcards")).toBeLessThan(names.indexOf("flashcard_reviews"));
    expect(names.indexOf("mcq_sessions")).toBeLessThan(names.indexOf("mcq_attempts"));
    expect(plan.tables.find((table) => table.name === "flashcard_reviews")?.rows).toBe(1);
    // Still a new database: planning changed nothing.
    expect((await planTransfer(source, target)).targetMigrations).toBe(0);
  });
});

describe("runTransfer", () => {
  it("copies the account exactly: the student's export is identical on both sides", async () => {
    const target = await emptyTarget();
    const progress: string[] = [];
    const result = await runTransfer(source, target, {
      onProgress: (table, copied, total) => {
        if (copied === total) progress.push(table);
      },
    });
    expect(result.migratedTarget).toBe(true);
    expect(result.totalRows).toBeGreaterThan(20);
    expect(progress).toContain("flashcard_reviews");

    const before = await createUserScope(source.db, userId).export.snapshot(NOW);
    const after = await createUserScope(target.db, userId).export.snapshot(NOW);
    expect(after).toEqual(before);
    expect(after.flashcards.reviews).toHaveLength(1);
    expect(after.mcq.attempts).toHaveLength(1);
    expect(after.annotations[0]?.note).toBe("Ask about «agonists» — and ümlauts");

    // Sign-in comes along; device sessions do not.
    const [account] = await target.db
      .select()
      .from(authAccounts)
      .where(eq(authAccounts.userId, userId));
    expect(account?.password).toBe("scrypt-hash-of-a-synthetic-password");
    expect(await count(target, "auth_sessions")).toBe(0);
  });

  it("keeps timestamps to the microsecond and ids unchanged", async () => {
    const target = await emptyTarget();
    await runTransfer(source, target);
    const stamps = async (connection: DatabaseConnection) =>
      (
        (await connection.db.execute(
          sql`select id::text, created_at::text as created from users order by id`,
        )) as unknown as { rows: { id: string; created: string }[] }
      ).rows;
    const original = await stamps(source);
    expect(original[0]?.created).toMatch(/\.\d{6}|\.\d{1,5}\+/);
    expect(await stamps(target)).toEqual(original);
  });

  it("refuses a target that already holds data, and changes nothing in it", async () => {
    const target = await emptyTarget();
    await migrate(target);
    await target.db.insert(users).values({ email: "someone@example.test", displayName: "Someone" });
    const plan = await planTransfer(source, target);
    expect(plan.problems).toEqual([expect.stringMatching(/already holds data \(users\)/)]);
    await expect(runTransfer(source, target)).rejects.toBeInstanceOf(TransferError);
    expect(await count(target, "users")).toBe(1);
    expect(await count(target, "courses")).toBe(0);
  });

  it("refuses a target at an older schema version", async () => {
    const target = await emptyTarget();
    await migrate(target);
    await target.db.execute(
      sql`delete from drizzle.__drizzle_migrations where id = (select max(id) from drizzle.__drizzle_migrations)`,
    );
    const plan = await planTransfer(source, target);
    expect(plan.problems).toEqual([expect.stringMatching(/older MedOS version/)]);
  });

  it("keeps nothing when the copy does not match the source", async () => {
    const target = await emptyTarget();
    await migrate(target);
    // Something on the server alters rows as they arrive: the checksums must catch it.
    await target.db.execute(sql`
      create function tamper() returns trigger language plpgsql as $$
      begin new.display_name := upper(new.display_name); return new; end $$`);
    await target.db.execute(
      sql`create trigger tamper before insert on users for each row execute function tamper()`,
    );
    await expect(runTransfer(source, target)).rejects.toThrow(
      /did not match the source, so nothing was kept: users/,
    );
    expect(await count(target, "users")).toBe(0);
    expect(await count(target, "flashcards")).toBe(0);
  });
});

describe("transferFiles", () => {
  it("copies every file the database names, checked, and skips those already there", async () => {
    const targetRoot = mkdtempSync(path.join(tmpdir(), "medos-transfer-target-"));
    try {
      const keys = await referencedObjects(source.db);
      expect(keys.sort()).toEqual([...objects.keys].sort());
      const from = new LocalObjectStore(objects.root);
      const to = new LocalObjectStore(targetRoot);
      expect(await transferFiles(source.db, from, to)).toEqual({
        total: 4,
        copied: 4,
        alreadyThere: 0,
        missing: [],
      });
      expect(await transferFiles(source.db, from, to)).toMatchObject({
        copied: 0,
        alreadyThere: 4,
      });
      for (const key of keys) expect(await to.read(key)).toEqual(await from.read(key));

      // A file the database names but the local store lacks is reported, not invented.
      const emptyRoot = mkdtempSync(path.join(tmpdir(), "medos-transfer-empty-"));
      const report = await transferFiles(
        source.db,
        new LocalObjectStore(emptyRoot),
        new LocalObjectStore(mkdtempSync(path.join(tmpdir(), "medos-transfer-t2-"))),
      );
      expect(report.missing).toHaveLength(4);
      rmSync(emptyRoot, { recursive: true, force: true });
    } finally {
      rmSync(targetRoot, { recursive: true, force: true });
    }
  });
});
