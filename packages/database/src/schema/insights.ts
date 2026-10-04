import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { courses } from "./academic";
import { id, timestamps } from "./columns";
import { ownerId } from "./users";

/**
 * A concept the user has marked as difficult (specification §28), in their
 * own words, within one course. It is a signal of its own in the weakness
 * engine, and is joined to an MCQ topic of the same name when there is one.
 */
export const difficultConcepts = pgTable(
  "difficult_concepts",
  {
    id: id(),
    userId: ownerId(),
    courseId: uuid("course_id").notNull(),
    label: text("label").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "difficult_concepts_course_fk",
      columns: [table.courseId, table.userId],
      foreignColumns: [courses.id, courses.userId],
    }).onDelete("restrict"),
    // The same concept once per course, whatever its capitals or spacing.
    uniqueIndex("difficult_concepts_label_unique").on(
      table.userId,
      table.courseId,
      sql`lower(btrim(${table.label}))`,
    ),
    index("difficult_concepts_course_idx").on(table.courseId),
    check(
      "difficult_concepts_label_length",
      sql`char_length(btrim(${table.label})) between 1 and 120`,
    ),
  ],
);

export type DifficultConceptRow = typeof difficultConcepts.$inferSelect;
