import { Notice, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@medos/ui";
import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Statistics" };

/** The measures each level will report (specification §27). No values exist yet. */
const STATISTIC_LEVELS = [
  {
    id: "semester",
    label: "Semester",
    measures: [
      "Total study time",
      "Weekly consistency",
      "Course completion",
      "MCQ volume",
      "Average accuracy",
      "Study streak",
      "Upcoming workload",
    ],
  },
  {
    id: "course",
    label: "Course",
    measures: [
      "Completion",
      "Study hours",
      "MCQ accuracy",
      "Performance by topic",
      "Flashcard retention",
      "Weak topics",
      "Progress over time",
    ],
  },
  {
    id: "lecture",
    label: "Lecture",
    measures: [
      "Completion",
      "Study time",
      "MCQ accuracy",
      "Question Bank performance",
      "Flashcard performance",
      "Weak concepts",
    ],
  },
] as const;

export default function StatisticsPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Statistics"
        description="A small set of measures, calculated only from your real study activity."
      />

      <Notice icon={<ChartNoAxesColumn />} title="No activity recorded yet.">
        Figures appear once you start studying in MedOS. Nothing here is estimated or generated.
      </Notice>

      <Tabs defaultValue="semester">
        <TabsList aria-label="Statistics level">
          {STATISTIC_LEVELS.map((level) => (
            <TabsTrigger key={level.id} value={level.id}>
              {level.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {STATISTIC_LEVELS.map((level) => (
          <TabsContent key={level.id} value={level.id}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-9 border-t border-border pt-7 @2xl:grid-cols-3 @4xl:grid-cols-4">
              {level.measures.map((measure) => (
                <div key={measure}>
                  <dt className="text-[13px] text-fg-muted">{measure}</dt>
                  <dd className="mt-2 text-2xl font-medium text-fg-subtle">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">No data yet</span>
                  </dd>
                </div>
              ))}
            </dl>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
