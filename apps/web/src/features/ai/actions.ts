"use server";

import { AI_FEATURE_IDS, type AIFeature, NOT_CONFIGURED_MESSAGE } from "@medos/ai";
import { z } from "zod";

import { getAIProvider } from "@/server/ai";
import { requireUser } from "@/server/session";

/*
 * The single entry point for AI features. Pages name a feature and the
 * place it is about; the provider is chosen here, on the server. With no
 * provider configured, nothing else happens: no context is gathered and no
 * request leaves MedOS.
 *
 * Adding a provider means gathering the feature's source context here (from
 * the user's scope) and calling the capability; the pages do not change.
 */

export type AIActionResult =
  | { ok: true; text: string; provenance: { provider: string; model: string; generatedAt: string } }
  | { ok: false; message: string };

const input = z.object({
  feature: z.enum(AI_FEATURE_IDS as [AIFeature, ...AIFeature[]]),
  /** The lecture, resource, question or deck the request is about. */
  context: z.record(z.string(), z.string().max(200)).default({}),
});

export async function requestAI(raw: unknown): Promise<AIActionResult> {
  await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "This AI request was not understood." };
  const provider = getAIProvider();
  if (!provider.configured) return { ok: false, message: NOT_CONFIGURED_MESSAGE };
  // These buttons are not connected yet; questions go through Ask AI at the top of the page.
  return {
    ok: false,
    message: "This button is not connected to AI yet. Use Ask AI at the top of the page.",
  };
}
