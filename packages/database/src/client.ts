import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { type DatabaseTarget, parseDatabaseUrl } from "./config";
import * as schema from "./schema";

export type Schema = typeof schema;

/**
 * A MedOS database handle, independent of the driver behind it. Transactions
 * have the same type, so query code accepts either.
 */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DatabaseConnection {
  db: Database;
  driver: DatabaseTarget["driver"];
  /** Applies every migration that has not been applied yet. */
  migrate: () => Promise<void>;
  /** Releases the connection. The handle must not be used afterwards. */
  close: () => Promise<void>;
}

/** The tracked SQL migrations shipped with this package. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Opens the database described by a `DATABASE_URL` value. Drivers are loaded
 * on demand, so a deployment only loads the one it uses.
 */
export async function connect(databaseUrl: string | undefined): Promise<DatabaseConnection> {
  const target = parseDatabaseUrl(databaseUrl);

  if (target.driver === "pglite") {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    if (target.dataDir) mkdirSync(path.dirname(target.dataDir), { recursive: true });
    const client = new PGlite(target.dataDir ?? undefined);
    const db = drizzle(client, { schema });
    return {
      db,
      driver: "pglite",
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => client.close(),
    };
  }

  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
  ]);
  // Notices (e.g. "relation already exists, skipping") are not errors; keep output quiet.
  const client = postgres(target.url, { onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db,
    driver: "postgres",
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.end(),
  };
}
