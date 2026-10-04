"use client";

import { MAX_EVENT_NOTES } from "@medos/database/limits";
import { formatDate } from "@medos/shared";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  cn,
} from "@medos/ui";
import { CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { deleteCalendarEvent, setCalendarEventNotes } from "./actions";
import { type CourseOption, EventForm, ExamForm } from "./event-forms";
import { CALENDAR_VIEWS } from "./event-types";
import type { CalendarData, DisplayEvent } from "./load";
import { MonthGrid } from "./month-grid";
import { calendarHref } from "./paths";
import { SemesterView } from "./semester-view";
import { TimeGrid } from "./time-grid";

/*
 * The calendar workspace: view switcher and navigation, the chosen view, and
 * the dialogs for an event's details, the user's own events and exams.
 */

type Panel =
  | { kind: "details"; event: DisplayEvent }
  | { kind: "edit-event"; event: DisplayEvent }
  | { kind: "edit-exam"; event: DisplayEvent }
  | { kind: "new-event" }
  | { kind: "new-exam" };

export function CalendarBoard({
  data,
  courses,
}: {
  data: CalendarData;
  courses: readonly CourseOption[];
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);
  const select = (event: DisplayEvent) => setPanel({ kind: "details", event });
  const defaultDate = data.view === "semester" || data.view === "month" ? data.today : data.anchor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Calendar view" className="flex rounded-lg bg-subtle p-0.5">
          {CALENDAR_VIEWS.map((view) => (
            <Link
              key={view.id}
              href={calendarHref(view.id, data.anchor)}
              aria-current={view.id === data.view ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                view.id === data.view
                  ? "bg-surface text-fg shadow-xs"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {view.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPanel({ kind: "new-event" })}>
            <CalendarPlus aria-hidden="true" />
            New event
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPanel({ kind: "new-exam" })}>
            <GraduationCap aria-hidden="true" />
            Add exam
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {data.view === "semester" ? null : (
          <div className="flex items-center gap-1">
            <Link
              href={calendarHref(data.view, data.previous)}
              aria-label={`Previous ${data.view}`}
              className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href={calendarHref(data.view, data.today)}
              className="rounded-lg border border-border-strong px-2.5 py-1 text-[13px] font-medium text-fg hover:bg-subtle"
            >
              Today
            </Link>
            <Link
              href={calendarHref(data.view, data.next)}
              aria-label={`Next ${data.view}`}
              className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        )}
        <h2 className="text-lg font-semibold text-fg" aria-live="polite">
          {data.title}
        </h2>
      </div>

      {data.view === "day" || data.view === "week" ? (
        <TimeGrid
          days={data.days}
          today={data.today}
          events={data.events}
          studied={data.studied}
          onSelect={select}
        />
      ) : data.view === "month" ? (
        <MonthGrid
          days={data.days}
          anchor={data.anchor}
          today={data.today}
          events={data.events}
          studied={data.studied}
          onSelect={select}
        />
      ) : (
        <SemesterView days={data.days} today={data.today} events={data.events} onSelect={select} />
      )}

      <Dialog open={panel !== null} onOpenChange={(open) => !open && close()}>
        {panel ? (
          <DialogContent className="max-w-lg">
            {panel.kind === "details" ? (
              <EventDetails
                event={panel.event}
                onEdit={() =>
                  setPanel({
                    kind: panel.event.examKind ? "edit-exam" : "edit-event",
                    event: panel.event,
                  })
                }
                onDone={close}
              />
            ) : panel.kind === "new-event" || panel.kind === "edit-event" ? (
              <>
                <DialogTitle>{panel.kind === "new-event" ? "New event" : "Edit event"}</DialogTitle>
                <DialogDescription>
                  Your own events appear outlined, apart from the university timetable.
                </DialogDescription>
                <div className="mt-4">
                  <EventForm
                    event={panel.kind === "edit-event" ? panel.event : undefined}
                    defaultDate={defaultDate}
                    courses={courses}
                    onDone={close}
                  />
                </div>
              </>
            ) : (
              <>
                <DialogTitle>{panel.kind === "new-exam" ? "Add exam" : "Edit exam"}</DialogTitle>
                <DialogDescription>
                  Enter a course exam once the university announces its date.
                </DialogDescription>
                <div className="mt-4">
                  <ExamForm
                    event={panel.kind === "edit-exam" ? panel.event : undefined}
                    defaultDate={defaultDate}
                    courses={courses}
                    onDone={close}
                  />
                </div>
              </>
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function EventDetails({
  event,
  onEdit,
  onDone,
}: {
  event: DisplayEvent;
  onEdit: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const [notes, setNotes] = useState(event.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const when = event.allDay
    ? event.endDate === event.date
      ? formatDate(event.date, { weekday: true, year: true })
      : `${formatDate(event.date, { weekday: true })} – ${formatDate(event.endDate, { weekday: true, year: true })}`
    : `${formatDate(event.date, { weekday: true, year: true })}, ${event.start}–${event.end}`;

  return (
    <>
      <DialogTitle>{event.title}</DialogTitle>
      <DialogDescription>{when}</DialogDescription>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
          <Badge tone={event.origin === "university" ? "accent" : "outline"}>
            {event.typeLabel}
          </Badge>
          {event.course ? <span>{event.course.name}</span> : null}
          {event.studentGroup ? <span>· Group {event.studentGroup}</span> : null}
        </div>
        {event.location ? (
          <p className="flex items-center gap-1.5 text-sm text-fg">
            <MapPin aria-hidden="true" className="size-4 text-fg-subtle" />
            <span className="sr-only">Place: </span>
            {event.location}
          </p>
        ) : null}
        {event.imported ? (
          <p className="text-[12.5px] text-fg-subtle">
            From the university timetable. It cannot be changed here; your notes are kept even when
            the timetable is imported again.
          </p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={`${id}-notes`} className="block text-sm font-medium text-fg">
            Notes
          </label>
          <textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={MAX_EVENT_NOTES}
            onChange={(change) => setNotes(change.target.value)}
            className="min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>
        {message ? (
          <p role="status" className="text-[13px] text-fg-muted">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {event.imported ? null : (
              <>
                <Button size="sm" variant="secondary" onClick={onEdit}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Delete "${event.title}"?`)) return;
                    startTransition(async () => {
                      const result = await deleteCalendarEvent({ eventId: event.id });
                      if (result.ok) onDone();
                      else setMessage(result.error);
                    });
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="primary"
            disabled={pending || notes === (event.notes ?? "")}
            onClick={() =>
              startTransition(async () => {
                const result = await setCalendarEventNotes({
                  eventId: event.id,
                  notes: notes || null,
                });
                setMessage(result.ok ? "Notes saved." : result.error);
              })
            }
          >
            Save notes
          </Button>
        </div>
      </div>
    </>
  );
}
