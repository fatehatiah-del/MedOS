export * from "./schema";

export {
  type ContentSummary,
  type CourseOverview,
  type LectureDetail,
  type LectureOutline,
  type ResourceContentView,
  type ResourceSummary,
  type StoredMedia,
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
export {
  type AnnotationInput,
  type AnnotationResult,
  type AnnotationView,
  MAX_NOTE_LENGTH,
  MAX_QUOTE_LENGTH,
  type ReadingProgressView,
  type StudyGuideView,
  percentOf,
  readingProgressView,
} from "./access/study-guides";
export {
  type OriginalLectureView,
  type PageAnnotationInput,
  type PageAnnotationResult,
  type PageAnnotationView,
  type StoredOriginal,
} from "./access/original-lectures";
export {
  type AnswerResult,
  type DraftResult,
  MAX_QUESTION_TIME_MS,
  type McqSessionView,
  type McqSetView,
  type StartInput,
  TIME_LIMIT_GRACE_SECONDS,
  isCorrect,
  sessionDeadline,
} from "./access/mcq";
export {
  type BankOverview,
  MAX_TYPED_ANSWER_LENGTH,
  type QuestionBankView,
  type RevealResult,
} from "./access/question-bank";
export {
  type CardResult,
  type CardText,
  DEFAULT_NEW_PER_DAY,
  type DeckSummary,
  MAX_CARD_TEXT,
  type ReviewQueue,
} from "./access/flashcards";
