import type { NotebookListing } from "@medos/database";
import { CURRENT_SEMESTER } from "@medos/shared";
import { EmptyState, PageHeader, Section, Surface } from "@medos/ui";
import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { notebookHref } from "@/features/courses/progress";
import { getWorkspace } from "@/server/workspace";

export const metadata: Metadata = { title: "Notebooks" };

const EDITED = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Every lecture notebook with notes in it, by course in the semester's order, then week and lecture. */
export default async function NotebooksPage() {
  const { scope } = await getWorkspace();
  const [notebooks, courses] = await Promise.all([scope.notebooks.list(), scope.courses.list()]);
  const order = new Map(courses.map((course, index) => [course.slug, index]));

  const byCourse = new Map<string, NotebookListing[]>();
  for (const notebook of notebooks) {
    const list = byCourse.get(notebook.course.slug) ?? [];
    list.push(notebook);
    byCourse.set(notebook.course.slug, list);
  }
  const groups = [...byCourse.values()]
    .sort((a, b) => (order.get(a[0]!.course.slug) ?? 99) - (order.get(b[0]!.course.slug) ?? 99))
    .map((list) =>
      list.sort((a, b) => a.weekNumber - b.weekNumber || a.lectureNumber - b.lectureNumber),
    );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Notebooks"
        description="Your own notes for each lecture, written beside the Study Guide."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="No notes yet"
          description="Open a Study Guide and choose Open notebook (or press Alt+N) to write notes beside it. They are saved here automatically."
        />
      ) : (
        groups.map((list) => {
          const course = list[0]!.course;
          return (
            <Section
              key={course.slug}
              title={course.name}
              aside={<CourseMark token={course.colorToken} />}
            >
              <ul className="grid gap-3 @xl:grid-cols-2">
                {list.map((notebook) => (
                  <li key={notebook.lectureId}>
                    <Link
                      href={notebookHref(course.slug, notebook.lectureId)}
                      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Surface
                        padding="md"
                        className="flex h-full flex-col gap-2 transition-colors duration-150 hover:bg-subtle"
                      >
                        <p className="text-[12.5px] font-medium text-fg-subtle">
                          Week {notebook.weekNumber} · Lecture {notebook.lectureNumber}
                        </p>
                        <h3 className="font-serif text-[1.075rem] leading-snug font-semibold text-fg">
                          {notebook.lectureTitle}
                        </h3>
                        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-fg-muted">
                          {notebook.excerpt}
                        </p>
                        <p className="mt-auto pt-1 text-xs text-fg-subtle tabular-nums">
                          Edited {EDITED.format(notebook.updatedAt)}
                        </p>
                      </Surface>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}
    </div>
  );
}
