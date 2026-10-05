import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { checkProductionReadiness, formatReadinessReport } from "../src/server/production-check";

/*
 * npm run check:production [-- --env <file>]
 *
 * Checks a deployment's configuration before it goes live: the variables in
 * this shell, plus those in --env if given (for example the production
 * variables exported from your host). Prints every problem at once and exits
 * with 1 if any must be fixed. Reads nothing else and connects to nothing.
 */

const { values } = parseArgs({ options: { env: { type: "string" } } });
const file = values.env;
if (file) {
  const resolved = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if (!existsSync(resolved)) {
    console.error(`No such file: ${resolved}`);
    process.exit(1);
  }
  process.loadEnvFile(resolved);
}

const report = checkProductionReadiness(process.env);
console.log(formatReadinessReport(report));
process.exitCode = report.errors.length > 0 ? 1 : 0;
