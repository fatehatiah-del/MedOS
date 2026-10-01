import type { ResourceKind } from "@medos/database";
import { COURSES } from "@medos/shared";

import type { ApplyResult } from "./apply";
import { type Classification, summariseCourseFolders } from "./classify/classify";
import type { SyncPlan } from "./plan";
import type { ScanResult } from "./scan/walk";

/*
 * Readable reports. Every number is counted from the scan, the plan or the
 * result of applying it; nothing is estimated.
 */

const KIND_LABELS: readonly [ResourceKind, string][] = [
  ["study-guide", "Study Guides"],
  ["original-lecture", "Original Lectures"],
  ["mcq", "MCQs"],
  ["question-bank", "Question Banks"],
  ["flashcards", "Flashcards"],
  ["image", "Images"],
  ["supplementary", "Supplementary"],
];

const row = (label: string, value: string | number) => `  ${label.padEnd(24)}${value}`;

function structureLines(classification: Classification): string[] {
  const weeks = classification.courses.flatMap((course) => course.weeks);
  const lectures = weeks.flatMap((week) => week.lectures);
  const courses = summariseCourseFolders(classification);
  return [
    row("Courses discovered", classification.courses.length),
    row("  with material", courses.withMaterial.length),
    row("  empty", courses.empty.length),
    row("Weeks discovered", weeks.length),
    row("Lectures inferred", lectures.length),
  ];
}

/** Empty course folders and courses with no folder, by name and source folder. */
function courseFolderLines(classification: Classification): string[] {
  const courses = summariseCourseFolders(classification);
  const nameOf = (slug: string) => COURSES.find((course) => course.id === slug)?.shortName ?? slug;
  const lines: string[] = [];
  if (courses.empty.length > 0) {
    lines.push("", "Empty courses (folder found, no material yet):");
    for (const course of courses.empty) lines.push(`  ${nameOf(course.slug)}  (${course.folder})`);
  }
  if (courses.notFound.length > 0) {
    lines.push("", "Courses without a folder:");
    for (const slug of courses.notFound) lines.push(`  ${nameOf(slug)}`);
  }
  return lines;
}

function kindLines(files: readonly { kind: ResourceKind | null; attached: boolean }[]): string[] {
  const lines: string[] = [];
  for (const [kind, label] of KIND_LABELS) {
    const count = files.filter((file) => file.attached && file.kind === kind).length;
    if (
      count > 0 ||
      ["study-guide", "original-lecture", "mcq", "question-bank", "flashcards"].includes(kind)
    ) {
      lines.push(row(label, count));
    }
  }
  lines.push(row("Needs review", files.filter((file) => !file.attached).length));
  return lines;
}

function issueLines(classification: Classification, scan: ScanResult, verbose: boolean): string[] {
  const lines: string[] = [];
  if (classification.issues.length > 0) {
    lines.push("", "Folders to look at:");
    for (const issue of classification.issues) lines.push(`  ${issue.path}: ${issue.message}`);
  }
  if (scan.unreadable.length > 0) {
    lines.push("", "Could not be read (left untouched):");
    for (const entry of scan.unreadable) lines.push(`  ${entry.relativePath}: ${entry.reason}`);
  }
  if (verbose && scan.skipped.length > 0) {
    lines.push("", "Skipped (not study material):");
    for (const entry of scan.skipped) lines.push(`  ${entry.relativePath}: ${entry.reason}`);
  }
  return lines;
}

function structureTree(classification: Classification): string[] {
  const lines = ["", "Structure:"];
  for (const course of classification.courses) {
    lines.push(`  ${course.slug}  (${course.folder})`);
    for (const week of course.weeks) {
      const count = week.lectures.length;
      lines.push(
        `    Week ${week.number}: ${count === 0 ? "no lectures" : count === 1 ? "1 lecture" : `${count} lectures`}`,
      );
      for (const lecture of week.lectures) {
        lines.push(`      Lecture ${lecture.number}${lecture.title ? `: ${lecture.title}` : ""}`);
      }
    }
  }
  return lines;
}

/** Report for `scan`: what is in the folder, with no reference to the database. */
export function formatScanReport(
  scan: ScanResult,
  classification: Classification,
  verbose: boolean,
): string {
  const files = classification.files.map((file) => ({
    kind: file.kind,
    attached: file.outcome === "attach",
  }));
  const lines = [
    "MedOS Sync — scan (read-only, nothing is changed)",
    "",
    `Source: ${scan.root}`,
    "",
    ...structureLines(classification),
    row("Files scanned", scan.files.length),
    row("Skipped", scan.skipped.length),
    row("Unreadable", scan.unreadable.length),
    "",
    ...kindLines(files),
    ...courseFolderLines(classification),
  ];
  const review = classification.files.filter((file) => file.outcome === "needs-review");
  if (review.length > 0) {
    lines.push("", "Needs review:");
    for (const file of review) lines.push(`  ${file.relativePath}: ${file.reasons.join("; ")}`);
  }
  lines.push(...issueLines(classification, scan, verbose));
  if (verbose) {
    lines.push(...structureTree(classification), "", "Files:");
    for (const file of classification.files) {
      const where =
        file.outcome === "attach"
          ? `${file.courseSlug} · week ${file.weekNumber} · lecture ${file.lectureNumber} · ${file.kind}`
          : "needs review";
      lines.push(`  ${file.relativePath}`, `      ${where} — ${file.reasons.join("; ")}`);
    }
  }
  return lines.join("\n");
}

/** Report for `sync` and `sync --dry-run`. */
export function formatSyncReport(input: {
  scan: ScanResult;
  plan: SyncPlan;
  dryRun: boolean;
  result?: ApplyResult;
  verbose: boolean;
  storage: string;
}): string {
  const { scan, plan, dryRun, result, verbose, storage } = input;
  const count = (change: string) => plan.files.filter((file) => file.change === change).length;
  const files = plan.files.map((planned) => ({
    kind: planned.kind,
    attached: planned.status === "synced",
  }));

  const lines = [
    dryRun ? "MedOS Sync — dry run (nothing is changed)" : "MedOS Sync",
    "",
    `Source:  ${scan.root}`,
    `Storage: ${storage}`,
    "",
    ...structureLines(plan.classification),
    row("Files scanned", scan.files.length),
    "",
    ...kindLines(files),
    row("Ignored by override", plan.files.filter((file) => file.status === "ignored").length),
    "",
    row(dryRun ? "Would add" : "New", count("new")),
    row(dryRun ? "Would update" : "Updated", count("changed")),
    row(dryRun ? "Would re-file" : "Re-filed", count("reclassified")),
    row("Back again", count("reappeared")),
    row("Unchanged", count("unchanged")),
    row(dryRun ? "Would mark missing" : "Missing", plan.missing.length),
    row("Still missing", plan.stillMissing.length),
    row("Warnings", plan.classification.issues.length + scan.unreadable.length),
  ];

  if (result) {
    lines.push(
      "",
      row("Weeks created", result.weeksCreated),
      row("Lectures created", result.lecturesCreated),
      row("Materials added", result.resourcesCreated),
      row("Materials updated", result.resourcesUpdated),
      row("Originals copied", result.objectsStored),
      row("Originals already kept", result.objectsExisting),
    );
    if (result.placeholdersRemoved > 0) {
      lines.push(row("Placeholders removed", result.placeholdersRemoved));
    }
  }

  if (plan.placeholderLectures > 0) {
    lines.push(
      "",
      `Note: this account has ${plan.placeholderLectures} development placeholder lectures.`,
      "      A real sync needs --remove-placeholders to remove them first.",
    );
  }

  const changes = plan.files.filter((file) => file.change !== "unchanged");
  if (changes.length > 0) {
    lines.push("", dryRun ? "Would change:" : "Changed:");
    for (const planned of changes) {
      const where =
        planned.status === "synced" && planned.target?.type === "position"
          ? `${planned.target.courseSlug} · week ${planned.target.weekNumber} · lecture ${planned.target.lectureNumber} · ${planned.kind}`
          : planned.status;
      lines.push(`  [${planned.change}] ${planned.file.relativePath} → ${where}`);
    }
  }
  if (plan.missing.length > 0) {
    lines.push("", "No longer in the source folder (kept in MedOS, marked missing):");
    for (const row of plan.missing) lines.push(`  ${row.relativePath}`);
  }
  const review = plan.files.filter((file) => file.status === "needs-review");
  if (review.length > 0) {
    lines.push("", "Needs review (kept on record, not attached to a lecture):");
    for (const planned of review) {
      lines.push(`  ${planned.file.relativePath}: ${planned.reasons.join("; ")}`);
    }
  }
  lines.push(...issueLines(plan.classification, scan, verbose));
  if (verbose) lines.push(...structureTree(plan.classification));
  return lines.join("\n");
}
