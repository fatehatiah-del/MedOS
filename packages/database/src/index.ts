export * from "./schema";

export {
  type ResourceSummary,
  type UserScope,
  type WeekWithLectures,
  createUserScope,
} from "./access/user-scope";
export { type Database, type DatabaseConnection, type Schema, connect } from "./client";
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
