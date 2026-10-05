import { rmSync } from "node:fs";
import path from "node:path";

import { connect, parseDatabaseUrl } from "@medos/database";
import { migrate } from "@medos/database/migrate";

import { prepareJourneyFixture, prepareReaderFixture } from "./reader-fixture";

/*
 * Runs before the server under test starts: gives every E2E run a brand-new
 * database with the tracked migrations applied. Tests create their accounts
 * through the real sign-up flow; the one exception is the Study Guide reader's
 * account, whose synthetic material is imported here through MedOS Sync
 * (an embedded database cannot be written while the server holds it).
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
  await prepareReaderFixture(connection.db, path.dirname(target.dataDir));
  await prepareJourneyFixture(connection.db, path.dirname(target.dataDir));
} finally {
  // Closed before the server opens it: an embedded database allows one process at a time.
  await connection.close();
}
console.log("E2E database ready.");
