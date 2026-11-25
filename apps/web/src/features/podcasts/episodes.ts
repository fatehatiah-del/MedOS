import { blocksText, type StudyGuideDocument } from "@medos/parsers/model";

import { headingLabel } from "@/features/study-guide/structure";

export interface PodcastTopic {
  label: string;
  text: string;
}

export interface PodcastEpisode {
  labels: string[];
  text: string;
}

export const EPISODE_SOURCE_LIMIT = 24_000;

export function guideTopics(guide: StudyGuideDocument): PodcastTopic[] {
  const topics = guide.sections.flatMap((section) => {
    const text = blocksText(section.blocks).trim();
    return text ? [{ label: headingLabel(section.heading) || section.id, text }] : [];
  });
  const introduction = blocksText(guide.preamble).trim();
  if (!introduction) return topics;
  if (!topics[0]) return [{ label: guide.title || "Study Guide", text: introduction }];
  topics[0].text = introduction + "\n\n" + topics[0].text;
  return topics;
}

export function pairTopics(topics: PodcastTopic[]): PodcastEpisode[] {
  // Very long topics span episodes so generation can use all of the source.
  const target = Math.floor(EPISODE_SOURCE_LIMIT / 2) - 300;
  const parts = topics.flatMap(({ label, text }) => {
    const chunks: PodcastTopic[] = [];
    let remaining = text;
    while (remaining.length > target) {
      const space = remaining.lastIndexOf(" ", target);
      const end = space >= target / 2 ? space : target;
      chunks.push({ label, text: remaining.slice(0, end) });
      remaining = remaining.slice(end).trimStart();
    }
    chunks.push({ label, text: remaining });
    return chunks.length === 1
      ? chunks
      : chunks.map((chunk, index) => ({ ...chunk, label: label + " (part " + (index + 1) + ")" }));
  });
  const episodes: PodcastEpisode[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const pair = parts.slice(index, index + 2);
    episodes.push({
      labels: pair.map(({ label }) => label.slice(0, 240)),
      text: pair.map(({ label, text }) => label.slice(0, 240) + "\n" + text).join("\n\n"),
    });
  }
  return episodes;
}

export interface PodcastTurn {
  host: "A" | "B";
  text: string;
}

export interface PodcastScript {
  turns: PodcastTurn[];
  provider: string;
  model: string;
  /** Present when the server can voice this dialogue with natural voices. */
  signature?: string;
}

/** The voice cues natural voices may perform; never read aloud or shown. */
export const VOICE_CUES = ["curious", "laughs", "thoughtful", "excited"] as const;
const CUE_PATTERN = new RegExp(
  String.raw`\s*\[(?:` + VOICE_CUES.join("|") + String.raw`)\]\s*`,
  "giu",
);

/** The turn as plain words: voice cues removed (transcript and device voices). */
export function plainText(text: string): string {
  return text
    .replace(CUE_PATTERN, " ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

export function parseDialogue(output: string): PodcastTurn[] | null {
  const lines = output
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const turns: PodcastTurn[] = [];
  for (const line of lines) {
    const match = /^([AB]):\s*(.{1,1200})$/u.exec(line.trim());
    if (!match?.[2]?.trim() || turns.at(-1)?.host === match[1]) return null;
    turns.push({ host: match[1] === "A" ? "A" : "B", text: match[2] });
  }
  return turns.length >= 4 && turns.length <= 24 ? turns : null;
}
