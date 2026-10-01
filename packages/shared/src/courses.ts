/**
 * The six Semester 5 courses. Each course is an independent learning
 * environment: Public & Global Health and Communication Skills are separate
 * courses, and flashcard review is never mixed across courses.
 */
export const COURSE_IDS = [
  "pathology",
  "pathophysiology",
  "microbiology",
  "pharmacology",
  "public-health",
  "communication-skills",
] as const;

export type CourseId = (typeof COURSE_IDS)[number];

export interface CourseDefinition {
  /** Stable identifier, also used as the URL slug. */
  id: CourseId;
  /** Official course name. */
  name: string;
  /** Compact name used in navigation and dense lists. */
  shortName: string;
  /**
   * Other names the course's folder may have in the source material, e.g.
   * "Pharma". Matched after ignoring case, spacing, punctuation and a trailing
   * "I". Each alias belongs to exactly one course.
   */
  folderAliases: readonly string[];
}

export const COURSES: readonly CourseDefinition[] = [
  {
    id: "pathology",
    name: "Pathology I",
    shortName: "Pathology",
    folderAliases: ["Pathology", "Path"],
  },
  {
    id: "pathophysiology",
    name: "Pathophysiology I",
    shortName: "Pathophysiology",
    folderAliases: ["Pathophysiology", "Pathophys", "Pathophysio", "Patho-physiology"],
  },
  {
    id: "microbiology",
    name: "Medical Microbiology I",
    shortName: "Microbiology",
    folderAliases: ["Microbiology", "Micro", "Medical Microbiology", "Microbio"],
  },
  {
    id: "pharmacology",
    name: "Pharmacology I",
    shortName: "Pharmacology",
    folderAliases: ["Pharmacology", "Pharma", "Pharm"],
  },
  {
    id: "public-health",
    name: "Public & Global Health",
    shortName: "Public Health",
    folderAliases: [
      "Public Health",
      "Public & Global Health",
      "Public and Global Health",
      "Global Health",
      "PGH",
    ],
  },
  {
    id: "communication-skills",
    name: "Communication Skills",
    shortName: "Communication Skills",
    folderAliases: ["Communication Skills", "Communication", "Communications", "Comm Skills"],
  },
];

export function isCourseId(value: string): value is CourseId {
  return (COURSE_IDS as readonly string[]).includes(value);
}

export function getCourse(id: CourseId): CourseDefinition {
  const course = COURSES.find((candidate) => candidate.id === id);
  if (!course) {
    throw new Error(`Unknown course id: ${id}`);
  }
  return course;
}

export function findCourse(id: string): CourseDefinition | undefined {
  return isCourseId(id) ? getCourse(id) : undefined;
}
