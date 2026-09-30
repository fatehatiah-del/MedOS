import { relations } from "drizzle-orm";

import { courses, lectures, semesters, weeks } from "./academic";
import { calendarEvents, examEvents } from "./calendar";
import { lectureProgress, studySessions } from "./progress";
import { resources, syncFiles } from "./resources";
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
