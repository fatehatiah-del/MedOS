import "server-only";

import path from "node:path";

import { findWorkspaceRoot } from "@medos/database";
import { type ObjectStore, createObjectStore, storageConfigFromEnv } from "@medos/storage";

import { env } from "@/env";

/*
 * MedOS's own object storage: the copies of originals and the images
 * extracted from them, written by MedOS Sync. A local folder by default, or an
 * S3-compatible bucket when STORAGE_PROVIDER=s3 (hosted deployments). The web app only reads it, and
 * only through handlers that have checked who is asking and what they own.
 * Locations never leave the server.
 */

let store: ObjectStore | undefined;

/** The folder the store reads: `MEDOS_STORAGE_DIR`, or `.medos/objects` in the repository. */
export function storageDirectory(value = env.MEDOS_STORAGE_DIR): string {
  const configured = value?.trim();
  return configured
    ? path.resolve(findWorkspaceRoot(), configured)
    : path.join(findWorkspaceRoot(), ".medos", "objects");
}

export function getObjectStore(): ObjectStore {
  store ??= createObjectStore(storageConfigFromEnv(process.env), (configured) =>
    storageDirectory(configured ?? undefined),
  );
  return store;
}
