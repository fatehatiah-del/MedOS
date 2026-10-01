import { statSync } from "node:fs";
import path from "node:path";

import { findWorkspaceRoot } from "@medos/database";

/*
 * Where to read from and where to keep copies. Nothing here has a built-in
 * personal path: the source folder always comes from --source or
 * MEDOS_SOURCE_DIR.
 */

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** True when `inner` is `outer` or anywhere inside it. Case-insensitive on Windows. */
export function isWithin(inner: string, outer: string): boolean {
  const normalise = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const relative = path.relative(normalise(outer), normalise(inner));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveSourceDir(value: string | undefined): string {
  if (!value?.trim()) {
    throw new ConfigError(
      "No source folder given. Pass --source <folder>, or set MEDOS_SOURCE_DIR in apps/web/.env.local.",
    );
  }
  const source = path.resolve(value.trim());
  let isDirectory = false;
  try {
    isDirectory = statSync(source).isDirectory();
  } catch {
    throw new ConfigError(`The source folder does not exist: ${source}`);
  }
  if (!isDirectory) throw new ConfigError(`The source is not a folder: ${source}`);
  return source;
}

/**
 * The folder MedOS copies originals into. Defaults to `.medos/objects` in the
 * repository (git-ignored). It must never be inside the source folder: MedOS
 * does not write there.
 */
export function resolveStorageDir(value: string | undefined, sourceDir?: string): string {
  const storage = value?.trim()
    ? path.resolve(value.trim())
    : path.join(findWorkspaceRoot(), ".medos", "objects");
  if (!sourceDir) return storage;
  if (isWithin(storage, sourceDir)) {
    throw new ConfigError(
      "The storage folder is inside the source folder. MedOS never writes into the source folder; " +
        "set MEDOS_STORAGE_DIR to a folder outside it.",
    );
  }
  if (isWithin(sourceDir, storage)) {
    throw new ConfigError(
      "The source folder is inside the storage folder. Choose separate folders.",
    );
  }
  return storage;
}

export function resolveUserEmail(value: string | undefined): string {
  if (!value?.trim()) {
    throw new ConfigError(
      "No MedOS account given. Pass --user <email>, or set MEDOS_SYNC_USER in apps/web/.env.local.",
    );
  }
  return value.trim().toLowerCase();
}
