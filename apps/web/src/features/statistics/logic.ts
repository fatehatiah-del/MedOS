import { MAX_CONCEPT_LABEL, type UserScope } from "@medos/database";
import { z } from "zod";

/*
 * Marking concepts difficult, apart from the Server Function wrappers so it
 * can be tested directly. Input is untrusted; whose data it is comes only
 * from the scope.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export const MESSAGES = {
  invalid: "Give the concept a name of up to 120 characters.",
  gone: "This concept is no longer marked. Reload the page to see the list as it is.",
} as const;

export async function markDifficult(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ courseId: z.uuid(), label: z.string().max(MAX_CONCEPT_LABEL) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.invalid };
  const added = await scope.statistics.difficult.add(parsed.data.courseId, parsed.data.label);
  return added ? { ok: true } : { ok: false, error: MESSAGES.invalid };
}

export async function unmarkDifficult(scope: UserScope, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ conceptId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.gone };
  return (await scope.statistics.difficult.remove(parsed.data.conceptId))
    ? { ok: true }
    : { ok: false, error: MESSAGES.gone };
}
