import { type IsoDate, addDays, formatDate, formatMinutes, isIsoDate } from "@medos/shared";
import { PLANNER_WEIGHTS } from "@medos/study-engine";
import { EmptyState, PageHeader, Progress, Section, Surface } from "@medos/ui";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { campusToday } from "@/features/calendar/load";
import { PlanBoard } from "@/features/planner/plan-board";
import { AvailabilityForm, PlanActions } from "@/features/planner/plan-controls";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Study Plan" };

interface StudyPlanPageProps {
  searchParams: Promise<{ date?: string | string[] }>;
}

const W = PLANNER_WEIGHTS;

/** The model in words (specification §20); the numbers come from the planner itself. */
const FACTORS: readonly { name: string; detail: string }[] = [
  { name: "Lecture today", detail: `${W.lectureToday} points for the lecture just taught.` },
  {
    name: "Unfinished lectures",
    detail: `${W.incompleteLecture} points, ${W.recentLecture} more if given in the last two weeks.`,
  },
  {
    name: "Flashcards due",
    detail: `${W.flashcardsBase} points plus ${W.flashcardsPerCard} per card due.`,
  },
  {
    name: "Weak MCQ topics",
    detail: `Under ${W.weakTopicAccuracy * 100}% correct over ${W.weakTopicMinAnswers}+ answers: ${W.weakTopicBase} points and more the weaker it is.`,
  },
  {
    name: "Weak recall",
    detail: `Question Bank items last rated Again or Hard: ${W.weakRecallBase} points plus ${W.weakRecallPerItem} each.`,
  },
  { name: "Review Later", detail: `${W.reviewLaterBase} points plus one per item.` },
  {
    name: "Exam urgency",
    detail: `Up to ${W.examUrgency} points over the ${W.examHorizonDays} days before a course exam or exam period.`,
  },
  {
    name: "Recent study",
    detail: `${W.neglect} points for a course studied under ${W.neglectMinutes} minutes this week.`,
  },
];

export default async function StudyPlanPage({ searchParams }: StudyPlanPageProps) {
  const { scope, semester } = await getWorkspace();
  const today = campusToday();
  const query = (await searchParams).date;
  const asked = Array.isArray(query) ? query[0] : query;
  const date = (asked && isIsoDate(asked) ? asked : today) as IsoDate;
  // Past days are shown as they were planned; suggestions are only made for today onwards.
  const past = date < today;
  const [plan, settings, courses] = await Promise.all([
    past ? scope.planner.get(date) : scope.planner.forDate(date),
    scope.planner.settings.get(),
    scope.courses.list(),
  ]);
  if (!plan) throw new Error("The plan could not be loaded.");
  const courseOptions = courses
    .filter((course) => course.semesterId === semester.id)
    .map((course) => ({ id: course.id, name: course.name }));
  const dayLabel = date === today ? "Today" : formatDate(date, { weekday: true });
  const href = (day: IsoDate) => `/study-plan?date=${day}`;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Study Plan"
        description="A suggested plan for each day that is yours to reorder, resize, postpone, add to or replace."
      />

      <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-14">
        <section aria-labelledby="plan-heading" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Link
                href={href(addDays(date, -1))}
                aria-label="Previous day"
                className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href={href(today)}
                className="rounded-lg border border-border-strong px-2.5 py-1 text-[13px] font-medium text-fg hover:bg-subtle"
              >
                Today
              </Link>
              <Link
                href={href(addDays(date, 1))}
                aria-label="Next day"
                className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <h2 id="plan-heading" className="text-lg font-semibold text-fg">
              {dayLabel}
              {date === today ? (
                <span className="ml-2 text-sm font-normal text-fg-muted">
                  {formatDate(date, { weekday: true })}
                </span>
              ) : null}
            </h2>
          </div>

          <div className="max-w-md">
            <p className="text-sm text-fg-muted">
              <span className="text-[22px] leading-none font-medium text-fg tabular-nums">
                {formatMinutes(plan.plannedMinutes)}
              </span>{" "}
              planned of {formatMinutes(plan.availableMinutes)}
            </p>
            <Progress
              className="mt-2.5"
              label="Planned study time"
              value={Math.min(plan.plannedMinutes, plan.availableMinutes)}
              max={Math.max(plan.availableMinutes, 1)}
              valueText={`${formatMinutes(plan.plannedMinutes)} of ${formatMinutes(plan.availableMinutes)}`}
            />
            {plan.plannedMinutes > plan.availableMinutes ? (
              <p className="mt-2 text-[12.5px] text-fg-muted">
                More than your study time for the day: your choice, nothing is held against it.
              </p>
            ) : null}
          </div>

          {past ? null : <PlanActions date={date} courses={courseOptions} />}

          {plan.items.length === 0 ? (
            <Surface>
              <EmptyState
                icon={<ListChecks />}
                title={past ? "Nothing was planned" : "Nothing planned"}
                description={
                  past
                    ? "This day had no plan."
                    : "There is nothing to suggest from your study so far. Add your own items, or refresh once you have lectures, flashcards or practice to review."
                }
              />
            </Surface>
          ) : (
            <PlanBoard
              // A new key when the stored plan changes, so the list shows it.
              key={plan.items
                .map((item) => `${item.id}:${item.position}:${item.minutes}:${item.status}`)
                .join()}
              date={date}
              items={plan.items}
              editable={!past}
            />
          )}
          {plan.setAside > 0 ? (
            <p className="text-[12.5px] text-fg-subtle">
              {plan.setAside === 1 ? "1 suggestion" : `${plan.setAside} suggestions`} set aside for
              this day. They are not suggested again.
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-fg-subtle">
            Ticking an item done never marks a lecture complete; only you do that, on the lecture
            page.
          </p>
        </section>

        <div className="space-y-10">
          <Section title="Available study time">
            <AvailabilityForm
              weekdayMinutes={settings.weekdayMinutes}
              weekendMinutes={settings.weekendMinutes}
            />
            <p className="text-xs leading-relaxed text-fg-subtle">
              Suggestions fill this time and never plan beyond it.
              {settings.custom
                ? ""
                : " These are the defaults: 2h 30m on weekdays, 4h at weekends."}
            </p>
          </Section>

          <Section title="How priority is decided">
            <ul className="space-y-3.5">
              {FACTORS.map((factor) => (
                <li key={factor.name}>
                  <p className="text-sm text-fg">{factor.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{factor.detail}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-fg-subtle">
              Each suggestion&rsquo;s priority is the sum of its reasons; open{" "}
              <strong className="font-medium">Why?</strong> on an item to see them. Highest first,
              until the day is full. No AI and no hidden scores.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
