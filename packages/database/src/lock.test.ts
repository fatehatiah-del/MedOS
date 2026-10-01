import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { connect } from "./client";
import { DatabaseInUseError, acquireDatabaseLock } from "./lock";

const folders: string[] = [];

function scratch(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "medos-lock-"));
  folders.push(folder);
  return path.join(folder, "pgdata");
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A real, separate, still-running process to own a lock. */
function otherProcess() {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
    stdio: "ignore",
  });
  return { pid: child.pid ?? 0, stop: () => child.kill() };
}

describe("embedded database lock", () => {
  it("is taken when the database is opened and released when it is closed", async () => {
    const dataDir = scratch();
    const connection = await connect(`pglite:${dataDir}`);

    expect(readFileSync(`${dataDir}.lock`, "utf8")).toBe(String(process.pid));
    await connection.close();
    expect(existsSync(`${dataDir}.lock`)).toBe(false);
  });

  it("refuses a second process while the first is running", () => {
    const dataDir = scratch();
    const owner = otherProcess();
    try {
      writeFileSync(`${dataDir}.lock`, String(owner.pid));
      expect(() => acquireDatabaseLock(dataDir)).toThrow(DatabaseInUseError);
      expect(() => acquireDatabaseLock(dataDir)).toThrow(/dev server/);
    } finally {
      owner.stop();
    }
  });

  it("takes over a lock left behind by a process that has exited", () => {
    const dataDir = scratch();
    // Process ids are positive; this one cannot belong to a running process.
    writeFileSync(`${dataDir}.lock`, "2147483646");

    const release = acquireDatabaseLock(dataDir);

    expect(readFileSync(`${dataDir}.lock`, "utf8")).toBe(String(process.pid));
    release();
  });

  it("lets the owning process reopen, as a development server does on reload", () => {
    const dataDir = scratch();
    const first = acquireDatabaseLock(dataDir);
    const second = acquireDatabaseLock(dataDir);
    second();
    first();
    expect(existsSync(`${dataDir}.lock`)).toBe(false);
  });
});
