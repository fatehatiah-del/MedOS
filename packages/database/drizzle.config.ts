import { defineConfig } from "drizzle-kit";

import { loadLocalEnv, parseDatabaseUrl } from "./src/config";

/*
 * drizzle-kit configuration.
 *
 * `db:generate` and `db:check` only read the schema and need no database.
 * `db:studio` connects to whatever DATABASE_URL points at.
 */
loadLocalEnv();

function credentials() {
  if (!process.env.DATABASE_URL) return {};
  const target = parseDatabaseUrl(process.env.DATABASE_URL);
  if (target.driver === "postgres") return { dbCredentials: { url: target.url } };
  if (target.dataDir === null) {
    throw new Error("drizzle-kit cannot open an in-memory database; use a pglite:<directory> URL.");
  }
  return { driver: "pglite" as const, dbCredentials: { url: target.dataDir } };
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  strict: true,
  ...credentials(),
});
