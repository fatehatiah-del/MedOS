import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * Where the database lives, decided entirely by `DATABASE_URL`:
 *
 * - `postgres://…` or `postgresql://…` — a PostgreSQL server (any host).
 * - `pglite:<directory>` — embedded PostgreSQL stored in a local directory.
 *   For local development without installing a server.
 * - `pglite:memory` — embedded PostgreSQL in memory. For tests.
 */
export type DatabaseTarget =
  { driver: "postgres"; url: string } | { driver: "pglite"; dataDir: string | null };

const PGLITE_PREFIX = "pglite:";

const databaseUrlSchema = z
  .string({ error: "DATABASE_URL is not set." })
  .trim()
  .min(1, "DATABASE_URL is not set.")
  .refine(
    (value) => /^postgres(ql)?:\/\/.+/.test(value) || /^pglite:.+/.test(value),
    'DATABASE_URL must start with "postgres://", "postgresql://" or "pglite:".',
  );

export class DatabaseConfigError extends Error {
  override name = "DatabaseConfigError";
}

/** Directory of the monorepo root: the nearest ancestor whose package.json declares workspaces. */
export function findWorkspaceRoot(from: string = process.cwd()): string {
  let current = path.resolve(from);
  for (;;) {
    const manifest = path.join(current, "package.json");
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
      if (typeof parsed === "object" && parsed !== null && "workspaces" in parsed) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(from);
    current = parent;
  }
}

/**
 * Validates a database URL and resolves it to a driver. Relative PGlite
 * directories are resolved against the repository root, so every command
 * finds the same database whichever folder it is run from.
 */
export function parseDatabaseUrl(
  value: string | undefined,
  options: { root?: string } = {},
): DatabaseTarget {
  const result = databaseUrlSchema.safeParse(value);
  if (!result.success) {
    const reason = result.error.issues[0]?.message ?? "DATABASE_URL is invalid.";
    throw new DatabaseConfigError(
      `${reason} Copy .env.example to apps/web/.env.local and set DATABASE_URL.`,
    );
  }

  const url = result.data;
  if (!url.startsWith(PGLITE_PREFIX)) return { driver: "postgres", url };

  // Accept both "pglite:./dir" and "pglite://./dir".
  const location = url.slice(PGLITE_PREFIX.length).replace(/^\/\/(?!\/)/, "");
  if (location === "memory") return { driver: "pglite", dataDir: null };
  const root = options.root ?? findWorkspaceRoot();
  return { driver: "pglite", dataDir: path.resolve(root, location) };
}

/**
 * Loads `apps/web/.env.local` (the project's single local environment file)
 * for command-line tools. Variables already set in the environment win.
 */
export function loadLocalEnv(root: string = findWorkspaceRoot()): void {
  const file = path.join(root, "apps", "web", ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}
