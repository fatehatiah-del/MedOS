import path from "node:path";

import { describe, expect, it } from "vitest";

import { DatabaseConfigError, findWorkspaceRoot, parseDatabaseUrl } from "./config";

const root = path.resolve("/workspace");

describe("parseDatabaseUrl", () => {
  it("recognises PostgreSQL server URLs", () => {
    expect(parseDatabaseUrl("postgres://user:secret@localhost:5432/medos")).toEqual({
      driver: "postgres",
      url: "postgres://user:secret@localhost:5432/medos",
    });
    expect(parseDatabaseUrl("postgresql://db.example/medos").driver).toBe("postgres");
  });

  it("resolves an embedded database directory against the repository root", () => {
    const expected = { driver: "pglite", dataDir: path.join(root, ".medos", "pgdata") };
    expect(parseDatabaseUrl("pglite:./.medos/pgdata", { root })).toEqual(expected);
    expect(parseDatabaseUrl("pglite://./.medos/pgdata", { root })).toEqual(expected);
  });

  it("keeps absolute embedded paths as they are", () => {
    const absolute = path.resolve("/data/medos");
    expect(parseDatabaseUrl(`pglite:${absolute}`, { root })).toEqual({
      driver: "pglite",
      dataDir: absolute,
    });
  });

  it("supports an in-memory database for tests", () => {
    expect(parseDatabaseUrl("pglite:memory")).toEqual({ driver: "pglite", dataDir: null });
  });

  it("explains how to fix a missing URL", () => {
    expect(() => parseDatabaseUrl(undefined)).toThrow(DatabaseConfigError);
    expect(() => parseDatabaseUrl("")).toThrow(/DATABASE_URL is not set.*\.env\.example/);
  });

  it("rejects unsupported schemes without echoing the value", () => {
    const attempt = () => parseDatabaseUrl("mysql://user:secret@localhost/medos");
    expect(attempt).toThrow(/must start with/);
    expect(attempt).not.toThrow(/secret/);
  });
});

describe("findWorkspaceRoot", () => {
  it("finds the monorepo root from inside a package", () => {
    const found = findWorkspaceRoot(import.meta.dirname);
    expect(path.basename(path.join(found, "packages", "database"))).toBe("database");
    expect(found).toBe(findWorkspaceRoot(found));
  });
});
