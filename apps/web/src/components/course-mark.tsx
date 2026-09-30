import type { CourseId } from "@medos/shared";
import { cn } from "@medos/ui";

// Full class names so Tailwind can detect them.
const markColors: Record<CourseId, string> = {
  pathology: "bg-course-pathology",
  pathophysiology: "bg-course-pathophysiology",
  microbiology: "bg-course-microbiology",
  pharmacology: "bg-course-pharmacology",
  "public-health": "bg-course-public-health",
  "communication-skills": "bg-course-communication-skills",
};

/**
 * A course's identity colour as a small dot. Decorative: always pair it with
 * the course name, never use colour alone to identify a course.
 */
export function CourseMark({ courseId, className }: { courseId: CourseId; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", markColors[courseId], className)}
    />
  );
}
