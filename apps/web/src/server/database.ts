import "server-only";

import { type Database, type DatabaseConnection, connect } from "@medos/database";

/*
 * One database connection per server process.
 *
 * It is opened on first use, never at build time, and kept on `globalThis` so
 * that development hot reloads reuse it instead of opening another. Only code
 * under `src/server` may import this module: everything else reaches data
 * through the user-scoped helpers in `session.ts`.
 */

const store = globalThis as typeof globalThis & {
  __medosDatabase?: Promise<DatabaseConnection>;
};

export async function getDatabase(): Promise<Database> {
  if (!store.__medosDatabase) {
    const pending = connect(process.env.DATABASE_URL);
    store.__medosDatabase = pending;
    // A failed attempt (e.g. missing DATABASE_URL) must not be cached forever.
    pending.catch(() => {
      if (store.__medosDatabase === pending) delete store.__medosDatabase;
    });
  }
  return (await store.__medosDatabase).db;
}
