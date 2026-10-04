import { relations } from "drizzle-orm";

import { courses, lectures, semesters, weeks } from "./academic";
import { calendarEvents, examEvents } from "./calendar";
import { flashcardDecks, flashcardReviews, flashcards } from "./flashcards";
import { resourceContents, resourceMedia } from "./content";
import { originalLectureAnnotations, originalLecturePositions } from "./lecture-viewer";
import { mcqAttempts, mcqSessions } from "./mcq";
import { lectureProgress, studySessions } from "./progress";
import { questionBankAttempts } from "./question-bank";
import { studyGuideAnnotations, studyGuideProgress } from "./reading";
import { resources, syncFiles } from "./resources";
import { questionReviewItems } from "./review";
import { users } from "./users";

/*
 * Relations describe how tables connect for the relational query API
 * (`db.query.courses.findMany({ with: { weeks: { with: { lectures: true } } } })`).
 * They add nothing to the database; the constraints live in the table files.
 */

export const usersRelations = relations(users, ({ many }) => ({
  semesters: many(semesters),
}));

export const semestersRelations = relations(semesters, ({ one, many }) => ({
  user: one(users, { fields: [semesters.userId], references: [users.id] }),
  courses: many(courses),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  semester: one(semesters, { fields: [courses.semesterId], references: [semesters.id] }),
  weeks: many(weeks),
  lectures: many(lectures),
  calendarEvents: many(calendarEvents),
  examEvents: many(examEvents),
}));

export const weeksRelations = relations(weeks, ({ one, many }) => ({
  course: one(courses, { fields: [weeks.courseId], references: [courses.id] }),
  lectures: many(lectures),
}));

export const lecturesRelations = relations(lectures, ({ one, many }) => ({
  course: one(courses, { fields: [lectures.courseId], references: [courses.id] }),
  week: one(weeks, { fields: [lectures.weekId], references: [weeks.id] }),
  resources: many(resources),
  progress: one(lectureProgress),
  studySessions: many(studySessions),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  lecture: one(lectures, { fields: [resources.lectureId], references: [lectures.id] }),
  syncFiles: many(syncFiles),
  content: one(resourceContents),
  media: many(resourceMedia),
  annotations: many(studyGuideAnnotations),
  readingProgress: one(studyGuideProgress),
  pageAnnotations: many(originalLectureAnnotations),
  viewerPosition: one(originalLecturePositions),
  mcqSessions: many(mcqSessions),
  recallAttempts: many(questionBankAttempts),
  reviewItems: many(questionReviewItems),
}));

export const resourceContentsRelations = relations(resourceContents, ({ one }) => ({
  resource: one(resources, { fields: [resourceContents.resourceId], references: [resources.id] }),
}));

export const resourceMediaRelations = relations(resourceMedia, ({ one }) => ({
  resource: one(resources, { fields: [resourceMedia.resourceId], references: [resources.id] }),
}));

export const syncFilesRelations = relations(syncFiles, ({ one }) => ({
  resource: one(resources, { fields: [syncFiles.resourceId], references: [resources.id] }),
}));

export const lectureProgressRelations = relations(lectureProgress, ({ one }) => ({
  lecture: one(lectures, { fields: [lectureProgress.lectureId], references: [lectures.id] }),
}));

export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  course: one(courses, { fields: [studySessions.courseId], references: [courses.id] }),
  lecture: one(lectures, { fields: [studySessions.lectureId], references: [lectures.id] }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  course: one(courses, { fields: [calendarEvents.courseId], references: [courses.id] }),
  exam: one(examEvents),
}));

export const examEventsRelations = relations(examEvents, ({ one }) => ({
  calendarEvent: one(calendarEvents, {
    fields: [examEvents.calendarEventId],
    references: [calendarEvents.id],
  }),
  course: one(courses, { fields: [examEvents.courseId], references: [courses.id] }),
}));

export const studyGuideAnnotationsRelations = relations(studyGuideAnnotations, ({ one }) => ({
  resource: one(resources, {
    fields: [studyGuideAnnotations.resourceId],
    references: [resources.id],
  }),
}));

export const studyGuideProgressRelations = relations(studyGuideProgress, ({ one }) => ({
  resource: one(resources, {
    fields: [studyGuideProgress.resourceId],
    references: [resources.id],
  }),
}));

export const originalLectureAnnotationsRelations = relations(
  originalLectureAnnotations,
  ({ one }) => ({
    resource: one(resources, {
      fields: [originalLectureAnnotations.resourceId],
      references: [resources.id],
    }),
  }),
);

export const originalLecturePositionsRelations = relations(originalLecturePositions, ({ one }) => ({
  resource: one(resources, {
    fields: [originalLecturePositions.resourceId],
    references: [resources.id],
  }),
}));

export const mcqSessionsRelations = relations(mcqSessions, ({ one, many }) => ({
  resource: one(resources, { fields: [mcqSessions.resourceId], references: [resources.id] }),
  attempts: many(mcqAttempts),
}));

export const mcqAttemptsRelations = relations(mcqAttempts, ({ one }) => ({
  session: one(mcqSessions, { fields: [mcqAttempts.sessionId], references: [mcqSessions.id] }),
}));

export const questionBankAttemptsRelations = relations(questionBankAttempts, ({ one }) => ({
  resource: one(resources, {
    fields: [questionBankAttempts.resourceId],
    references: [resources.id],
  }),
}));

export const flashcardDecksRelations = relations(flashcardDecks, ({ one, many }) => ({
  course: one(courses, { fields: [flashcardDecks.courseId], references: [courses.id] }),
  lecture: one(lectures, { fields: [flashcardDecks.lectureId], references: [lectures.id] }),
  cards: many(flashcards),
}));

export const flashcardsRelations = relations(flashcards, ({ one, many }) => ({
  deck: one(flashcardDecks, { fields: [flashcards.deckId], references: [flashcardDecks.id] }),
  reviews: many(flashcardReviews),
}));

export const flashcardReviewsRelations = relations(flashcardReviews, ({ one }) => ({
  card: one(flashcards, { fields: [flashcardReviews.cardId], references: [flashcards.id] }),
}));

export const questionReviewItemsRelations = relations(questionReviewItems, ({ one }) => ({
  resource: one(resources, {
    fields: [questionReviewItems.resourceId],
    references: [resources.id],
  }),
}));
