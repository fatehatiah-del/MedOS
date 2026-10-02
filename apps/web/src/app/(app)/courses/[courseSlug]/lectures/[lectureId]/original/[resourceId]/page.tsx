import { Notice } from "@medos/ui";
import { FileText, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { lectureHref, originalLectureHref } from "@/features/courses/progress";
import { LectureViewer } from "@/features/original-lecture/lecture-viewer";
import { pageFromQuery } from "@/features/original-lecture/pages";
import { getWorkspace } from "@/server/workspace";

interface OriginalLecturePageProps {
  params: Promise<{ courseSlug: string; lectureId: string; resourceId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * The address must name the user's own lecture in its own course, and an
 * original lecture PDF of that lecture. Anything else (another user's file,
 * another lecture's, another kind of material, a malformed id) is the same
 * "not found".
 */
async function loadOriginalLecture(courseSlug: string, lectureId: string, resourceId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const original = await scope.originalLectures.get(resourceId);
  if (!original || original.lectureId !== detail.lecture.id) notFound();
  return { scope, detail, original };
}

export async function generateMetadata({ params }: OriginalLecturePageProps): Promise<Metadata> {
  const { courseSlug, lectureId, resourceId } = await params;
  const { detail, original } = await loadOriginalLecture(courseSlug, lectureId, resourceId);
  return { title: `${original.originalFilename} · ${detail.course.shortName}` };
}

export default async function OriginalLecturePage({
  params,
  searchParams,
}: OriginalLecturePageProps) {
  const [{ courseSlug, lectureId, resourceId }, query] = await Promise.all([params, searchParams]);
  const { scope, detail, original } = await loadOriginalLecture(courseSlug, lectureId, resourceId);
  const { lecture, week, course } = detail;

  const [annotations, savedPage] = await Promise.all([
    scope.originalLectures.annotations.list(resourceId),
    scope.originalLectures.position.get(resourceId),
  ]);

  return (
    // `data-layout="wide"` lets the workspace grow beyond its usual width.
    <div data-layout="wide" className="space-y-4">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lectureHref(course.slug, lecture.id) },
            { label: "Original Lecture" },
          ]}
        />
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-fg-subtle">
            <CourseMark token={course.colorToken} />
            <span>{course.name}</span>
            <span aria-hidden="true">·</span>
            <span>Week {week.number}</span>
            <span aria-hidden="true">·</span>
            <span>{lecture.title}</span>
            <span aria-hidden="true">·</span>
            <span>Original Lecture</span>
          </p>
          <h1 className="font-serif text-[1.2rem] leading-snug font-semibold break-words text-fg sm:text-[1.6rem] lg:text-[1.85rem]">
            {original.originalFilename}
          </h1>
          <p className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
            <FileText aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              PDF · {original.pageCount} {original.pageCount === 1 ? "page" : "pages"} ·{" "}
              {megabytes(original.sizeBytes)}
              {original.pagesWithoutText.length > 0
                ? ` · ${original.pagesWithoutText.length} without selectable text`
                : null}
            </span>
          </p>
        </div>
        {!original.current ? (
          <Notice tone="warning" icon={<TriangleAlert />} title="The file has changed.">
            Its pages were registered from an earlier version. They are read again on the next sync.
          </Notice>
        ) : null}
      </header>

      <LectureViewer
        resourceId={resourceId}
        title={original.originalFilename}
        fileUrl={`/api/resources/${resourceId}/file`}
        downloadUrl={`/api/resources/${resourceId}/file?download=1`}
        baseHref={originalLectureHref(course.slug, lecture.id, resourceId)}
        pageCount={original.pageCount}
        initialPage={pageFromQuery(query.page, original.pageCount)}
        savedPage={savedPage}
        pagesWithoutText={original.pagesWithoutText}
        annotations={annotations.map(({ id, kind, page, note }) => ({ id, kind, page, note }))}
      />
    </div>
  );
}
