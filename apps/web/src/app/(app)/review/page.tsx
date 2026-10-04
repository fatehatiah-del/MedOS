import { ANNOTATION_KINDS, type AnnotationKind } from "@medos/database";
import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";

import { mcqHref } from "@/features/courses/progress";
import { type HubEntry, ReviewHub } from "@/features/review/hub";
import { hubItemHref } from "@/features/review/logic";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Review" };

interface ReviewPageProps {
  /** `tab=note` (or highlight, bookmark) opens that tab first. */
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const { scope } = await getWorkspace();
  const [{ tab }, items, courses] = await Promise.all([
    searchParams,
    scope.review.hub(),
    scope.courses.list(),
  ]);
  const initialTab: AnnotationKind = ANNOTATION_KINDS.includes(tab as AnnotationKind)
    ? (tab as AnnotationKind)
    : "review-later";

  const entries: HubEntry[] = items.map((item) => ({
    id: item.id,
    source: item.source,
    kind: item.kind,
    excerpt: item.excerpt,
    location: item.location,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    resourceLabel: item.originalFilename,
    lectureTitle: item.lecture.title,
    weekNumber: item.week.number,
    course: {
      slug: item.course.slug,
      shortName: item.course.shortName,
      colorToken: item.course.colorToken,
    },
    href: item.target?.kind === "mcq" ? null : hubItemHref(item),
    practise:
      item.target?.kind === "mcq"
        ? {
            resourceId: item.resourceId,
            questionKey: item.target.questionKey,
            sessionBase: `${mcqHref(item.course.slug, item.lecture.id, item.resourceId)}/session`,
          }
        : null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Review"
        description="Everything you marked while studying, with where it came from. Open goes to the exact place; Done removes an item from Review later."
      />
      <ReviewHub
        entries={entries}
        courses={courses.map(({ slug, name }) => ({ slug, name }))}
        initialTab={initialTab}
      />
      <p className="text-xs text-fg-subtle">
        Nothing here marks a lecture complete; only you do, on the lecture page.
      </p>
    </div>
  );
}
