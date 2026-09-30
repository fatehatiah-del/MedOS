import { sql } from "drizzle-orm";
import { check, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";

/**
 * The owner of study data. MedOS has one user today, but every owned table
 * carries `user_id` so access can be scoped per user from the start.
 *
 * `auth_subject` is the identifier issued by the authentication provider. It
 * stays empty until authentication is implemented (Phase 3).
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    authSubject: text("auth_subject"),
    ...timestamps,
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    unique("users_auth_subject_unique").on(table.authSubject),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
  ],
);

/** `user_id` column: every owned row points at its owner and blocks the owner's deletion. */
export const ownerId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" });

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
