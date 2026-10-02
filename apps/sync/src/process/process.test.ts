import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type Database,
  type DatabaseConnection,
  createUserScope,
  resourceContents,
  resourceMedia,
  resources,
  users,
} from "@medos/database";
import { createTestDatabase } from "@medos/database/testing";
import { PARSER_VERSIONS, sha256 } from "@medos/parsers";
import { blocksText } from "@medos/parsers/model";
import {
  buildDocx,
  buildPdf,
  heading,
  paragraph,
  pngBytes,
  sampleQuestionBank,
  sampleQuiz,
  sampleStudyGuide,
} from "@medos/parsers/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocalObjectStore, contentKey } from "@medos/storage";
import { runSync } from "../sync";
import { createScratchFolder, createSourceTree, removeFolder, snapshotTree } from "../test-support";

import { UNEXPECTED_FAILURE, processResources } from "./process";

/*
 * The Phase 6 pipeline against synthetic study folders and an in-memory
 * PostgreSQL database with the real migrations: import, parse, persist, and
 * everything that must stay safe around it.
 */

const GUIDE = "Pharma/w1/StudyGuide.docx";
const QUIZ = "Pharma/w1/Quiz.html";
const BANK = "Pharma/w1/QuestionBank.docx";
const SLIDES = "Pharma/w1/Lecture.pdf";
const DECK = "Pathophysiology/w1/Lecture.pptx";
const BROKEN = "Pathology/w1/StudyGuide.docx";

function fixture(): Record<string, string | Uint8Array> {
  return {
    [GUIDE]: sampleStudyGuide(),
    [QUIZ]: sampleQuiz(),
    [BANK]: sampleQuestionBank(),
    [SLIDES]: buildPdf(["Week 1", "Receptors"], { title: "Week 1" }),
    [DECK]: "not really a presentation",
    [BROKEN]: "this is not a Word document",
  };
}

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
async function setup(entries = fixture()) {
  sequence += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `process-${sequence}@example.test`, displayName: `Process ${sequence}` })
    .returning();
  if (!user) throw new Error("expected a user");
  const source = createSourceTree(entries);
  const storage = createScratchFolder("objects");
  folders.push(source, storage);
  const store = new LocalObjectStore(storage);
  const sync = (dryRun = false) => runSync(db, user.id, source, { store, dryRun });
  const resourceAt = async (relativePath: string) => {
    const rows = await db.select().from(resources).where(eq(resources.userId, user.id));
    const row = rows.find((candidate) => candidate.sourcePath === relativePath);
    if (!row) throw new Error(`no resource for ${relativePath}`);
    return row;
  };
  const contentOf = async (resourceId: string) =>
    db.select().from(resourceContents).where(eq(resourceContents.resourceId, resourceId));
  return { user, source, storage, store, sync, resourceAt, contentOf };
}

describe("parsing after import", () => {
  it("reads each supported material into structured content", async () => {
    const { sync, resourceAt, contentOf } = await setup();
    const run = await sync();

    const outcomes = Object.fromEntries(
      run.processing.processed.map((entry) => [entry.label, entry.outcome]),
    );
    expect(outcomes).toEqual({
      [GUIDE]: "parsed",
      [QUIZ]: "parsed",
      [BANK]: "parsed",
      [SLIDES]: "parsed",
      [DECK]: "unsupported",
      [BROKEN]: "failed",
    });

    const guide = await resourceAt(GUIDE);
    expect(guide.status).toBe("parsed");
    const [content] = await contentOf(guide.id);
    expect(content).toMatchObject({ format: "study-guide", origin: "source" });
    expect(content?.stats).toMatchObject({ sections: 3, tables: 1 });

    expect((await contentOf((await resourceAt(QUIZ)).id))[0]?.stats).toMatchObject({
      questions: 2,
    });
    expect((await contentOf((await resourceAt(BANK)).id))[0]?.stats).toMatchObject({
      items: 2,
      paired: 2,
    });
    expect((await contentOf((await resourceAt(SLIDES)).id))[0]?.stats).toMatchObject({ pages: 2 });
  });

  it("keeps the kinds separate: the quiz becomes MCQs, the question bank active-recall items", async () => {
    const { sync, resourceAt, contentOf } = await setup();
    await sync();
    expect((await contentOf((await resourceAt(QUIZ)).id))[0]?.format).toBe("mcq-set");
    expect((await contentOf((await resourceAt(BANK)).id))[0]?.format).toBe("question-bank");
  });

  it("records provenance: which file, which version of it, and which parser", async () => {
    const { source, sync, resourceAt, contentOf } = await setup();
    await sync();
    const guide = await resourceAt(GUIDE);
    const [content] = await contentOf(guide.id);

    const fileHash = sha256(readFileSync(path.join(source, ...GUIDE.split("/"))));
    expect(guide).toMatchObject({ sourcePath: GUIDE, contentHash: fileHash });
    expect(content).toMatchObject({
      resourceId: guide.id,
      sourceContentHash: fileHash,
      parser: "docx-study-guide",
      parserVersion: PARSER_VERSIONS["docx-study-guide"],
    });
    expect(content?.extractedAt).toBeInstanceOf(Date);
  });

  it("stores extracted images under their hash and records which resource uses them", async () => {
    const { store, sync, resourceAt } = await setup();
    await sync();
    const guide = await resourceAt(GUIDE);
    const media = await db
      .select()
      .from(resourceMedia)
      .where(eq(resourceMedia.resourceId, guide.id));

    expect(media).toMatchObject([{ contentHash: sha256(pngBytes()), mimeType: "image/png" }]);
    expect(await store.read(contentKey(sha256(pngBytes())))).toEqual(pngBytes());
  });

  it("indexes the text of parsed content for search", async () => {
    const { sync, resourceAt, contentOf } = await setup();
    await sync();
    const [content] = await contentOf((await resourceAt(GUIDE)).id);
    expect(content?.searchText).toContain("Affinity is not efficacy.");
  });
});

describe("failures preserve the original", () => {
  it("keeps a file that cannot be read stored and attached, with a useful message", async () => {
    const { source, storage, store, sync, resourceAt, contentOf } = await setup();
    await sync();
    const broken = await resourceAt(BROKEN);

    expect(broken.status).toBe("failed");
    expect(broken.processingError).toMatch(/not a valid Word document/);
    expect(broken.lectureId).toBeTruthy();
    expect(await contentOf(broken.id)).toEqual([]);
    expect(await store.read(contentKey(broken.contentHash))).toEqual(
      new Uint8Array(readFileSync(path.join(source, ...BROKEN.split("/")))),
    );
    // Messages are for people: no paths, no internals.
    for (const folder of [source, storage]) expect(broken.processingError).not.toContain(folder);
  });

  it("explains unsupported files instead of guessing at them", async () => {
    const { sync, resourceAt } = await setup();
    await sync();
    const deck = await resourceAt(DECK);
    expect(deck.status).toBe("unsupported");
    expect(deck.processingError).toMatch(/PowerPoint/);
  });

  it("reports a missing stored copy without crashing", async () => {
    const { storage, sync, resourceAt } = await setup();
    await sync();
    const quiz = await resourceAt(QUIZ);
    const hash = quiz.contentHash;
    rmSync(path.join(storage, "sha256", hash.slice(0, 2), hash));
    const store = new LocalObjectStore(storage);

    await processResources(db, quiz.userId, { store, reprocessAll: true });
    const after = await resourceAt(QUIZ);
    expect(after.status).toBe("failed");
    expect(after.processingError).toMatch(/stored copy of this file is missing/);
  });

  it("refuses a stored copy that does not match the imported file", async () => {
    const { storage, sync, resourceAt } = await setup();
    await sync();
    const quiz = await resourceAt(QUIZ);
    writeFileSync(
      path.join(storage, "sha256", quiz.contentHash.slice(0, 2), quiz.contentHash),
      "tampered",
    );

    await processResources(db, quiz.userId, {
      store: new LocalObjectStore(storage),
      reprocessAll: true,
    });
    expect((await resourceAt(QUIZ)).processingError).toMatch(/does not match/);
  });

  it("never shows internal errors to the user", async () => {
    const { sync, resourceAt, user } = await setup();
    await sync();
    const failing = {
      describe: () => "broken store",
      has: async () => true,
      put: async () => "existing" as const,
      putBytes: async () => "existing" as const,
      read: async () => {
        throw new Error("EACCES: C:\\secret\\path");
      },
    };
    const seen: unknown[] = [];
    await processResources(db, user.id, {
      store: failing,
      reprocessAll: true,
      onUnexpectedError: (_label, error) => seen.push(error),
    });
    const guide = await resourceAt(GUIDE);
    expect(guide.processingError).toBe(UNEXPECTED_FAILURE);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("repeated syncs and changed sources", () => {
  it("processes nothing again when nothing changed", async () => {
    const { sync, resourceAt, contentOf } = await setup();
    await sync();
    const before = await contentOf((await resourceAt(GUIDE)).id);

    const again = await sync();

    expect(again.processing.processed).toEqual([]);
    expect(again.processing.upToDate).toBe(5);
    expect(again.processing.failedBefore.map((entry) => entry.label)).toEqual([BROKEN]);
    expect(await contentOf((await resourceAt(GUIDE)).id)).toEqual(before);
  });

  it("replaces content when the source changes, keeping one current version and the earlier original", async () => {
    const { source, store, sync, resourceAt, contentOf } = await setup();
    await sync();
    const before = await resourceAt(GUIDE);

    writeFileSync(
      path.join(source, ...GUIDE.split("/")),
      buildDocx(heading("Revised") + paragraph("New content.")),
    );
    const run = await sync();

    expect(run.processing.processed).toMatchObject([
      { label: GUIDE, reason: "source-changed", outcome: "parsed" },
    ]);
    const after = await resourceAt(GUIDE);
    expect(after.id).toBe(before.id);
    const contents = await contentOf(after.id);
    expect(contents).toHaveLength(1);
    expect(contents[0]?.sourceContentHash).toBe(after.contentHash);
    const content = contents[0]?.content;
    expect(content?.format === "study-guide" && blocksText(content.sections[0]!.blocks)).toBe(
      "New content.",
    );
    expect(await store.has(contentKey(before.contentHash))).toBe(true);
  });

  it("keeps earlier content, recognisably out of date, when a changed file cannot be read", async () => {
    const { source, sync, resourceAt, user } = await setup();
    await sync();
    writeFileSync(path.join(source, ...GUIDE.split("/")), "now broken");
    await sync();

    const guide = await resourceAt(GUIDE);
    expect(guide.status).toBe("failed");
    const summary = await createUserScope(db, user.id).resources.get(guide.id);
    expect(summary?.content).toMatchObject({ format: "study-guide", current: false });
  });

  it("processes content made by an older parser again", async () => {
    const { sync, resourceAt, user } = await setup();
    await sync();
    const guide = await resourceAt(GUIDE);
    await db
      .update(resourceContents)
      .set({ parserVersion: 1, parser: "an-old-parser" })
      .where(eq(resourceContents.resourceId, guide.id));

    const report = await processResources(db, user.id, {
      store: new LocalObjectStore(createScratchFolder("x")),
    });
    expect(report.processed).toMatchObject([{ label: GUIDE, reason: "parser-updated" }]);
  });

  it("retries earlier failures only when asked", async () => {
    const { store, sync, user } = await setup();
    await sync();
    const quiet = await processResources(db, user.id, { store });
    expect(quiet.processed).toEqual([]);
    const all = await processResources(db, user.id, { store, reprocessAll: true });
    expect(all.processed.map((entry) => entry.label).sort()).toEqual(Object.keys(fixture()).sort());
  });
});

describe("what processing never touches", () => {
  it("leaves the source folder byte-for-byte unchanged", async () => {
    const { source, sync } = await setup();
    const before = snapshotTree(source);
    await sync(true);
    await sync();
    await sync();
    expect(snapshotTree(source)).toEqual(before);
  });

  it("writes nothing in a dry run, and lists what it would process", async () => {
    const { sync, storage, user } = await setup();
    await sync();
    await db.update(resources).set({ status: "stored" }).where(eq(resources.userId, user.id));
    const files = readdirSync(storage, { recursive: true }).length;
    const rowsBefore = await db.select().from(resourceContents);

    const report = await processResources(db, user.id, {
      store: new LocalObjectStore(storage),
      dryRun: true,
    });

    expect(report.processed.length).toBeGreaterThan(0);
    expect(report.processed.every((entry) => entry.outcome === undefined)).toBe(true);
    expect(await db.select().from(resourceContents)).toEqual(rowsBefore);
    expect(readdirSync(storage, { recursive: true }).length).toBe(files);
  });

  it("never changes lecture completion or other user data", async () => {
    const { source, sync, resourceAt, user } = await setup();
    await sync();
    const guide = await resourceAt(GUIDE);
    const scope = createUserScope(db, user.id);
    await scope.lectures.setCompleted(guide.lectureId, true, new Date("2026-10-01T10:00:00Z"));

    writeFileSync(
      path.join(source, ...GUIDE.split("/")),
      buildDocx(heading("Changed") + paragraph("Text.")),
    );
    await sync();
    await processResources(db, user.id, {
      store: new LocalObjectStore(createScratchFolder("y")),
      reprocessAll: true,
    });

    expect((await scope.lectures.detail(guide.lectureId))?.completedAt).toEqual(
      new Date("2026-10-01T10:00:00Z"),
    );
  });

  it("only ever processes the user's own materials", async () => {
    const mine = await setup();
    const theirs = await setup();
    await mine.sync();
    await theirs.sync();
    const theirGuide = await theirs.resourceAt(GUIDE);
    const [theirContent] = await theirs.contentOf(theirGuide.id);

    const report = await processResources(db, mine.user.id, {
      store: mine.store,
      reprocessAll: true,
    });

    expect(report.processed.every((entry) => entry.resourceId !== theirGuide.id)).toBe(true);
    expect((await theirs.contentOf(theirGuide.id))[0]?.updatedAt).toEqual(theirContent?.updatedAt);
  });
});
