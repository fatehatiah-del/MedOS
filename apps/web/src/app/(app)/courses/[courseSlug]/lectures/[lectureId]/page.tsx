import { CURRENT_SEMESTER } from "@medos/shared";
import { Badge, PageHeader, Section, Surface, cn } from "@medos/ui";
import {
  BookOpenText,
  FileText,
  Layers,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestionMark,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { FixtureNotice } from "@/components/fixture-notice";
import { courseHref } from "@/config/navigation";
import { FIXTURE_LECTURES_NOTICE } from "@/features/courses/fixture-data";
import {
  lectureHref,
  mcqHref,
  originalLectureHref,
  questionBankHref,
  studyGuideHref,
} from "@/features/courses/progress";
import {
  type LectureCategoryId,
  categoryStateLabel,
  lectureCategoryStates,
} from "@/features/lectures/categories";
import { OpenLectureDeck } from "@/features/flashcards/deck-manager";
import { CompletionControl } from "@/features/lectures/completion-control";
import { materialState } from "@/features/resources/processing";
import { LecturePerformance } from "@/features/statistics/lecture-performance";
import { StudyTimeSection } from "@/features/timer/study-time-section";
import { getWorkspace } from "@/server/workspace";

interface LecturePageProps {
  params: Promise<{ courseSlug: string; lectureId: string }>;
}

const CATEGORY_ICONS: Record<LectureCategoryId, LucideIcon> = {
  "study-guide": BookOpenText,
  "original-lecture": FileText,
  mcq: ListChecks,
  "question-bank": MessageCircleQuestionMark,
  flashcards: Layers,
};

const COMPLETED_ON = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});

async function loadLecture(courseSlug: string, lectureId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  // The address must name the lecture's own course; anything else is not found.
  if (!detail || detail.course.slug !== courseSlug) notFound();
  return { scope, detail };
}

export async function generateMetadata({ params }: LecturePageProps): Promise<Metadata> {
  const { courseSlug, lectureId } = await params;
  const { detail } = await loadLecture(courseSlug, lectureId);
  return { title: `${detail.lecture.title} · ${detail.course.shortName}` };
}

export default async function LecturePage({ params }: LecturePageProps) {
  const { courseSlug, lectureId } = await params;
  const { scope, detail } = await loadLecture(courseSlug, lectureId);
  const { lecture, week, course, completedAt, resources, weekLectures } = detail;

  const categories = lectureCategoryStates(resources);
  const [fixtures, reading, mcqScores, banks] = await Promise.all([
    scope.lectures.includesFixtures(),
    scope.studyGuides.progress.forLecture(lecture.id),
    scope.mcq.latestScores(lecture.id),
    scope.questionBanks.banks(),
  ]);
  const lectureDeck = await scope.flashcards.decks.lectureSummary(lecture.id);
  const practisedBanks = new Map(banks.map((bank) => [bank.resourceId, bank]));
  const position =
    weekLectures.length > 1
      ? `Lecture ${lecture.number} of ${weekLectures.length}`
      : `Lecture ${lecture.number}`;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
          ]}
        />
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CourseMark token={course.colorToken} />
              <span>{course.name}</span>
              <span aria-hidden="true">·</span>
              <span>Week {week.number}</span>
              <span aria-hidden="true">·</span>
              <span>{position}</span>
            </span>
          }
          title={lecture.title}
        />
      </div>

      {fixtures ? <FixtureNotice>{FIXTURE_LECTURES_NOTICE}</FixtureNotice> : null}

      <section aria-label="Completion">
        <Surface padding="md">
          <CompletionControl
            lectureId={lecture.id}
            completedOn={completedAt ? COMPLETED_ON.format(completedAt) : null}
          />
        </Surface>
      </section>

      <StudyTimeSection scope={scope} lectureId={lecture.id} courseId={course.id} />

      <LecturePerformance scope={scope} lectureId={lecture.id} course={course} />

      <Section title="Study material">
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.id];
            const available = category.state.status === "available";
            return (
              <li key={category.id}>
                <Surface padding="md" className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
                          available ? "bg-accent-soft text-accent" : "bg-subtle text-fg-subtle",
                        )}
                      >
                        <Icon />
                      </span>
                      <h3 className="text-[15px] font-medium text-fg">{category.label}</h3>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-fg-muted">
                    {category.description}
                  </p>
                  {category.resources.length > 0 ? (
                    <ul className="mt-auto space-y-3 border-t border-border pt-3">
                      {category.resources.map((resource) => {
                        const state = materialState(resource);
                        return (
                          <li key={resource.id} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <span
                                className="min-w-0 text-[13px] break-words text-fg"
                                title={resource.originalFilename}
                              >
                                {resource.originalFilename}
                              </span>
                              <Badge tone={state.tone} className="shrink-0">
                                {state.label}
                              </Badge>
                            </div>
                            <p className="text-xs leading-relaxed text-fg-subtle">{state.detail}</p>
                            {resource.content?.format === "study-guide" ? (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                                <Link
                                  href={studyGuideHref(course.slug, lecture.id, resource.id)}
                                  aria-label={`Open Study Guide: ${resource.originalFilename}`}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
                                >
                                  Open Study Guide
                                </Link>
                                {/* Reading progress is shown, never used to complete the lecture. */}
                                <span className="text-xs text-fg-subtle tabular-nums">
                                  {reading.get(resource.id) ?? 0}% read
                                </span>
                              </div>
                            ) : null}
                            {resource.kind === "mcq" && resource.content?.format === "mcq-set" ? (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                                <Link
                                  href={mcqHref(course.slug, lecture.id, resource.id)}
                                  aria-label={`Practise MCQ: ${resource.originalFilename}`}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
                                >
                                  Practise MCQ
                                </Link>
                                {/* Shown for information; it never completes the lecture. */}
                                {mcqScores.has(resource.id) ? (
                                  <span className="text-xs text-fg-subtle tabular-nums">
                                    Last exam {mcqScores.get(resource.id)}%
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {resource.kind === "question-bank" &&
                            resource.content?.format === "question-bank" ? (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                                <Link
                                  href={questionBankHref(course.slug, lecture.id, resource.id)}
                                  aria-label={`Practise recall: ${resource.originalFilename}`}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
                                >
                                  Practise recall
                                </Link>
                                {/* Shown for information; it never completes the lecture. */}
                                {practisedBanks.has(resource.id) ? (
                                  <span className="text-xs text-fg-subtle tabular-nums">
                                    {practisedBanks.get(resource.id)?.practised} of{" "}
                                    {practisedBanks.get(resource.id)?.itemCount} practised
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {resource.kind === "original-lecture" &&
                            resource.content?.format === "pdf" ? (
                              <div className="pt-1">
                                <Link
                                  href={originalLectureHref(course.slug, lecture.id, resource.id)}
                                  aria-label={`Open lecture: ${resource.originalFilename}`}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
                                >
                                  Open lecture
                                </Link>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : category.id === "flashcards" ? (
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
                      <OpenLectureDeck
                        lectureId={lecture.id}
                        deckHref={`/flashcards/${course.slug}/decks/DECK`}
                        label={lectureDeck ? "Open deck" : "Start this lecture's deck"}
                      />
                      {lectureDeck ? (
                        <span className="text-xs text-fg-subtle tabular-nums">
                          {lectureDeck.total} cards · {lectureDeck.due} due
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-auto pt-1">
                      <Badge tone={available ? "accent" : "outline"}>
                        {categoryStateLabel(category.state)}
                      </Badge>
                    </div>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-fg-subtle">
          Material appears here once it has been synced from your study folder, and is read into
          MedOS content by the sync. Study Guides open in the reader, lecture PDFs in the viewer,
          quizzes in MCQ practice and question banks in active recall. Reading and practising never
          mark the lecture complete.
        </p>
      </Section>

      {weekLectures.length > 1 ? (
        <Section title={`Week ${week.number}`}>
          <ul className="space-y-1">
            {weekLectures.map((sibling) => {
              const current = sibling.id === lecture.id;
              return (
                <li key={sibling.id}>
                  {current ? (
                    <span
                      aria-current="page"
                      className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2 text-sm font-medium text-fg"
                    >
                      <span className="w-4 text-[13px] text-fg-subtle tabular-nums">
                        {sibling.number}
                      </span>
                      <span className="truncate">{sibling.title}</span>
                    </span>
                  ) : (
                    <Link
                      href={lectureHref(course.slug, sibling.id)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors duration-150 hover:bg-subtle/60 hover:text-fg"
                    >
                      <span className="w-4 text-[13px] text-fg-subtle tabular-nums">
                        {sibling.number}
                      </span>
                      <span className="truncate">{sibling.title}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
