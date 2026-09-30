export * from "./schema";

export {
  type CourseOverview,
  type LectureDetail,
  type LectureOutline,
  type ResourceSummary,
  type UserScope,
  type WeekOutline,
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
  DEVELOPMENT_USER,
  type DevelopmentSeedResult,
  FIXTURE_LECTURE_PREFIX,
  FIXTURE_WEEKS,
  type FixtureSeedResult,
  fixtureLectureTitle,
  isFixtureLecture,
  seedDevelopment,
  seedDevelopmentUser,
  seedFixtureLectures,
} from "./seed/development";
export { type SeededSemester, seedSemester } from "./seed/semester";
export { type EnsureWorkspaceOptions, ensureWorkspace } from "./seed/workspace";
