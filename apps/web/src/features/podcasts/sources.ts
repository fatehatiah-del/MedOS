import "server-only";

import { createHash } from "node:crypto";

import type { LectureDetail, UserScope } from "@medos/database";

import { guideTopics, pairTopics } from "./episodes";

export async function podcastSource(
  scope: UserScope,
  resource: LectureDetail["resources"][number],
) {
  const guide = resource.kind === "study-guide" ? await scope.studyGuides.get(resource.id) : null;
  const slides =
    resource.kind === "original-lecture"
      ? await scope.originalLectures.podcastText(resource.id)
      : null;
  const topics = guide?.current
    ? guideTopics(guide.content)
    : (slides ?? [])
        .map((page) => ({ label: "Slide " + page.number, text: page.text.trim() }))
        .filter(({ text }) => text);
  const episodes = pairTopics(topics).map((episode) => ({
    ...episode,
    version: createHash("sha256").update(episode.text).digest("hex"),
  }));
  return { id: resource.id, title: guide?.content.title || resource.originalFilename, episodes };
}
