import { EmptyState, PageHeader, Section, Surface } from "@medos/ui";
import { ChevronRight, Headphones } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Podcasts" };

export default async function PodcastsPage() {
  const { scope } = await getWorkspace();
  const courses = await scope.courses.list();
  const groups = (
    await Promise.all(
      courses.map(async (course) => ({
        course,
        lectures: ((await scope.courses.outline(course.id)) ?? []).flatMap((week) =>
          week.lectures.map((lecture) => ({ ...lecture, week: week.number })),
        ),
      })),
    )
  ).filter(({ lectures }) => lectures.length);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Podcasts"
        description="Turn lecture material into short, two-host study episodes."
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={<Headphones />}
          title="No lectures yet"
          description="Sync your lectures to start creating study podcasts."
        />
      ) : (
        groups.map(({ course, lectures }) => (
          <Section
            key={course.id}
            title={course.name}
            aside={<CourseMark token={course.colorToken} />}
          >
            <Surface>
              <ul className="divide-y divide-border">
                {lectures.map((lecture) => (
                  <li key={lecture.id}>
                    <Link
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                      href={"/podcasts/" + lecture.id}
                    >
                      <Headphones aria-hidden="true" className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-fg">{lecture.title}</span>
                        <span className="block text-xs text-fg-subtle">
                          Week {lecture.week} · Lecture {lecture.number}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
          </Section>
        ))
      )}
    </div>
  );
}
