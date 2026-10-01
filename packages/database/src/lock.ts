import { readFileSync, rmSync, writeFileSync } from "node:fs";

/**
 * An embedded (PGlite) database folder may be opened by only one process at a
 * time; two writers can corrupt it. The first process to open it writes its
 * process id into `<folder>.lock`, and any other process refuses to open the
 * folder while that process is alive. A lock left behind by a process that
 * has exited is taken over.
 */
export class DatabaseInUseError extends Error {
  override name = "DatabaseInUseError";
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(lockFile: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(lockFile, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Takes the lock or throws. Returns the function that releases it. */
export function acquireDatabaseLock(dataDir: string): () => void {
  const lockFile = `${dataDir}.lock`;
  const owner = readOwner(lockFile);

  if (owner !== null && owner !== process.pid && isRunning(owner)) {
    throw new DatabaseInUseError(
      `The embedded database is open in another process (pid ${owner}), most likely the MedOS ` +
        "dev server. Stop it, then run this command again.",
    );
  }

  writeFileSync(lockFile, String(process.pid));

  return () => {
    if (readOwner(lockFile) === process.pid) rmSync(lockFile, { force: true });
  };
}
