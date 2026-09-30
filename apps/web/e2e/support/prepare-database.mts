import { rmSync } from "node:fs";

import { connect, parseDatabaseUrl } from "@medos/database";
import { migrate } from "@medos/database/migrate";

/*
 * Runs before the server under test starts: gives every E2E run a brand-new
 * database with the tracked migrations applied and no users. Tests then create
 * their accounts through the real sign-up flow.
 */

const target = parseDatabaseUrl(process.env.DATABASE_URL);

// This script deletes the database it is pointed at. Refuse anything but the E2E scratch folder.
if (target.driver !== "pglite" || target.dataDir === null || !target.dataDir.includes(".e2e")) {
  throw new Error("The E2E database must be an embedded database inside a .e2e folder.");
}

rmSync(target.dataDir, { recursive: true, force: true });

const connection = await connect(process.env.DATABASE_URL);
try {
  await migrate(connection);
} finally {
  // Closed before the server opens it: an embedded database allows one process at a time.
  await connection.close();
}
console.log("E2E database ready.");
