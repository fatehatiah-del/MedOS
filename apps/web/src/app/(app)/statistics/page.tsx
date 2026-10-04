import type { UserScope } from "@medos/database";
import {
  CURRENT_SEMESTER,
  type IsoDate,
  formatDate,
  formatMinutes,
  semesterWeekFor,
} from "@medos/shared";
import { PageHeader, Section, cn } from "@medos/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseMark } from "@/components/course-mark";
import { campusToday } from "@/features/calendar/load";
import { lectureHref } from "@/features/courses/progress";
import { TileGrid, metricTiles } from "@/features/statistics/metric-tiles";
import { MarkConceptForm, WeaknessList } from "@/features/statistics/weakness-list";
import { WeeklyChart } from "@/features/statistics/weekly-chart";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Statistics" };

interface StatisticsPageProps {
  searchParams: Promise<{ course?: string | string[] }>;
}

const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

export default async function StatisticsPage({ searchParams }: StatisticsPageProps) {
  const { scope, semester } = await getWorkspace();
  const query = (await searchParams).course;
  const slug = Array.isArray(query) ? query[0] : query;
  const courses = (await scope.courses.list()).filter(
    (course) => course.semesterId === semester.id,
  );
  const selected = slug ? courses.find((course) => course.slug === slug) : undefined;
  if (slug && !selected) notFound();
  const today = campusToday();
  const currentWeek = semesterWeekFor(today);
  const courseLinks = courses.map(({ id, slug: courseSlug, shortName, colorToken }) => ({
    id,
    slug: courseSlug,
    shortName,
    colorToken,
  }));

  return (
    <div className="space-y-10">
      <PageHeader
        title="Statistics"
        description="Measures calculated only from your own study activity. Nothing is estimated or scored."
      />

      <nav aria-label="Statistics level" className="flex flex-wrap gap-1.5">
        {[
          { href: "/statistics", label: "Semester", current: !selected },
          ...courses.map((course) => ({
            href: `/statistics?course=${course.slug}`,
            label: course.shortName,
            current: selected?.id === course.id,
          })),
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={link.current ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors duration-150",
              link.current
                ? "border-accent bg-accent-soft text-fg"
                : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {selected ? (
        <CourseView
          scope={scope}
          courseId={selected.id}
          courses={courseLinks}
          currentWeek={currentWeek}
          today={today}
        />
      ) : (
        <SemesterView scope={scope} courses={courseLinks} currentWeek={currentWeek} today={today} />
      )}
    </div>
  );
}

interface CourseLink {
  id: string;
  slug: string;
  shortName: string;
  colorToken: string | null;
}

interface ViewProps {
  scope: UserScope;
  courses: CourseLink[];
  currentWeek: number | null;
  today: IsoDate;
}

async function SemesterView({ scope, courses: links, currentWeek: week }: ViewProps) {
  const [stats, weaknesses] = await Promise.all([
    scope.statistics.semester(),
    scope.statistics.weaknesses(),
  ]);
  return (
    <div className="space-y-12">
      <Section title={`${CURRENT_SEMESTER.label} · ${CURRENT_SEMESTER.name}`}>
        <TileGrid
          tiles={[
            {
              label: "Study streak",
              value:
                stats.streakDays === 0
                  ? null
                  : `${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`,
              detail: "Consecutive days with timed study",
            },
            {
              label: "This week",
              value: `${stats.daysStudiedLast7} / 7`,
              detail: "Days with study in the last seven",
            },
            ...metricTiles(stats.metrics),
          ]}
        />
      </Section>

      <Section title="Study time by week">
        <WeeklyChart
          weeks={stats.weekly}
          currentWeek={week}
          label="Study time per week of the semester"
        />
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-14">
        <Section title="Courses">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b border-border text-left text-[12px] text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Course
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Lectures complete
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Study time
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    MCQ accuracy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.courses.map((course) => (
                  <tr key={course.id}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <Link
                        href={`/statistics?course=${course.slug}`}
                        className="flex items-center gap-2 text-fg hover:underline"
                      >
                        <CourseMark token={course.colorToken} />
                        {course.shortName}
                      </Link>
                    </th>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {course.lectures === 0
                        ? "—"
                        : `${course.completedLectures} / ${course.lectures}`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {course.studyMinutes === 0 ? "—" : formatMinutes(course.studyMinutes)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {percent(course.mcqAccuracy)}
                      {course.mcqAnswered > 0 ? (
                        <span className="ml-1 text-[12px] text-fg-subtle">
                          ({course.mcqAnswered})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Upcoming workload">
          <ul className="space-y-2.5 text-sm">
            {stats.upcoming.exams.length === 0 ? (
              <li className="text-fg-muted">No exams in the next four weeks.</li>
            ) : (
              stats.upcoming.exams.map((exam) => (
                <li key={`${exam.title}-${exam.date}`} className="flex justify-between gap-4">
                  <span className="text-fg">{exam.title}</span>
                  <span className="shrink-0 text-fg-muted tabular-nums">
                    {exam.days === 0
                      ? "Today"
                      : exam.days === 1
                        ? "Tomorrow"
                        : `In ${exam.days} days`}
                  </span>
                </li>
              ))
            )}
            <li className="flex justify-between gap-4 border-t border-border pt-2.5">
              <span className="text-fg">Flashcards due within 7 days</span>
              <span className="shrink-0 text-fg-muted tabular-nums">
                {stats.upcoming.flashcardsDue7}
              </span>
            </li>
          </ul>
        </Section>
      </div>

      <Section title="Weak spots">
        <WeaknessList
          weaknesses={weaknesses.slice(0, 12)}
          courses={links}
          showCourse
          empty="Nothing stands out yet. Weak spots appear here once your answers, ratings and reviews show a pattern."
        />
        <WeaknessRules />
      </Section>
    </div>
  );
}

async function CourseView({
  scope,
  courseId,
  courses: links,
  currentWeek: week,
  today,
}: ViewProps & { courseId: string }) {
  const stats = await scope.statistics.course(courseId);
  if (!stats) notFound();
  const { course } = stats;
  return (
    <div className="space-y-12">
      <Section title={course.name}>
        <TileGrid tiles={metricTiles(stats.metrics)} />
      </Section>

      <Section title="Study time by week">
        <WeeklyChart
          weeks={stats.weekly}
          currentWeek={week}
          label={`Study time per week, ${course.shortName}`}
        />
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 @4xl:grid-cols-2 @4xl:gap-14">
        <Section title="Weak spots">
          <WeaknessList
            weaknesses={stats.weaknesses}
            courses={links}
            showCourse={false}
            empty="Nothing stands out yet in this course."
          />
          <MarkConceptForm courseId={course.id} />
          <WeaknessRules />
        </Section>

        <Section title="Performance by topic">
          {stats.topics.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No MCQ answers with a topic yet. Topics come from the quizzes themselves.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[12px] text-fg-muted">
                <tr>
                  <th scope="col" className="py-2 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Answers
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Correct
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.topics.map((topic) => (
                  <tr key={topic.topic}>
                    <th scope="row" className="py-2 text-left font-normal text-fg">
                      {topic.topic}
                    </th>
                    <td className="py-2 text-right text-fg-muted tabular-nums">{topic.answered}</td>
                    <td className="py-2 text-right text-fg tabular-nums">{topic.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Lectures">
        {stats.lectures.length === 0 ? (
          <p className="text-sm text-fg-muted">No lectures in this course yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-border text-left text-[12px] text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Lecture
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Study time
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    MCQ accuracy
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Weak recall
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Card lapses
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.lectures.map((lecture) => (
                  <tr key={lecture.id}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <Link
                        href={lectureHref(course.slug, lecture.id)}
                        className="text-fg hover:underline"
                      >
                        <span className="text-fg-subtle">W{lecture.weekNumber} · </span>
                        {lecture.title}
                      </Link>
                    </th>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {lecture.completed ? "Complete" : "Open"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {lecture.studyMinutes === 0 ? "—" : formatMinutes(lecture.studyMinutes)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {percent(lecture.mcqAccuracy)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {lecture.weakRecall}
                    </td>
                    <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">
                      {lecture.lapses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-subtle">
          As of {formatDate(today, { weekday: true })}. Each lecture&rsquo;s own page shows its full
          performance.
        </p>
      </Section>
    </div>
  );
}

/** The rules of the weakness engine, in words. */
function WeaknessRules() {
  return (
    <details className="text-[12.5px] text-fg-subtle">
      <summary className="cursor-pointer font-medium text-fg-muted">
        How weak spots are found
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>An MCQ topic under 70% correct over at least 3 answers.</li>
        <li>A question answered wrong more than once.</li>
        <li>
          A lecture with 3 or more flashcard lapses, 2 or more Question Bank items last rated Again
          or Hard, or 2 or more Review Later items.
        </li>
        <li>A concept you marked difficult.</li>
      </ul>
      <p className="mt-2">
        Each item lists the signals that met these rules. There is no mastery score.
      </p>
    </details>
  );
}
