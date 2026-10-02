import {
  type Database,
  type Resource,
  ensureWorkspace,
  lectures,
  removeFixtureLectures,
  resources,
  syncFiles,
  weeks,
} from "@medos/database";
import { type IsoDate, addDays } from "@medos/shared";
import { and, eq, inArray } from "drizzle-orm";

import type { PlannedFile, SyncPlan } from "./plan";
import { absolutePathOf } from "./scan/walk";
import { SyncError, lectureKey, loadSyncState, weekKey } from "./state";
import { type ObjectStore, contentKey } from "@medos/storage";

/*
 * Carries out a sync plan.
 *
 * What it writes: weeks and lectures that do not exist yet, one resource per
 * attached file, the manifest (sync_files), and a copy of each new original in
 * the object store. What it never does: delete anything, touch a lecture's
 * completion or any other study data, or write to the source folder.
 */

export interface ApplyOptions {
  store: ObjectStore;
  sourceRoot: string;
  /** Remove development placeholder lectures first. Required when any exist. */
  removePlaceholders?: boolean;
  now?: Date;
}

export interface ApplyResult {
  objectsStored: number;
  objectsExisting: number;
  weeksCreated: number;
  lecturesCreated: number;
  resourcesCreated: number;
  resourcesUpdated: number;
  placeholdersRemoved: number;
}

export async function applySync(
  db: Database,
  userId: string,
  plan: SyncPlan,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const now = options.now ?? new Date();
  const result: ApplyResult = {
    objectsStored: 0,
    objectsExisting: 0,
    weeksCreated: 0,
    lecturesCreated: 0,
    resourcesCreated: 0,
    resourcesUpdated: 0,
    placeholdersRemoved: 0,
  };

  if (plan.placeholderLectures > 0) {
    if (!options.removePlaceholders) {
      throw new SyncError(
        `This account has ${plan.placeholderLectures} development placeholder lectures. Run the ` +
          "sync again with --remove-placeholders to remove them before importing real material.",
      );
    }
    result.placeholdersRemoved = (await removeFixtureLectures(db, userId)).lectures;
  }

  // Preserve originals first. Content-addressed, so this is safe to repeat and to interrupt.
  const attached = plan.files.filter((planned) => planned.status === "synced");
  for (const planned of attached) {
    const outcome = await options.store.put(
      contentKey(planned.file.contentHash),
      absolutePathOf(options.sourceRoot, planned.file),
    );
    if (outcome === "stored") result.objectsStored += 1;
    else result.objectsExisting += 1;
  }

  const semester = await ensureWorkspace(db, userId);

  await db.transaction(async (tx) => {
    let state = await loadSyncState(tx, userId);

    // Weeks and lectures from the discovered structure. Existing rows are left as they are.
    const newWeeks = plan.classification.courses.flatMap((course) => {
      const courseRow = state.coursesBySlug.get(course.slug);
      if (!courseRow) return [];
      return course.weeks
        .filter((week) => !state.weeksByKey.has(weekKey(courseRow.id, week.number)))
        .map((week) => {
          const startsOn = addDays(semester.startsOn as IsoDate, (week.number - 1) * 7);
          return {
            userId,
            courseId: courseRow.id,
            number: week.number,
            startsOn,
            endsOn: addDays(startsOn, 6),
          };
        });
    });
    if (newWeeks.length > 0) {
      const inserted = await tx
        .insert(weeks)
        .values(newWeeks)
        .onConflictDoNothing({ target: [weeks.courseId, weeks.number] })
        .returning({ id: weeks.id });
      result.weeksCreated = inserted.length;
      state = await loadSyncState(tx, userId);
    }

    const newLectures = plan.classification.courses.flatMap((course) => {
      const courseRow = state.coursesBySlug.get(course.slug);
      if (!courseRow) return [];
      return course.weeks.flatMap((week) => {
        const weekRow = state.weeksByKey.get(weekKey(courseRow.id, week.number));
        if (!weekRow) return [];
        return week.lectures
          .filter((lecture) => !state.lecturesByKey.has(lectureKey(weekRow.id, lecture.number)))
          .map((lecture) => ({
            userId,
            courseId: courseRow.id,
            weekId: weekRow.id,
            number: lecture.number,
            // Set once, when the lecture is created: a later rename by the user is never overwritten.
            title: lecture.title ?? `Lecture ${lecture.number}`,
          }));
      });
    });
    if (newLectures.length > 0) {
      const inserted = await tx
        .insert(lectures)
        .values(newLectures)
        .onConflictDoNothing({ target: [lectures.weekId, lectures.number] })
        .returning({ id: lectures.id });
      result.lecturesCreated = inserted.length;
      state = await loadSyncState(tx, userId);
    }

    const lectureIdFor = (planned: PlannedFile): string | null => {
      const target = planned.target;
      if (!target) return null;
      if (target.type === "override") return target.lectureId;
      const course = state.coursesBySlug.get(target.courseSlug);
      const week = course ? state.weeksByKey.get(weekKey(course.id, target.weekNumber)) : undefined;
      const lecture = week
        ? state.lecturesByKey.get(lectureKey(week.id, target.lectureNumber))
        : undefined;
      return lecture?.id ?? null;
    };

    const findResource = async (lectureId: string, contentHash: string) => {
      const [row] = await tx
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.userId, userId),
            eq(resources.lectureId, lectureId),
            eq(resources.contentHash, contentHash),
          ),
        );
      return row ?? null;
    };

    for (const planned of plan.files) {
      const { file } = planned;
      let resourceId = planned.previous?.resourceId ?? null;
      let status = planned.status;
      const reasons = [...planned.reasons];

      if (status === "synced" && planned.kind) {
        const lectureId = lectureIdFor(planned);
        if (!lectureId) {
          status = "needs-review";
          reasons.push("its lecture could not be created");
        } else {
          const values = {
            lectureId,
            kind: planned.kind,
            originalFilename: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            contentHash: file.contentHash,
            sourcePath: file.relativePath,
            storageKey: contentKey(file.contentHash),
          };
          const existing: Resource | null =
            (resourceId ? state.resourcesById.get(resourceId) : undefined) ?? null;
          const sameContentThere = await findResource(lectureId, file.contentHash);

          if (sameContentThere && sameContentThere.id !== existing?.id) {
            // Identical content is already attached to that lecture: point at it, add nothing.
            resourceId = sameContentThere.id;
          } else if (existing) {
            const contentChanged = existing.contentHash !== file.contentHash;
            const moved =
              existing.lectureId !== lectureId ||
              existing.kind !== planned.kind ||
              existing.originalFilename !== file.name ||
              existing.sourcePath !== file.relativePath;
            if (contentChanged || moved) {
              await tx
                .update(resources)
                .set({
                  ...values,
                  // New content must be processed again; the earlier copy stays in the store.
                  ...(contentChanged ? { status: "stored" as const, processingError: null } : {}),
                })
                .where(and(eq(resources.id, existing.id), eq(resources.userId, userId)));
              result.resourcesUpdated += 1;
            }
          } else {
            const [inserted] = await tx
              .insert(resources)
              .values({ ...values, userId, status: "stored" })
              .returning({ id: resources.id });
            resourceId = inserted?.id ?? null;
            result.resourcesCreated += 1;
          }
        }
      }

      const manifestValues = {
        contentHash: file.contentHash,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        detectedCourseSlug: file.courseSlug,
        detectedWeekNumber: file.weekNumber,
        detectedLectureNumber: file.lectureNumber,
        detectedKind: file.kind,
        status,
        classificationReason: reasons.join("; "),
        errorMessage: null,
        lastSyncedAt: now,
        resourceId,
      };
      // Manual override columns are never written here, so corrections survive every sync.
      await tx
        .insert(syncFiles)
        .values({ userId, relativePath: file.relativePath, ...manifestValues })
        .onConflictDoUpdate({
          target: [syncFiles.userId, syncFiles.relativePath],
          set: manifestValues,
        });
    }

    if (plan.missing.length > 0) {
      await tx
        .update(syncFiles)
        .set({ status: "missing", lastSyncedAt: now })
        .where(
          and(
            eq(syncFiles.userId, userId),
            inArray(
              syncFiles.id,
              plan.missing.map((row) => row.id),
            ),
          ),
        );
    }
  });

  return result;
}
