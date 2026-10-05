import path from "node:path";
import { parseArgs } from "node:util";

import {
  type ObjectStore,
  StorageConfigError,
  createObjectStore,
  storageConfigFromEnv,
} from "@medos/storage";

import { type DatabaseConnection, connect } from "../client";
import { DatabaseConfigError, findWorkspaceRoot, loadLocalEnv, parseDatabaseUrl } from "../config";
import { DatabaseInUseError } from "../lock";
import { transferFiles } from "../transfer-files";
import { type TransferPlan, TransferError, planTransfer, runTransfer } from "../transfer";

const HELP = `MedOS — transfer your data to another database

Usage:
  npm run db:transfer                 Check, and show what would be copied. Changes nothing.
  npm run db:transfer -- --yes        Copy every table into the target, then verify it.
  npm run db:transfer -- --yes --files        Also copy lecture files to the target bucket.
  npm run db:transfer -- --yes --files-only   Copy only the files (the data was copied before).

Source: the database in DATABASE_URL (your local MedOS; stop MedOS first).
Target: TARGET_DATABASE_URL, an empty PostgreSQL database. Set it in the shell for
        this run only, never in a file, for example in PowerShell:
          $env:TARGET_DATABASE_URL = "postgres://…:5432/postgres"
Files:  copied from your local store to the bucket in TARGET_STORAGE_PROVIDER=s3,
        TARGET_STORAGE_BUCKET, TARGET_STORAGE_ENDPOINT, TARGET_STORAGE_REGION,
        TARGET_STORAGE_ACCESS_KEY_ID and TARGET_STORAGE_SECRET_ACCESS_KEY.

The target must be empty: MedOS never merges. The copy is one transaction and is kept
only if every table's row count and checksum match the source. See docs/deployment.md.`;

class CommandError extends Error {}

/** A database address for reports: driver, host and database name, never credentials. */
function describeTarget(url: string): string {
  const target = parseDatabaseUrl(url);
  if (target.driver === "pglite") return `embedded database ${target.dataDir ?? "(in memory)"}`;
  const parsed = new URL(target.url);
  return `PostgreSQL ${parsed.host}${parsed.pathname}`;
}

function sameDatabase(a: string, b: string): boolean {
  const left = parseDatabaseUrl(a);
  const right = parseDatabaseUrl(b);
  if (left.driver === "pglite" && right.driver === "pglite") {
    return left.dataDir !== null && left.dataDir === right.dataDir;
  }
  if (left.driver === "postgres" && right.driver === "postgres") {
    const [x, y] = [new URL(left.url), new URL(right.url)];
    return (
      x.hostname === y.hostname &&
      (x.port || "5432") === (y.port || "5432") &&
      x.pathname === y.pathname
    );
  }
  return false;
}

/** The local store (as MedOS uses it) and the target bucket (TARGET_STORAGE_*). */
function stores(): { source: ObjectStore; target: ObjectStore } {
  const local = (configured: string | null) =>
    configured
      ? path.resolve(findWorkspaceRoot(), configured)
      : path.join(findWorkspaceRoot(), ".medos", "objects");
  const targetVariables: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("TARGET_STORAGE_")) targetVariables[key.slice("TARGET_".length)] = value;
  }
  try {
    const targetConfig = storageConfigFromEnv(targetVariables);
    if (targetConfig.provider !== "s3") {
      throw new CommandError(
        "Set TARGET_STORAGE_PROVIDER=s3 and the TARGET_STORAGE_* variables to copy files.",
      );
    }
    return {
      source: createObjectStore(storageConfigFromEnv(process.env), local),
      target: createObjectStore(targetConfig, local),
    };
  } catch (error) {
    if (error instanceof StorageConfigError) {
      throw new CommandError(error.problems.map((problem) => `TARGET_${problem}`).join("\n"));
    }
    throw error;
  }
}

function planLines(plan: TransferPlan): string[] {
  const width = Math.max(...plan.tables.map((table) => table.name.length), 10);
  const rows = plan.tables.reduce((sum, table) => sum + table.rows, 0);
  return [
    `Schema: source at migration ${plan.sourceMigrations}, target ${
      plan.targetMigrations === 0
        ? "empty (will be brought up to date)"
        : `at migration ${plan.targetMigrations}`
    }.`,
    "",
    `To copy (${rows} rows in ${plan.tables.length} tables):`,
    ...plan.tables.map(
      (table) => `  ${table.name.padEnd(width)}  ${String(table.rows).padStart(7)}`,
    ),
    "",
    "Left behind:",
    ...plan.excluded.map(
      (table) =>
        `  ${table.name.padEnd(width)}  ${String(table.rows).padStart(7)}  ${table.reason}`,
    ),
  ];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      yes: { type: "boolean", default: false },
      files: { type: "boolean", default: false },
      "files-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }

  loadLocalEnv();
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL?.trim();
  if (!targetUrl) {
    throw new CommandError(`TARGET_DATABASE_URL is not set.\n\n${HELP}`);
  }
  if (!sourceUrl) throw new CommandError("DATABASE_URL (the source) is not set.");
  if (sameDatabase(sourceUrl, targetUrl)) {
    throw new CommandError("The source and target are the same database.");
  }

  console.log(`MedOS transfer${values.yes ? "" : " — check only (add --yes to copy)"}`);
  console.log(`  from: ${describeTarget(sourceUrl)}`);
  console.log(`  to:   ${describeTarget(targetUrl)}\n`);

  let source: DatabaseConnection | undefined;
  let target: DatabaseConnection | undefined;
  try {
    source = await connect(sourceUrl);
    target = await connect(targetUrl);

    if (!values["files-only"]) {
      const plan = await planTransfer(source, target);
      console.log(planLines(plan).join("\n"));
      if (plan.problems.length > 0) {
        throw new CommandError(
          `\nCannot transfer:\n${plan.problems.map((p) => `  - ${p}`).join("\n")}`,
        );
      }
      if (!values.yes) {
        console.log("\nEverything checks out. Run again with --yes to copy.");
        return;
      }

      console.log("\nCopying…");
      const result = await runTransfer(source, target, {
        onProgress: (table, copied, total) => {
          if (copied === total) console.log(`  ${table}: ${total} rows`);
        },
      });
      console.log(
        `\nDone: ${result.totalRows} rows in ${result.tables.length} tables, each matching the source by count and checksum.` +
          (result.migratedTarget ? " The target schema was created first." : ""),
      );
    }

    if (values.files || values["files-only"]) {
      if (!values.yes) {
        console.log("\nFiles: add --yes to copy them.");
        return;
      }
      const { source: from, target: to } = stores();
      console.log(`\nCopying files from ${from.describe()} to ${to.describe()}…`);
      const files = await transferFiles(source.db, from, to, {
        onProgress: (done, total) => {
          if (done === total || done % 25 === 0) console.log(`  ${done} of ${total}`);
        },
      });
      console.log(
        `Files: ${files.copied} copied, ${files.alreadyThere} already there, ${files.missing.length} missing locally.`,
      );
      if (files.missing.length > 0) {
        throw new CommandError(
          `These files are named by the database but not in the local store (run MedOS Sync against the target to restore them):\n${files.missing.map((key) => `  ${key}`).join("\n")}`,
        );
      }
    }
  } finally {
    await target?.close();
    await source?.close();
  }
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  if (error instanceof DatabaseInUseError) {
    console.error(
      "The local database is in use. Close MedOS (its black window) and run this again.",
    );
  } else if (
    error instanceof CommandError ||
    error instanceof TransferError ||
    error instanceof DatabaseConfigError
  ) {
    console.error(error.message);
  } else {
    console.error("db:transfer failed.");
    console.error(error);
  }
}
