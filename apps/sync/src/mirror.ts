import {
  type Database,
  type Resource,
  type ResourceContent,
  type ResourceMedia,
  type SyncFile,
  courses,
  ensureWorkspace,
  lectures,
  resourceContents,
  resourceMedia,
  resources,
  syncFiles,
  users,
  weeks,
} from "@medos/database";
import { COURSES } from "@medos/shared";
import { and, eq, isNotNull, ne } from "drizzle-orm";

import { SyncError, lectureKey, loadSyncState, weekKey } from "./state";

/*
 * Mirror: gives another account the same study material as a source account.
 *
 * The source account is the one the sync imports into. Mirroring copies its
 * material, as already imported and parsed, into the target account: weeks,
 * lectures, resources, parsed content, image records and the sync manifest.
 * Nothing is parsed again and nothing is uploaded: originals and images are
 * stored once, by content hash, and the copied rows point at the same objects.
 *
 * The copy belongs to the target account. Each file is matched by its path in
 * the study folder (the target's own sync manifest), so once a file has been
 * mirrored it is never added again: lectures the target renamed stay renamed.
 * Only a file whose content changed in the source account is brought up to
 * date in the target's existing resource.
 *
 * Study data (progress, attempts, notes, highlights, notebooks, flashcards) is
 * never read from the source or written to the target. Nothing is deleted.
 */

export interface MirrorOptions {
  dryRun: boolean;
  now?: Date;
}

export interface MirroredFile {
  path: string;
  /** "new": attached to the target; "updated": changed content brought over; "linked": the same file was already on that lecture. */
  action: "new" | "updated" | "linked";
}

export interface MirrorReport {
  dryRun: boolean;
  weeksCreated: number;
  lecturesCreated: number;
  files: MirroredFile[];
  /** Files already in the target account and unchanged. */
  unchanged: number;
  /** Files that could not be mirrored, with the reason. */
  skipped: { path: string; reason: string }[];
}

/** Where a week sits in the source account, by natural key. */
interface WeekPlace {
  courseSlug: string;
  weekNumber: number;
  weekStartsOn: string | null;
  weekEndsOn: string | null;
}

/** Where a lecture sits in the source account, by natural key. */
interface LecturePlace extends WeekPlace {
  lectureNumber: number;
  lectureTitle: string;
  lectureHeldOn: string | null;
}

interface SourceFile extends LecturePlace {
  manifest: SyncFile;
  resource: Resource;
  content: ResourceContent | null;
  media: ResourceMedia[];
}

interface SourceLibrary {
  files: SourceFile[];
  /** Every week and lecture, including ones without files, so the outline matches. */
  weeks: WeekPlace[];
  lectures: LecturePlace[];
}

/** Every account except `exceptUserId`, by email. */
export async function otherAccounts(db: Database, exceptUserId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(ne(users.id, exceptUserId))
    .orderBy(users.email);
  return rows.map((row) => row.email);
}

/** The source account's mirrored material: each attached file, with where it sits. */
async function loadSource(db: Database, userId: string): Promise<SourceLibrary> {
  const manifest = await db
    .select()
    .from(syncFiles)
    .where(
      and(
        eq(syncFiles.userId, userId),
        isNotNull(syncFiles.resourceId),
        eq(syncFiles.ignored, false),
      ),
    )
    .orderBy(syncFiles.relativePath);

  const resourceRows = await db.select().from(resources).where(eq(resources.userId, userId));
  const contentRows = await db
    .select()
    .from(resourceContents)
    .where(eq(resourceContents.userId, userId));
  const mediaRows = await db.select().from(resourceMedia).where(eq(resourceMedia.userId, userId));
  const lectureRows = await db.select().from(lectures).where(eq(lectures.userId, userId));
  const weekRows = await db.select().from(weeks).where(eq(weeks.userId, userId));
  const courseRows = await db.select().from(courses).where(eq(courses.userId, userId));

  const resourceById = new Map(resourceRows.map((row) => [row.id, row]));
  const contentByResource = new Map(contentRows.map((row) => [row.resourceId, row]));
  const lectureById = new Map(lectureRows.map((row) => [row.id, row]));
  const weekById = new Map(weekRows.map((row) => [row.id, row]));
  const courseById = new Map(courseRows.map((row) => [row.id, row]));

  const weekPlaces: WeekPlace[] = [];
  const weekPlaceById = new Map<string, WeekPlace>();
  for (const week of weekRows) {
    const course = courseById.get(week.courseId);
    if (!course) continue;
    const place = {
      courseSlug: course.slug,
      weekNumber: week.number,
      weekStartsOn: week.startsOn,
      weekEndsOn: week.endsOn,
    };
    weekPlaces.push(place);
    weekPlaceById.set(week.id, place);
  }
  const lecturePlaces: LecturePlace[] = [];
  for (const lecture of lectureRows) {
    const week = weekPlaceById.get(lecture.weekId);
    if (!week) continue;
    lecturePlaces.push({
      ...week,
      lectureNumber: lecture.number,
      lectureTitle: lecture.title,
      lectureHeldOn: lecture.heldOn,
    });
  }
  const byPlace = (a: LecturePlace, b: LecturePlace) =>
    a.courseSlug.localeCompare(b.courseSlug) ||
    a.weekNumber - b.weekNumber ||
    a.lectureNumber - b.lectureNumber;
  weekPlaces.sort(
    (a, b) => a.courseSlug.localeCompare(b.courseSlug) || a.weekNumber - b.weekNumber,
  );
  lecturePlaces.sort(byPlace);

  const files: SourceFile[] = [];
  for (const entry of manifest) {
    const resource = entry.resourceId ? resourceById.get(entry.resourceId) : undefined;
    const lecture = resource ? lectureById.get(resource.lectureId) : undefined;
    const week = lecture ? weekById.get(lecture.weekId) : undefined;
    const course = lecture ? courseById.get(lecture.courseId) : undefined;
    if (!resource || !lecture || !week || !course) continue;
    files.push({
      manifest: entry,
      resource,
      content: contentByResource.get(resource.id) ?? null,
      media: mediaRows.filter((row) => row.resourceId === resource.id),
      courseSlug: course.slug,
      weekNumber: week.number,
      weekStartsOn: week.startsOn,
      weekEndsOn: week.endsOn,
      lectureNumber: lecture.number,
      lectureTitle: lecture.title,
      lectureHeldOn: lecture.heldOn,
    });
  }
  return { files, weeks: weekPlaces, lectures: lecturePlaces };
}

/** Whether the target's resource already holds what the source has for this file. */
function isCurrent(
  target: Resource,
  targetContent: ResourceContent | undefined,
  source: SourceFile,
): boolean {
  if (target.contentHash !== source.resource.contentHash) return false;
  if (!source.content) return true;
  return (
    targetContent !== undefined &&
    targetContent.sourceContentHash === source.content.sourceContentHash &&
    targetContent.parser === source.content.parser &&
    targetContent.parserVersion === source.content.parserVersion
  );
}

/**
 * Copies the source account's material into the target account. With
 * `dryRun`, reads only and reports what would be done.
 */
export async function mirrorLibrary(
  db: Database,
  sourceUserId: string,
  targetUserId: string,
  options: MirrorOptions,
): Promise<MirrorReport> {
  if (sourceUserId === targetUserId) {
    throw new SyncError("An account cannot be mirrored into itself.");
  }
  const now = options.now ?? new Date();
  const report: MirrorReport = {
    dryRun: options.dryRun,
    weeksCreated: 0,
    lecturesCreated: 0,
    files: [],
    unchanged: 0,
    skipped: [],
  };

  const source = await loadSource(db, sourceUserId);

  const preflight = await loadSyncState(db, targetUserId);
  if (preflight.placeholderLectures > 0) {
    throw new SyncError(
      `The target account has ${preflight.placeholderLectures} development placeholder lectures. ` +
        "Run a sync into it with --remove-placeholders first.",
    );
  }

  // The target's semester and courses come from the same academic definitions as the source's.
  let hasWorkspace = preflight.semester !== null;
  if (!options.dryRun && !hasWorkspace) {
    await ensureWorkspace(db, targetUserId);
    hasWorkspace = true;
  }

  const work = async (tx: Database) => {
    const state = await loadSyncState(tx, targetUserId);
    const contentRows = await tx
      .select()
      .from(resourceContents)
      .where(eq(resourceContents.userId, targetUserId));
    const contentByResource = new Map(contentRows.map((row) => [row.resourceId, row]));
    const resourcesByLecture = new Map<string, Resource[]>();
    for (const resource of state.resourcesById.values()) {
      const list = resourcesByLecture.get(resource.lectureId) ?? [];
      list.push(resource);
      resourcesByLecture.set(resource.lectureId, list);
    }

    // In a dry run, rows that would be created get placeholder ids so later files can find them.
    let planned = 0;
    const plannedId = () => `planned-${(planned += 1)}`;

    const courseIdFor = (slug: string): string | null => {
      const row = state.coursesBySlug.get(slug);
      if (row) return row.id;
      // Without a workspace yet (dry run only), every defined course will be created.
      if (!hasWorkspace && COURSES.some((course) => course.id === slug)) {
        return `planned-course-${slug}`;
      }
      return null;
    };

    const weekIdFor = async (courseId: string, file: WeekPlace): Promise<string> => {
      const key = weekKey(courseId, file.weekNumber);
      const existing = state.weeksByKey.get(key);
      if (existing) return existing.id;
      let id = plannedId();
      if (!options.dryRun) {
        const [row] = await tx
          .insert(weeks)
          .values({
            userId: targetUserId,
            courseId,
            number: file.weekNumber,
            startsOn: file.weekStartsOn,
            endsOn: file.weekEndsOn,
          })
          .returning();
        if (!row) throw new Error("week was not created");
        id = row.id;
        state.weeksByKey.set(key, row);
      } else {
        state.weeksByKey.set(key, { id } as never);
      }
      report.weeksCreated += 1;
      return id;
    };

    const lectureIdFor = async (
      courseId: string,
      weekId: string,
      file: LecturePlace,
    ): Promise<string> => {
      const key = lectureKey(weekId, file.lectureNumber);
      const existing = state.lecturesByKey.get(key);
      if (existing) return existing.id;
      let id = plannedId();
      if (!options.dryRun) {
        const [row] = await tx
          .insert(lectures)
          .values({
            userId: targetUserId,
            courseId,
            weekId,
            number: file.lectureNumber,
            // Set once, when the lecture is created: the target's own renames are never overwritten.
            title: file.lectureTitle,
            heldOn: file.lectureHeldOn,
          })
          .returning();
        if (!row) throw new Error("lecture was not created");
        id = row.id;
        state.lecturesByKey.set(key, row);
      } else {
        state.lecturesByKey.set(key, { id } as never);
      }
      report.lecturesCreated += 1;
      return id;
    };

    /** Writes the source's parsed content and image records onto a target resource. */
    const copyContent = async (targetResourceId: string, file: SourceFile) => {
      if (options.dryRun) return;
      await tx
        .delete(resourceMedia)
        .where(
          and(
            eq(resourceMedia.resourceId, targetResourceId),
            eq(resourceMedia.userId, targetUserId),
          ),
        );
      if (file.content) {
        const values = {
          format: file.content.format,
          origin: file.content.origin,
          parser: file.content.parser,
          parserVersion: file.content.parserVersion,
          sourceContentHash: file.content.sourceContentHash,
          content: file.content.content,
          stats: file.content.stats,
          issues: file.content.issues,
          searchText: file.content.searchText,
          extractedAt: file.content.extractedAt,
        };
        await tx
          .insert(resourceContents)
          .values({ userId: targetUserId, resourceId: targetResourceId, ...values })
          .onConflictDoUpdate({
            target: resourceContents.resourceId,
            set: values,
            setWhere: eq(resourceContents.userId, targetUserId),
          });
      }
      if (file.media.length > 0) {
        await tx.insert(resourceMedia).values(
          file.media.map((media) => ({
            userId: targetUserId,
            resourceId: targetResourceId,
            contentHash: media.contentHash,
            storageKey: media.storageKey,
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
          })),
        );
      }
    };

    const fileValues = (file: SourceFile) => ({
      kind: file.resource.kind,
      originalFilename: file.resource.originalFilename,
      mimeType: file.resource.mimeType,
      sizeBytes: file.resource.sizeBytes,
      contentHash: file.resource.contentHash,
      sourcePath: file.resource.sourcePath,
      storageKey: file.resource.storageKey,
      status: file.resource.status,
      processingError: file.resource.processingError,
    });

    const recordManifest = async (file: SourceFile, resourceId: string) => {
      if (options.dryRun) return;
      const { manifest } = file;
      const values = {
        contentHash: manifest.contentHash,
        sizeBytes: manifest.sizeBytes,
        modifiedAt: manifest.modifiedAt,
        detectedCourseSlug: manifest.detectedCourseSlug,
        detectedWeekNumber: manifest.detectedWeekNumber,
        detectedLectureNumber: manifest.detectedLectureNumber,
        detectedKind: manifest.detectedKind,
        status: manifest.status,
        classificationReason: "mirrored from another account",
        errorMessage: null,
        lastSyncedAt: now,
        resourceId,
      };
      await tx
        .insert(syncFiles)
        .values({ userId: targetUserId, relativePath: manifest.relativePath, ...values })
        .onConflictDoUpdate({ target: [syncFiles.userId, syncFiles.relativePath], set: values });
    };

    for (const file of source.files) {
      const path = file.manifest.relativePath;
      const recorded = state.manifest.get(path);

      if (recorded) {
        // Already mirrored (or synced) once: the target's copy is theirs.
        const target = recorded.resourceId
          ? state.resourcesById.get(recorded.resourceId)
          : undefined;
        if (!target) {
          report.skipped.push({ path, reason: "the target account has no resource for it" });
          continue;
        }
        if (isCurrent(target, contentByResource.get(target.id), file)) {
          report.unchanged += 1;
          continue;
        }
        const clash = (resourcesByLecture.get(target.lectureId) ?? []).find(
          (other) => other.id !== target.id && other.contentHash === file.resource.contentHash,
        );
        if (clash) {
          report.skipped.push({
            path,
            reason: "its new content is already attached to that lecture in the target account",
          });
          continue;
        }
        if (!options.dryRun) {
          await tx
            .update(resources)
            .set(fileValues(file))
            .where(and(eq(resources.id, target.id), eq(resources.userId, targetUserId)));
        }
        await copyContent(target.id, file);
        await recordManifest(file, target.id);
        report.files.push({ path, action: "updated" });
        continue;
      }

      const courseId = courseIdFor(file.courseSlug);
      if (!courseId) {
        report.skipped.push({
          path,
          reason: `the target account has no course "${file.courseSlug}"`,
        });
        continue;
      }
      const weekId = await weekIdFor(courseId, file);
      const lectureId = await lectureIdFor(courseId, weekId, file);

      const same = (resourcesByLecture.get(lectureId) ?? []).find(
        (other) => other.contentHash === file.resource.contentHash,
      );
      if (same) {
        await recordManifest(file, same.id);
        report.files.push({ path, action: "linked" });
        continue;
      }

      let resourceId = plannedId();
      if (!options.dryRun) {
        const [row] = await tx
          .insert(resources)
          .values({ userId: targetUserId, lectureId, ...fileValues(file) })
          .returning();
        if (!row) throw new Error("resource was not created");
        resourceId = row.id;
        state.resourcesById.set(row.id, row);
        resourcesByLecture.set(lectureId, [...(resourcesByLecture.get(lectureId) ?? []), row]);
      } else {
        const row = { id: resourceId, contentHash: file.resource.contentHash } as Resource;
        resourcesByLecture.set(lectureId, [...(resourcesByLecture.get(lectureId) ?? []), row]);
      }
      await copyContent(resourceId, file);
      await recordManifest(file, resourceId);
      report.files.push({ path, action: "new" });
    }

    // The rest of the outline: weeks and lectures that have no files yet.
    for (const week of source.weeks) {
      const courseId = courseIdFor(week.courseSlug);
      if (courseId) await weekIdFor(courseId, week);
    }
    for (const lecture of source.lectures) {
      const courseId = courseIdFor(lecture.courseSlug);
      if (!courseId) continue;
      await lectureIdFor(courseId, await weekIdFor(courseId, lecture), lecture);
    }
  };

  if (options.dryRun) await work(db);
  else await db.transaction(async (tx) => work(tx as unknown as Database));
  return report;
}

/** The mirror report, in the same plain style as the sync report. */
export function formatMirrorReport(from: string, to: string, report: MirrorReport): string {
  const count = (action: MirroredFile["action"]) =>
    report.files.filter((file) => file.action === action).length;
  const row = (label: string, value: number) => `  ${label.padEnd(24)}${value}`;
  const [add, update, link, weeks, lectures] = report.dryRun
    ? [
        "Would add files",
        "Would update files",
        "Would link files",
        "Would create weeks",
        "Would create lectures",
      ]
    : ["Files added", "Files updated", "Files linked", "Weeks created", "Lectures created"];
  const lines = [
    `MedOS Sync — mirror${report.dryRun ? ", dry run (nothing is changed)" : ""}`,
    "",
    `  ${"From".padEnd(24)}${from}`,
    `  ${"To".padEnd(24)}${to}`,
    "",
    row(add, count("new")),
    row(update, count("updated")),
    row(link, count("linked")),
    row(weeks, report.weeksCreated),
    row(lectures, report.lecturesCreated),
    row("Unchanged", report.unchanged),
    row("Skipped", report.skipped.length),
  ];
  if (report.files.length > 0) {
    lines.push("");
    for (const file of report.files) lines.push(`  [${file.action}] ${file.path}`);
  }
  if (report.skipped.length > 0) {
    lines.push("", "Skipped:");
    for (const skip of report.skipped) lines.push(`  ${skip.path}: ${skip.reason}`);
  }
  return lines.join("\n");
}
