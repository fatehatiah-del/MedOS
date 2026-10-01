import type { ResourceKind } from "@medos/database";

import { IMAGE_EXTENSIONS, isSupportedExtension } from "../scan/files";

/*
 * Which kind of study material a file is. Rules, in order:
 *
 * 1. Names say it explicitly: the file name, and the names of any folders
 *    between the lecture and the file ("MCQ/Quiz 1.html"). Study Guide,
 *    Question Bank, MCQ and Flashcards are distinct signals. A name with more
 *    than one of them is ambiguous and goes to review.
 * 2. Otherwise a name that says lecture, slides or presentation marks the
 *    original lecture.
 * 3. Otherwise the file type decides, as a documented default:
 *    PDF, PPT, PPTX → Original Lecture; DOC, DOCX → Study Guide;
 *    HTML → MCQ; images → Image.
 * 4. Anything else (plain text, CSV, unknown types with no telling name) is
 *    not guessed: it goes to review.
 *
 * MCQ and Question Bank are never merged: a question bank is only ever
 * recognised by name.
 */

export type KindConfidence = "explicit" | "inferred";

export type KindResult =
  | { kind: ResourceKind; confidence: KindConfidence; reason: string }
  | { kind: null; reason: string };

const SPECIFIC_SIGNALS: readonly { kind: ResourceKind; pattern: RegExp; label: string }[] = [
  { kind: "study-guide", pattern: /\bstudy ?guides?\b/, label: "Study Guide" },
  {
    kind: "question-bank",
    pattern: /\b(?:question ?banks?|q ?banks?|qb)\b/,
    label: "Question Bank",
  },
  { kind: "mcq", pattern: /\b(?:mcqs?|quiz(?:zes)?|multiple choice)\b/, label: "MCQ" },
  { kind: "flashcards", pattern: /\b(?:flash ?cards?|anki)\b/, label: "Flashcards" },
];

const LECTURE_SIGNAL = /\b(?:lectures?|slides?|presentations?|powerpoint|handouts?)\b/;

/** Lowercase words of a name, separators turned into spaces: "Study_Guide-2" → "study guide 2". */
export function nameText(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SLIDE_FOLDER = /^(?:slides?|presentations?|powerpoints?|lecture slides?|original|originals)$/;

/**
 * Whether a folder groups one kind of material ("MCQ", "Study Guides",
 * "Slides") rather than standing for a lecture of its own.
 */
export function isCategoryFolder(name: string): boolean {
  const text = nameText(name);
  return SPECIFIC_SIGNALS.some((signal) => signal.pattern.test(text)) || SLIDE_FOLDER.test(text);
}

export function classifyKind(input: {
  fileName: string;
  extension: string;
  /** Names of folders between the lecture (or week) folder and the file. */
  folderNames?: readonly string[];
}): KindResult {
  const { fileName, extension, folderNames = [] } = input;
  const text = [...folderNames, fileName].map(nameText).join(" | ");

  const specific = SPECIFIC_SIGNALS.filter((signal) => signal.pattern.test(text));
  if (specific.length > 1) {
    return {
      kind: null,
      reason: `the name suggests several kinds (${specific.map((signal) => signal.label).join(", ")})`,
    };
  }
  const [only] = specific;
  if (only) {
    return { kind: only.kind, confidence: "explicit", reason: `the name says ${only.label}` };
  }

  if (!isSupportedExtension(extension)) {
    return { kind: null, reason: `unsupported file type (${extension || "no extension"})` };
  }

  if (LECTURE_SIGNAL.test(text) && extension !== ".html" && extension !== ".htm") {
    return {
      kind: "original-lecture",
      confidence: "explicit",
      reason: "the name says lecture or slides",
    };
  }

  switch (extension) {
    case ".pdf":
    case ".ppt":
    case ".pptx":
      return {
        kind: "original-lecture",
        confidence: "inferred",
        reason: `${extension.slice(1).toUpperCase()} files default to Original Lecture`,
      };
    case ".doc":
    case ".docx":
      return {
        kind: "study-guide",
        confidence: "inferred",
        reason: `${extension.slice(1).toUpperCase()} files default to Study Guide`,
      };
    case ".html":
    case ".htm":
      return { kind: "mcq", confidence: "inferred", reason: "HTML files default to MCQ" };
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return { kind: "image", confidence: "inferred", reason: "image file" };
  }

  return { kind: null, reason: `a ${extension} file whose name does not say what it is` };
}
