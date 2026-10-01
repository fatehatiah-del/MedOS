import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { lectures } from "./academic";
import { id, oneOf, timestamps } from "./columns";
import { ownerId } from "./users";
import { RESOURCE_KINDS, RESOURCE_STATUSES, SYNC_STATUSES } from "./values";

/**
 * A source file attached to a lecture: a study guide, the original slides, an
 * MCQ quiz, a question bank, or supporting material.
 *
 * The row describes the original file and where it came from. Parsed or
 * structured content is derived from it later and must never replace it, so a
 * failed parse changes `status` and `processing_error` and nothing else.
 */
export const resources = pgTable(
  "resources",
  {
    id: id(),
    userId: ownerId(),
    lectureId: uuid("lecture_id").notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull(),
    /** File name as it was on the user's machine, e.g. "StudyGuide.docx". */
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** SHA-256 of the original file, lowercase hex. Identifies content, not location. */
    contentHash: text("content_hash").notNull(),
    /** Path relative to the sync root, e.g. "Pharma/w4/lecture-1/StudyGuide.docx". */
    sourcePath: text("source_path"),
    /** Object-storage key of the preserved original. Empty until it has been uploaded. */
    storageKey: text("storage_key"),
    status: text("status", { enum: RESOURCE_STATUSES }).notNull().default("pending"),
    /** Why processing failed, in words the user can act on. */
    processingError: text("processing_error"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "resources_lecture_fk",
      columns: [table.lectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    // The same file is attached to a lecture once. Also serves "resources by lecture".
    unique("resources_lecture_hash_unique").on(table.lectureId, table.contentHash),
    unique("resources_id_user_unique").on(table.id, table.userId),
    check("resources_kind_valid", oneOf(table.kind, RESOURCE_KINDS)),
    check("resources_status_valid", oneOf(table.status, RESOURCE_STATUSES)),
    check("resources_size_not_negative", sql`${table.sizeBytes} >= 0`),
    check("resources_hash_format", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/**
 * What the local sync tool knows about one file in the user's source folder.
 *
 * Files are identified by their path relative to the sync root, never by a
 * machine-specific absolute path. The `detected_*` columns record what the
 * scanner inferred from the path; they are observations, not references, and
 * may point at a course, week or lecture that does not exist yet.
 */
export const syncFiles = pgTable(
  "sync_files",
  {
    id: id(),
    userId: ownerId(),
    relativePath: text("relative_path").notNull(),
    contentHash: text("content_hash").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Last-modified time reported by the file system. */
    modifiedAt: timestamp("modified_at", { withTimezone: true }).notNull(),
    detectedCourseSlug: text("detected_course_slug"),
    detectedWeekNumber: integer("detected_week_number"),
    detectedLectureNumber: integer("detected_lecture_number"),
    detectedKind: text("detected_kind", { enum: RESOURCE_KINDS }),
    status: text("status", { enum: SYNC_STATUSES }).notNull().default("pending"),
    /** Why the file was classified as it was, in words, e.g. "file name mentions MCQ". */
    classificationReason: text("classification_reason"),
    errorMessage: text("error_message"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** The resource this file was uploaded as, once it has been. */
    resourceId: uuid("resource_id"),
    /*
     * Manual corrections. Automatic classification is only a proposal: when
     * set, these win over what the scanner detects, on every later sync.
     */
    /** Use this kind instead of the detected one. */
    overrideKind: text("override_kind", { enum: RESOURCE_KINDS }),
    /** Attach the file to this lecture instead of the detected one. */
    overrideLectureId: uuid("override_lecture_id"),
    /** Leave the file out of MedOS entirely. It stays on record. */
    ignored: boolean("ignored").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "sync_files_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "sync_files_override_lecture_fk",
      columns: [table.overrideLectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    check(
      "sync_files_override_kind_valid",
      sql`${table.overrideKind} is null or ${oneOf(table.overrideKind, RESOURCE_KINDS)}`,
    ),
    unique("sync_files_user_path_unique").on(table.userId, table.relativePath),
    index("sync_files_resource_idx").on(table.resourceId),
    check("sync_files_status_valid", oneOf(table.status, SYNC_STATUSES)),
    check(
      "sync_files_detected_kind_valid",
      sql`${table.detectedKind} is null or ${oneOf(table.detectedKind, RESOURCE_KINDS)}`,
    ),
    check("sync_files_size_not_negative", sql`${table.sizeBytes} >= 0`),
    check("sync_files_hash_format", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    // Relative, forward-slash paths only: no drive letters, roots or backslashes.
    check(
      "sync_files_path_relative",
      sql`${table.relativePath} !~ '^([a-zA-Z]:|/)' and position(chr(92) in ${table.relativePath}) = 0`,
    ),
  ],
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type SyncFile = typeof syncFiles.$inferSelect;
export type NewSyncFile = typeof syncFiles.$inferInsert;
