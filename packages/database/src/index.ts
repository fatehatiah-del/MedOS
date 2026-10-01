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
export { DatabaseInUseError } from "./lock";
export {
  DEVELOPMENT_USER,
  type DevelopmentSeedResult,
  FIXTURE_LECTURE_PREFIX,
  FIXTURE_WEEKS,
  type FixtureRemovalResult,
  type FixtureSeedResult,
  fixtureLectureTitle,
  isFixtureLecture,
  removeFixtureLectures,
  seedDevelopment,
  seedDevelopmentUser,
  seedFixtureLectures,
} from "./seed/development";
export { type SeededSemester, seedSemester } from "./seed/semester";
export { type EnsureWorkspaceOptions, ensureWorkspace } from "./seed/workspace";
