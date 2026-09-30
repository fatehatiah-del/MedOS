import { type CourseId, isCourseId } from "@medos/shared";
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
 *
 * `token` is the course's colour token; an unknown or missing token gets a
 * neutral dot.
 */
export function CourseMark({ token, className }: { token: string | null; className?: string }) {
  const color = token !== null && isCourseId(token) ? markColors[token] : "bg-border-strong";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", color, className)}
    />
  );
}
