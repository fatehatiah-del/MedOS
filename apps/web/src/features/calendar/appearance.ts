import { isCourseId } from "@medos/shared";
import { cn } from "@medos/ui";
import type { CSSProperties } from "react";

import type { DisplayEvent } from "./load";

/*
 * How events look. University events are filled with their course colour;
 * the user's own events are outlined and dashed; timed study is dotted and
 * quiet. The difference never rests on colour alone: own events also carry
 * their type in text, and study blocks say "Studied".
 */

/** The course colour as a CSS variable, for the classes below. */
export function courseColor(token: string | null): CSSProperties {
  const color = token && isCourseId(token) ? `var(--course-${token})` : "var(--color-fg-subtle)";
  return { "--event-color": color } as CSSProperties;
}

export function eventClasses(event: Pick<DisplayEvent, "origin" | "type" | "examKind">): string {
  if (event.examKind || event.type === "exam" || event.type === "midterm") {
    return "border border-danger/40 bg-danger-soft text-fg border-l-[3px] border-l-danger";
  }
  if (event.origin === "university") {
    return cn(
      "border border-l-[3px] border-transparent border-l-[var(--event-color)] text-fg",
      "bg-[color-mix(in_oklab,var(--event-color)_13%,var(--color-surface))]",
    );
  }
  return "border border-dashed border-accent bg-surface text-fg";
}

/** All-day items: holidays, academic dates, exam periods and the user's own. */
export function allDayClasses(event: Pick<DisplayEvent, "origin" | "type">): string {
  if (event.origin === "personal") return "border border-dashed border-accent bg-surface text-fg";
  if (event.type === "holiday") return "bg-warning-soft text-fg";
  if (event.type === "midterm" || event.type === "exam") return "bg-danger-soft text-fg";
  return "bg-accent-soft text-fg";
}

export const STUDIED_CLASSES = "border border-dotted border-fg-subtle bg-subtle/60 text-fg-muted";

/** A sentence describing an event for screen readers. */
export function eventDescription(event: DisplayEvent): string {
  const when = event.allDay ? "all day" : `${event.start} to ${event.end}`;
  const parts = [event.title, event.typeLabel, when];
  if (event.course && event.course.name !== event.title) parts.push(event.course.name);
  if (event.location) parts.push(`room ${event.location}`);
  if (event.studentGroup) parts.push(`group ${event.studentGroup}`);
  if (event.origin === "personal") parts.push("your event");
  return parts.join(", ");
}
