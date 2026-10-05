import { DatabaseConfigError, parseDatabaseUrl } from "@medos/database";
import { StorageConfigError, isLocalHost, storageConfigFromEnv } from "@medos/storage";

import { parseEnv } from "@/env-schema";

import { AuthConfigError, resolveAuthConfig } from "./auth/config";

/*
 * Production readiness: every rule a deployment must meet, checked together so
 * one run lists everything to fix. Used by `npm run check:production` before a
 * deployment and by the server itself when it starts in production
 * (src/instrumentation.ts). Pure: it reads only the variables it is given.
 *
 * Nothing here depends on a hosting provider. A host without a lasting disk
 * (serverless, such as Vercel) is recognised by VERCEL being set, or declared
 * with MEDOS_EPHEMERAL_DISK=true on any other host.
 */

export interface ReadinessReport {
  /** Must be fixed: the deployment would not work, or would not be safe. */
  errors: string[];
  /** Allowed, but probably not what a real deployment wants. */
  warnings: string[];
  /** Things to set up outside MedOS. */
  notes: string[];
}

type Source = Record<string, string | undefined>;

const read = (source: Source, name: string) => source[name]?.trim() || undefined;
/** The listed problems of a multi-line configuration error (its "  - …" lines). */
const linesOf = (message: string) =>
  message
    .split("\n")
    .filter((line) => /^\s*-\s/.test(line))
    .map((line) => line.replace(/^\s*-\s*/, ""));

export function checkProductionReadiness(input: Source): ReadinessReport {
  const source = { ...input, NODE_ENV: "production" };
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  try {
    parseEnv(source);
  } catch (error) {
    errors.push(...linesOf((error as Error).message));
  }

  try {
    resolveAuthConfig(source);
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    errors.push(...linesOf(error.message));
  }

  const appUrl = read(source, "APP_URL");
  const url = appUrl && URL.canParse(appUrl) ? new URL(appUrl) : null;
  const local = url !== null && isLocalHost(url.hostname);
  if (url && !local && url.protocol !== "https:") {
    errors.push("APP_URL must use https:// for a deployment reachable from other devices.");
  }
  if (url && (url.pathname !== "/" || url.search || appUrl!.endsWith("/"))) {
    errors.push("APP_URL must be the origin only, without a path or a trailing slash.");
  }

  let database: ReturnType<typeof parseDatabaseUrl> | null = null;
  try {
    database = parseDatabaseUrl(read(source, "DATABASE_URL"));
  } catch (error) {
    if (!(error instanceof DatabaseConfigError)) throw error;
    errors.push(error.message);
  }

  let storage: ReturnType<typeof storageConfigFromEnv> | null = null;
  try {
    storage = storageConfigFromEnv(source);
  } catch (error) {
    if (!(error instanceof StorageConfigError)) throw error;
    errors.push(...error.problems);
  }

  const ephemeral =
    Boolean(read(source, "VERCEL")) || read(source, "MEDOS_EPHEMERAL_DISK") === "true";
  if (ephemeral) {
    if (database?.driver === "pglite") {
      errors.push(
        "This host has no lasting disk, so the embedded database would be lost: set DATABASE_URL to a PostgreSQL server (postgres://…).",
      );
    }
    if (storage?.provider === "local") {
      errors.push(
        "This host has no lasting disk, so stored lecture files would be lost: set STORAGE_PROVIDER=s3 and the STORAGE_* variables.",
      );
    }
  } else if (url && !local) {
    if (database?.driver === "pglite") {
      warnings.push(
        "The embedded database suits one always-on server with a lasting disk, opened by one process at a time. Use PostgreSQL for anything else.",
      );
    }
    if (storage?.provider === "local") {
      warnings.push(
        "Lecture files are kept in a local folder: it must be on a lasting disk, and MedOS Sync must write to the same folder.",
      );
    }
  }

  if (read(source, "DEV_FIXTURE_LECTURES") === "true") {
    warnings.push(
      "DEV_FIXTURE_LECTURES is on: new accounts get placeholder lectures. Leave it unset in production.",
    );
  }
  if (url && !local && !read(source, "AUTH_ALLOWED_EMAILS")) {
    warnings.push(
      "AUTH_ALLOWED_EMAILS is not set, so anyone who finds the address can create an account. Set it to your own address.",
    );
  }

  if (url && read(source, "AUTH_GOOGLE_CLIENT_ID")) {
    notes.push(
      `Google sign-in: add ${url.origin}/api/auth/callback/google as an authorised redirect URI in the Google Cloud console.`,
    );
  }
  if (database?.driver === "postgres") {
    notes.push(
      "Apply database migrations before this version serves requests: npm run db:migrate with this DATABASE_URL.",
    );
  }

  return { errors, warnings, notes };
}

/** The report as plain text, for a terminal or a server log. */
export function formatReadinessReport(report: ReadinessReport): string {
  const section = (title: string, items: string[]) =>
    items.length === 0 ? [] : [title, ...items.map((item) => `  - ${item}`), ""];
  const verdict =
    report.errors.length === 0
      ? "MedOS is ready for production with this configuration."
      : `MedOS is not ready for production: ${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} to fix.`;
  return [
    verdict,
    "",
    ...section("Problems", report.errors),
    ...section("Warnings", report.warnings),
    ...section("To set up", report.notes),
  ]
    .join("\n")
    .trimEnd();
}
