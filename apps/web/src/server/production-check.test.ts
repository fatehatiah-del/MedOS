// @vitest-environment node
import { describe, expect, it } from "vitest";

import { checkProductionReadiness, formatReadinessReport } from "./production-check";

/*
 * The production readiness rules: everything a deployment must meet, reported
 * together, for a hosted (serverless) deployment, a self-hosted server and
 * this computer.
 */

const SECRET = "a".repeat(40);

/** A complete hosted deployment: PostgreSQL behind a pooler, an S3 bucket, one allowed account. */
const HOSTED = {
  APP_URL: "https://medos.example",
  AUTH_SECRET: SECRET,
  AUTH_ALLOWED_EMAILS: "student@example.com",
  DATABASE_URL: "postgres://medos:secret@pooler.example:6543/postgres?pgbouncer=true",
  STORAGE_PROVIDER: "s3",
  STORAGE_BUCKET: "medos",
  STORAGE_ENDPOINT: "https://project.supabase.co/storage/v1/s3",
  STORAGE_REGION: "eu-central-1",
  STORAGE_ACCESS_KEY_ID: "id",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  VERCEL: "1",
};

describe("production readiness", () => {
  it("passes a complete hosted deployment, noting the migration step", () => {
    const report = checkProductionReadiness(HOSTED);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.notes).toEqual([
      "Apply database migrations before this version serves requests: npm run db:migrate with this DATABASE_URL.",
    ]);
    expect(formatReadinessReport(report)).toMatch(/^MedOS is ready for production/);
  });

  it("lists every missing essential at once", () => {
    const report = checkProductionReadiness({});
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "AUTH_SECRET is not set. Generate one with: npm run auth:secret",
        "APP_URL must be set in production.",
        expect.stringMatching(/DATABASE_URL/),
      ]),
    );
    expect(formatReadinessReport(report)).toMatch(
      /^MedOS is not ready for production: \d+ problems/,
    );
  });

  it("refuses local disk storage and the embedded database on a host without a lasting disk", () => {
    const report = checkProductionReadiness({
      ...HOSTED,
      DATABASE_URL: "pglite:./.medos/pgdata",
      STORAGE_PROVIDER: "",
    });
    expect(report.errors).toEqual([
      expect.stringMatching(/embedded database would be lost/),
      expect.stringMatching(/stored lecture files would be lost/),
    ]);
    // The same rule on any other serverless host, declared explicitly.
    const declared = checkProductionReadiness({
      ...HOSTED,
      VERCEL: "",
      MEDOS_EPHEMERAL_DISK: "true",
      STORAGE_PROVIDER: "local",
    });
    expect(declared.errors).toEqual([expect.stringMatching(/stored lecture files would be lost/)]);
  });

  it("requires https and a bare origin for a public address", () => {
    expect(checkProductionReadiness({ ...HOSTED, APP_URL: "http://medos.example" }).errors).toEqual(
      ["APP_URL must use https:// for a deployment reachable from other devices."],
    );
    expect(
      checkProductionReadiness({ ...HOSTED, APP_URL: "https://medos.example/" }).errors,
    ).toEqual(["APP_URL must be the origin only, without a path or a trailing slash."]);
  });

  it("warns, without failing, about an open sign-up and placeholder lectures", () => {
    const report = checkProductionReadiness({
      ...HOSTED,
      AUTH_ALLOWED_EMAILS: "",
      DEV_FIXTURE_LECTURES: "true",
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      expect.stringMatching(/^DEV_FIXTURE_LECTURES is on/),
      expect.stringMatching(/^AUTH_ALLOWED_EMAILS is not set/),
    ]);
  });

  it("accepts this computer's setup: localhost over http, embedded database, local folder", () => {
    const report = checkProductionReadiness({
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: SECRET,
      DATABASE_URL: "pglite:./.medos/pgdata",
    });
    expect(report).toEqual({ errors: [], warnings: [], notes: [] });
  });

  it("warns that a self-hosted server must keep its disk", () => {
    const report = checkProductionReadiness({
      ...HOSTED,
      VERCEL: "",
      DATABASE_URL: "pglite:/srv/medos/pgdata",
      STORAGE_PROVIDER: "local",
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      expect.stringMatching(/^The embedded database suits one always-on server/),
      expect.stringMatching(/^Lecture files are kept in a local folder/),
    ]);
  });

  it("gives the Google redirect address to register when Google sign-in is on", () => {
    const report = checkProductionReadiness({
      ...HOSTED,
      AUTH_GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      AUTH_GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(report.notes).toContain(
      "Google sign-in: add https://medos.example/api/auth/callback/google as an authorised redirect URI in the Google Cloud console.",
    );
  });

  it("reports invalid storage settings by name", () => {
    const report = checkProductionReadiness({ ...HOSTED, STORAGE_BUCKET: "" });
    expect(report.errors).toEqual(["STORAGE_BUCKET is required when STORAGE_PROVIDER=s3."]);
  });
});
