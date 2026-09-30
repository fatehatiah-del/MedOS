import { type DatabaseConnection, connect } from "./client";
import { migrate } from "./migrate";

/**
 * A fresh in-memory PostgreSQL database with every migration applied. Each
 * call is fully isolated; close the connection when the tests are done.
 */
export async function createTestDatabase(): Promise<DatabaseConnection> {
  const connection = await connect("pglite:memory");
  await migrate(connection);
  return connection;
}
