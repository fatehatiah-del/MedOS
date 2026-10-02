import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where MedOS keeps its own copy of each original file.
 *
 * Copies are content-addressed: a file is stored under its SHA-256, so the
 * same content is stored once however many times or places it appears, and
 * an unchanged file is never copied again. Stored copies are never modified
 * or deleted by a sync; a changed source file simply adds a new copy, so
 * earlier versions remain available.
 *
 * The interface is the seam for later storage: an S3-compatible store for
 * the hosted app implements the same methods.
 */
export interface ObjectStore {
  /** Human-readable location, for reports. */
  describe(): string;
  has(key: string): Promise<boolean>;
  /** Stores the file at `sourcePath` under `key`, unless that key exists. Only reads the source. */
  put(key: string, sourcePath: string): Promise<"stored" | "existing">;
  /** Stores bytes (e.g. an image extracted from a document) under their content key. */
  putBytes(key: string, bytes: Uint8Array): Promise<"stored" | "existing">;
  /** The stored bytes. Throws ObjectMissingError when there is no such object. */
  read(key: string): Promise<Uint8Array>;
}

export class ObjectMissingError extends Error {
  constructor(key: string) {
    super(`No stored object ${key}.`);
    this.name = "ObjectMissingError";
  }
}

/** The storage key for content with this SHA-256. Relative and machine-independent. */
export function contentKey(contentHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error("Invalid content hash.");
  return `sha256/${contentHash}`;
}

/** A store in a local folder, e.g. `.medos/objects` in the repository (git-ignored). */
export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  describe(): string {
    return this.root;
  }

  private pathFor(key: string): string {
    const [scheme, hash] = key.split("/");
    if (scheme !== "sha256" || !hash || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path.join(this.root, scheme, hash.slice(0, 2), hash);
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.pathFor(key), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, sourcePath: string): Promise<"stored" | "existing"> {
    const target = this.pathFor(key);
    if (await this.has(key)) return "existing";

    await mkdir(path.dirname(target), { recursive: true });
    // Copy to a temporary name inside the store, then rename: a crash never leaves a partial object.
    const temporary = `${target}.${process.pid}.partial`;
    try {
      await copyFile(sourcePath, temporary, constants.COPYFILE_EXCL);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      if (await this.has(key)) return "existing";
      throw error;
    }
    return "stored";
  }

  async putBytes(key: string, bytes: Uint8Array): Promise<"stored" | "existing"> {
    const target = this.pathFor(key);
    // Content addressing is a promise: the bytes must be what the key says.
    if (`sha256/${createHash("sha256").update(bytes).digest("hex")}` !== key) {
      throw new Error(`Content does not match its storage key ${key}.`);
    }
    if (await this.has(key)) return "existing";

    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.partial`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      if (await this.has(key)) return "existing";
      throw error;
    }
    return "stored";
  }

  async read(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ObjectMissingError(key);
      throw error;
    }
  }
}
