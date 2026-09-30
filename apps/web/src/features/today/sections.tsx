import { COURSES, formatDateRange, formatMinutes, getCourse } from "@medos/shared";
import { Badge, EmptyState, Progress, Section, Surface, cn, progressPercent } from "@medos/ui";
import { ChevronRight, MapPin, RotateCcw } from "lucide-react";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";

import { type ExamPeriodSummary, describePeriodStatus } from "./summary";
import {
  SCHEDULE_KIND_LABELS,
  STUDY_ACTIVITY_LABELS,
  type ScheduleEntry,
  type StudyPlanItem,
} from "./types";

interface SectionProps {
  className?: string;
}

/** 1. What university activity do I have today? */
export function ScheduleSection({
  schedule,
  className,
}: SectionProps & { schedule: ScheduleEntry[] }) {
  return (
    <Section title="Today's university schedule" className={className}>
      <Surface>
        {schedule.length === 0 ? (
          <EmptyState
            size="compact"
            title="No university activity today"
            description="Lectures and labs from your timetable appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {schedule.map((entry) => {
              const course = getCourse(entry.courseId);
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
                >
                  <p className="w-28 shrink-0 text-sm font-medium text-fg tabular-nums">
                    {entry.start}–{entry.end}
                  </p>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2.5 text-[15px] font-medium text-fg">
                      <CourseMark courseId={course.id} />
                      <span className="truncate">{course.name}</span>
                    </p>
                    <p className="mt-0.5 pl-5 text-[13px] text-fg-subtle">
                      {SCHEDULE_KIND_LABELS[entry.kind]}
                    </p>
                  </div>
                  {entry.location ? (
                    <p className="flex shrink-0 items-center gap-1.5 pl-5 text-[13px] text-fg-muted sm:pl-0">
                      <MapPin aria-hidden="true" className="size-3.5 text-fg-subtle" />
                      <span className="sr-only">Location: </span>
                      {entry.location}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </Section>
  );
}

/** 2. What should I study today? */
export function PlanSection({
  plan,
  plannedMinutes,
  className,
}: SectionProps & { plan: StudyPlanItem[]; plannedMinutes: number }) {
  return (
    <Section
      title="Recommended study plan"
      aside={plan.length > 0 ? `${formatMinutes(plannedMinutes)} planned` : undefined}
      className={className}
    >
      <Surface>
        {plan.length === 0 ? (
          <EmptyState
            size="compact"
            title="Nothing planned"
            description="Recommended study blocks for today appear here."
          />
        ) : (
          <ol className="divide-y divide-border">
            {plan.map((item, index) => {
              const course = getCourse(item.courseId);
              const activity = STUDY_ACTIVITY_LABELS[item.activity];
              return (
                <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 text-[13px] text-fg-subtle tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2.5 text-[15px] font-medium text-fg">
                      <CourseMark courseId={course.id} />
                      <span className="truncate">{course.shortName}</span>
                    </p>
                    {/* On narrow screens the activity joins this line instead of a badge. */}
                    <p
                      className={cn(
                        "mt-0.5 truncate pl-5 text-[13px] text-fg-muted",
                        !item.detail && "sm:hidden",
                      )}
                    >
                      {item.detail}
                      <span className="sm:hidden">
                        {item.detail ? " · " : null}
                        {activity}
                      </span>
                    </p>
                  </div>
                  <Badge className="hidden sm:inline-flex">{activity}</Badge>
                  <p className="w-12 shrink-0 text-right text-sm font-medium text-fg tabular-nums">
                    {formatMinutes(item.minutes)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-fg-subtle">
          The plan will be yours to reorder, resize, postpone or replace once the Study Planner is
          built.
        </p>
      </Surface>
    </Section>
  );
}

/** 4. How am I progressing? */
export function ProgressSection({
  studiedMinutes,
  availableMinutes,
  className,
}: SectionProps & { studiedMinutes: number; availableMinutes: number }) {
  const studied = formatMinutes(studiedMinutes);
  const available = formatMinutes(availableMinutes);
  return (
    <Section title="Today's progress" className={className}>
      <div>
        <p className="text-sm text-fg-muted">
          <span className="text-[26px] leading-none font-medium tracking-[-0.01em] text-fg tabular-nums">
            {studied}
          </span>{" "}
          / {available}
        </p>
        <Progress
          className="mt-3.5"
          label="Study time today"
          value={studiedMinutes}
          max={availableMinutes}
          valueText={`${studied} of ${available}`}
        />
        <p className="mt-2.5 text-xs text-fg-subtle">
          {progressPercent(studiedMinutes, availableMinutes)}% of today&rsquo;s study time
        </p>
      </div>
    </Section>
  );
}

/** 3. What is due or overdue? Nothing can be due until flashcards and Review Later exist. */
export function DueReviewSection({ className }: SectionProps) {
  return (
    <Section title="Due for review" className={className}>
      <Surface>
        <EmptyState
          size="compact"
          icon={<RotateCcw />}
          title="Nothing due"
          description="Due flashcards and Review Later items will appear here, one course at a time."
        />
      </Surface>
    </Section>
  );
}

export function CoursesSection({ className }: SectionProps) {
  return (
    <Section title="Courses" className={className}>
      <ul className="-mx-2.5">
        {COURSES.map((course) => (
          <li key={course.id}>
            <Link
              href={courseHref(course.id)}
              className="group flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm text-fg transition-colors duration-150 hover:bg-hover/60"
            >
              <CourseMark courseId={course.id} />
              <span className="min-w-0 flex-1 truncate">{course.shortName}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ExamPeriodsSection({
  periods,
  className,
}: SectionProps & { periods: ExamPeriodSummary[] }) {
  if (periods.length === 0) return null;
  return (
    <Section title="Exam periods" className={className}>
      <dl className="space-y-3.5">
        {periods.map(({ period, status }) => (
          <div
            key={period.kind}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5"
          >
            <dt className="text-sm text-fg">{period.label}</dt>
            <dd className="text-[13px] text-fg-muted tabular-nums">
              {describePeriodStatus(status)}
            </dd>
            <dd className="col-span-2 text-xs text-fg-subtle">{formatDateRange(period.range)}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
