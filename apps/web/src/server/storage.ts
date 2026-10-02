import "server-only";

import path from "node:path";

import { findWorkspaceRoot } from "@medos/database";
import { LocalObjectStore, type ObjectStore } from "@medos/storage";

import { env } from "@/env";

/*
 * MedOS's own object storage: the copies of originals and the images
 * extracted from them, written by MedOS Sync. The web app only reads it, and
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
  store ??= new LocalObjectStore(storageDirectory());
  return store;
}
