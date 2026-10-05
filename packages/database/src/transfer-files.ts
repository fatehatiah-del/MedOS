import { ObjectMissingError, type ObjectStore } from "@medos/storage";
import { isNotNull } from "drizzle-orm";

import type { Database } from "./client";
import { resourceMedia, resources } from "./schema";

/*
 * The files a database refers to (copies of originals and extracted images),
 * copied from one object store to another, such as the local folder into the
 * hosted bucket. Each is checked against its SHA-256 on the way in, files the
 * target already has are skipped, so it can be run again safely.
 */

export interface FileTransferResult {
  total: number;
  copied: number;
  alreadyThere: number;
  /** Keys the database names but the source store does not have. */
  missing: string[];
}

/** Every storage key the database refers to, without duplicates, in a stable order. */
export async function referencedObjects(db: Database): Promise<string[]> {
  const [originals, media] = await Promise.all([
    db
      .selectDistinct({ key: resources.storageKey })
      .from(resources)
      .where(isNotNull(resources.storageKey)),
    db.selectDistinct({ key: resourceMedia.storageKey }).from(resourceMedia),
  ]);
  return [...new Set([...originals, ...media].map((row) => row.key).filter((key) => key !== null))]
    .map(String)
    .sort();
}

export async function transferFiles(
  db: Database,
  source: ObjectStore,
  target: ObjectStore,
  { onProgress = () => {} }: { onProgress?: (done: number, total: number) => void } = {},
): Promise<FileTransferResult> {
  const keys = await referencedObjects(db);
  const result: FileTransferResult = {
    total: keys.length,
    copied: 0,
    alreadyThere: 0,
    missing: [],
  };
  for (const [index, key] of keys.entries()) {
    if (await target.has(key)) {
      result.alreadyThere += 1;
    } else {
      try {
        // putBytes refuses bytes whose SHA-256 is not the key.
        await target.putBytes(key, await source.read(key));
        result.copied += 1;
      } catch (error) {
        if (!(error instanceof ObjectMissingError)) throw error;
        result.missing.push(key);
      }
    }
    onProgress(index + 1, keys.length);
  }
  return result;
}
