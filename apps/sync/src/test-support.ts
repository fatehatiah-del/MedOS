import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/*
 * Synthetic study folders for tests. They are created in the operating
 * system's temporary directory and deleted afterwards; no test ever reads or
 * writes a real study folder.
 */

/** Builds a folder tree. Keys are relative paths ("Pharma/w4/quiz.html"); a trailing "/" makes an empty folder. */
export function createSourceTree(entries: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "medos-source-"));
  for (const [relative, contents] of Object.entries(entries)) {
    const target = path.join(root, ...relative.split("/").filter(Boolean));
    if (relative.endsWith("/")) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
  }
  return root;
}

export function createScratchFolder(label: string): string {
  return mkdtempSync(path.join(tmpdir(), `medos-${label}-`));
}

export function removeFolder(folder: string): void {
  rmSync(folder, { recursive: true, force: true });
}

export interface TreeEntry {
  path: string;
  type: "file" | "folder";
  size: number;
  modifiedMs: number;
  hash: string | null;
}

/** Everything observable about a folder tree: names, sizes, times and contents. */
export function snapshotTree(root: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const visit = (folder: string, prefix: string) => {
    for (const name of readdirSync(folder).sort()) {
      const absolute = path.join(folder, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const info = statSync(absolute);
      if (info.isDirectory()) {
        entries.push({
          path: relative,
          type: "folder",
          size: 0,
          modifiedMs: info.mtimeMs,
          hash: null,
        });
        visit(absolute, relative);
      } else {
        entries.push({
          path: relative,
          type: "file",
          size: info.size,
          modifiedMs: info.mtimeMs,
          hash: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
        });
      }
    }
  };
  visit(root, "");
  return entries;
}
