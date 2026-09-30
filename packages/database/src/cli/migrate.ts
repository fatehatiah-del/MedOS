import { runCommand } from "./run";

await runCommand("db:migrate", async (connection) => {
  await connection.migrate();
  console.log(`Migrations are up to date (${connection.driver}).`);
});
