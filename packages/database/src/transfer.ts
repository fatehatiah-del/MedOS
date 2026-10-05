import { type SQL, sql } from "drizzle-orm";

import type { Database, DatabaseConnection } from "./client";
import { migrate } from "./migrate";

/*
 * Transfer: an exact copy of a MedOS database into another, empty one, such as
 * the local embedded database into the hosted PostgreSQL server.
 *
 * - Exact: rows travel as PostgreSQL's own JSON of them and are rebuilt by
 *   PostgreSQL on the other side, so ids, timestamps (to the microsecond),
 *   JSON and numbers arrive unchanged. Nothing is converted in JavaScript.
 * - Complete: every table is found in the database itself and copied in
 *   foreign-key order, so a table added later is included without a change
 *   here. Only sign-in sessions, one-time tokens and rate-limit counters stay
 *   behind (EXCLUDED_TABLES): they belong to a device and a moment.
 * - Safe: the target must be at the same schema version (an empty target is
 *   brought up to date first) and hold no rows at all; MedOS never merges.
 *   The copy is one transaction, and before it commits every table's row
 *   count and checksum must equal the source's. Otherwise it rolls back and
 *   the target is left as it was. The source is only ever read.
 */

/** Tables not copied, and why. Every other table in the database is. */
export const EXCLUDED_TABLES: Readonly<Record<string, string>> = {
  auth_sessions: "sign-in sessions belong to a device; sign in again on the new server",
  auth_verifications: "one-time sign-in tokens expire within minutes",
  auth_rate_limits: "temporary counters of recent sign-in attempts",
};

/** Rows per batch: small enough for large parsed documents, large enough to be quick. */
const BATCH_ROWS = 100;
const NO_ID = "00000000-0000-0000-0000-000000000000";

export class TransferError extends Error {
  override name = "TransferError";
}

export interface TableInfo {
  name: string;
  /** Columns copied: every stored (not generated) column, in table order. */
  columns: string[];
}

export interface TableCount {
  name: string;
  rows: number;
}

export interface TransferPlan {
  /** Tables to copy, in the order they will be written, with their row counts. */
  tables: TableCount[];
  /** Tables left behind, with their row counts and the reason. */
  excluded: (TableCount & { reason: string })[];
  /** Migrations applied to the source, and to the target (0 for a new database). */
  sourceMigrations: number;
  targetMigrations: number;
  /** Why the transfer cannot go ahead. Empty when it can. */
  problems: string[];
}

export interface TableCheck extends TableCount {
  checksum: string;
}

export interface TransferResult {
  tables: TableCheck[];
  totalRows: number;
  /** Whether the target was brought to the source's schema version first. */
  migratedTarget: boolean;
}

type Executor = Pick<Database, "execute">;

/** Result rows of a raw query, whichever driver ran it. */
async function query<T>(db: Executor, statement: SQL): Promise<T[]> {
  const result = (await db.execute(statement)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const name = (identifier: string) => sql.identifier(identifier);
const columnList = (columns: string[]) =>
  sql.join(
    columns.map((column) => name(column)),
    sql`, `,
  );

/** The base tables of the public schema, with their stored columns. */
async function listTables(db: Executor): Promise<TableInfo[]> {
  const rows = await query<{ table_name: string; column_name: string }>(
    db,
    sql`select c.table_name, c.column_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
          and c.is_generated = 'NEVER'
        order by c.table_name, c.ordinal_position`,
  );
  const tables = new Map<string, string[]>();
  for (const row of rows) {
    const columns = tables.get(row.table_name) ?? [];
    columns.push(row.column_name);
    tables.set(row.table_name, columns);
  }
  return [...tables].map(([table, columns]) => ({ name: table, columns }));
}

/** Tables ordered so that each comes after every table it references. */
async function inDependencyOrder(db: Executor, tables: TableInfo[]): Promise<TableInfo[]> {
  const references = await query<{ child: string; parent: string }>(
    db,
    sql`select distinct tc.table_name as child, ccu.table_name as parent
        from information_schema.table_constraints tc
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  const byName = new Map(tables.map((table) => [table.name, table]));
  const parents = new Map<string, Set<string>>();
  for (const { child, parent } of references) {
    if (child === parent || !byName.has(child) || !byName.has(parent)) continue;
    const set = parents.get(child) ?? new Set();
    set.add(parent);
    parents.set(child, set);
  }
  const ordered: TableInfo[] = [];
  const placed = new Set<string>();
  // Alphabetical among equals, so the order is the same on every run.
  const remaining = [...tables].sort((a, b) => a.name.localeCompare(b.name));
  while (remaining.length > 0) {
    const index = remaining.findIndex((table) =>
      [...(parents.get(table.name) ?? [])].every((parent) => placed.has(parent)),
    );
    if (index < 0) {
      throw new TransferError(
        `The tables ${remaining.map((table) => table.name).join(", ")} reference each other in a cycle.`,
      );
    }
    const [next] = remaining.splice(index, 1);
    ordered.push(next!);
    placed.add(next!.name);
  }
  return ordered;
}

/** The hashes of the migrations applied to a database, oldest first. Empty for a new database. */
async function appliedMigrations(db: Executor): Promise<string[]> {
  const [exists] = await query<{ present: boolean }>(
    db,
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
  );
  if (!exists?.present) return [];
  const rows = await query<{ hash: string }>(
    db,
    sql`select hash from drizzle.__drizzle_migrations order by id`,
  );
  return rows.map((row) => row.hash);
}

async function countRows(db: Executor, table: string): Promise<number> {
  const [row] = await query<{ n: number | string }>(
    db,
    sql`select count(*)::int as n from ${name(table)}`,
  );
  return Number(row?.n ?? 0);
}

/**
 * The same text for the same data on any PostgreSQL server: times in UTC and
 * in ISO form, floats with full precision. Only inside a transaction.
 */
async function fixOutputFormat(db: Executor): Promise<void> {
  await db.execute(sql`set local timezone = 'UTC'`);
  await db.execute(sql`set local datestyle = 'ISO, YMD'`);
  await db.execute(sql`set local intervalstyle = 'postgres'`);
  await db.execute(sql`set local extra_float_digits = 1`);
}

/** Row count and a digest of every stored value, in id order. */
async function checksum(db: Executor, table: TableInfo): Promise<TableCheck> {
  const [row] = await query<{ n: number | string; digest: string }>(
    db,
    sql`select count(*)::int as n,
               coalesce(md5(string_agg(row(${columnList(table.columns)})::text, E'\n' order by "id")), '') as digest
        from ${name(table.name)}`,
  );
  return { name: table.name, rows: Number(row?.n ?? 0), checksum: row?.digest ?? "" };
}

/** Copies one table in id order, in batches, exactly as PostgreSQL stores it. */
async function copyTable(
  source: Executor,
  target: Executor,
  table: TableInfo,
  onBatch: (rows: number) => void,
): Promise<void> {
  if (!table.columns.includes("id")) {
    throw new TransferError(`The table ${table.name} has no id column to copy it by.`);
  }
  const columns = columnList(table.columns);
  let after = NO_ID;
  for (;;) {
    const rows = await query<{ id: string; data: string }>(
      source,
      sql`select r.id::text as id, row_to_json(r)::text as data
          from (select ${columns} from ${name(table.name)} where "id" > ${after}::uuid order by "id" limit ${BATCH_ROWS}) r
          order by r.id`,
    );
    if (rows.length === 0) return;
    await target.execute(
      sql`insert into ${name(table.name)} (${columns})
          select ${columns} from json_populate_recordset(null::${name(table.name)}, ${`[${rows.map((row) => row.data).join(",")}]`}::json)`,
    );
    onBatch(rows.length);
    after = rows.at(-1)!.id;
  }
}

/** What a transfer would do, and anything that stops it. Reads both databases; writes nothing. */
export async function planTransfer(
  source: DatabaseConnection,
  target: DatabaseConnection,
): Promise<TransferPlan> {
  const problems: string[] = [];
  const [sourceMigrations, targetMigrations] = await Promise.all([
    appliedMigrations(source.db),
    appliedMigrations(target.db),
  ]);
  if (sourceMigrations.length === 0) {
    problems.push("The source database has no MedOS schema. Check DATABASE_URL.");
  }
  const versionsAgree =
    targetMigrations.length === 0 ||
    (targetMigrations.length === sourceMigrations.length &&
      targetMigrations.every((hash, index) => hash === sourceMigrations[index]));
  if (!versionsAgree) {
    problems.push(
      targetMigrations.length < sourceMigrations.length &&
        targetMigrations.every((hash, index) => hash === sourceMigrations[index])
        ? "The target database is at an older MedOS version than the source. Run npm run db:migrate against the target, then transfer again."
        : "The source and target databases are at different MedOS versions. Bring both up to date with npm run db:migrate, then transfer again.",
    );
  }

  const tables = await inDependencyOrder(source.db, await listTables(source.db));
  for (const excluded of Object.keys(EXCLUDED_TABLES)) {
    if (!tables.some((table) => table.name === excluded)) {
      problems.push(`The excluded table ${excluded} does not exist in the source.`);
    }
  }
  const counts = await Promise.all(
    tables.map(async (table) => ({
      name: table.name,
      rows: await countRows(source.db, table.name),
    })),
  );

  if (targetMigrations.length > 0) {
    const occupied: string[] = [];
    for (const table of await listTables(target.db)) {
      if ((await countRows(target.db, table.name)) > 0) occupied.push(table.name);
    }
    if (occupied.length > 0) {
      problems.push(
        `The target database already holds data (${occupied.join(", ")}). MedOS copies only into an empty database and never merges.`,
      );
    }
  }

  return {
    tables: counts.filter((table) => !(table.name in EXCLUDED_TABLES)),
    excluded: counts
      .filter((table) => table.name in EXCLUDED_TABLES)
      .map((table) => ({ ...table, reason: EXCLUDED_TABLES[table.name]! })),
    sourceMigrations: sourceMigrations.length,
    targetMigrations: targetMigrations.length,
    problems,
  };
}

/**
 * Copies the source into the target. Throws TransferError, with the target
 * unchanged, when the plan has a problem or the copy does not check out.
 */
export async function runTransfer(
  source: DatabaseConnection,
  target: DatabaseConnection,
  {
    onProgress = () => {},
  }: { onProgress?: (table: string, copied: number, total: number) => void } = {},
): Promise<TransferResult> {
  const plan = await planTransfer(source, target);
  if (plan.problems.length > 0) throw new TransferError(plan.problems.join("\n"));

  // An empty target gets the schema first; migrations only ever add.
  const migratedTarget = plan.targetMigrations === 0;
  if (migratedTarget) {
    await migrate(target);
    const after = await planTransfer(source, target);
    if (after.problems.length > 0) throw new TransferError(after.problems.join("\n"));
  }

  const tables = (await inDependencyOrder(source.db, await listTables(source.db))).filter(
    (table) => !(table.name in EXCLUDED_TABLES),
  );

  // One consistent view of the source for the whole copy and its checks.
  return source.db.transaction(async (sourceTx) => {
    await fixOutputFormat(sourceTx);
    const expected = new Map<string, TableCheck>();
    for (const table of tables) expected.set(table.name, await checksum(sourceTx, table));

    return target.db.transaction(async (targetTx) => {
      await fixOutputFormat(targetTx);
      for (const table of tables) {
        const total = expected.get(table.name)!.rows;
        let copied = 0;
        onProgress(table.name, 0, total);
        await copyTable(sourceTx, targetTx, table, (rows) => {
          copied += rows;
          onProgress(table.name, copied, total);
        });
      }

      // Every table must match before anything is kept.
      const checks: TableCheck[] = [];
      const mismatched: string[] = [];
      for (const table of tables) {
        const actual = await checksum(targetTx, table);
        const wanted = expected.get(table.name)!;
        if (actual.rows !== wanted.rows || actual.checksum !== wanted.checksum) {
          mismatched.push(`${table.name} (${actual.rows} of ${wanted.rows} rows)`);
        }
        checks.push(actual);
      }
      if (mismatched.length > 0) {
        throw new TransferError(
          `The copy did not match the source, so nothing was kept: ${mismatched.join(", ")}.`,
        );
      }
      return {
        tables: checks,
        totalRows: checks.reduce((sum, table) => sum + table.rows, 0),
        migratedTarget,
      };
    });
  });
}
