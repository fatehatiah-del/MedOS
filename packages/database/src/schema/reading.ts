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
import { ANNOTATION_KINDS } from "./values";

/*
 * The user's own layer over a study guide: highlights, notes, bookmarks,
 * Review Later items and reading progress.
 *
 * None of it is stored in, or changes, the parsed content or the original
 * file. It points at the source by anchor (section, text unit, offsets, the
 * quoted passage and its context), so re-processing a file never erases it:
 * an anchor whose text moved is found again, and one whose text is gone is
 * reported, not silently re-attached.
 *
 * Nothing here affects lecture completion, which only the user sets.
 */

const SECTION_ID = sql.raw(`'^[a-z0-9]+(-[a-z0-9]+)*$'`);

/** A highlight, note, bookmark or Review Later item on a study guide. */
export const studyGuideAnnotations = pgTable(
  "study_guide_annotations",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    kind: text("kind", { enum: ANNOTATION_KINDS }).notNull(),
    /** The section's stable id; null for the preamble before the first heading. */
    sectionId: text("section_id"),
    /** The text unit within the section (see text-units in @medos/parsers); null for a whole section. */
    unitPath: text("unit_path"),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    /** The passage as the source has it (the section heading for a whole section). */
    quote: text("quote").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    /** The user's own words. Set for notes only. */
    note: text("note"),
    /** SHA-256 of the original file whose content the anchor was made against. */
    sourceContentHash: text("source_content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "study_guide_annotations_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    index("study_guide_annotations_resource_idx").on(table.resourceId, table.userId),
    // One highlight (bookmark, Review Later item) per place; notes may be several.
    uniqueIndex("study_guide_annotations_place_unique")
      .on(
        table.resourceId,
        table.kind,
        sql`coalesce(${table.sectionId}, '')`,
        sql`coalesce(${table.unitPath}, '')`,
        sql`coalesce(${table.startOffset}, -1)`,
        sql`coalesce(${table.endOffset}, -1)`,
      )
      .where(sql`${table.kind} <> 'note'`),
    check("study_guide_annotations_kind_valid", oneOf(table.kind, ANNOTATION_KINDS)),
    check(
      "study_guide_annotations_section_format",
      sql`${table.sectionId} is null or ${table.sectionId} ~ ${SECTION_ID}`,
    ),
    // A passage has a unit and a non-empty range; a whole section has neither.
    check(
      "study_guide_annotations_range_valid",
      sql`(${table.unitPath} is null and ${table.startOffset} is null and ${table.endOffset} is null and ${table.sectionId} is not null)
        or (${table.unitPath} is not null and ${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset})`,
    ),
    check(
      "study_guide_annotations_quote_length",
      sql`char_length(${table.quote}) between 1 and 5000`,
    ),
    check(
      "study_guide_annotations_note_only_on_notes",
      sql`(${table.kind} = 'note') = (${table.note} is not null)`,
    ),
    check(
      "study_guide_annotations_note_length",
      sql`${table.note} is null or char_length(btrim(${table.note})) between 1 and 10000`,
    ),
    check(
      "study_guide_annotations_source_hash_format",
      sql`${table.sourceContentHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * How far through a study guide the user has read: the furthest section
 * whose end they reached, and where they were last. 100% means the end of the
 * guide was reached. It is not lecture completion and never sets it.
 */
export const studyGuideProgress = pgTable(
  "study_guide_progress",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    furthestSectionId: text("furthest_section_id").notNull(),
    /** Sections read up to and including the furthest, out of `section_count`, when recorded. */
    furthestPosition: integer("furthest_position").notNull(),
    sectionCount: integer("section_count").notNull(),
    /** The section the user reached most recently, to resume from. */
    lastSectionId: text("last_section_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "study_guide_progress_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("study_guide_progress_resource_unique").on(table.resourceId),
    check(
      "study_guide_progress_position_valid",
      sql`${table.sectionCount} >= 1 and ${table.furthestPosition} between 1 and ${table.sectionCount}`,
    ),
    check(
      "study_guide_progress_section_format",
      sql`${table.furthestSectionId} ~ ${SECTION_ID} and ${table.lastSectionId} ~ ${SECTION_ID}`,
    ),
  ],
);

export type StudyGuideAnnotation = typeof studyGuideAnnotations.$inferSelect;
export type NewStudyGuideAnnotation = typeof studyGuideAnnotations.$inferInsert;
export type StudyGuideProgress = typeof studyGuideProgress.$inferSelect;
