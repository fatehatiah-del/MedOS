import { type DatabaseConnection, connect } from "./client";

/**
 * A fresh in-memory PostgreSQL database with every migration applied. Each
 * call is fully isolated; close the connection when the tests are done.
 */
export async function createTestDatabase(): Promise<DatabaseConnection> {
  const connection = await connect("pglite:memory");
  await connection.migrate();
  return connection;
}
