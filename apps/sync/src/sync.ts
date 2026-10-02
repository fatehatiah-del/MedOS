import type { Database } from "@medos/database";

import { type ApplyResult, applySync } from "./apply";
import { type Classification, classifyScan } from "./classify/classify";
import { type SyncPlan, planSync } from "./plan";
import { type ProcessReport, processResources } from "./process/process";
import { type ScanResult, scanSource } from "./scan/walk";
import { loadSyncState } from "./state";
import type { ObjectStore } from "@medos/storage";

/*
 * The pipeline, end to end:
 *
 *   source folder ─scan─▶ files ─classify─▶ course/week/lecture/kind
 *                 ─plan─▶ differences from the last sync ─apply─▶ MedOS
 *                 ─process─▶ structured content from the stored originals
 *
 * A dry run stops after "plan" (and lists what processing would do): it reads
 * the source folder and the database and writes to neither.
 */

export interface SyncRun {
  scan: ScanResult;
  classification: Classification;
  plan: SyncPlan;
  /** Absent for a dry run. */
  result?: ApplyResult;
  /** Processing of imported materials into structured content. */
  processing: ProcessReport;
}

export interface SyncOptions {
  store: ObjectStore;
  dryRun: boolean;
  removePlaceholders?: boolean;
  now?: Date;
  /** See ProcessOptions.onUnexpectedError. */
  onUnexpectedError?: (label: string, error: unknown) => void;
}

export async function scanAndClassify(sourceRoot: string) {
  const scan = await scanSource(sourceRoot);
  return { scan, classification: classifyScan(scan) };
}

export async function runSync(
  db: Database,
  userId: string,
  sourceRoot: string,
  options: SyncOptions,
): Promise<SyncRun> {
  const { scan, classification } = await scanAndClassify(sourceRoot);
  const plan = planSync(scan, classification, await loadSyncState(db, userId));
  const processOptions = {
    store: options.store,
    now: options.now,
    onUnexpectedError: options.onUnexpectedError,
  };
  if (options.dryRun) {
    const processing = await processResources(db, userId, { ...processOptions, dryRun: true });
    return { scan, classification, plan, processing };
  }

  const result = await applySync(db, userId, plan, {
    store: options.store,
    sourceRoot: scan.root,
    removePlaceholders: options.removePlaceholders,
    now: options.now,
  });
  const processing = await processResources(db, userId, processOptions);
  return { scan, classification, plan, result, processing };
}
