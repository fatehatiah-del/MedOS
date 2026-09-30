import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";
import { users } from "./users";

/*
 * Authentication tables, owned by the authentication framework (Better Auth).
 *
 * They hold how a user signs in and which sessions are open. They are not
 * part of the academic domain: nothing in MedOS reads them except through the
 * framework, and no study data references them. The `auth_` prefix keeps that
 * boundary visible.
 *
 * Unlike study data, these rows have no value without their user, so they are
 * the only tables that are removed together with the user (ON DELETE CASCADE).
 */

const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** An open session. The browser holds only a signed cookie containing `token`. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: userId(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    unique("auth_sessions_token_unique").on(table.token),
    index("auth_sessions_user_idx").on(table.userId),
  ],
);

/**
 * One way of signing in as a user: `provider_id` is "credential" for email and
 * password, or the identity provider's name (e.g. "google"); `account_id` is
 * the user's identifier at that provider.
 *
 * `password` holds a salted scrypt hash, never a password. It is only ever
 * read by the authentication framework and must never be selected into
 * anything that reaches a client.
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: userId(),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    ...timestamps,
  },
  (table) => [
    // An external identity maps to exactly one user.
    unique("auth_accounts_provider_account_unique").on(table.providerId, table.accountId),
    index("auth_accounts_user_idx").on(table.userId),
  ],
);

/** Short-lived values the framework needs to verify a flow, such as OAuth state. */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

/**
 * Request counters for rate limiting sign-in and sign-up. Stored in the
 * database so limits hold across server instances.
 */
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: id(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [unique("auth_rate_limits_key_unique").on(table.key)],
);
