import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { opendir, stat } from "node:fs/promises";
import path from "node:path";

import { junkReason } from "./files";

/*
 * READ-ONLY. This module is the only code that touches the source folder, and
 * it uses exactly three operations on it: list a directory, read a file's
 * metadata, and open a file for reading. Nothing is written, renamed, moved,
 * deleted or created there, and symbolic links are never followed.
 */

export interface ScannedFile {
  /** Path from the source root with forward slashes, e.g. "Pharma/w4/lecture-1/Quiz.html". */
  relativePath: string;
  /** The path's folder and file names, in order. */
  segments: string[];
  name: string;
  /** Lowercase, with the dot: ".docx". Empty when the name has none. */
  extension: string;
  sizeBytes: number;
  modifiedAt: Date;
  /** SHA-256 of the contents, lowercase hex. */
  contentHash: string;
}

export interface SkippedEntry {
  relativePath: string;
  reason: string;
}

export interface ScanResult {
  /** Absolute path of the source folder, for local display only. Never stored. */
  root: string;
  files: ScannedFile[];
  /** Every folder below the root, relative, so empty weeks and lectures are still seen. */
  directories: string[];
  /** Operating-system files, temporary files and links: not study material. */
  skipped: SkippedEntry[];
  /** Files that could not be read. They are reported, and nothing about them changes. */
  unreadable: SkippedEntry[];
}

/** SHA-256 of a file, read as a stream. */
export async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

const byPath = <T extends { relativePath: string }>(a: T, b: T) =>
  a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;

/** Walks the source folder recursively and describes every file in it. */
export async function scanSource(sourceRoot: string): Promise<ScanResult> {
  const root = path.resolve(sourceRoot);
  const result: ScanResult = { root, files: [], directories: [], skipped: [], unreadable: [] };

  async function visit(directory: string, segments: string[]): Promise<void> {
    const entries = [];
    for await (const entry of await opendir(directory)) entries.push(entry);

    for (const entry of entries) {
      const entrySegments = [...segments, entry.name];
      const relativePath = entrySegments.join("/");
      const absolute = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        result.skipped.push({ relativePath, reason: "symbolic link (not followed)" });
      } else if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          result.skipped.push({ relativePath, reason: "hidden folder" });
          continue;
        }
        result.directories.push(relativePath);
        await visit(absolute, entrySegments);
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        const junk = junkReason(entry.name, extension);
        if (junk) {
          result.skipped.push({ relativePath, reason: junk });
          continue;
        }
        try {
          const info = await stat(absolute);
          result.files.push({
            relativePath,
            segments: entrySegments,
            name: entry.name,
            extension,
            sizeBytes: info.size,
            modifiedAt: info.mtime,
            contentHash: await hashFile(absolute),
          });
        } catch (error) {
          result.unreadable.push({
            relativePath,
            reason: (error as NodeJS.ErrnoException).code ?? "could not be read",
          });
        }
      } else {
        result.skipped.push({ relativePath, reason: "not a regular file" });
      }
    }
  }

  await visit(root, []);
  result.files.sort(byPath);
  result.directories.sort();
  result.skipped.sort(byPath);
  result.unreadable.sort(byPath);
  return result;
}

/** The absolute path of a scanned file, built from its segments with the platform's rules. */
export function absolutePathOf(root: string, file: Pick<ScannedFile, "segments">): string {
  return path.join(root, ...file.segments);
}
