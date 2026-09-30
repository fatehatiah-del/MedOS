import { COURSES, type CourseDefinition } from "@medos/shared";
import { Surface } from "@medos/ui";
import type { ReactNode } from "react";

import { CourseMark } from "@/components/course-mark";

export interface CourseListProps {
  /** Status shown at the end of each row, e.g. "No cards yet". */
  renderStatus: (course: CourseDefinition) => ReactNode;
}

/** The six courses as rows. Used wherever content is organised strictly per course. */
export function CourseList({ renderStatus }: CourseListProps) {
  return (
    <Surface>
      <ul className="divide-y divide-border">
        {COURSES.map((course) => (
          <li key={course.id} className="flex items-center gap-3 px-5 py-3.5">
            <CourseMark courseId={course.id} />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{course.name}</p>
            <div className="shrink-0 text-[13px] text-fg-subtle">{renderStatus(course)}</div>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
