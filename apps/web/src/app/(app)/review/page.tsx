import { EmptyState, PageHeader, Section, Surface } from "@medos/ui";
import { Bookmark, Clock, Layers, Target } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Review" };

const REVIEW_QUEUES: readonly {
  title: string;
  icon: ReactNode;
  emptyTitle: string;
  description: string;
}[] = [
  {
    title: "Due flashcards",
    icon: <Layers />,
    emptyTitle: "No flashcards due",
    description: "Cards scheduled for today, reviewed one course at a time and never mixed.",
  },
  {
    title: "Review Later",
    icon: <Bookmark />,
    emptyTitle: "Nothing saved for later",
    description: "Passages, figures and questions you flag while studying, with their source.",
  },
  {
    title: "Weak concepts",
    icon: <Target />,
    emptyTitle: "No weak concepts identified",
    description: "Topics where your answers and ratings show a gap, with the evidence behind each.",
  },
  {
    title: "Overdue review",
    icon: <Clock />,
    emptyTitle: "Nothing overdue",
    description: "Anything whose review date has passed, oldest first.",
  },
];

export default async function ReviewPage() {
  await requireUser();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Review"
        description="Everything that needs another look, gathered in one place."
      />

      <div className="grid gap-x-8 gap-y-10 @2xl:grid-cols-2">
        {REVIEW_QUEUES.map((queue) => (
          <Section key={queue.title} title={queue.title} className="flex flex-col">
            <Surface className="flex-1">
              <EmptyState
                size="compact"
                icon={queue.icon}
                title={queue.emptyTitle}
                description={queue.description}
              />
            </Surface>
          </Section>
        ))}
      </div>
    </div>
  );
}
