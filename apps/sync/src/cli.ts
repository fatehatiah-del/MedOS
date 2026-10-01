import { parseArgs } from "node:util";

import {
  DatabaseConfigError,
  DatabaseInUseError,
  type DatabaseConnection,
  connect,
  loadLocalEnv,
  syncFiles,
} from "@medos/database";
import { migrate } from "@medos/database/migrate";
import { eq } from "drizzle-orm";

import { ConfigError, resolveSourceDir, resolveStorageDir, resolveUserEmail } from "./config";
import { formatScanReport, formatSyncReport } from "./report";
import { SyncError, findUserId } from "./state";
import { LocalObjectStore } from "./store";
import { runSync, scanAndClassify } from "./sync";

const HELP = `MedOS Sync — bring your study folder into MedOS, read-only.

Usage:
  npm run medos-sync -- <command> [options]

Commands:
  scan                 Read the source folder and show what MedOS finds. Uses no database.
  sync --dry-run       Show exactly what a sync would change. Changes nothing.
  sync                 Import: create weeks and lectures, attach materials, copy originals.
  status               Show what earlier syncs recorded.

Options:
  --source <folder>    The study folder (or MEDOS_SOURCE_DIR).
  --user <email>       The MedOS account to import into (or MEDOS_SYNC_USER).
  --dry-run            With sync: plan only.
  --remove-placeholders
                       With sync: remove development placeholder lectures first.
  --verbose            List every file, the structure, and skipped files.
  --help               Show this help.

The source folder is only ever read. Nothing in it is created, changed,
renamed, moved or deleted. Settings are read from apps/web/.env.local.
Stop the MedOS dev server first when using the embedded database.`;

async function withDatabase<T>(work: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
  const connection = await connect(process.env.DATABASE_URL);
  try {
    // A sync must never write to a schema older than its code.
    await migrate(connection);
    return await work(connection);
  } finally {
    await connection.close();
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      source: { type: "string" },
      user: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "remove-placeholders": { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  loadLocalEnv();
  const verbose = values.verbose;

  switch (command) {
    case "scan": {
      const source = resolveSourceDir(values.source ?? process.env.MEDOS_SOURCE_DIR);
      const { scan, classification } = await scanAndClassify(source);
      console.log(formatScanReport(scan, classification, verbose));
      return;
    }

    case "sync": {
      const source = resolveSourceDir(values.source ?? process.env.MEDOS_SOURCE_DIR);
      const storage = resolveStorageDir(process.env.MEDOS_STORAGE_DIR, source);
      const email = resolveUserEmail(values.user ?? process.env.MEDOS_SYNC_USER);
      const dryRun = values["dry-run"];
      await withDatabase(async ({ db }) => {
        const userId = await findUserId(db, email);
        const run = await runSync(db, userId, source, {
          store: new LocalObjectStore(storage),
          dryRun,
          removePlaceholders: values["remove-placeholders"],
        });
        console.log(formatSyncReport({ ...run, dryRun, verbose, storage }));
      });
      return;
    }

    case "status": {
      const email = resolveUserEmail(values.user ?? process.env.MEDOS_SYNC_USER);
      await withDatabase(async ({ db }) => {
        const userId = await findUserId(db, email);
        const rows = await db.select().from(syncFiles).where(eq(syncFiles.userId, userId));
        const byStatus = new Map<string, number>();
        for (const entry of rows) byStatus.set(entry.status, (byStatus.get(entry.status) ?? 0) + 1);
        const last = rows
          .map((entry) => entry.lastSyncedAt?.getTime() ?? 0)
          .reduce((latest, time) => Math.max(latest, time), 0);

        const lines = ["MedOS Sync — status", "", `  Files on record      ${rows.length}`];
        for (const [status, count] of [...byStatus].sort()) {
          lines.push(`  ${status.padEnd(21)}${count}`);
        }
        lines.push(`  Last sync            ${last ? new Date(last).toISOString() : "never"}`);
        for (const status of ["needs-review", "missing"]) {
          const listed = rows.filter((entry) => entry.status === status);
          if (listed.length === 0) continue;
          lines.push(
            "",
            status === "missing" ? "Missing from the source folder:" : "Needs review:",
          );
          for (const entry of listed) {
            lines.push(
              `  ${entry.relativePath}${entry.classificationReason && status === "needs-review" ? `: ${entry.classificationReason}` : ""}`,
            );
          }
        }
        console.log(lines.join("\n"));
      });
      return;
    }

    default:
      throw new ConfigError(`Unknown command "${command}". Run with --help to see the commands.`);
  }
}

const KNOWN_ERRORS = [ConfigError, SyncError, DatabaseConfigError, DatabaseInUseError];

main(process.argv.slice(2)).catch((error: unknown) => {
  process.exitCode = 1;
  if (KNOWN_ERRORS.some((type) => error instanceof type)) {
    console.error(`medos-sync: ${(error as Error).message}`);
  } else if (
    error instanceof TypeError &&
    "code" in error &&
    String(error.code).startsWith("ERR_PARSE_ARGS")
  ) {
    console.error(`medos-sync: ${error.message}. Run with --help to see the options.`);
  } else {
    console.error("medos-sync failed. Nothing in the source folder was changed.");
    console.error(error);
  }
});
