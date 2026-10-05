/**
 * Runs once when a server starts. In production, the deployment's
 * configuration is checked as a whole before any request is served: a
 * problem stops the server with the full list of what to fix (the same list
 * `npm run check:production` prints), and warnings go to the log.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { checkProductionReadiness, formatReadinessReport } =
    await import("./server/production-check");
  const report = checkProductionReadiness(process.env);
  if (report.errors.length > 0) throw new Error(formatReadinessReport(report));
  for (const warning of report.warnings) console.warn(`MedOS: ${warning}`);
}
