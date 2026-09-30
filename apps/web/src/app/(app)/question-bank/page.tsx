import { Badge, PageHeader, Section } from "@medos/ui";
import type { Metadata } from "next";

import { CourseList } from "@/components/course-list";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Question Bank" };

const RECALL_STEPS: readonly { title: string; detail: string }[] = [
  { title: "Read the question", detail: "An open question from your imported question bank." },
  { title: "Answer in your head", detail: "Typing a response is optional." },
  { title: "Reveal the model answer", detail: "Compare it with what you recalled." },
  { title: "Rate your recall", detail: "Again, Hard, Good or Easy." },
];

export default async function QuestionBankPage() {
  await requireUser();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Question Bank"
        description="Open questions for active recall: retrieve the answer yourself, then check it against the model answer."
        actions={<Badge tone="outline">Not yet available</Badge>}
      />

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

      <Section title="By course">
        <CourseList renderStatus={() => "No questions yet"} />
        <p className="text-xs leading-relaxed text-fg-subtle">
          Questions are imported from your own question bank documents. MedOS does not invent
          medical questions.
        </p>
      </Section>
    </div>
  );
}
