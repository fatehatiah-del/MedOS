"use server";

import { refresh } from "next/cache";

import { getWorkspace } from "@/server/workspace";

import * as logic from "./logic";

/*
 * Server Functions behind calendar editing. Each verifies the session itself
 * and acts only through the signed-in user's scope; a successful change
 * refreshes the page so every view shows it.
 */

type Result<T> = Promise<logic.ActionResult<T>>;

async function run<T>(
  action: (scope: Awaited<ReturnType<typeof getWorkspace>>["scope"]) => Result<T>,
) {
  const { scope } = await getWorkspace();
  const result = await action(scope);
  if (result.ok) refresh();
  return result;
}

export async function createCalendarEvent(input: unknown): Result<{ eventId: string }> {
  return run((scope) => logic.createEvent(scope, input));
}

export async function updateCalendarEvent(input: unknown): Result<{ eventId: string }> {
  return run((scope) => logic.updateEvent(scope, input));
}

export async function setCalendarEventNotes(input: unknown): Result<{ eventId: string }> {
  return run((scope) => logic.setEventNotes(scope, input));
}

export async function deleteCalendarEvent(input: unknown): Result<undefined> {
  return run((scope) => logic.deleteEvent(scope, input));
}

export async function addCourseExam(input: unknown): Result<{ eventId: string }> {
  return run((scope) => logic.addExam(scope, input));
}

export async function updateCourseExam(input: unknown): Result<{ eventId: string }> {
  return run((scope) => logic.updateExam(scope, input));
}
