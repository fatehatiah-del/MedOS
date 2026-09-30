import { EmptyState, PageHeader, Progress, Section, Surface, cn } from "@medos/ui";
import { ArrowRight, CircleCheck, FolderSync } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { FixtureNotice } from "@/components/fixture-notice";
import { FIXTURE_LECTURES_NOTICE } from "@/features/courses/fixture-data";
import {
  courseProgressLabel,
  formatWeekDates,
  lectureHref,
  nextIncompleteLecture,
  outlineProgress,
  weekProgress,
  weekProgressLabel,
} from "@/features/courses/progress";
import { availableCategoryLabels } from "@/features/lectures/categories";
import { getWorkspace } from "@/server/workspace";

interface CoursePageProps {
  params: Promise<{ courseSlug: string }>;
}

async function loadCourse(courseSlug: string) {
  const { semester, scope } = await getWorkspace();
  const course = await scope.courses.getBySlug(semester.id, courseSlug);
  if (!course) notFound();
  const weeks = await scope.courses.outline(course.id);
  if (!weeks) notFound();
  return { semester, scope, course, weeks };
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { courseSlug } = await params;
  const { course } = await loadCourse(courseSlug);
  return { title: course.name };
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseSlug } = await params;
  const { semester, scope, course, weeks } = await loadCourse(courseSlug);

  const progress = outlineProgress(weeks);
  const next = nextIncompleteLecture(weeks);
  const fixtures = progress.total > 0 && (await scope.lectures.includesFixtures());

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: "Courses", href: "/courses" }, { label: course.shortName }]}
        />
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              <CourseMark token={course.colorToken} />
              {semester.label} · {semester.name}
            </span>
          }
          title={course.name}
        />
      </div>

      {fixtures ? <FixtureNotice>{FIXTURE_LECTURES_NOTICE}</FixtureNotice> : null}

      {progress.percent !== null ? (
        <section
          aria-label="Course progress"
          className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:gap-10"
        >
          {/* min-w-0: grid items otherwise grow to fit an untruncated lecture title. */}
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-fg-muted">
              <span className="text-[22px] font-medium tracking-[-0.01em] text-fg tabular-nums">
                {progress.completed}
              </span>{" "}
              of {progress.total} lectures complete
            </p>
            <Progress
              label={`${course.shortName} progress`}
              value={progress.completed}
              max={progress.total}
              valueText={courseProgressLabel(progress)}
            />
          </div>

          {next ? (
            <Link
              href={lectureHref(course.slug, next.lecture.id)}
              className="group flex min-w-0 items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4 shadow-xs transition-colors duration-150 hover:border-border-strong"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium tracking-[0.06em] text-fg-subtle uppercase">
                  Continue with
                </span>
                <span className="mt-1 block truncate text-sm font-medium text-fg">
                  Week {next.week.number} · {next.lecture.title}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg"
              />
            </Link>
          ) : (
            <p className="flex items-center gap-2.5 self-center text-sm text-fg-muted">
              <CircleCheck aria-hidden="true" className="size-5 text-success" />
              Every lecture in this course is marked complete.
            </p>
          )}
        </section>
      ) : null}

      <Section title="Weeks" aside={weeks.length > 0 ? `${weeks.length} weeks` : undefined}>
        {weeks.length === 0 ? (
          <Surface>
            <EmptyState
              icon={<FolderSync />}
              title="No lectures yet"
              description="Weeks and lectures appear here once your study material for this course is synced."
            />
          </Surface>
        ) : (
          <ol className="space-y-8">
            {weeks.map((week) => {
              const summary = weekProgress(week);
              const dates = formatWeekDates(week.startsOn, week.endsOn);
              return (
                <li key={week.id}>
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-[15px] font-medium text-fg">Week {week.number}</h2>
                      {dates ? <p className="text-[13px] text-fg-subtle">{dates}</p> : null}
                    </div>
                    {summary.state !== "empty" ? (
                      <p className="text-[13px] text-fg-subtle">{weekProgressLabel(summary)}</p>
                    ) : null}
                  </div>

                  {week.lectures.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-5 py-4 text-sm text-fg-subtle">
                      No lectures yet
                    </p>
                  ) : (
                    <Surface>
                      <ul className="divide-y divide-border">
                        {week.lectures.map((lecture) => {
                          const complete = lecture.completedAt !== null;
                          const material = availableCategoryLabels(lecture.resourceKinds);
                          return (
                            <li key={lecture.id}>
                              <Link
                                href={lectureHref(course.slug, lecture.id)}
                                className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-subtle/60"
                              >
                                <span
                                  aria-hidden="true"
                                  className="w-4 shrink-0 text-[13px] text-fg-subtle tabular-nums"
                                >
                                  {lecture.number}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-medium text-fg">
                                    <span className="sr-only">Lecture {lecture.number}: </span>
                                    {lecture.title}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[13px] text-fg-subtle">
                                    {material.length > 0 ? material.join(" · ") : "No material yet"}
                                  </span>
                                </span>
                                <span
                                  className={cn(
                                    "flex shrink-0 items-center gap-1.5 text-[13px]",
                                    complete ? "text-success" : "text-fg-subtle",
                                  )}
                                >
                                  {complete ? (
                                    <CircleCheck aria-hidden="true" className="size-4" />
                                  ) : (
                                    <span
                                      aria-hidden="true"
                                      className="size-4 rounded-full border-[1.5px] border-border-strong"
                                    />
                                  )}
                                  <span className="sr-only @md:not-sr-only">
                                    {complete ? "Complete" : "Not complete"}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </Surface>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
