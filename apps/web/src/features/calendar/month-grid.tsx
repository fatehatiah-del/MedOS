"use client";

import { type IsoDate, formatDate } from "@medos/shared";
import { cn } from "@medos/ui";
import Link from "next/link";

import { allDayClasses, courseColor, eventDescription } from "./appearance";
import type { DisplayEvent, DisplayStudy } from "./load";
import { allDayOn } from "./model";
import { calendarHref } from "./paths";

/*
 * The Month view: whole weeks around the month, each day with its all-day
 * items and first timed events, and a link to the day for the rest.
 */

const SHOWN = 3;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  days,
  anchor,
  today,
  events,
  studied,
  onSelect,
}: {
  days: readonly IsoDate[];
  anchor: IsoDate;
  today: IsoDate;
  events: readonly DisplayEvent[];
  studied: readonly DisplayStudy[];
  onSelect: (event: DisplayEvent) => void;
}) {
  const month = anchor.slice(0, 7);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className="min-w-[40rem]">
        <div className="grid grid-cols-7 border-b border-border" aria-hidden="true">
          {WEEKDAYS.map((name) => (
            <p key={name} className="px-2 py-2 text-[12px] font-medium text-fg-muted">
              {name}
            </p>
          ))}
        </div>
        <ul className="grid grid-cols-7">
          {days.map((day) => {
            const items = events.filter((event) =>
              event.allDay ? allDayOn(event, day, days[0] ?? day) : event.date === day,
            );
            const minutes = studied
              .filter((study) => study.date === day)
              .reduce((total, study) => total + study.activeMinutes, 0);
            const hidden = items.length - SHOWN;
            return (
              <li
                key={day}
                aria-label={formatDate(day, { weekday: true })}
                className={cn(
                  "min-h-28 min-w-0 space-y-1 border-b border-l border-border p-1.5 [&:nth-child(7n+1)]:border-l-0",
                  day.slice(0, 7) !== month && "bg-subtle/50",
                )}
              >
                <Link
                  href={calendarHref("day", day)}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums hover:bg-hover",
                    day === today
                      ? "bg-accent font-semibold text-accent-fg hover:bg-accent-hover"
                      : "text-fg-muted",
                  )}
                  aria-label={`Open ${formatDate(day, { weekday: true })}`}
                >
                  {Number(day.slice(8))}
                </Link>
                {items.slice(0, SHOWN).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelect(event)}
                    aria-label={eventDescription(event)}
                    className={cn(
                      "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px]",
                      event.allDay ? allDayClasses(event) : "text-fg hover:bg-hover",
                    )}
                    style={courseColor(event.course?.colorToken ?? null)}
                  >
                    {event.allDay ? null : (
                      <>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            event.origin === "personal"
                              ? "border border-accent"
                              : "bg-[var(--event-color)]",
                          )}
                        />
                        <span className="text-fg-subtle tabular-nums">{event.start}</span>
                      </>
                    )}
                    <span className="truncate">{event.title}</span>
                  </button>
                ))}
                {hidden > 0 ? (
                  <Link
                    href={calendarHref("day", day)}
                    className="block px-1 text-[11px] font-medium text-accent hover:underline"
                  >
                    {hidden} more
                  </Link>
                ) : null}
                {minutes > 0 ? (
                  <p className="px-1 text-[11px] text-fg-subtle">Studied {minutes}m</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
