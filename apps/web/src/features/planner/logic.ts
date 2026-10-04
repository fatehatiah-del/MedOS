import {
  MAX_ITEM_MINUTES,
  MAX_ITEM_TITLE,
  MIN_ITEM_MINUTES,
  STUDY_ACTIVITIES,
  type UserScope,
} from "@medos/database";
import { type IsoDate, isIsoDate } from "@medos/shared";
import { z } from "zod";

/*
 * Study Plan Server Functions, apart from their wrappers so they can be
 * tested directly. Input from the browser is untrusted; whose plan it is
 * comes only from the scope. Nothing here changes lecture completion.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export const MESSAGES = {
  invalid: "That change could not be saved. Check the details and try again.",
  gone: "This item is no longer in the plan. Reload the page to see the plan as it is.",
  availability: "Study time must be between 0 and 24 hours a day.",
} as const;

const date = z.string().refine((value) => isIsoDate(value));
const minutes = z.number().int().min(MIN_ITEM_MINUTES).max(MAX_ITEM_MINUTES);
const item = z.object({ itemId: z.uuid() });

const done = (ok: boolean, error: string = MESSAGES.gone): ActionResult =>
  ok ? { ok: true } : { ok: false, error };

export async function setAvailability(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({
      weekdayMinutes: z.number().int().min(0).max(1440),
      weekendMinutes: z.number().int().min(0).max(1440),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.availability };
  return done(await scope.planner.settings.setAvailability(parsed.data), MESSAGES.availability);
}

export async function addItem(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({
      date,
      activity: z.enum(STUDY_ACTIVITIES),
      title: z.string().max(MAX_ITEM_TITLE),
      minutes,
      courseId: z.uuid().nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { date: day, ...rest } = parsed.data;
  return done((await scope.planner.items.add(day as IsoDate, rest)) !== null, MESSAGES.invalid);
}

export async function updateItem(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = item
    .extend({ title: z.string().max(MAX_ITEM_TITLE).optional(), minutes: minutes.optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const { itemId, ...change } = parsed.data;
  return done(await scope.planner.items.update(itemId, change));
}

export async function reorderItems(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ date, itemIds: z.array(z.uuid()).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(await scope.planner.items.reorder(parsed.data.date as IsoDate, parsed.data.itemIds));
}

export async function setItemDone(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = item.extend({ done: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(await scope.planner.items.setDone(parsed.data.itemId, parsed.data.done));
}

export async function removeItem(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = item.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(await scope.planner.items.remove(parsed.data.itemId));
}

export async function postponeItem(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = item.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(await scope.planner.items.postpone(parsed.data.itemId));
}

export async function refreshPlan(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ date }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(
    (await scope.planner.refresh(parsed.data.date as IsoDate)) !== null,
    MESSAGES.invalid,
  );
}

export async function clearSuggestions(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ date }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  return done(
    (await scope.planner.clearSuggestions(parsed.data.date as IsoDate)) !== null,
    MESSAGES.invalid,
  );
}
