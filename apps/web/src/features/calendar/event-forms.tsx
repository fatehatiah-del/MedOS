"use client";

import { MAX_EVENT_LOCATION, MAX_EVENT_NOTES, MAX_EVENT_TITLE } from "@medos/database/limits";
import { Button, Field, Input } from "@medos/ui";
import { useId, useState, useTransition } from "react";

import {
  addCourseExam,
  createCalendarEvent,
  updateCalendarEvent,
  updateCourseExam,
} from "./actions";
import { EXAM_KIND_OPTIONS, USER_TYPE_OPTIONS } from "./event-types";
import type { DisplayEvent } from "./load";

/*
 * Forms for the user's own events and for course exams. Dates and times are
 * campus wall-clock values; the server turns them into instants.
 */

export interface CourseOption {
  id: string;
  name: string;
}

const selectClasses =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none";
const textareaClasses =
  "min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none";

function useSubmit(onDone: () => void) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (result.ok) onDone();
        else setError(result.error ?? "This could not be saved.");
      } catch {
        setError("MedOS could not be reached. Check your connection and try again.");
      }
    });
  return { pending, error, submit };
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[13px] text-danger">
      {error}
    </p>
  ) : null;
}

/** Create or edit one of the user's own events. */
export function EventForm({
  event,
  defaultDate,
  courses,
  onDone,
}: {
  event?: DisplayEvent;
  defaultDate: string;
  courses: readonly CourseOption[];
  onDone: () => void;
}) {
  const id = useId();
  const { pending, error, submit } = useSubmit(onDone);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);

  return (
    <form
      className="space-y-4"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const data = new FormData(formEvent.currentTarget);
        const text = (name: string) => String(data.get(name) ?? "");
        const input = {
          type: text("type"),
          title: text("title"),
          courseId: text("courseId") || null,
          date: text("date"),
          allDay,
          endDate: allDay ? text("endDate") || text("date") : null,
          start: allDay ? null : text("start"),
          end: allDay ? null : text("end"),
          location: text("location") || null,
          notes: text("notes") || null,
        };
        submit(() =>
          event ? updateCalendarEvent({ ...input, eventId: event.id }) : createCalendarEvent(input),
        );
      }}
    >
      <Field label="Title" htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          name="title"
          required
          maxLength={MAX_EVENT_TITLE}
          defaultValue={event?.title ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${id}-type`}>
          <select
            id={`${id}-type`}
            name="type"
            className={selectClasses}
            defaultValue={event?.type ?? "study-session"}
          >
            {USER_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course" htmlFor={`${id}-course`}>
          <select
            id={`${id}-course`}
            name="courseId"
            className={selectClasses}
            defaultValue={event?.course?.id ?? ""}
          >
            <option value="">No course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(change) => setAllDay(change.target.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        All day
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={allDay ? "First day" : "Date"} htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            name="date"
            type="date"
            required
            defaultValue={event?.date ?? defaultDate}
          />
        </Field>
        {allDay ? (
          <Field label="Last day" htmlFor={`${id}-end-date`}>
            <Input
              id={`${id}-end-date`}
              name="endDate"
              type="date"
              defaultValue={event?.endDate ?? event?.date ?? defaultDate}
            />
          </Field>
        ) : (
          <>
            <Field label="Start" htmlFor={`${id}-start`}>
              <Input
                id={`${id}-start`}
                name="start"
                type="time"
                required
                defaultValue={event && !event.allDay ? event.start : "09:00"}
              />
            </Field>
            <Field label="End" htmlFor={`${id}-end`}>
              <Input
                id={`${id}-end`}
                name="end"
                type="time"
                required
                defaultValue={event && !event.allDay ? event.end : "10:00"}
              />
            </Field>
          </>
        )}
      </div>
      <Field label="Place" htmlFor={`${id}-location`}>
        <Input
          id={`${id}-location`}
          name="location"
          maxLength={MAX_EVENT_LOCATION}
          defaultValue={event?.location ?? ""}
        />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`}>
        <textarea
          id={`${id}-notes`}
          name="notes"
          maxLength={MAX_EVENT_NOTES}
          className={textareaClasses}
          defaultValue={event?.notes ?? ""}
        />
      </Field>
      <FormError error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {event ? "Save changes" : "Add event"}
        </Button>
      </div>
    </form>
  );
}

/** Add or edit a course exam, entered once the university announces it. */
export function ExamForm({
  event,
  defaultDate,
  courses,
  onDone,
}: {
  event?: DisplayEvent;
  defaultDate: string;
  courses: readonly CourseOption[];
  onDone: () => void;
}) {
  const id = useId();
  const { pending, error, submit } = useSubmit(onDone);

  return (
    <form
      className="space-y-4"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const data = new FormData(formEvent.currentTarget);
        const text = (name: string) => String(data.get(name) ?? "");
        const input = {
          courseId: text("courseId"),
          kind: text("kind"),
          title: text("title") || null,
          date: text("date"),
          start: text("start"),
          end: text("end"),
          location: text("location") || null,
          notes: text("notes") || null,
        };
        submit(() =>
          event ? updateCourseExam({ ...input, eventId: event.id }) : addCourseExam(input),
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course" htmlFor={`${id}-course`}>
          <select
            id={`${id}-course`}
            name="courseId"
            required
            className={selectClasses}
            defaultValue={event?.course?.id ?? ""}
          >
            <option value="" disabled>
              Choose a course
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Exam" htmlFor={`${id}-kind`}>
          <select
            id={`${id}-kind`}
            name="kind"
            className={selectClasses}
            defaultValue={event?.examKind ?? "final"}
          >
            {EXAM_KIND_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            name="date"
            type="date"
            required
            defaultValue={event?.date ?? defaultDate}
          />
        </Field>
        <Field label="Start" htmlFor={`${id}-start`}>
          <Input
            id={`${id}-start`}
            name="start"
            type="time"
            required
            defaultValue={event?.start ?? "09:00"}
          />
        </Field>
        <Field label="End" htmlFor={`${id}-end`}>
          <Input
            id={`${id}-end`}
            name="end"
            type="time"
            required
            defaultValue={event?.end ?? "11:00"}
          />
        </Field>
      </div>
      <Field label="Place" htmlFor={`${id}-location`}>
        <Input
          id={`${id}-location`}
          name="location"
          maxLength={MAX_EVENT_LOCATION}
          defaultValue={event?.location ?? ""}
        />
      </Field>
      <Field
        label="Title"
        htmlFor={`${id}-title`}
        hint="Optional. Without one, the exam is named after its course."
      >
        <Input
          id={`${id}-title`}
          name="title"
          maxLength={MAX_EVENT_TITLE}
          defaultValue={event?.title ?? ""}
        />
      </Field>
      <Field label="Notes" htmlFor={`${id}-notes`}>
        <textarea
          id={`${id}-notes`}
          name="notes"
          maxLength={MAX_EVENT_NOTES}
          className={textareaClasses}
          defaultValue={event?.notes ?? ""}
        />
      </Field>
      <FormError error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {event ? "Save exam" : "Add exam"}
        </Button>
      </div>
    </form>
  );
}
