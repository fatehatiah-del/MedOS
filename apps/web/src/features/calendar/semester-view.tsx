"use client";

import { type IsoDate, addDays } from "@medos/shared";
import { cn } from "@medos/ui";
import Link from "next/link";

import { allDayClasses, eventDescription } from "./appearance";
import type { DisplayEvent } from "./load";
import { calendarHref } from "./paths";

/*
 * The Semester view: the term week by week, numbered as the academic
 * calendar numbers them (holiday weeks are not teaching weeks), with each
 * week's academic dates, exams and amount of teaching.
 */

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const short = (date: IsoDate) => SHORT.format(new Date(`${date}T00:00:00Z`));

export interface SemesterWeek {
  start: IsoDate;
  end: IsoDate;
  /** "Week 3", "Winter holidays", "Final exams". */
  label: string;
  teaching: boolean;
  lectures: number;
  labs: number;
  highlights: DisplayEvent[];
}

/** Splits the visible range into weeks and names them as the academic calendar does. */
export function semesterWeeks(
  days: readonly IsoDate[],
  events: readonly DisplayEvent[],
): SemesterWeek[] {
  const weeks: SemesterWeek[] = [];
  let teachingWeek = 0;
  for (let index = 0; index < days.length; index += 7) {
    const start = days[index] as IsoDate;
    const end = addDays(start, 6);
    const friday = addDays(start, 4);
    const inWeek = events.filter((event) =>
      event.allDay
        ? event.date <= end && event.endDate >= start
        : event.date >= start && event.date <= end,
    );
    const covering = (type: DisplayEvent["type"]) =>
      inWeek.find(
        (event) =>
          event.allDay && event.type === type && event.date <= start && event.endDate >= friday,
      );
    const holiday = covering("holiday");
    const finals = covering("exam");
    const sessions = inWeek.filter((event) => !event.allDay && event.origin === "university");
    let label: string;
    let teaching = false;
    if (holiday) label = holiday.title;
    else if (finals) label = "Final exams";
    else {
      teachingWeek += 1;
      teaching = true;
      label = `Week ${teachingWeek}`;
    }
    weeks.push({
      start,
      end,
      label,
      teaching,
      lectures: sessions.filter((event) => event.type === "lecture").length,
      labs: sessions.filter((event) => event.type === "lab").length,
      highlights: inWeek.filter(
        (event) =>
          event.allDay ||
          event.examKind !== null ||
          event.type === "exam" ||
          event.type === "midterm",
      ),
    });
  }
  return weeks;
}

export function SemesterView({
  days,
  today,
  events,
  onSelect,
}: {
  days: readonly IsoDate[];
  today: IsoDate;
  events: readonly DisplayEvent[];
  onSelect: (event: DisplayEvent) => void;
}) {
  const weeks = semesterWeeks(days, events);
  return (
    <ol
      aria-label="Weeks of the semester"
      className="divide-y divide-border rounded-xl border border-border bg-surface"
    >
      {weeks.map((week) => {
        const current = week.start <= today && week.end >= today;
        return (
          <li
            key={week.start}
            aria-current={current ? "date" : undefined}
            className={cn(
              "grid gap-x-6 gap-y-2 px-4 py-3 @2xl:grid-cols-[9rem_8rem_minmax(0,1fr)]",
              current && "bg-accent-soft/40",
            )}
          >
            <Link
              href={calendarHref("week", week.start)}
              className={cn(
                "text-sm font-medium hover:underline",
                week.teaching ? "text-fg" : "text-fg-muted",
              )}
            >
              {week.label}
              {current ? (
                <span className="ml-1.5 text-[12px] font-normal text-accent"> (this week)</span>
              ) : null}
            </Link>
            <p className="text-[13px] text-fg-muted tabular-nums">
              {short(week.start)} – {short(addDays(week.start, 4))}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {week.lectures + week.labs > 0 ? (
                <span className="text-[12.5px] text-fg-subtle">
                  {week.lectures} lectures · {week.labs} labs
                </span>
              ) : null}
              {week.highlights.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onSelect(event)}
                  aria-label={eventDescription(event)}
                  className={cn(
                    "max-w-full truncate rounded px-1.5 py-0.5 text-[12px] font-medium",
                    event.allDay ? allDayClasses(event) : "bg-danger-soft text-fg",
                  )}
                >
                  {event.allDay ? event.title : `${short(event.date)} · ${event.title}`}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
