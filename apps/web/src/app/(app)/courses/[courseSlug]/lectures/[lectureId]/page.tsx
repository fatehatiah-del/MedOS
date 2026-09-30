import { CURRENT_SEMESTER } from "@medos/shared";
import { Badge, PageHeader, Section, Surface, cn } from "@medos/ui";
import {
  BookOpenText,
  FileText,
  Layers,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestionMark,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { FixtureNotice } from "@/components/fixture-notice";
import { courseHref } from "@/config/navigation";
import { FIXTURE_LECTURES_NOTICE } from "@/features/courses/fixture-data";
import { lectureHref } from "@/features/courses/progress";
import {
  type LectureCategoryId,
  categoryStateLabel,
  lectureCategoryStates,
} from "@/features/lectures/categories";
import { CompletionControl } from "@/features/lectures/completion-control";
import { getWorkspace } from "@/server/workspace";

interface LecturePageProps {
  params: Promise<{ courseSlug: string; lectureId: string }>;
}

const CATEGORY_ICONS: Record<LectureCategoryId, LucideIcon> = {
  "study-guide": BookOpenText,
  "original-lecture": FileText,
  mcq: ListChecks,
  "question-bank": MessageCircleQuestionMark,
  flashcards: Layers,
};

const COMPLETED_ON = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});

async function loadLecture(courseSlug: string, lectureId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  // The address must name the lecture's own course; anything else is not found.
  if (!detail || detail.course.slug !== courseSlug) notFound();
  return { scope, detail };
}

export async function generateMetadata({ params }: LecturePageProps): Promise<Metadata> {
  const { courseSlug, lectureId } = await params;
  const { detail } = await loadLecture(courseSlug, lectureId);
  return { title: `${detail.lecture.title} · ${detail.course.shortName}` };
}

export default async function LecturePage({ params }: LecturePageProps) {
  const { courseSlug, lectureId } = await params;
  const { scope, detail } = await loadLecture(courseSlug, lectureId);
  const { lecture, week, course, completedAt, resources, weekLectures } = detail;

  const categories = lectureCategoryStates(resources);
  const fixtures = await scope.lectures.includesFixtures();
  const position =
    weekLectures.length > 1
      ? `Lecture ${lecture.number} of ${weekLectures.length}`
      : `Lecture ${lecture.number}`;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
          ]}
        />
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CourseMark token={course.colorToken} />
              <span>{course.name}</span>
              <span aria-hidden="true">·</span>
              <span>Week {week.number}</span>
              <span aria-hidden="true">·</span>
              <span>{position}</span>
            </span>
          }
          title={lecture.title}
        />
      </div>

      {fixtures ? <FixtureNotice>{FIXTURE_LECTURES_NOTICE}</FixtureNotice> : null}

      <section aria-label="Completion">
        <Surface padding="md">
          <CompletionControl
            lectureId={lecture.id}
            completedOn={completedAt ? COMPLETED_ON.format(completedAt) : null}
          />
        </Surface>
      </section>

      <Section title="Study material">
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.id];
            const available = category.state.status === "available";
            return (
              <li key={category.id}>
                <Surface padding="md" className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
                          available ? "bg-accent-soft text-accent" : "bg-subtle text-fg-subtle",
                        )}
                      >
                        <Icon />
                      </span>
                      <h3 className="text-[15px] font-medium text-fg">{category.label}</h3>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-fg-muted">
                    {category.description}
                  </p>
                  <div className="mt-auto pt-1">
                    <Badge tone={available ? "accent" : "outline"}>
                      {categoryStateLabel(category.state)}
                    </Badge>
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-fg-subtle">
          Material appears here once it has been synced from your study folder. Reading, practice
          and review open in later phases.
        </p>
      </Section>

      {weekLectures.length > 1 ? (
        <Section title={`Week ${week.number}`}>
          <ul className="space-y-1">
            {weekLectures.map((sibling) => {
              const current = sibling.id === lecture.id;
              return (
                <li key={sibling.id}>
                  {current ? (
                    <span
                      aria-current="page"
                      className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2 text-sm font-medium text-fg"
                    >
                      <span className="w-4 text-[13px] text-fg-subtle tabular-nums">
                        {sibling.number}
                      </span>
                      <span className="truncate">{sibling.title}</span>
                    </span>
                  ) : (
                    <Link
                      href={lectureHref(course.slug, sibling.id)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors duration-150 hover:bg-subtle/60 hover:text-fg"
                    >
                      <span className="w-4 text-[13px] text-fg-subtle tabular-nums">
                        {sibling.number}
                      </span>
                      <span className="truncate">{sibling.title}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
