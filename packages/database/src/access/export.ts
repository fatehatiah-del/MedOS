import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  type ExportMcqQuestion,
  type ExportSnapshot,
  type ExportSource,
} from "@medos/export";
import {
  type McqQuestion,
  type ParsedContent,
  type QuestionBankItem,
  blocksText,
  plainText,
  unitText,
  validateContent,
} from "@medos/parsers/model";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { Database } from "../client";
import {
  calendarEvents,
  courses,
  dailyPlanItems,
  dailyPlans,
  difficultConcepts,
  examEvents,
  flashcardDecks,
  flashcardReviews,
  flashcards,
  lectureProgress,
  lectures,
  mcqAttempts,
  mcqSessions,
  originalLectureAnnotations,
  originalLecturePositions,
  questionBankAttempts,
  questionReviewItems,
  resourceContents,
  resources,
  semesters,
  studyGuideAnnotations,
  studyGuideProgress,
  studySessions,
  userSettings,
  users,
  weeks,
} from "../schema";

/*
 * Export: everything the user has made or recorded in MedOS, as one snapshot
 * in the open MedOS export format (see @medos/export). Read-only.
 *
 * Every item that belongs to a lecture names its course, week, lecture and
 * the file it was made from. Questions are looked up in the parsed file so an
 * attempt reads on its own; a question that is no longer in the file is
 * exported without its text, never matched to a different one.
 */

const iso = (instant: Date) => instant.toISOString();
const isoOrNull = (instant: Date | null) => (instant ? instant.toISOString() : null);

/** A question by key, or, after a re-import renumbered it, by fingerprint. */
function findQuestion<T extends { key: string; fingerprint: string }>(
  questions: readonly T[],
  key: string,
  fingerprint: string,
): T | null {
  const byKey = questions.find((question) => question.key === key);
  if (byKey?.fingerprint === fingerprint) return byKey;
  return questions.find((question) => question.fingerprint === fingerprint) ?? null;
}

function mcqQuestion(question: McqQuestion): ExportMcqQuestion {
  return {
    number: question.number,
    stem: plainText(question.stem),
    options: question.options.map((option) => ({
      label: option.label,
      text: plainText(option.text),
    })),
    correctOption:
      question.answer.status === "resolved"
        ? (question.options[question.answer.optionIndex]?.label ?? null)
        : null,
    topic: question.topic,
    sourceRef: question.sourceRef,
  };
}

function recallQuestion(item: QuestionBankItem): { question: string; modelAnswer: string | null } {
  const choices = item.choices.map((choice) => `${choice.label}. ${plainText(choice.text)}`);
  return {
    question: [blocksText(item.prompt), ...choices].join("\n"),
    modelAnswer: item.answer.status === "paired" ? blocksText(item.answer.blocks) : null,
  };
}

export function createExportAccess(db: Database, userId: string) {
  return {
    /** The user's data as one export snapshot. */
    async snapshot(now: Date = new Date()): Promise<ExportSnapshot> {
      const mine = (column: AnyPgColumn) => eq(column, userId);

      const [
        [owner],
        semesterRows,
        courseRows,
        weekRows,
        lectureRows,
        completionRows,
        resourceRows,
        guideAnnotationRows,
        pageAnnotationRows,
        deckRows,
        cardRows,
        reviewRows,
        sessionRows,
        attemptRows,
        recallRows,
        questionReviewRows,
        guideProgressRows,
        positionRows,
        studySessionRows,
        eventRows,
        examRows,
        settingsRows,
        planRows,
        planItemRows,
        conceptRows,
      ] = await Promise.all([
        db
          .select({ email: users.email, displayName: users.displayName })
          .from(users)
          .where(eq(users.id, userId)),
        db.select().from(semesters).where(mine(semesters.userId)).orderBy(asc(semesters.startsOn)),
        db.select().from(courses).where(mine(courses.userId)).orderBy(asc(courses.position)),
        db.select().from(weeks).where(mine(weeks.userId)).orderBy(asc(weeks.number)),
        db.select().from(lectures).where(mine(lectures.userId)).orderBy(asc(lectures.number)),
        db.select().from(lectureProgress).where(mine(lectureProgress.userId)),
        db
          .select({
            id: resources.id,
            lectureId: resources.lectureId,
            kind: resources.kind,
            originalFilename: resources.originalFilename,
            contentHash: resources.contentHash,
          })
          .from(resources)
          .where(mine(resources.userId)),
        db
          .select()
          .from(studyGuideAnnotations)
          .where(mine(studyGuideAnnotations.userId))
          .orderBy(asc(studyGuideAnnotations.createdAt)),
        db
          .select()
          .from(originalLectureAnnotations)
          .where(mine(originalLectureAnnotations.userId))
          .orderBy(asc(originalLectureAnnotations.createdAt)),
        db
          .select()
          .from(flashcardDecks)
          .where(mine(flashcardDecks.userId))
          .orderBy(asc(flashcardDecks.createdAt)),
        db
          .select()
          .from(flashcards)
          .where(mine(flashcards.userId))
          .orderBy(asc(flashcards.createdAt)),
        db
          .select()
          .from(flashcardReviews)
          .where(mine(flashcardReviews.userId))
          .orderBy(asc(flashcardReviews.reviewedAt)),
        db
          .select()
          .from(mcqSessions)
          .where(mine(mcqSessions.userId))
          .orderBy(asc(mcqSessions.startedAt)),
        db
          .select()
          .from(mcqAttempts)
          .where(mine(mcqAttempts.userId))
          .orderBy(asc(mcqAttempts.answeredAt)),
        db
          .select()
          .from(questionBankAttempts)
          .where(mine(questionBankAttempts.userId))
          .orderBy(asc(questionBankAttempts.revealedAt)),
        db
          .select()
          .from(questionReviewItems)
          .where(mine(questionReviewItems.userId))
          .orderBy(asc(questionReviewItems.createdAt)),
        db.select().from(studyGuideProgress).where(mine(studyGuideProgress.userId)),
        db.select().from(originalLecturePositions).where(mine(originalLecturePositions.userId)),
        db
          .select()
          .from(studySessions)
          .where(mine(studySessions.userId))
          .orderBy(asc(studySessions.startedAt)),
        db
          .select()
          .from(calendarEvents)
          .where(mine(calendarEvents.userId))
          .orderBy(asc(calendarEvents.startsAt)),
        db.select().from(examEvents).where(mine(examEvents.userId)),
        db.select().from(userSettings).where(mine(userSettings.userId)),
        db.select().from(dailyPlans).where(mine(dailyPlans.userId)).orderBy(asc(dailyPlans.date)),
        db
          .select()
          .from(dailyPlanItems)
          .where(mine(dailyPlanItems.userId))
          .orderBy(asc(dailyPlanItems.position)),
        db
          .select()
          .from(difficultConcepts)
          .where(mine(difficultConcepts.userId))
          .orderBy(asc(difficultConcepts.createdAt)),
      ]);
      if (!owner) throw new Error("The user of this scope does not exist.");

      // Parsed files, only for those an exported item needs to be read against.
      const needed = [
        ...new Set(
          [
            ...guideAnnotationRows,
            ...attemptRows,
            ...recallRows,
            ...questionReviewRows,
            ...guideProgressRows,
          ].map((row) => row.resourceId),
        ),
      ];
      for (const card of cardRows) if (card.sourceResourceId) needed.push(card.sourceResourceId);
      const contentRows =
        needed.length === 0
          ? []
          : await db
              .select({
                resourceId: resourceContents.resourceId,
                content: resourceContents.content,
              })
              .from(resourceContents)
              .where(
                and(
                  eq(resourceContents.userId, userId),
                  inArray(resourceContents.resourceId, [...new Set(needed)]),
                ),
              );
      const contents = new Map<string, ParsedContent>();
      for (const row of contentRows) {
        // A file that no longer reads is exported like one without the question:
        // the user's own records must never be held back by a parsed file.
        try {
          contents.set(row.resourceId, validateContent(row.content));
        } catch {
          continue;
        }
      }

      const courseById = new Map(courseRows.map((row) => [row.id, row]));
      const weekById = new Map(weekRows.map((row) => [row.id, row]));
      const lectureById = new Map(lectureRows.map((row) => [row.id, row]));
      const resourceById = new Map(resourceRows.map((row) => [row.id, row]));
      const completedAt = new Map(completionRows.map((row) => [row.lectureId, row.completedAt]));

      /** Where an item comes from: its course, and its lecture and file when it has them. */
      function sourceOf(place: {
        courseId?: string | null;
        lectureId?: string | null;
        resourceId?: string | null;
      }): ExportSource | null {
        const resource = place.resourceId ? resourceById.get(place.resourceId) : undefined;
        const lecture = lectureById.get(resource?.lectureId ?? place.lectureId ?? "");
        const course = courseById.get(lecture?.courseId ?? place.courseId ?? "");
        if (!course) return null;
        return {
          courseId: course.id,
          course: course.name,
          courseSlug: course.slug,
          week: lecture ? (weekById.get(lecture.weekId)?.number ?? null) : null,
          lectureId: lecture?.id ?? null,
          lecture: lecture?.number ?? null,
          lectureTitle: lecture?.title ?? null,
          resourceId: resource?.id ?? null,
          resourceKind: resource?.kind ?? null,
          file: resource?.originalFilename ?? null,
          fileContentHash: resource?.contentHash ?? null,
        };
      }

      /** Every row here references the user's own course; a missing one is a broken database. */
      function sourceFor(place: Parameters<typeof sourceOf>[0]): ExportSource {
        const source = sourceOf(place);
        if (!source) throw new Error("An exported item has no course.");
        return source;
      }

      const sectionHeading = (resourceId: string | null, sectionId: string | null) => {
        if (!resourceId || !sectionId) return null;
        const content = contents.get(resourceId);
        if (content?.format !== "study-guide") return null;
        const section = content.sections.find((candidate) => candidate.id === sectionId);
        return section ? unitText(section.heading) : null;
      };

      const mcqQuestions = (resourceId: string) => {
        const content = contents.get(resourceId);
        return content?.format === "mcq-set" ? content.questions : [];
      };
      const bankItems = (resourceId: string) => {
        const content = contents.get(resourceId);
        return content?.format === "question-bank" ? content.items : [];
      };

      const deckById = new Map(deckRows.map((row) => [row.id, row]));
      const examByEvent = new Map(examRows.map((row) => [row.calendarEventId, row.kind]));
      const settings = settingsRows[0];

      return {
        format: EXPORT_FORMAT,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: iso(now),
        generator: "MedOS",
        user: { email: owner.email, displayName: owner.displayName },

        semesters: semesterRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          label: row.label,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
        })),

        courses: courseRows.map((course) => ({
          id: course.id,
          semesterId: course.semesterId,
          slug: course.slug,
          name: course.name,
          shortName: course.shortName,
          code: course.code,
          weeks: weekRows
            .filter((week) => week.courseId === course.id)
            .map((week) => ({
              id: week.id,
              number: week.number,
              startsOn: week.startsOn,
              endsOn: week.endsOn,
              lectures: lectureRows
                .filter((lecture) => lecture.weekId === week.id)
                .map((lecture) => ({
                  id: lecture.id,
                  number: lecture.number,
                  title: lecture.title,
                  heldOn: lecture.heldOn,
                  completedAt: isoOrNull(completedAt.get(lecture.id) ?? null),
                })),
            })),
        })),

        annotations: [
          ...guideAnnotationRows.map((row) => ({
            id: row.id,
            on: "study-guide" as const,
            kind: row.kind,
            quote: row.quote,
            prefix: row.prefix,
            suffix: row.suffix,
            section: sectionHeading(row.resourceId, row.sectionId),
            sectionId: row.sectionId,
            page: null,
            note: row.note,
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
            source: sourceFor({ resourceId: row.resourceId }),
          })),
          ...pageAnnotationRows.map((row) => ({
            id: row.id,
            on: "lecture-page" as const,
            kind: row.kind,
            quote: null,
            prefix: null,
            suffix: null,
            section: null,
            sectionId: null,
            page: row.page,
            note: row.note,
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
            source: sourceFor({ resourceId: row.resourceId }),
          })),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),

        flashcards: {
          decks: deckRows.map((deck) => ({
            id: deck.id,
            name: deck.name,
            source: sourceFor({ courseId: deck.courseId, lectureId: deck.lectureId }),
            createdAt: iso(deck.createdAt),
          })),
          cards: cardRows.map((card) => {
            const deck = deckById.get(card.deckId);
            if (!deck) throw new Error("A flashcard has no deck.");
            return {
              id: card.id,
              deckId: card.deckId,
              deck: deck.name,
              front: card.front,
              back: card.back,
              origin: card.origin,
              sourceSection: sectionHeading(card.sourceResourceId, card.sourceSectionId),
              sourceSectionId: card.sourceSectionId,
              sourceQuote: card.sourceQuote,
              fsrs: {
                state: card.state,
                due: iso(card.due),
                stability: card.stability,
                difficulty: card.difficulty,
                scheduledDays: card.scheduledDays,
                learningSteps: card.learningSteps,
                reps: card.reps,
                lapses: card.lapses,
                lastReview: isoOrNull(card.lastReview),
              },
              deletedAt: isoOrNull(card.deletedAt),
              createdAt: iso(card.createdAt),
              updatedAt: iso(card.updatedAt),
              source: sourceFor({
                courseId: deck.courseId,
                lectureId: deck.lectureId,
                resourceId: card.sourceResourceId,
              }),
            };
          }),
          reviews: reviewRows.map((row) => ({
            id: row.id,
            cardId: row.cardId,
            rating: row.rating,
            reviewedAt: iso(row.reviewedAt),
            durationMs: row.durationMs,
            stateBefore: row.stateBefore,
            dueBefore: iso(row.dueBefore),
            stateAfter: row.stateAfter,
            dueAfter: iso(row.dueAfter),
            stabilityAfter: row.stabilityAfter,
            difficultyAfter: row.difficultyAfter,
            scheduledDaysAfter: row.scheduledDaysAfter,
          })),
        },

        mcq: {
          sessions: sessionRows.map((row) => ({
            id: row.id,
            mode: row.mode,
            status: row.status,
            questionCount: row.questions.length,
            shuffled: row.shuffled,
            timeLimitSeconds: row.timeLimitSeconds,
            startedAt: iso(row.startedAt),
            submittedAt: isoOrNull(row.submittedAt),
            elapsedSeconds: row.elapsedSeconds,
            source: sourceFor({ resourceId: row.resourceId }),
          })),
          attempts: attemptRows.map((row) => {
            const found = findQuestion(
              mcqQuestions(row.resourceId),
              row.questionKey,
              row.questionFingerprint,
            );
            const selected =
              row.selectedOption === null
                ? null
                : (found?.options[row.selectedOption]?.label ?? String(row.selectedOption + 1));
            return {
              id: row.id,
              sessionId: row.sessionId,
              mode: row.mode,
              questionKey: row.questionKey,
              questionFingerprint: row.questionFingerprint,
              question: found ? mcqQuestion(found) : null,
              selectedOption: selected,
              correct: row.correct,
              flagged: row.flagged,
              timeSpentMs: row.timeSpentMs,
              attemptNumber: row.attemptNumber,
              answeredAt: iso(row.answeredAt),
              source: sourceFor({ resourceId: row.resourceId }),
            };
          }),
        },

        questionBank: {
          attempts: recallRows.map((row) => {
            const found = findQuestion(bankItems(row.resourceId), row.itemKey, row.itemFingerprint);
            const text = found ? recallQuestion(found) : null;
            return {
              id: row.id,
              itemKey: row.itemKey,
              itemFingerprint: row.itemFingerprint,
              question: text?.question ?? null,
              modelAnswer: text?.modelAnswer ?? null,
              typedAnswer: row.typedAnswer,
              rating: row.rating,
              revealedAt: iso(row.revealedAt),
              ratedAt: isoOrNull(row.ratedAt),
              timeSpentMs: row.timeSpentMs,
              attemptNumber: row.attemptNumber,
              source: sourceFor({ resourceId: row.resourceId }),
            };
          }),
        },

        reviewLater: questionReviewRows.map((row) => {
          const questions: readonly (McqQuestion | QuestionBankItem)[] = [
            ...mcqQuestions(row.resourceId),
            ...bankItems(row.resourceId),
          ];
          const found = findQuestion(questions, row.questionKey, row.questionFingerprint);
          return {
            id: row.id,
            questionKey: row.questionKey,
            questionFingerprint: row.questionFingerprint,
            question: found
              ? "stem" in found
                ? plainText(found.stem)
                : recallQuestion(found).question
              : null,
            note: row.note,
            createdAt: iso(row.createdAt),
            source: sourceFor({ resourceId: row.resourceId }),
          };
        }),

        progress: {
          studyGuides: guideProgressRows.map((row) => ({
            resourceId: row.resourceId,
            furthestSection: sectionHeading(row.resourceId, row.furthestSectionId),
            furthestSectionId: row.furthestSectionId,
            furthestPosition: row.furthestPosition,
            sectionCount: row.sectionCount,
            lastSectionId: row.lastSectionId,
            updatedAt: iso(row.updatedAt),
            source: sourceFor({ resourceId: row.resourceId }),
          })),
          originalLectures: positionRows.map((row) => ({
            resourceId: row.resourceId,
            page: row.page,
            updatedAt: iso(row.updatedAt),
            source: sourceFor({ resourceId: row.resourceId }),
          })),
        },

        studySessions: studySessionRows.map((row) => ({
          id: row.id,
          activity: row.activity,
          startedAt: iso(row.startedAt),
          endedAt: isoOrNull(row.endedAt),
          activeSeconds: row.activeSeconds,
          pausedReason: row.pausedReason,
          source: sourceOf({ courseId: row.courseId, lectureId: row.lectureId }),
        })),

        calendar: eventRows.map((row) => ({
          id: row.id,
          type: row.type,
          origin: row.origin,
          title: row.title,
          startsAt: iso(row.startsAt),
          endsAt: iso(row.endsAt),
          allDay: row.allDay,
          timeZone: row.timezone,
          location: row.location,
          studentGroup: row.studentGroup,
          notes: row.notes,
          exam: examByEvent.get(row.id) ?? null,
          sourceKey: row.sourceKey,
          source: sourceOf({ courseId: row.courseId }),
        })),

        planner: {
          availability: settings
            ? { weekdayMinutes: settings.weekdayMinutes, weekendMinutes: settings.weekendMinutes }
            : null,
          days: planRows.map((plan) => ({
            date: plan.date,
            suggestedAt: isoOrNull(plan.suggestedAt),
            items: planItemRows
              .filter((item) => item.planId === plan.id)
              .map((item) => ({
                id: item.id,
                position: item.position,
                origin: item.source,
                status: item.status,
                activity: item.activity,
                title: item.title,
                minutes: item.minutes,
                edited: item.edited,
                reasons: item.reasons,
                postponedFrom: item.postponedFrom,
                source: sourceOf({
                  courseId: item.courseId,
                  lectureId: item.lectureId,
                  resourceId: item.resourceId,
                }),
              })),
          })),
        },

        difficultConcepts: conceptRows.map((row) => ({
          id: row.id,
          label: row.label,
          createdAt: iso(row.createdAt),
          source: sourceFor({ courseId: row.courseId }),
        })),
      };
    },
  };
}
