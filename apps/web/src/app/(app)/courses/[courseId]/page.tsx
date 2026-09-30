import { CURRENT_SEMESTER, findCourse } from "@medos/shared";
import { EmptyState, PageHeader, Section, Surface } from "@medos/ui";
import { ChevronRight, FolderSync } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseMark } from "@/components/course-mark";
import { HierarchyPreview } from "@/features/courses/hierarchy-preview";
import { requireUser } from "@/server/session";

interface CoursePageProps {
  params: Promise<{ courseId: string }>;
}

// Private pages are rendered per request, never prerendered, so there are no static params.
// An unknown course shows the not-found page below.

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { courseId } = await params;
  return { title: findCourse(courseId)?.name ?? "Course not found" };
}

export default async function CoursePage({ params }: CoursePageProps) {
  await requireUser();

  const { courseId } = await params;
  const course = findCourse(courseId);
  if (!course) notFound();

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <li>
              <Link
                href="/courses"
                className="rounded transition-colors duration-150 hover:text-fg"
              >
                Courses
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="text-fg-muted">
              {course.shortName}
            </li>
          </ol>
        </nav>

        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              <CourseMark courseId={course.id} />
              {CURRENT_SEMESTER.label} · {CURRENT_SEMESTER.name}
            </span>
          }
          title={course.name}
        />
      </div>

      <Section title="Weeks">
        <Surface>
          <EmptyState
            icon={<FolderSync />}
            title="No lectures yet"
            description="Weeks and lectures appear here once your study material is synced from the local S5 folder. The sync tool arrives in a later phase."
          />
        </Surface>
      </Section>

      <Section title="What this will look like">
        <HierarchyPreview />
      </Section>
    </div>
  );
}
