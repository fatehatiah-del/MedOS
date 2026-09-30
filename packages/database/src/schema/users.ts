import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";

/**
 * A MedOS user: the owner of study data, and the same record the
 * authentication framework signs in. There is one user concept, not two.
 *
 * How someone proves they are this user (a password, a Google account) is
 * kept out of this table, in `auth_accounts`. Every owned table carries
 * `user_id`, so access is scoped per user.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    /** Set only once the address has been proven, e.g. by Google. */
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: text("display_name").notNull(),
    /** Profile picture URL supplied by an identity provider, if any. */
    image: text("image"),
    ...timestamps,
  },
  (table) => [
    unique("users_email_unique").on(table.email),
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
