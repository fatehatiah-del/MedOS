import { DEFAULT_STUDY_AVAILABILITY, formatMinutes } from "@medos/shared";
import { EmptyState, PageHeader, Section, Surface } from "@medos/ui";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Study Plan" };

/** The transparent inputs of the planner's priority model (specification §20). */
const PRIORITY_FACTORS: readonly { name: string; detail: string }[] = [
  { name: "Exam urgency", detail: "How close the next exam for a course is." },
  { name: "Overdue review", detail: "Material whose review date has already passed." },
  { name: "Weakness", detail: "Topics with low accuracy or repeated mistakes." },
  { name: "Incomplete lectures", detail: "Lectures you have not marked complete." },
  { name: "Flashcards due", detail: "The size of each course's due queue." },
  { name: "Lecture recency", detail: "How recently each lecture was given." },
];

export default async function StudyPlanPage() {
  await requireUser();

  const { weekdayMinutes, weekendMinutes } = DEFAULT_STUDY_AVAILABILITY;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Study Plan"
        description="A recommended plan for each day that stays entirely under your control."
      />

      <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-14">
        <Section title="Today's plan">
          <Surface>
            <EmptyState
              icon={<ListChecks />}
              title="No plan yet"
              description="MedOS will propose a daily plan that you can reorder, resize, postpone, add to or replace. Overriding a recommendation is never penalised."
            />
          </Surface>
        </Section>

        <div className="space-y-10">
          <Section title="Available study time">
            <dl className="divide-y divide-border border-y border-border">
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-sm text-fg">Weekdays</dt>
                <dd className="text-sm text-fg-muted tabular-nums">
                  {formatMinutes(weekdayMinutes)} per day
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-sm text-fg">Weekends</dt>
                <dd className="text-sm text-fg-muted tabular-nums">
                  {formatMinutes(weekendMinutes)} per day
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-fg-subtle">
              Default values. They become editable once settings can be saved.
            </p>
          </Section>

          <Section title="How priority is decided">
            <ul className="space-y-3.5">
              {PRIORITY_FACTORS.map((factor) => (
                <li key={factor.name}>
                  <p className="text-sm text-fg">{factor.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{factor.detail}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-fg-subtle">
              A simple weighted sum you can inspect. No opaque scoring.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
