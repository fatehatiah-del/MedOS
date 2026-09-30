import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Options for `onConflictDoUpdate` that overwrite the given columns with the
 * incoming values, but only when at least one of them actually differs.
 *
 * An unchanged row is left completely alone, including its `updated_at`, which
 * is what makes re-running a seed a true no-op.
 */
export function overwriteWhenChanged<T extends Record<string, PgColumn>>(columns: T) {
  const entries = Object.entries(columns);
  const incoming = (column: PgColumn) => sql.raw(`excluded."${column.name}"`);

  const current = sql.join(
    entries.map(([, column]) => sql`${column}`),
    sql`, `,
  );
  const proposed = sql.join(
    entries.map(([, column]) => incoming(column)),
    sql`, `,
  );

  return {
    set: Object.fromEntries(entries.map(([key, column]) => [key, incoming(column)])) as {
      [K in keyof T]: SQL;
    },
    setWhere: sql`(${current}) is distinct from (${proposed})`,
  };
}
