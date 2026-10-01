import { createHash } from "node:crypto";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError, isWithin, resolveSourceDir, resolveStorageDir } from "../config";
import { createSourceTree, removeFolder, snapshotTree } from "../test-support";

import { scanSource } from "./walk";

const roots: string[] = [];
const tree = (entries: Record<string, string>) => {
  const root = createSourceTree(entries);
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) removeFolder(root);
});

describe("scanSource", () => {
  it("walks every level, with relative forward-slash paths and SHA-256 hashes", async () => {
    const root = tree({
      "Pharma/w4/lecture-1/study-guide.docx": "guide",
      "Pharma/w4/lecture-1/deeper/folder/notes.pdf": "notes",
      "Pathology/w2/": "",
    });

    const scan = await scanSource(root);

    expect(scan.files.map((file) => file.relativePath)).toEqual([
      "Pharma/w4/lecture-1/deeper/folder/notes.pdf",
      "Pharma/w4/lecture-1/study-guide.docx",
    ]);
    expect(scan.directories).toContain("Pathology/w2");
    expect(scan.files[1]).toMatchObject({
      name: "study-guide.docx",
      extension: ".docx",
      sizeBytes: 5,
      contentHash: createHash("sha256").update("guide").digest("hex"),
    });
  });

  it("handles spaces, mixed case and non-ASCII names", async () => {
    const root = tree({
      "Public & Global Health/Week 01/Lecture 1 – Épidémiologie.docx": "é",
      "Communication Skills/W2/Übung Quiz.HTML": "q",
    });

    const scan = await scanSource(root);

    expect(scan.files.map((file) => file.relativePath)).toEqual([
      "Communication Skills/W2/Übung Quiz.HTML",
      "Public & Global Health/Week 01/Lecture 1 – Épidémiologie.docx",
    ]);
    expect(scan.files[0]?.extension).toBe(".html");
  });

  it("skips operating-system and temporary files, and says why", async () => {
    const root = tree({
      "Pharma/w1/~$udy Guide.docx": "lock",
      "Pharma/w1/Thumbs.db": "x",
      "Pharma/w1/.DS_Store": "x",
      "Pharma/w1/.private-notes.txt": "x",
      "Pharma/w1/download.pdf.crdownload": "x",
      "Pharma/w1/real.pdf": "real",
    });

    const scan = await scanSource(root);

    expect(scan.files.map((file) => file.name)).toEqual(["real.pdf"]);
    expect(scan.skipped.map((entry) => entry.reason).sort()).toEqual([
      "Office lock file",
      "hidden file",
      "operating-system file",
      "operating-system file",
      "temporary or incomplete download",
    ]);
  });

  it("only reads: the folder is identical afterwards", async () => {
    const root = tree({ "Pharma/w1/a.pdf": "a", "Pharma/w2/b.docx": "b" });
    const before = snapshotTree(root);

    await scanSource(root);

    expect(snapshotTree(root)).toEqual(before);
  });
});

describe("configuration", () => {
  it("requires a source folder and checks that it exists", () => {
    expect(() => resolveSourceDir(undefined)).toThrow(ConfigError);
    expect(() => resolveSourceDir(undefined)).toThrow(/MEDOS_SOURCE_DIR/);
    expect(() => resolveSourceDir(path.join(tree({}), "nope"))).toThrow(/does not exist/);
  });

  it("never stores copies inside the source folder", () => {
    const source = tree({ "Pharma/w1/a.pdf": "a" });

    expect(() => resolveStorageDir(path.join(source, "objects"), source)).toThrow(
      /inside the source folder/,
    );
    expect(() => resolveStorageDir(source, source)).toThrow(ConfigError);
    expect(() => resolveStorageDir(path.dirname(source), source)).toThrow(/inside the storage/);
  });

  it("compares folders by path, not by text prefix", () => {
    expect(isWithin("/data/S5/Pharma", "/data/S5")).toBe(true);
    expect(isWithin("/data/S5-copy", "/data/S5")).toBe(false);
    expect(isWithin("/data", "/data/S5")).toBe(false);
  });
});
