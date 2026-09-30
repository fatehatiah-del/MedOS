import { migrate } from "../migrate";

import { runCommand } from "./run";

await runCommand("db:migrate", async (connection) => {
  await migrate(connection);
  console.log(`Migrations are up to date (${connection.driver}).`);
});
