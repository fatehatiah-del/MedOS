import { COURSES, type CourseId } from "@medos/shared";

/*
 * Reading meaning from folder names. Every rule is deterministic: the same
 * name always gives the same answer, and anything that cannot be read with
 * confidence gives no answer rather than a guess.
 */

const ROMAN_OR_NUMBER = /^(?:i{1,3}|iv|v|\d+)$/;

/**
 * Canonical form of a course folder name: lowercase letters and digits only,
 * "&" read as "and", and a trailing course number ("I", "1") dropped, so
 * "Public & Global Health" and "public-and-global-health" compare equal.
 */
export function normaliseCourseName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replaceAll("&", " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (tokens.length > 1 && ROMAN_OR_NUMBER.test(tokens.at(-1) ?? "")) tokens.pop();
  return tokens.join("");
}

const COURSE_NAME_INDEX: ReadonlyMap<string, CourseId> = (() => {
  const index = new Map<string, CourseId>();
  for (const course of COURSES) {
    for (const name of [course.id, course.name, course.shortName, ...course.folderAliases]) {
      const key = normaliseCourseName(name);
      const existing = index.get(key);
      if (existing && existing !== course.id) {
        throw new Error(`Course alias "${name}" is claimed by both ${existing} and ${course.id}.`);
      }
      index.set(key, course.id);
    }
  }
  return index;
})();

/** The course a top-level folder belongs to, or null if its name is not a known course. */
export function courseForFolder(name: string): CourseId | null {
  return COURSE_NAME_INDEX.get(normaliseCourseName(name)) ?? null;
}

/**
 * Top-level folders that hold no course material and are skipped without a
 * warning. "Calendars" holds the university timetable and academic calendar,
 * which MedOS carries as transcribed data (see @medos/shared) rather than
 * importing as lecture material.
 */
const NON_COURSE_FOLDERS: ReadonlySet<string> = new Set(["calendars", "calendar"]);

export function isNonCourseFolder(name: string): boolean {
  return NON_COURSE_FOLDERS.has(normaliseCourseName(name));
}

const WEEK_FOLDER = /^(?:w|wk|week)[\s._-]*0*(\d{1,2})(?:$|[\s._-])/i;

/**
 * The teaching week a folder stands for: "w1", "W01", "week 1", "Week-01",
 * "week_1", "Wk 3", "Week 4 - Pharmacokinetics". Null for anything else.
 */
export function weekForFolder(name: string): number | null {
  const match = WEEK_FOLDER.exec(name.trim());
  if (!match) return null;
  const week = Number(match[1]);
  return week >= 1 && week <= 40 ? week : null;
}

const LECTURE_FOLDER = /^(?:lecture|lect|lec|l)[\s._-]*0*(\d{1,3})(?:$|[\s._:-]+(.*)$)/i;
const LECTURE_IN_NAME = /(?:^|[^a-z])(?:lecture|lect|lec)[\s._-]*0*(\d{1,3})(?![0-9])/i;

export interface LectureLabel {
  /** The number the source uses, e.g. 3 in "Lecture 3". */
  number: number;
  /** Descriptive text after the number, e.g. "Pharmacokinetics" in "Lecture 3 - Pharmacokinetics". */
  title: string | null;
}

/** Reads a lecture folder name: "lecture-1", "Lecture 2 - Renal", "L3", "Lec 04". */
export function lectureFolderLabel(name: string): LectureLabel | null {
  const match = LECTURE_FOLDER.exec(name.trim());
  if (!match) return null;
  const title = match[2]?.trim() || null;
  return { number: Number(match[1]), title };
}

/** A lecture number mentioned in a file name: "Lecture 2 Study Guide.docx", "lec3-mcq.html". */
export function lectureNumberInFileName(name: string): number | null {
  const match = LECTURE_IN_NAME.exec(name);
  return match ? Number(match[1]) : null;
}
