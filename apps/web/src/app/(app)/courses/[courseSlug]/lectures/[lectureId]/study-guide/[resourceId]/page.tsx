import { CURRENT_SEMESTER } from "@medos/shared";
import { Notice } from "@medos/ui";
import { FileText, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { lectureHref } from "@/features/courses/progress";
import { progressSnapshot } from "@/features/study-guide/annotations";
import { Blocks, SectionView } from "@/features/study-guide/content";
import { ContextPanel } from "@/features/study-guide/context-panel";
import { ProgressTracker } from "@/features/study-guide/progress-tracker";
import { ReaderBar } from "@/features/study-guide/reader-bar";
import { ReaderProvider } from "@/features/study-guide/reader-context";
import { PREAMBLE_LABEL, buildReaderAnnotations } from "@/features/study-guide/reader-model";
import { ReaderToc } from "@/features/study-guide/reader-toc";
import { SectionActions } from "@/features/study-guide/section-actions";
import { SelectionToolbar } from "@/features/study-guide/selection-toolbar";
import { buildToc, headingLabel } from "@/features/study-guide/structure";
import { getWorkspace } from "@/server/workspace";

interface StudyGuidePageProps {
  params: Promise<{ courseSlug: string; lectureId: string; resourceId: string }>;
}

const READ_ON = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The address must name the user's own lecture in its own course, and a
 * Study Guide of that lecture with readable content. Anything else (another
 * user's guide, another lecture's, another kind of material, a malformed id)
 * is the same "not found".
 */
async function loadStudyGuide(courseSlug: string, lectureId: string, resourceId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const guide = await scope.studyGuides.get(resourceId);
  if (!guide || guide.lectureId !== detail.lecture.id) notFound();
  return { scope, detail, guide };
}

export async function generateMetadata({ params }: StudyGuidePageProps): Promise<Metadata> {
  const { courseSlug, lectureId, resourceId } = await params;
  const { detail, guide } = await loadStudyGuide(courseSlug, lectureId, resourceId);
  return {
    title: `${guide.content.title ?? "Study Guide"} · ${detail.course.shortName}`,
  };
}

export default async function StudyGuidePage({ params }: StudyGuidePageProps) {
  const { courseSlug, lectureId, resourceId } = await params;
  const { scope, detail, guide } = await loadStudyGuide(courseSlug, lectureId, resourceId);
  const { lecture, week, course } = detail;
  const document = guide.content;

  const [annotations, progress] = await Promise.all([
    scope.studyGuides.annotations.list(resourceId),
    scope.studyGuides.progress.get(resourceId),
  ]);
  const reader = buildReaderAnnotations(document, annotations);
  const toc = buildToc(document);
  const lecturePage = lectureHref(course.slug, lecture.id);
  const context = { resourceId, marks: reader.marks };

  return (
    // `data-layout="wide"` lets the workspace grow beyond its usual width for the three columns.
    <div data-layout="wide" className="space-y-6">
      <a
        href="#study-guide-text"
        className="sr-only rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-fg focus:not-sr-only focus:inline-block"
      >
        Skip to the Study Guide text
      </a>

      <header className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lecturePage },
            { label: "Study Guide" },
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
            <span aria-hidden="true">·</span>
            <span>Study Guide</span>
          </p>
          <h1 className="max-w-[46rem] font-serif text-[1.9rem] leading-tight font-semibold text-balance text-fg sm:text-[2.2rem]">
            {document.title ?? "Study Guide"}
          </h1>
          {document.subtitle ? (
            <p className="max-w-[46rem] text-[15px] leading-relaxed text-fg-muted">
              {document.subtitle}
            </p>
          ) : null}
          <p className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
            <FileText aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              From {guide.originalFilename}, read on {READ_ON.format(guide.extractedAt)}
            </span>
          </p>
        </div>
        {!guide.current ? (
          <Notice tone="warning" icon={<TriangleAlert />} title="The file has changed.">
            This is the Study Guide as it was read from an earlier version of the file. It is read
            again on the next sync.
          </Notice>
        ) : null}
        {guide.issues.length > 0 ? (
          <details className="rounded-lg border border-border px-4 py-2.5 text-sm text-fg-muted">
            <summary className="cursor-pointer font-medium text-fg">
              {guide.issues.length === 1
                ? "1 note from reading this file"
                : `${guide.issues.length} notes from reading this file`}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {guide.issues.map((issue, index) => (
                <li key={index}>
                  {issue.message}
                  {issue.location ? ` (${issue.location})` : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </header>

      <ReaderProvider
        resourceId={resourceId}
        lectureHref={lecturePage}
        annotations={reader.list}
        initialProgress={progressSnapshot(progress ?? emptyProgress(document.sections.length))}
      >
        <ReaderBar toc={toc} />
        <div className="grid gap-7 @min-[48rem]:grid-cols-[12rem_minmax(0,1fr)] @min-[63rem]:grid-cols-[11.5rem_minmax(0,1fr)_15rem]">
          <div className="hidden @min-[48rem]:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 pb-6">
              <ReaderToc entries={toc} />
            </div>
          </div>

          <article
            id="study-guide-text"
            tabIndex={-1}
            aria-label="Study Guide"
            className="sg-reader min-w-0 focus:outline-none"
          >
            <div className="mx-auto max-w-[44rem] space-y-8 text-[16px] leading-[1.7] text-fg">
              {document.preamble.length > 0 ? (
                <div
                  data-sg-section=""
                  className="rounded-xl border border-border bg-surface px-4 py-4 sm:px-5"
                >
                  <p className="mb-2 text-[11.5px] font-semibold tracking-wider text-fg-subtle uppercase">
                    From the document
                  </p>
                  <Blocks
                    blocks={document.preamble}
                    parent={null}
                    context={{ ...context, sectionId: null, sectionLabel: PREAMBLE_LABEL }}
                    compact
                  />
                </div>
              ) : null}
              {document.sections.length === 0 ? (
                <p className="text-fg-muted">This Study Guide has no headings to show.</p>
              ) : null}
              {document.sections.map((section) => (
                <SectionView
                  key={section.id}
                  section={section}
                  context={context}
                  actions={
                    <SectionActions
                      sectionId={section.id}
                      label={headingLabel(section.heading) || section.id}
                    />
                  }
                />
              ))}
            </div>
          </article>

          <div className="hidden @min-[63rem]:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6">
              <ContextPanel />
            </div>
          </div>
        </div>
        <SelectionToolbar />
        <ProgressTracker />
      </ReaderProvider>
    </div>
  );
}

function emptyProgress(sectionCount: number) {
  return {
    furthestSectionId: null,
    lastSectionId: null,
    sectionsRead: 0,
    sectionCount,
    percent: 0,
    updatedAt: null,
  };
}
