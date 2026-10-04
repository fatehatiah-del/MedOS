import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { SEARCH_ENTRY_KINDS } from "./values";

/**
 * The search index of parsed material: one row per Study Guide section, MCQ
 * question or Question Bank item, as plain text. Derived data only: it is
 * rebuilt from `resource_contents` whenever a resource's content changes
 * (`source_content_hash` records which content it was built from), and the
 * original files and parsed content stay the source of truth.
 */
export const searchEntries = pgTable(
  "search_entries",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    kind: text("kind", { enum: SEARCH_ENTRY_KINDS }).notNull(),
    /** Where in the resource: a section id, or a question key such as "q3". */
    anchor: text("anchor").notNull(),
    /** Order within the resource. */
    position: integer("position").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceContentHash: text("source_content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "search_entries_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("search_entries_anchor_unique").on(table.resourceId, table.kind, table.anchor),
    index("search_entries_user_idx").on(table.userId, table.kind),
    check("search_entries_kind_valid", oneOf(table.kind, SEARCH_ENTRY_KINDS)),
    check("search_entries_position", sql`${table.position} >= 0`),
  ],
);

export type SearchEntry = typeof searchEntries.$inferSelect;
export type NewSearchEntry = typeof searchEntries.$inferInsert;
