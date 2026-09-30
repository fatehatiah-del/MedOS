import { seedDevelopment } from "../seed/development";

import { CommandError, runCommand } from "./run";

await runCommand("db:seed", async (connection) => {
  // The seed creates a placeholder user and fixture lectures. It has no place in production.
  if (process.env.NODE_ENV === "production") {
    throw new CommandError(
      "it writes development data and refuses to run when NODE_ENV=production.",
    );
  }

  const result = await seedDevelopment(connection.db);
  console.log("Seeded development data:");
  console.log(`  user      ${result.user.email} (placeholder)`);
  console.log(`  semester  ${result.semester.label} · ${result.semester.name}`);
  console.log(`  courses   ${result.courses.map((course) => course.shortName).join(", ")}`);
  console.log(`  fixtures  ${result.weekCount} weeks, ${result.lectureCount} placeholder lectures`);
});
