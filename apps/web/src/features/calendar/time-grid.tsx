"use client";

import { type IsoDate, formatDate } from "@medos/shared";
import { cn } from "@medos/ui";

import {
  STUDIED_CLASSES,
  allDayClasses,
  courseColor,
  eventClasses,
  eventDescription,
} from "./appearance";
import type { DisplayEvent, DisplayStudy } from "./load";
import { type TimedBlock, allDayOn, hourBounds, layoutDay } from "./model";

/*
 * The Day and Week views: one column per day, an all-day row on top, and
 * timed blocks placed by their start and end. Overlapping blocks share the
 * column side by side. The week scrolls sideways inside its frame on narrow
 * screens, never the page.
 */

const PX_PER_MINUTE = 0.8;
/** Height at which a block shows title, time and place whole (an hour fits; 50 minutes clips the place). */
const THREE_LINES_PX = 46;

type Block =
  | (TimedBlock & { kind: "event"; event: DisplayEvent })
  | (TimedBlock & { kind: "study"; study: DisplayStudy });

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

export function TimeGrid({
  days,
  today,
  events,
  studied,
  onSelect,
}: {
  days: readonly IsoDate[];
  today: IsoDate;
  events: readonly DisplayEvent[];
  studied: readonly DisplayStudy[];
  onSelect: (event: DisplayEvent) => void;
}) {
  const blocks: Block[] = [
    ...events
      .filter((event) => !event.allDay)
      .map((event): Block => ({ ...event, kind: "event", event })),
    ...studied.map((study): Block => ({ ...study, kind: "study", study })),
  ];
  const hours = hourBounds(blocks);
  const height = (hours.end - hours.start) * 60 * PX_PER_MINUTE;
  const single = days.length === 1;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className={cn(single ? "min-w-0" : "min-w-[46rem]")}>
        {/* Day headings and all-day items. */}
        <div
          className="grid border-b border-border"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div aria-hidden="true" />
          {days.map((day) => {
            const allDay = events.filter((event) => allDayOn(event, day, days[0] ?? day));
            return (
              <div key={day} className="min-w-0 space-y-1 border-l border-border px-1.5 py-2">
                <p
                  className={cn(
                    "text-center text-[12px] font-medium",
                    day === today ? "text-accent" : "text-fg-muted",
                  )}
                >
                  {single ? (
                    formatDate(day, { weekday: true })
                  ) : (
                    <>
                      {WEEKDAY.format(new Date(`${day}T00:00:00Z`))}{" "}
                      <span
                        className={cn(
                          "tabular-nums",
                          day === today && "rounded bg-accent px-1 text-accent-fg",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </>
                  )}
                </p>
                {allDay.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelect(event)}
                    aria-label={eventDescription(event)}
                    className={cn(
                      "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11.5px] font-medium",
                      allDayClasses(event),
                    )}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Hours and timed blocks. */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="relative" style={{ height }} aria-hidden="true">
            {Array.from({ length: hours.end - hours.start }, (_, index) => (
              <span
                key={index}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-fg-subtle tabular-nums"
                style={{ top: index * 60 * PX_PER_MINUTE }}
              >
                {index === 0 ? "" : `${String(hours.start + index).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const placed = layoutDay(blocks.filter((block) => block.date === day));
            return (
              <div
                key={day}
                role="list"
                aria-label={formatDate(day, { weekday: true })}
                className={cn(
                  "relative border-l border-border",
                  day === today && "bg-accent-soft/30",
                )}
                style={{ height }}
              >
                {Array.from({ length: hours.end - hours.start }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-border/70"
                    style={{ top: index * 60 * PX_PER_MINUTE }}
                  />
                ))}
                {placed.map(({ block, column, columns }) => {
                  const top = (block.startMinutes - hours.start * 60) * PX_PER_MINUTE;
                  const blockHeight = Math.max(
                    (block.endMinutes - block.startMinutes) * PX_PER_MINUTE,
                    18,
                  );
                  const style = {
                    top,
                    height: blockHeight,
                    left: `calc(${(column / columns) * 100}% + 2px)`,
                    width: `calc(${100 / columns}% - 4px)`,
                  };
                  if (block.kind === "study") {
                    return (
                      <div
                        key={`study-${block.id}`}
                        role="listitem"
                        className={cn(
                          "absolute overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight",
                          STUDIED_CLASSES,
                        )}
                        style={style}
                      >
                        <span className="font-medium">Studied</span> {block.study.activeMinutes}m
                        <span className="block truncate">{block.study.label}</span>
                      </div>
                    );
                  }
                  const event = block.event;
                  return (
                    <div key={event.id} role="listitem" className="absolute" style={style}>
                      <button
                        type="button"
                        onClick={() => onSelect(event)}
                        aria-label={eventDescription(event)}
                        className={cn(
                          "h-full w-full overflow-hidden rounded-md px-1.5 py-1 text-left text-[11.5px] leading-tight",
                          "transition-[filter] duration-150 hover:brightness-[0.97]",
                          eventClasses(event),
                        )}
                        style={courseColor(event.course?.colorToken ?? null)}
                      >
                        <span className="block truncate font-medium">{event.title}</span>
                        <span className="block truncate text-fg-muted tabular-nums">
                          {event.start}–{event.end}
                          {event.origin === "personal" ? ` · ${event.typeLabel}` : ""}
                        </span>
                        {/* A third line only where it fits whole; the label and the details keep the place. */}
                        {event.location && blockHeight >= THREE_LINES_PX ? (
                          <span className="block truncate text-fg-muted">{event.location}</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
