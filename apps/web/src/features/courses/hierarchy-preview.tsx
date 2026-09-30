import { Badge, Surface } from "@medos/ui";

/**
 * Illustrative only. Shows how a course is organised — Course → Week →
 * 0..n Lectures, each lecture with its own resources — without inventing
 * lecture content. Deliberately includes weeks with zero, one and two lectures.
 */
const EXAMPLE_WEEKS: readonly { week: number; lectures: number }[] = [
  { week: 3, lectures: 1 },
  { week: 4, lectures: 2 },
  { week: 5, lectures: 0 },
];

const LECTURE_RESOURCES = [
  "Study Guide",
  "Original lecture",
  "MCQ",
  "Question Bank",
  "Flashcards",
] as const;

function lectureCountLabel(count: number): string {
  if (count === 0) return "No lectures";
  return count === 1 ? "1 lecture" : `${count} lectures`;
}

export function HierarchyPreview() {
  return (
    <Surface padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg">Course → Week → Lectures</p>
        <Badge tone="outline">Illustration, not real data</Badge>
      </div>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-muted">
        A week can hold no lectures, one, or several. Each lecture keeps its own study guide,
        original material, questions and flashcards.
      </p>

      <ul className="mt-6 space-y-5">
        {EXAMPLE_WEEKS.map(({ week, lectures }) => (
          <li key={week}>
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-medium text-fg">Week {week}</p>
              <p className="text-xs text-fg-subtle">{lectureCountLabel(lectures)}</p>
            </div>
            {lectures > 0 ? (
              <ul className="mt-2.5 ml-1 space-y-3 border-l border-border pl-5">
                {Array.from({ length: lectures }, (_, index) => (
                  <li
                    key={index}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5"
                  >
                    <p className="w-20 shrink-0 text-sm text-fg-muted">Lecture {index + 1}</p>
                    <ul
                      aria-label={`Resources of lecture ${index + 1}`}
                      className="flex flex-wrap gap-1.5"
                    >
                      {LECTURE_RESOURCES.map((resource) => (
                        <li key={resource}>
                          <Badge>{resource}</Badge>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
