import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { lectures } from "./academic";
import { id, timestamps } from "./columns";
import { ownerId } from "./users";

/*
 * The user's own notebook for a lecture: free-form rich-text notes written
 * beside the Study Guide, in place of a separate document elsewhere.
 *
 * One notebook per lecture. The document is stored as the editor's JSON
 * (never as HTML), so it is only ever rendered through the editor's schema.
 * A plain-text copy serves search and excerpts. `revision` increases on
 * every save; a save made against an older revision is refused, so two open
 * tabs never silently overwrite each other.
 *
 * Nothing here touches the parsed Study Guide or lecture completion.
 */

/** A notebook document as the editor stores it. */
export interface NotebookDocument {
  type: "doc";
  content?: unknown[];
}

export const lectureNotebooks = pgTable(
  "lecture_notebooks",
  {
    id: id(),
    userId: ownerId(),
    lectureId: uuid("lecture_id").notNull(),
    content: jsonb("content").$type<NotebookDocument>().notNull(),
    plainText: text("plain_text").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "lecture_notebooks_lecture_fk",
      columns: [table.lectureId, table.userId],
      foreignColumns: [lectures.id, lectures.userId],
    }).onDelete("restrict"),
    unique("lecture_notebooks_lecture_unique").on(table.lectureId),
    check("lecture_notebooks_revision_positive", sql`${table.revision} >= 1`),
    check("lecture_notebooks_content_is_doc", sql`${table.content}->>'type' = 'doc'`),
    check("lecture_notebooks_content_size", sql`octet_length(${table.content}::text) <= 2000000`),
    check("lecture_notebooks_text_length", sql`char_length(${table.plainText}) <= 200000`),
  ],
);

export type LectureNotebook = typeof lectureNotebooks.$inferSelect;
