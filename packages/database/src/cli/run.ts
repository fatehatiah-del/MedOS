import { type DatabaseConnection, connect } from "../client";
import { DatabaseConfigError, loadLocalEnv } from "../config";

/** A failure the user can act on. Reported as a single line, without a stack trace. */
export class CommandError extends Error {
  override name = "CommandError";
}

/**
 * Shared wrapper for database commands: loads the local environment, opens
 * the configured database, always closes it, and reports failures plainly.
 */
export async function runCommand(
  name: string,
  command: (connection: DatabaseConnection) => Promise<void>,
): Promise<void> {
  let connection: DatabaseConnection | undefined;
  try {
    loadLocalEnv();
    connection = await connect(process.env.DATABASE_URL);
    await command(connection);
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof DatabaseConfigError || error instanceof CommandError) {
      console.error(`${name}: ${error.message}`);
    } else {
      console.error(`${name} failed.`);
      console.error(error);
    }
  } finally {
    await connection?.close();
  }
}
