import { fileURLToPath } from "node:url";

import type { DatabaseConnection } from "./client";

/*
 * Kept apart from the client so that applications which only query the
 * database never load the migrator or resolve the migrations folder.
 */

/** The tracked SQL migrations shipped with this package. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies every migration that has not been applied yet. */
export async function migrate(connection: DatabaseConnection): Promise<void> {
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  // Each driver ships its own migrator; the handle was created by the matching driver.
  if (connection.driver === "pglite") {
    const migrator = await import("drizzle-orm/pglite/migrator");
    await migrator.migrate(connection.db as Parameters<typeof migrator.migrate>[0], config);
  } else {
    const migrator = await import("drizzle-orm/postgres-js/migrator");
    await migrator.migrate(connection.db as Parameters<typeof migrator.migrate>[0], config);
  }
}
