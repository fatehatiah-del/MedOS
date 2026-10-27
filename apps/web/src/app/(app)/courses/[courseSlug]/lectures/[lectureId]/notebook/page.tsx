import { BookOpenText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { lectureHref, studyGuideHref } from "@/features/courses/progress";
import { NotebookPageEditor } from "@/features/notebook/notebook-page-editor";
import { getWorkspace } from "@/server/workspace";

interface NotebookPageProps {
  params: Promise<{ courseSlug: string; lectureId: string }>;
}

/** The lecture must be the user's own, in the course the address names. */
async function loadNotebook(courseSlug: string, lectureId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const notebook = await scope.notebooks.get(lectureId);
  if (!notebook) notFound();
  return { detail, notebook };
}

export async function generateMetadata({ params }: NotebookPageProps): Promise<Metadata> {
  const { courseSlug, lectureId } = await params;
  const { detail } = await loadNotebook(courseSlug, lectureId);
  return { title: `Notebook · ${detail.lecture.title} · ${detail.course.shortName}` };
}

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { courseSlug, lectureId } = await params;
  const { detail, notebook } = await loadNotebook(courseSlug, lectureId);
  const { lecture, week, course, resources } = detail;
  const guides = resources.filter((resource) => resource.content?.format === "study-guide");

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lectureHref(course.slug, lecture.id) },
            { label: "Notebook" },
          ]}
        />
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-fg-subtle">
            <CourseMark token={course.colorToken} />
            <span>{course.name}</span>
            <span aria-hidden="true">·</span>
            <span>Week {week.number}</span>
            <span aria-hidden="true">·</span>
            <span>{lecture.title}</span>
          </p>
          <h1 className="font-serif text-[1.9rem] leading-tight font-semibold text-balance text-fg sm:text-[2.2rem]">
            Notebook
          </h1>
        </div>
        {guides.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {guides.map((guide) => (
              <Link
                key={guide.id}
                href={studyGuideHref(course.slug, lecture.id, guide.id)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-fg shadow-xs hover:bg-subtle"
              >
                <BookOpenText aria-hidden="true" className="size-4 text-fg-muted" />
                {guides.length === 1 ? "Study Guide beside the notebook" : guide.originalFilename}
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <NotebookPageEditor lectureId={lecture.id} initial={notebook} />
    </div>
  );
}
