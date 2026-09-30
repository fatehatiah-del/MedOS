import { Badge, Notice, PageHeader, Section } from "@medos/ui";
import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { CourseList } from "@/components/course-list";

export const metadata: Metadata = { title: "Flashcards" };

export default function FlashcardsPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Flashcards"
        description="Spaced-repetition decks, organised by course and lecture."
        actions={<Badge tone="outline">Not yet available</Badge>}
      />

      <Notice icon={<Layers />} title="One course per session.">
        Review always stays within a single course. Pathology cards are reviewed with Pathology,
        Pharmacology with Pharmacology. MedOS never mixes courses into one session.
      </Notice>

      <Section title="Decks by course">
        <CourseList renderStatus={() => "No cards yet"} />
        <p className="text-xs leading-relaxed text-fg-subtle">
          You will be able to write cards by hand or create them from selected study guide text.
          Each card is scheduled with Again, Hard, Good and Easy ratings.
        </p>
      </Section>
    </div>
  );
}
