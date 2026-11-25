import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import type { PodcastTurn } from "@/features/podcasts/episodes";

/*
 * Natural podcast voices through ElevenLabs Text to Dialogue: both hosts are voiced as one
 * conversation, so turn-taking, pacing and intonation sound like people talking rather than a
 * screen reader. Optional: without ELEVENLABS_API_KEY the browser's voices read the dialogue.
 *
 * Only dialogues this server generated can be voiced (each carries an HMAC of its turns), so a
 * signed-in user cannot spend the key on arbitrary text.
 */

const DIALOGUE_URL = "https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128";
/** ElevenLabs advises at most about 2,000 characters per dialogue request. */
const REQUEST_CHARACTERS = 1_900;
/** Requests in flight at once; the smallest paid plans allow two or three. */
const CONCURRENCY = 2;

export function voicesConfigured(): boolean {
  return Boolean(env.ELEVENLABS_API_KEY);
}

function signingKey(): string {
  return process.env.BETTER_AUTH_SECRET || env.ELEVENLABS_API_KEY || "";
}

const turnsDigest = (turns: PodcastTurn[]) =>
  turns.map(({ host, text }) => host + ":" + text).join("\n");

export function signTurns(turns: PodcastTurn[]): string | undefined {
  const key = signingKey();
  return key ? createHmac("sha256", key).update(turnsDigest(turns)).digest("hex") : undefined;
}

export function verifyTurns(turns: PodcastTurn[], signature: string): boolean {
  const expected = signTurns(turns);
  if (!expected || signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** The storage key of this dialogue's audio for the current model and voices. */
export function audioKey(turns: PodcastTurn[]): string {
  const hash = createHash("sha256")
    .update([env.ELEVENLABS_MODEL, env.ELEVENLABS_VOICE_A, env.ELEVENLABS_VOICE_B].join("|"))
    .update("\n" + turnsDigest(turns))
    .digest("hex");
  return "podcasts/" + hash.slice(0, 2) + "/" + hash + ".mp3";
}

/** Consecutive turns grouped into requests under the per-request character budget. */
export function dialogueRequests(turns: PodcastTurn[], budget = REQUEST_CHARACTERS) {
  const groups: PodcastTurn[][] = [];
  let size = 0;
  for (const turn of turns) {
    const last = groups.at(-1);
    if (last && size + turn.text.length <= budget) {
      last.push(turn);
      size += turn.text.length;
    } else {
      groups.push([turn]);
      size = turn.text.length;
    }
  }
  return groups;
}

export class VoiceError extends Error {}

async function speakGroup(group: PodcastTurn[], signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(DIALOGUE_URL, {
    method: "POST",
    signal,
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY ?? "",
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      model_id: env.ELEVENLABS_MODEL,
      inputs: group.map(({ host, text }) => ({
        text,
        voice_id: host === "A" ? env.ELEVENLABS_VOICE_A : env.ELEVENLABS_VOICE_B,
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[podcast-voices] ElevenLabs", response.status, detail.slice(0, 300));
    if (response.status === 401) throw new VoiceError("The ElevenLabs key was rejected.");
    if (response.status === 402 || /quota|credits/i.test(detail))
      throw new VoiceError("The ElevenLabs account has run out of credits.");
    if (response.status === 429) throw new VoiceError("ElevenLabs is busy. Try again in a minute.");
    throw new VoiceError("ElevenLabs could not voice this episode. Try again.");
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Voices the whole dialogue as one MP3 (MPEG frames concatenate cleanly). */
export async function speakDialogue(turns: PodcastTurn[], signal: AbortSignal) {
  const groups = dialogueRequests(turns);
  const parts: Uint8Array[] = new Array(groups.length);
  let next = 0;
  const worker = async () => {
    while (next < groups.length) {
      const index = next++;
      parts[index] = await speakGroup(groups[index]!, signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, worker));
  const audio = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    audio.set(part, offset);
    offset += part.length;
  }
  return audio;
}
