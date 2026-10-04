import { Badge, EmptyState, PageHeader, Progress, Section } from "@medos/ui";
import { MessageCircleQuestionMark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { questionBankHref } from "@/features/courses/progress";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Question Bank" };

const RECALL_STEPS: readonly { title: string; detail: string }[] = [
  { title: "Read the question", detail: "A question from your imported question bank." },
  { title: "Answer in your head", detail: "Typing a response is optional." },
  { title: "Reveal the model answer", detail: "Compare it with what you recalled." },
  { title: "Rate your recall", detail: "Again, Hard, Good or Easy." },
];

export default async function QuestionBankPage() {
  const { scope } = await getWorkspace();
  const banks = await scope.questionBanks.banks();

  // Grouped by course, in the order of the courses.
  const byCourse = new Map<string, typeof banks>();
  for (const bank of banks) {
    const group = byCourse.get(bank.course.slug) ?? [];
    group.push(bank);
    byCourse.set(bank.course.slug, group);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Question Bank"
        description="Active recall: retrieve the answer yourself, then check it against the model answer."
        actions={
          <Badge tone={banks.length > 0 ? "accent" : "outline"}>
            {banks.length} {banks.length === 1 ? "bank" : "banks"}
          </Badge>
        }
      />

      {banks.length === 0 ? (
        <EmptyState
          icon={<MessageCircleQuestionMark />}
          headingLevel={2}
          title="No question banks yet"
          description="Question banks appear here once they have been synced from your study folder. MedOS does not invent medical questions."
        />
      ) : (
        <div className="space-y-8">
          {[...byCourse.values()].map((group) => {
            const course = group[0]!.course;
            return (
              <Section key={course.slug} title={course.name}>
                <ul className="grid gap-3 @2xl:grid-cols-2">
                  {group.map((bank) => (
                    <li key={bank.resourceId}>
                      <Link
                        href={questionBankHref(course.slug, bank.lecture.id, bank.resourceId)}
                        className="block space-y-3 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:bg-subtle/60"
                      >
                        <span className="flex items-center gap-2 text-[12.5px] font-medium text-fg-subtle">
                          <CourseMark token={course.colorToken} />
                          Week {bank.week.number} · {bank.lecture.title}
                        </span>
                        <span className="block text-[15px] font-semibold text-fg">
                          {bank.title ?? bank.originalFilename}
                        </span>
                        <Progress
                          value={bank.practised}
                          max={bank.itemCount}
                          label={`Practised in ${bank.title ?? bank.originalFilename}`}
                          valueText={`${bank.practised} of ${bank.itemCount} practised`}
                        />
                        <span className="block text-[13px] text-fg-muted">
                          {bank.practised} of {bank.itemCount} practised
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>
      )}

      <Section title="How a session works">
        <ol className="grid gap-x-8 gap-y-6 @lg:grid-cols-2 @4xl:grid-cols-4">
          {RECALL_STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-border pt-4">
              <p aria-hidden="true" className="text-xs text-fg-subtle tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-2 text-sm font-medium text-fg">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
