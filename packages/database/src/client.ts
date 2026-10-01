import { mkdirSync } from "node:fs";
import path from "node:path";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { type DatabaseTarget, parseDatabaseUrl } from "./config";
import { acquireDatabaseLock } from "./lock";
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
  /** Releases the connection. The handle must not be used afterwards. */
  close: () => Promise<void>;
}

/**
 * Opens the database described by a `DATABASE_URL` value. Drivers are loaded
 * on demand, so a deployment only loads the one it uses.
 */
export async function connect(databaseUrl: string | undefined): Promise<DatabaseConnection> {
  const target = parseDatabaseUrl(databaseUrl);

  if (target.driver === "pglite") {
    const [{ PGlite }, { drizzle }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
    ]);
    let release = () => {};
    if (target.dataDir) {
      mkdirSync(path.dirname(target.dataDir), { recursive: true });
      release = acquireDatabaseLock(target.dataDir);
    }
    const client = new PGlite(target.dataDir ?? undefined);
    return {
      db: drizzle(client, { schema }),
      driver: "pglite",
      close: async () => {
        try {
          await client.close();
        } finally {
          release();
        }
      },
    };
  }

  const [{ default: postgres }, { drizzle }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
  ]);
  // Notices (e.g. "relation already exists, skipping") are not errors; keep output quiet.
  const client = postgres(target.url, { onnotice: () => {} });
  return {
    db: drizzle(client, { schema }),
    driver: "postgres",
    close: () => client.end(),
  };
}
