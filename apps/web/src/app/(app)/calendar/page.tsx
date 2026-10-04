import {
  CURRENT_SEMESTER,
  FALL_2026_ACADEMIC_CALENDAR,
  academicPeriods,
  formatDate,
  formatDateRange,
} from "@medos/shared";
import { PageHeader, Section } from "@medos/ui";
import type { Metadata } from "next";

import { CourseMark } from "@/components/course-mark";
import { CalendarBoard } from "@/features/calendar/calendar-board";
import { campusToday, loadCalendar, toDisplayEvent } from "@/features/calendar/load";
import { parseCalendarQuery } from "@/features/calendar/model";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Calendar" };

interface CalendarPageProps {
  searchParams: Promise<{ view?: string | string[]; date?: string | string[] }>;
}

const LEGEND = [
  { label: "University timetable", sample: "border-l-[3px] border-l-fg-subtle bg-subtle" },
  { label: "Your own events", sample: "border border-dashed border-accent" },
  { label: "Exams", sample: "border-l-[3px] border-l-danger bg-danger-soft" },
  { label: "Timed study", sample: "border border-dotted border-fg-subtle bg-subtle/60" },
] as const;

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { scope, semester } = await getWorkspace();
  const today = campusToday();
  const { view, anchor } = parseCalendarQuery(await searchParams, today);
  const [data, courses, exams] = await Promise.all([
    loadCalendar(scope, view, anchor, today),
    scope.courses.list(),
    scope.calendar.exams.upcoming(new Date()),
  ]);
  const courseOptions = courses
    .filter((course) => course.semesterId === semester.id)
    .map((course) => ({ id: course.id, name: course.name }));

  return (
    <div data-layout="wide" className="space-y-10">
      <PageHeader
        eyebrow={`${CURRENT_SEMESTER.name} · Group ${CURRENT_SEMESTER.group}`}
        title="Calendar"
        description="Your Group A timetable, the academic calendar, exams and your own events."
      />

      <CalendarBoard data={data} courses={courseOptions} />

      <ul
        aria-label="Legend"
        className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-fg-muted"
      >
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={`inline-block h-3 w-5 rounded-sm ${item.sample}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <div className="grid gap-10 @3xl:grid-cols-2 @3xl:gap-14">
        <Section title="Course exams">
          {exams.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No course exams yet. Add each one with{" "}
              <strong className="font-medium">Add exam</strong> once the university announces its
              date.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {exams.map((item) => {
                const exam = toDisplayEvent(item);
                return (
                  <li key={exam.id} className="flex items-baseline justify-between gap-6 py-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                      <CourseMark token={exam.course?.colorToken ?? null} />
                      <span className="truncate">{exam.title}</span>
                    </span>
                    <span className="shrink-0 text-right text-[13px] text-fg-muted tabular-nums">
                      {formatDate(exam.date, { weekday: true })}, {exam.start}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Academic calendar">
          <dl className="divide-y divide-border border-y border-border">
            {academicPeriods().map((period) => (
              <div key={period.kind} className="flex items-baseline justify-between gap-6 py-3">
                <dt className="text-sm text-fg">{period.label}</dt>
                <dd className="text-right text-[13px] text-fg-muted tabular-nums">
                  {formatDateRange(period.range)}
                </dd>
              </div>
            ))}
            {FALL_2026_ACADEMIC_CALENDAR.dates
              .filter((date) => date.kind === "holiday")
              .map((date) => (
                <div key={date.key} className="flex items-baseline justify-between gap-6 py-3">
                  <dt className="text-sm text-fg">{date.title}</dt>
                  <dd className="text-right text-[13px] text-fg-muted tabular-nums">
                    {formatDateRange(date.range)}
                  </dd>
                </div>
              ))}
          </dl>
          <p className="text-xs leading-relaxed text-fg-subtle">
            From the university&rsquo;s academic calendar and your Group A timetable. No teaching on
            public holidays or during the midterm period.
          </p>
        </Section>
      </div>
    </div>
  );
}
