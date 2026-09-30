export * from "./schema";

export {
  type Database,
  type DatabaseConnection,
  MIGRATIONS_FOLDER,
  type Schema,
  connect,
} from "./client";
export {
  DatabaseConfigError,
  type DatabaseTarget,
  findWorkspaceRoot,
  loadLocalEnv,
  parseDatabaseUrl,
} from "./config";
export {
  DEVELOPMENT_COURSE_SLUG,
  DEVELOPMENT_USER,
  DEVELOPMENT_WEEKS,
  type DevelopmentSeedResult,
  seedDevelopment,
  seedDevelopmentUser,
} from "./seed/development";
export { type SeededSemester, seedSemester } from "./seed/semester";
