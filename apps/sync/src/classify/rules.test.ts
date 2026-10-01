import { COURSES } from "@medos/shared";
import { describe, expect, it } from "vitest";

import { classifyKind, isCategoryFolder } from "./kind";
import {
  courseForFolder,
  lectureFolderLabel,
  lectureNumberInFileName,
  normaliseCourseName,
  weekForFolder,
} from "./names";

describe("course folders", () => {
  it.each([
    ["Pathology", "pathology"],
    ["pathology", "pathology"],
    ["Pathology I", "pathology"],
    ["Pathophysiology", "pathophysiology"],
    ["pathophys", "pathophysiology"],
    ["Pathophysiology I", "pathophysiology"],
    ["Microbiology", "microbiology"],
    ["micro", "microbiology"],
    ["Medical Microbiology I", "microbiology"],
    ["Pharmacology", "pharmacology"],
    ["Pharma", "pharmacology"],
    ["PHARMA", "pharmacology"],
    ["Public Health", "public-health"],
    ["PublicHealth", "public-health"],
    ["public-health", "public-health"],
    ["Public & Global Health", "public-health"],
    ["Public and Global Health", "public-health"],
    ["Communication Skills", "communication-skills"],
    ["communication", "communication-skills"],
    ["communications", "communication-skills"],
    ["communication-skills", "communication-skills"],
  ])("maps %s to %s", (folder, slug) => {
    expect(courseForFolder(folder)).toBe(slug);
  });

  it("keeps Public Health and Communication Skills apart", () => {
    expect(courseForFolder("Public Health")).not.toBe(courseForFolder("Communication Skills"));
  });

  it("does not guess unknown or ambiguous folders", () => {
    expect(courseForFolder("Anatomy")).toBeNull();
    expect(courseForFolder("Patho")).toBeNull();
    expect(courseForFolder("Health")).toBeNull();
    expect(courseForFolder("Misc")).toBeNull();
  });

  it("gives every alias to exactly one course", () => {
    const owners = new Map<string, string>();
    for (const course of COURSES) {
      for (const alias of [course.id, course.name, course.shortName, ...course.folderAliases]) {
        const key = normaliseCourseName(alias);
        expect(owners.get(key) ?? course.id, alias).toBe(course.id);
        owners.set(key, course.id);
      }
    }
  });
});

describe("week folders", () => {
  it.each([
    ["w1", 1],
    ["W1", 1],
    ["w01", 1],
    ["week1", 1],
    ["week 1", 1],
    ["Week 01", 1],
    ["week-1", 1],
    ["week_1", 1],
    ["Wk 3", 3],
    ["Week 4", 4],
    ["week-04", 4],
    ["Week 12 - Revision", 12],
  ])("reads %s as week %i", (folder, week) => {
    expect(weekForFolder(folder)).toBe(week);
  });

  it.each(["lecture 1", "notes", "week", "w", "weekly", "w1a", "Week 0", "2026"])(
    "does not read %s as a week",
    (folder) => {
      expect(weekForFolder(folder)).toBeNull();
    },
  );
});

describe("lecture names", () => {
  it("reads lecture folders with an optional title", () => {
    expect(lectureFolderLabel("lecture-1")).toEqual({ number: 1, title: null });
    expect(lectureFolderLabel("Lecture 2 - Renal physiology")).toEqual({
      number: 2,
      title: "Renal physiology",
    });
    expect(lectureFolderLabel("L3")).toEqual({ number: 3, title: null });
    expect(lectureFolderLabel("Lec 04")).toEqual({ number: 4, title: null });
    expect(lectureFolderLabel("Pharmacokinetics")).toBeNull();
  });

  it("reads lecture numbers in file names", () => {
    expect(lectureNumberInFileName("Lecture 2 Study Guide.docx")).toBe(2);
    expect(lectureNumberInFileName("lec3-mcq.html")).toBe(3);
    expect(lectureNumberInFileName("study-guide.docx")).toBeNull();
    expect(lectureNumberInFileName("selection 2.pdf")).toBeNull();
  });
});

describe("material kinds", () => {
  const kindOf = (fileName: string, folderNames: string[] = []) => {
    const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    return classifyKind({ fileName, extension, folderNames });
  };

  it("keeps the five study categories distinct", () => {
    expect(kindOf("Study Guide.docx").kind).toBe("study-guide");
    expect(kindOf("lecture.pdf").kind).toBe("original-lecture");
    expect(kindOf("MCQ.html").kind).toBe("mcq");
    expect(kindOf("Question Bank.docx").kind).toBe("question-bank");
    expect(kindOf("Flashcards.csv").kind).toBe("flashcards");
  });

  it("never treats a question bank as MCQs, or MCQs as a question bank", () => {
    expect(kindOf("QuestionBank.html").kind).toBe("question-bank");
    expect(kindOf("Quiz.docx").kind).toBe("mcq");
    expect(kindOf("MCQ Question Bank.docx").kind).toBeNull();
  });

  it("says when a kind was read from the name and when it is a default", () => {
    expect(kindOf("study-guide.docx")).toMatchObject({
      kind: "study-guide",
      confidence: "explicit",
    });
    expect(kindOf("notes.docx")).toMatchObject({ kind: "study-guide", confidence: "inferred" });
    expect(kindOf("handout.pdf")).toMatchObject({
      kind: "original-lecture",
      confidence: "explicit",
    });
    expect(kindOf("slides.pptx")).toMatchObject({ kind: "original-lecture" });
    expect(kindOf("week4.html")).toMatchObject({ kind: "mcq", confidence: "inferred" });
  });

  it("uses folder names between the lecture and the file", () => {
    expect(kindOf("1.html", ["Question Bank"]).kind).toBe("question-bank");
    expect(kindOf("part one.pdf", ["MCQs"]).kind).toBe("mcq");
  });

  it("does not guess files that say nothing about themselves", () => {
    expect(kindOf("unknown-file.txt").kind).toBeNull();
    expect(kindOf("data.csv").kind).toBeNull();
    expect(kindOf("archive.zip")).toMatchObject({ kind: null });
    expect(kindOf("archive.zip").reason).toMatch(/unsupported/);
  });

  it("recognises material folders", () => {
    expect(isCategoryFolder("MCQ")).toBe(true);
    expect(isCategoryFolder("Study Guides")).toBe(true);
    expect(isCategoryFolder("Slides")).toBe(true);
    expect(isCategoryFolder("lecture-1")).toBe(false);
    expect(isCategoryFolder("Pharmacokinetics")).toBe(false);
  });
});
