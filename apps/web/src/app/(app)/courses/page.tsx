import { PageHeader, Progress, Section, Surface } from "@medos/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { FixtureNotice } from "@/components/fixture-notice";
import { courseHref } from "@/config/navigation";
import { FIXTURE_LECTURES_NOTICE } from "@/features/courses/fixture-data";
import { courseProgressLabel, summariseProgress } from "@/features/courses/progress";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const { semester, scope } = await getWorkspace();
  const overview = await scope.courses.overview(semester.id);
  const fixtures = await scope.lectures.includesFixtures();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`${semester.label} · ${semester.name}`}
        title="Courses"
        description="Each course is its own study environment. Lectures, questions and flashcards stay within their course."
      />

      {fixtures ? <FixtureNotice>{FIXTURE_LECTURES_NOTICE}</FixtureNotice> : null}

      <Section title="This semester" aside={`${overview.length} courses`}>
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {overview.map(
            ({ course, lectureCount, completedLectureCount, latestWeekWithLectures }) => {
              const progress = summariseProgress(completedLectureCount, lectureCount);
              return (
                <li key={course.id}>
                  <Link href={courseHref(course.slug)} className="group block h-full rounded-xl">
                    <Surface
                      padding="md"
                      className="flex h-full flex-col gap-5 transition-colors duration-150 group-hover:border-border-strong"
                    >
                      <div className="flex items-center gap-2.5">
                        <CourseMark token={course.colorToken} />
                        <h2 className="min-w-0 truncate text-[15px] font-medium text-fg">
                          {course.name}
                        </h2>
                      </div>

                      <div className="mt-auto space-y-2.5">
                        {progress.percent !== null ? (
                          <Progress
                            label={`${course.shortName} progress`}
                            value={progress.completed}
                            max={progress.total}
                            valueText={courseProgressLabel(progress)}
                          />
                        ) : null}
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13px] text-fg-subtle">
                            {courseProgressLabel(progress)}
                            {latestWeekWithLectures !== null
                              ? ` · through week ${latestWeekWithLectures}`
                              : ""}
                          </p>
                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-fg-subtle transition-colors duration-150 group-hover:text-fg"
                          />
                        </div>
                      </div>
                    </Surface>
                  </Link>
                </li>
              );
            },
          )}
        </ul>
      </Section>
    </div>
  );
}
