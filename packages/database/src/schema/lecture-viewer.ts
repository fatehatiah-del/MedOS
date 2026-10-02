import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { PAGE_ANNOTATION_KINDS } from "./values";

/*
 * The user's own layer over an original lecture (a PDF): bookmarks, notes and
 * Review Later items on its pages, and the page they were last on.
 *
 * The original file is never changed. Pages are addressed by their number in
 * the PDF; the hash of the file an item was made against is kept, so a page
 * that no longer exists after a re-import is reported, not silently moved.
 * Nothing here affects lecture completion.
 */

/** A bookmark, note or Review Later item on one page of an original lecture. */
export const originalLectureAnnotations = pgTable(
  "original_lecture_annotations",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    kind: text("kind", { enum: PAGE_ANNOTATION_KINDS }).notNull(),
    /** 1-based page number in the PDF. */
    page: integer("page").notNull(),
    /** The user's own words. Set for notes only. */
    note: text("note"),
    /** SHA-256 of the original file the item was made against. */
    sourceContentHash: text("source_content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "original_lecture_annotations_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    index("original_lecture_annotations_resource_idx").on(table.resourceId, table.userId),
    // One bookmark (Review Later item) per page; notes may be several.
    uniqueIndex("original_lecture_annotations_page_unique")
      .on(table.resourceId, table.kind, table.page)
      .where(sql`${table.kind} <> 'note'`),
    check("original_lecture_annotations_kind_valid", oneOf(table.kind, PAGE_ANNOTATION_KINDS)),
    check("original_lecture_annotations_page_positive", sql`${table.page} >= 1`),
    check(
      "original_lecture_annotations_note_only_on_notes",
      sql`(${table.kind} = 'note') = (${table.note} is not null)`,
    ),
    check(
      "original_lecture_annotations_note_length",
      sql`${table.note} is null or char_length(btrim(${table.note})) between 1 and 10000`,
    ),
    check(
      "original_lecture_annotations_source_hash_format",
      sql`${table.sourceContentHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * The page the user was last on in an original lecture, to resume there.
 * It records where they were, not how much they studied, and is never
 * lecture completion.
 */
export const originalLecturePositions = pgTable(
  "original_lecture_positions",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    page: integer("page").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "original_lecture_positions_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("original_lecture_positions_resource_unique").on(table.resourceId),
    check("original_lecture_positions_page_positive", sql`${table.page} >= 1`),
  ],
);

export type OriginalLectureAnnotation = typeof originalLectureAnnotations.$inferSelect;
export type OriginalLecturePosition = typeof originalLecturePositions.$inferSelect;
