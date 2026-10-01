import type { ResourceKind } from "@medos/database";
import type { CourseId } from "@medos/shared";

import { mimeTypeFor } from "../scan/files";
import type { ScanResult, ScannedFile } from "../scan/walk";

import { type KindConfidence, classifyKind, isCategoryFolder } from "./kind";
import {
  courseForFolder,
  lectureFolderLabel,
  lectureNumberInFileName,
  weekForFolder,
} from "./names";

/*
 * Turns a scan into the Course → Week → Lecture structure and a verdict for
 * every file.
 *
 * Expected layout:  <course folder>/<week folder>/[<lecture folder>/]…/<file>
 *
 * Lecture boundaries inside a week, in order of precedence:
 *
 * 1. Lecture folders. Every subfolder of the week that is not a material
 *    folder ("MCQ", "Slides", …) is a lecture. Folders named with a number
 *    ("lecture-2", "Lecture 3 - Renal", "L4") are ordered by that number;
 *    others follow in name order. Files lying directly in the week next to
 *    lecture folders cannot be placed with confidence and go to review.
 * 2. Otherwise, lecture numbers in file names ("Lecture 2 Study Guide.docx").
 *    Each distinct number is a lecture. Files without a number go to review
 *    when the week has two or more numbered lectures, and join the lecture
 *    when it has exactly one.
 * 3. Otherwise the whole week is a single lecture.
 *
 * Lectures are numbered 1, 2, 3 … within their week in that order, whatever
 * numbers the source used (a week may hold "Lecture 5" and "Lecture 6"). The
 * source's own label is kept as the lecture's title.
 *
 * Nothing is dropped: a file that cannot be placed stays in the result with
 * `outcome: "needs-review"` and the reasons why.
 */

export interface ClassifiedFile extends ScannedFile {
  courseSlug: CourseId | null;
  courseFolder: string | null;
  weekNumber: number | null;
  weekFolder: string | null;
  /** Position of the lecture within its week, from 1. */
  lectureNumber: number | null;
  kind: ResourceKind | null;
  kindConfidence: KindConfidence | null;
  mimeType: string;
  /** "attach": course, week, lecture and kind are all known. */
  outcome: "attach" | "needs-review";
  /** Why the file was classified this way, for reports and the manifest. */
  reasons: string[];
}

export interface LectureStructure {
  number: number;
  /** Title from the source (a folder name or "Lecture 3"), or null to use the default. */
  title: string | null;
  /** The source folder of the lecture, relative, when it has one. */
  folder: string | null;
}

export interface WeekStructure {
  number: number;
  folder: string;
  lectures: LectureStructure[];
}

export interface CourseStructure {
  slug: CourseId;
  folder: string;
  weeks: WeekStructure[];
}

export interface ClassificationIssue {
  path: string;
  message: string;
}

export interface Classification {
  courses: CourseStructure[];
  files: ClassifiedFile[];
  /** Folders and conflicts that need a person to look at them. */
  issues: ClassificationIssue[];
}

interface Draft {
  file: ScannedFile;
  courseSlug: CourseId | null;
  courseFolder: string | null;
  weekNumber: number | null;
  weekFolder: string | null;
  lectureNumber: number | null;
  /** Folder names between the lecture (or week) and the file. */
  innerFolders: string[];
  reasons: string[];
  blocked: boolean;
}

function childFolders(directories: readonly string[], parent: string): string[] {
  const prefix = `${parent}/`;
  return directories
    .filter((dir) => dir.startsWith(prefix) && !dir.slice(prefix.length).includes("/"))
    .map((dir) => dir.slice(prefix.length));
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function classifyScan(scan: Pick<ScanResult, "files" | "directories">): Classification {
  const issues: ClassificationIssue[] = [];
  const drafts: Draft[] = scan.files.map((file) => ({
    file,
    courseSlug: null,
    courseFolder: null,
    weekNumber: null,
    weekFolder: null,
    lectureNumber: null,
    innerFolders: [],
    reasons: [],
    blocked: false,
  }));

  // --- Courses -------------------------------------------------------------
  const topFolders = scan.directories.filter((dir) => !dir.includes("/"));
  const foldersByCourse = new Map<CourseId, string[]>();
  for (const folder of topFolders) {
    const slug = courseForFolder(folder);
    if (!slug) {
      issues.push({ path: folder, message: "folder name does not match any course" });
      continue;
    }
    foldersByCourse.set(slug, [...(foldersByCourse.get(slug) ?? []), folder]);
  }
  const courseByFolder = new Map<string, CourseId>();
  for (const [slug, folders] of foldersByCourse) {
    if (folders.length > 1) {
      for (const folder of folders) {
        issues.push({
          path: folder,
          message: `several folders map to the same course (${folders.join(", ")}); none is imported until one remains`,
        });
      }
      continue;
    }
    courseByFolder.set(folders[0] ?? "", slug);
  }

  for (const draft of drafts) {
    const [top, ...rest] = draft.file.segments;
    if (rest.length === 0) {
      draft.reasons.push("not inside a course folder");
      draft.blocked = true;
      continue;
    }
    const slug = courseByFolder.get(top ?? "");
    if (!slug) {
      draft.reasons.push(`course folder "${top}" is not recognised`);
      draft.blocked = true;
      continue;
    }
    draft.courseSlug = slug;
    draft.courseFolder = top ?? null;
  }

  // --- Weeks ---------------------------------------------------------------
  const courses: CourseStructure[] = [];
  for (const [folder, slug] of [...courseByFolder].sort(([a], [b]) => byName(a, b))) {
    const weekFolders = childFolders(scan.directories, folder);
    const numbered = new Map<number, string[]>();
    for (const weekFolder of weekFolders) {
      const number = weekForFolder(weekFolder);
      if (number === null) {
        issues.push({
          path: `${folder}/${weekFolder}`,
          message: "folder is not a recognisable week (expected names like w1 or Week 1)",
        });
        continue;
      }
      numbered.set(number, [...(numbered.get(number) ?? []), weekFolder]);
    }

    const weeks: WeekStructure[] = [];
    for (const [number, names] of [...numbered].sort(([a], [b]) => a - b)) {
      if (names.length > 1) {
        for (const name of names) {
          issues.push({
            path: `${folder}/${name}`,
            message: `several folders are week ${number} (${names.join(", ")}); none is imported until one remains`,
          });
        }
        continue;
      }
      weeks.push({ number, folder: `${folder}/${names[0]}`, lectures: [] });
    }
    courses.push({ slug, folder, weeks });
  }

  const weekByFolder = new Map<string, { course: CourseStructure; week: WeekStructure }>();
  for (const course of courses) {
    for (const week of course.weeks) weekByFolder.set(week.folder, { course, week });
  }

  for (const draft of drafts) {
    if (draft.blocked) continue;
    const [course, weekName, ...rest] = draft.file.segments;
    if (rest.length === 0) {
      draft.reasons.push("not inside a week folder");
      draft.blocked = true;
      continue;
    }
    const found = weekByFolder.get(`${course}/${weekName}`);
    if (!found) {
      draft.reasons.push(`folder "${weekName}" is not a usable week`);
      draft.blocked = true;
      continue;
    }
    draft.weekNumber = found.week.number;
    draft.weekFolder = found.week.folder;
  }

  // --- Lectures ------------------------------------------------------------
  for (const { week } of weekByFolder.values()) {
    const inWeek = drafts.filter((draft) => !draft.blocked && draft.weekFolder === week.folder);
    const subfolders = childFolders(scan.directories, week.folder);
    const lectureFolders = subfolders.filter((name) => !isCategoryFolder(name));

    if (lectureFolders.length > 0) {
      // Rule 1: lecture folders.
      const labelled = lectureFolders.map((name) => ({ name, label: lectureFolderLabel(name) }));
      const sorted = [
        ...labelled
          .filter((entry) => entry.label !== null)
          .sort(
            (a, b) => (a.label?.number ?? 0) - (b.label?.number ?? 0) || byName(a.name, b.name),
          ),
        ...labelled.filter((entry) => entry.label === null).sort((a, b) => byName(a.name, b.name)),
      ];
      const seen = new Map<number, string>();
      const duplicates = new Set<string>();
      for (const { name, label } of sorted) {
        if (!label) continue;
        const other = seen.get(label.number);
        if (other) {
          duplicates.add(name).add(other);
          issues.push({
            path: `${week.folder}/${name}`,
            message: `both "${other}" and "${name}" are lecture ${label.number}; neither is imported until one remains`,
          });
        } else {
          seen.set(label.number, name);
        }
      }

      const positionByFolder = new Map<string, number>();
      for (const { name, label } of sorted.filter((entry) => !duplicates.has(entry.name))) {
        const number = week.lectures.length + 1;
        positionByFolder.set(name, number);
        week.lectures.push({
          number,
          title: label ? (label.title ?? `Lecture ${label.number}`) : name,
          folder: `${week.folder}/${name}`,
        });
      }

      for (const draft of inWeek) {
        const inner = draft.file.segments.slice(2);
        const folder = inner.length > 1 ? inner[0] : undefined;
        if (folder === undefined) {
          draft.reasons.push("lies directly in a week that has lecture folders");
          draft.blocked = true;
        } else if (isCategoryFolder(folder)) {
          draft.reasons.push(`material folder "${folder}" sits next to lecture folders`);
          draft.blocked = true;
        } else if (duplicates.has(folder)) {
          draft.reasons.push(`lecture folder "${folder}" clashes with another`);
          draft.blocked = true;
        } else {
          draft.lectureNumber = positionByFolder.get(folder) ?? null;
          draft.innerFolders = inner.slice(1, -1);
          draft.reasons.push(`lecture folder "${folder}"`);
        }
      }
      continue;
    }

    // Rules 2 and 3: numbers in file names, or one lecture for the whole week.
    for (const draft of inWeek) draft.innerFolders = draft.file.segments.slice(2, -1);
    const numbers = [
      ...new Set(
        inWeek
          .map((draft) => lectureNumberInFileName(draft.file.name))
          .filter((number): number is number => number !== null),
      ),
    ].sort((a, b) => a - b);

    if (numbers.length === 0) {
      if (inWeek.length > 0 || subfolders.length > 0) {
        week.lectures.push({ number: 1, title: null, folder: null });
      }
      for (const draft of inWeek) {
        draft.lectureNumber = 1;
        draft.reasons.push("the week holds a single lecture");
      }
      continue;
    }

    for (const [index, sourceNumber] of numbers.entries()) {
      week.lectures.push({ number: index + 1, title: `Lecture ${sourceNumber}`, folder: null });
    }
    for (const draft of inWeek) {
      const sourceNumber = lectureNumberInFileName(draft.file.name);
      if (sourceNumber !== null) {
        draft.lectureNumber = numbers.indexOf(sourceNumber) + 1;
        draft.reasons.push(`the file name says lecture ${sourceNumber}`);
      } else if (numbers.length === 1) {
        draft.lectureNumber = 1;
        draft.reasons.push("the week holds a single lecture");
      } else {
        draft.reasons.push(
          `the week has lectures ${numbers.join(", ")} and the file name does not say which it belongs to`,
        );
        draft.blocked = true;
      }
    }
  }

  // --- Kinds ---------------------------------------------------------------
  const files = drafts.map((draft): ClassifiedFile => {
    const kind = classifyKind({
      fileName: draft.file.name,
      extension: draft.file.extension,
      folderNames: draft.innerFolders,
    });
    const reasons = [...draft.reasons, kind.reason];
    const placed = !draft.blocked && draft.lectureNumber !== null;
    return {
      ...draft.file,
      courseSlug: draft.courseSlug,
      courseFolder: draft.courseFolder,
      weekNumber: draft.weekNumber,
      weekFolder: draft.weekFolder,
      lectureNumber: placed ? draft.lectureNumber : null,
      kind: kind.kind,
      kindConfidence: kind.kind === null ? null : kind.confidence,
      mimeType: mimeTypeFor(draft.file.extension),
      outcome: placed && kind.kind !== null ? "attach" : "needs-review",
      reasons,
    };
  });

  return { courses, files, issues };
}
