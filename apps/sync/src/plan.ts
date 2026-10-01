import type { ResourceKind, SyncFile, SyncStatus } from "@medos/database";

import type { Classification, ClassifiedFile } from "./classify/classify";
import type { ScanResult } from "./scan/walk";
import { type SyncState, lectureKey, weekKey } from "./state";

/*
 * Compares what is in the source folder now with what MedOS recorded last
 * time, and decides what a sync would do. Pure: it reads the state it is
 * given and changes nothing, which is what makes a dry run exact.
 */

/** How a file differs from the last sync. */
export type FileChange =
  /** Not seen before. */
  | "new"
  /** Same path, different content. */
  | "changed"
  /** Same content, but it now belongs elsewhere or is a different kind (rules or overrides changed). */
  | "reclassified"
  /** Was missing, is back. */
  | "reappeared"
  | "unchanged";

/** Where an attached file goes: a lecture identified by numbers, or one chosen by hand. */
export type LectureTarget =
  | { type: "position"; courseSlug: string; weekNumber: number; lectureNumber: number }
  | { type: "override"; lectureId: string };

export interface PlannedFile {
  file: ClassifiedFile;
  change: FileChange;
  /** Status the manifest will record. */
  status: Extract<SyncStatus, "synced" | "needs-review" | "ignored">;
  /** Kind after manual overrides. */
  kind: ResourceKind | null;
  target: LectureTarget | null;
  reasons: string[];
  previous: SyncFile | null;
}

export interface SyncPlan {
  classification: Classification;
  files: PlannedFile[];
  /** Recorded files no longer in the source folder. Marked missing; nothing is deleted. */
  missing: SyncFile[];
  /** Missing last time and still missing. */
  stillMissing: SyncFile[];
  placeholderLectures: number;
}

function previousTargetKey(previous: SyncFile, state: SyncState): string | null {
  if (!previous.resourceId) return null;
  const resource = state.resourcesById.get(previous.resourceId);
  return resource ? `${resource.lectureId}|${resource.kind}` : null;
}

function targetKey(target: LectureTarget | null, kind: ResourceKind | null, state: SyncState) {
  if (!target || !kind) return null;
  if (target.type === "override") return `${target.lectureId}|${kind}`;
  const course = state.coursesBySlug.get(target.courseSlug);
  const week = course ? state.weeksByKey.get(weekKey(course.id, target.weekNumber)) : undefined;
  const lecture = week
    ? state.lecturesByKey.get(lectureKey(week.id, target.lectureNumber))
    : undefined;
  // A lecture that does not exist yet cannot be where the file already is.
  return lecture ? `${lecture.id}|${kind}` : `new|${kind}`;
}

export function planSync(
  scan: Pick<ScanResult, "unreadable">,
  classification: Classification,
  state: SyncState,
): SyncPlan {
  const files = classification.files.map((file): PlannedFile => {
    const previous = state.manifest.get(file.relativePath) ?? null;
    const reasons = [...file.reasons];
    let status: PlannedFile["status"];
    let kind: ResourceKind | null = file.kind;
    let target: LectureTarget | null = null;

    if (previous?.ignored) {
      status = "ignored";
      kind = null;
      reasons.push("ignored by a manual override");
    } else {
      if (previous?.overrideKind) {
        kind = previous.overrideKind;
        reasons.push(`kind set by hand to ${previous.overrideKind}`);
      }
      if (previous?.overrideLectureId) {
        if (state.lecturesById.has(previous.overrideLectureId)) {
          target = { type: "override", lectureId: previous.overrideLectureId };
          reasons.push("lecture chosen by hand");
        } else {
          reasons.push("the lecture chosen by hand no longer exists");
        }
      } else if (
        file.courseSlug !== null &&
        file.weekNumber !== null &&
        file.lectureNumber !== null
      ) {
        target = {
          type: "position",
          courseSlug: file.courseSlug,
          weekNumber: file.weekNumber,
          lectureNumber: file.lectureNumber,
        };
      }
      status = target && kind ? "synced" : "needs-review";
    }

    let change: FileChange;
    if (!previous) {
      change = "new";
    } else if (previous.contentHash !== file.contentHash) {
      change = "changed";
    } else if (previous.status === "missing") {
      change = "reappeared";
    } else if (
      previous.status !== status ||
      (status === "synced" && previousTargetKey(previous, state) !== targetKey(target, kind, state))
    ) {
      change = "reclassified";
    } else {
      change = "unchanged";
    }

    return { file, change, status, kind, target, reasons, previous };
  });

  const present = new Set([
    ...classification.files.map((file) => file.relativePath),
    // A file that exists but could not be read this time is not missing.
    ...scan.unreadable.map((entry) => entry.relativePath),
  ]);
  const absent = [...state.manifest.values()].filter((row) => !present.has(row.relativePath));

  return {
    classification,
    files,
    missing: absent.filter((row) => row.status !== "missing"),
    stillMissing: absent.filter((row) => row.status === "missing"),
    placeholderLectures: state.placeholderLectures,
  };
}
