import { ObjectMissingError } from "@medos/storage";
import { z } from "zod";

import { getObjectStore } from "@/server/storage";
import {
  VoiceError,
  audioKey,
  speakDialogue,
  verifyTurns,
  voicesConfigured,
} from "@/server/podcast-voices";
import { getCurrentUser } from "@/server/session";

/*
 * The natural-voice audio of one podcast episode. Signed-in users only, from MedOS's own pages,
 * and only for dialogues this server generated (signed). Audio is stored by content, so playing
 * an episode again, or the same episode on another device, costs no further credits.
 */

export const maxDuration = 300;

const body = z.object({
  turns: z
    .array(z.object({ host: z.enum(["A", "B"]), text: z.string().min(1).max(1200) }))
    .min(4)
    .max(24),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

const audio = (bytes: Uint8Array) =>
  new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(bytes.length),
      "cache-control": "private, max-age=31536000, immutable",
    },
  });

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return plain(403, "Not allowed.");
  if (!(await getCurrentUser())) return plain(401, "Sign in to play podcasts.");
  if (!voicesConfigured()) return plain(503, "Natural voices are not configured.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyTurns(parsed.data.turns, parsed.data.signature)) {
    return plain(400, "Generate this episode again to play it with natural voices.");
  }

  const { turns } = parsed.data;
  const store = getObjectStore();
  const key = audioKey(turns);
  try {
    return audio(await store.read(key));
  } catch (error) {
    if (!(error instanceof ObjectMissingError)) console.error("[podcasts] cache read", error);
  }

  try {
    const bytes = await speakDialogue(turns, request.signal);
    await store.putBytes(key, bytes).catch((error: unknown) => {
      // Playback still works; only the replay cache is lost.
      console.error("[podcasts] cache write", error);
    });
    return audio(bytes);
  } catch (error) {
    if (error instanceof VoiceError) return plain(502, error.message);
    if (request.signal.aborted) return plain(499, "Cancelled.");
    console.error("[podcasts] voicing failed", error);
    return plain(502, "The episode could not be voiced. Try again.");
  }
}
