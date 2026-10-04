import {
  type CalendarResult,
  EXAM_KINDS,
  MAX_EVENT_LOCATION,
  MAX_EVENT_NOTES,
  MAX_EVENT_TITLE,
  USER_EVENT_TYPES,
  type UserScope,
} from "@medos/database";
import {
  CURRENT_SEMESTER,
  type ClockTime,
  type IsoDate,
  addDays,
  clockMinutes,
  daysBetween,
  isClockTime,
  isIsoDate,
  zonedInstant,
} from "@medos/shared";
import { z } from "zod";

/*
 * Calendar Server Functions, apart from their wrappers so they can be tested
 * directly. The browser sends campus wall-clock dates and times; they are
 * turned into instants here, in the campus time zone. Whose data it is comes
 * only from the scope.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGES = {
  invalid: "Check the details: a title is needed, and the end must be after the start.",
  notFound: "This event could not be found. It may have been deleted.",
  readOnly: "University timetable events cannot be changed; you can keep notes on them.",
} as const;

const ZONE = CURRENT_SEMESTER.timeZone;

const date = z.string().refine((value) => isIsoDate(value));
const time = z.string().refine((value) => isClockTime(value));
const optionalText = (max: number) => z.string().max(max).nullable().optional();

const eventInput = z.object({
  type: z.enum(USER_EVENT_TYPES),
  title: z.string().max(MAX_EVENT_TITLE),
  courseId: z.uuid().nullable().optional(),
  date,
  allDay: z.boolean(),
  /** Last day of an all-day event; the same day when absent. */
  endDate: date.nullable().optional(),
  start: time.nullable().optional(),
  end: time.nullable().optional(),
  location: optionalText(MAX_EVENT_LOCATION),
  notes: optionalText(MAX_EVENT_NOTES),
});

const examInput = z.object({
  courseId: z.uuid(),
  kind: z.enum(EXAM_KINDS),
  title: optionalText(MAX_EVENT_TITLE),
  date,
  start: time,
  end: time,
  location: optionalText(MAX_EVENT_LOCATION),
  notes: optionalText(MAX_EVENT_NOTES),
});

const idInput = z.object({ eventId: z.uuid() });

/** Instants of a timed event on one day; null when the end is not after the start. */
function timedSpan(day: IsoDate, start: ClockTime, end: ClockTime) {
  if (clockMinutes(end) <= clockMinutes(start)) return null;
  return { startsAt: zonedInstant(day, start, ZONE), endsAt: zonedInstant(day, end, ZONE) };
}

function eventFields(input: z.infer<typeof eventInput>) {
  const day = input.date as IsoDate;
  let span: { startsAt: Date; endsAt: Date } | null;
  if (input.allDay) {
    const last = (input.endDate ?? input.date) as IsoDate;
    span =
      daysBetween(day, last) < 0
        ? null
        : {
            startsAt: zonedInstant(day, "00:00", ZONE),
            endsAt: zonedInstant(addDays(last, 1), "00:00", ZONE),
          };
  } else {
    span =
      input.start && input.end
        ? timedSpan(day, input.start as ClockTime, input.end as ClockTime)
        : null;
  }
  if (!span) return null;
  return {
    type: input.type,
    title: input.title,
    courseId: input.courseId ?? null,
    ...span,
    allDay: input.allDay,
    timezone: ZONE,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
}

function examFields(input: z.infer<typeof examInput>) {
  const span = timedSpan(input.date as IsoDate, input.start as ClockTime, input.end as ClockTime);
  if (!span) return null;
  return {
    courseId: input.courseId,
    kind: input.kind,
    title: input.title ?? null,
    ...span,
    timezone: ZONE,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
}

function outcome(result: CalendarResult): ActionResult<{ eventId: string }> {
  if (result.ok) return { ok: true, value: { eventId: result.event.id } };
  return {
    ok: false,
    error:
      result.reason === "not-found"
        ? MESSAGES.notFound
        : result.reason === "read-only"
          ? MESSAGES.readOnly
          : MESSAGES.invalid,
  };
}

export async function createEvent(scope: UserScope, input: unknown) {
  const parsed = eventInput.safeParse(input);
  const fields = parsed.success ? eventFields(parsed.data) : null;
  if (!fields) return { ok: false, error: MESSAGES.invalid } as const;
  return outcome(await scope.calendar.create(fields));
}

export async function updateEvent(scope: UserScope, input: unknown) {
  const parsed = eventInput.extend(idInput.shape).safeParse(input);
  const fields = parsed.success ? eventFields(parsed.data) : null;
  if (!parsed.success || !fields) return { ok: false, error: MESSAGES.invalid } as const;
  return outcome(await scope.calendar.update(parsed.data.eventId, fields));
}

export async function setEventNotes(scope: UserScope, input: unknown) {
  const parsed = idInput.extend({ notes: optionalText(MAX_EVENT_NOTES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid } as const;
  return outcome(await scope.calendar.setNotes(parsed.data.eventId, parsed.data.notes ?? null));
}

export async function deleteEvent(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const result = await scope.calendar.remove(parsed.data.eventId);
  if (result.ok) return { ok: true, value: undefined };
  return {
    ok: false,
    error: result.reason === "read-only" ? MESSAGES.readOnly : MESSAGES.notFound,
  };
}

export async function addExam(scope: UserScope, input: unknown) {
  const parsed = examInput.safeParse(input);
  const fields = parsed.success ? examFields(parsed.data) : null;
  if (!fields) return { ok: false, error: MESSAGES.invalid } as const;
  return outcome(await scope.calendar.exams.add(fields));
}

export async function updateExam(scope: UserScope, input: unknown) {
  const parsed = examInput.extend(idInput.shape).safeParse(input);
  const fields = parsed.success ? examFields(parsed.data) : null;
  if (!parsed.success || !fields) return { ok: false, error: MESSAGES.invalid } as const;
  return outcome(await scope.calendar.exams.update(parsed.data.eventId, fields));
}
