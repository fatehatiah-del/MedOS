import type { UserScope } from "@medos/database";
import { Section } from "@medos/ui";

import { TileGrid, metricTiles } from "./metric-tiles";
import { WeaknessList } from "./weakness-list";

/**
 * A lecture's performance: its MCQ, Question Bank, flashcard and Review Later
 * measures, its topics, and any weak spots with their evidence. Shown for
 * information; it never completes the lecture.
 */
export async function LecturePerformance({
  scope,
  lectureId,
  course,
}: {
  scope: UserScope;
  lectureId: string;
  course: { id: string; slug: string; shortName: string; colorToken: string | null };
}) {
  const stats = await scope.statistics.lecture(lectureId);
  if (!stats) return null;
  return (
    <Section title="Performance">
      <TileGrid tiles={metricTiles(stats.metrics, { completion: false, studyTime: false })} />
      {stats.topics.length > 0 ? (
        <p className="text-[13px] text-fg-muted">
          By topic:{" "}
          {stats.topics.map((topic, index) => (
            <span key={topic.topic}>
              {index > 0 ? " · " : ""}
              {topic.topic} <span className="text-fg tabular-nums">{topic.accuracy}%</span>
              <span className="text-fg-subtle"> ({topic.answered})</span>
            </span>
          ))}
        </p>
      ) : null}
      <WeaknessList
        weaknesses={stats.weaknesses}
        courses={[course]}
        showCourse={false}
        empty="No weak spots in this lecture."
      />
    </Section>
  );
}
