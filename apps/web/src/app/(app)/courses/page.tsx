import { COURSES, CURRENT_SEMESTER } from "@medos/shared";
import { PageHeader, Section, Surface } from "@medos/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { HierarchyPreview } from "@/features/courses/hierarchy-preview";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`${CURRENT_SEMESTER.label} · ${CURRENT_SEMESTER.name}`}
        title="Courses"
        description="Six courses, each its own study environment. Lectures, questions and flashcards stay within their course."
      />

      <Section title="This semester" aside={`${COURSES.length} courses`}>
        <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
          {COURSES.map((course) => (
            <li key={course.id}>
              <Link href={courseHref(course.id)} className="group block rounded-xl">
                <Surface
                  padding="md"
                  className="flex h-full flex-col gap-6 transition-colors duration-150 group-hover:border-border-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <CourseMark courseId={course.id} />
                    <h3 className="min-w-0 truncate text-[15px] font-medium text-fg">
                      {course.name}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-fg-subtle">No lectures yet</p>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-fg-subtle transition-colors duration-150 group-hover:text-fg"
                    />
                  </div>
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How a course is organised">
        <HierarchyPreview />
      </Section>
    </div>
  );
}
