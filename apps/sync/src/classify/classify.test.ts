import { describe, expect, it } from "vitest";

import type { ScannedFile } from "../scan/walk";

import { type Classification, classifyScan } from "./classify";

/** A scan made of paths only; classification never reads file contents. */
function scanOf(paths: string[], extraFolders: string[] = []) {
  const files: ScannedFile[] = paths.map((relativePath, index) => {
    const segments = relativePath.split("/");
    const name = segments.at(-1) ?? "";
    const dot = name.lastIndexOf(".");
    return {
      relativePath,
      segments,
      name,
      extension: dot >= 0 ? name.slice(dot).toLowerCase() : "",
      sizeBytes: 1,
      modifiedAt: new Date(0),
      contentHash: index.toString(16).padStart(64, "0"),
    };
  });
  // A real scan lists every folder, including each folder's parents.
  const folders = new Set<string>();
  const addWithParents = (segments: string[]) => {
    for (let depth = 1; depth <= segments.length; depth += 1) {
      folders.add(segments.slice(0, depth).join("/"));
    }
  };
  for (const folder of extraFolders) addWithParents(folder.split("/"));
  for (const file of files) addWithParents(file.segments.slice(0, -1));
  return { files, directories: [...folders].sort() };
}

const fileAt = (result: Classification, relativePath: string) => {
  const file = result.files.find((entry) => entry.relativePath === relativePath);
  if (!file) throw new Error(`no ${relativePath}`);
  return file;
};

const lecturesOf = (result: Classification, slug: string, week: number) =>
  result.courses
    .find((course) => course.slug === slug)
    ?.weeks.find((entry) => entry.number === week)?.lectures;

describe("structure", () => {
  const result = classifyScan(
    scanOf(
      [
        "Pathology/w1/study-guide.docx",
        "Pathology/w1/lecture.pdf",
        "Pathology/w1/mcq.html",
        "Pharma/w4/lecture-1/study-guide.docx",
        "Pharma/w4/lecture-1/mcq.html",
        "Pharma/w4/lecture-2/study-guide.docx",
        "Pharma/w4/lecture-2/mcq.html",
        "Microbiology/w3/unknown-file.txt",
      ],
      ["Pathology/w2", "Public Health/week 1", "Communication Skills/Week 01"],
    ),
  );

  it("finds the courses, keeping Public Health and Communication Skills apart", () => {
    expect(result.courses.map((course) => course.slug).sort()).toEqual([
      "communication-skills",
      "microbiology",
      "pathology",
      "pharmacology",
      "public-health",
    ]);
  });

  it("keeps an empty week as a week without lectures", () => {
    expect(lecturesOf(result, "pathology", 2)).toEqual([]);
    expect(lecturesOf(result, "public-health", 1)).toEqual([]);
  });

  it("treats a week of loose files as one lecture", () => {
    expect(lecturesOf(result, "pathology", 1)).toEqual([{ number: 1, title: null, folder: null }]);
    expect(fileAt(result, "Pathology/w1/mcq.html")).toMatchObject({
      courseSlug: "pathology",
      weekNumber: 1,
      lectureNumber: 1,
      kind: "mcq",
      outcome: "attach",
    });
  });

  it("keeps two lecture folders in one week as two lectures", () => {
    expect(lecturesOf(result, "pharmacology", 4)).toEqual([
      { number: 1, title: "Lecture 1", folder: "Pharma/w4/lecture-1" },
      { number: 2, title: "Lecture 2", folder: "Pharma/w4/lecture-2" },
    ]);
    expect(fileAt(result, "Pharma/w4/lecture-2/mcq.html").lectureNumber).toBe(2);
    expect(fileAt(result, "Pharma/w4/lecture-1/study-guide.docx")).toMatchObject({
      lectureNumber: 1,
      kind: "study-guide",
    });
  });

  it("keeps an unclassifiable file, marked for review", () => {
    const unknown = fileAt(result, "Microbiology/w3/unknown-file.txt");
    expect(unknown.outcome).toBe("needs-review");
    expect(unknown.kind).toBeNull();
    expect(unknown.reasons.join(" ")).toMatch(/does not say what it is/);
  });
});

describe("lecture boundaries", () => {
  it("numbers lectures within the week, keeping the source's own label as the title", () => {
    const result = classifyScan(
      scanOf([
        "Pharma/w2/Lecture 6 Study Guide.docx",
        "Pharma/w2/Lecture 5 Study Guide.docx",
        "Pharma/w2/Lecture 5 slides.pdf",
      ]),
    );
    expect(lecturesOf(result, "pharmacology", 2)).toEqual([
      { number: 1, title: "Lecture 5", folder: null },
      { number: 2, title: "Lecture 6", folder: null },
    ]);
    expect(fileAt(result, "Pharma/w2/Lecture 6 Study Guide.docx").lectureNumber).toBe(2);
  });

  it("sends unnumbered files to review when a week has several numbered lectures", () => {
    const result = classifyScan(
      scanOf([
        "Pharma/w2/Lecture 1 Study Guide.docx",
        "Pharma/w2/Lecture 2 Study Guide.docx",
        "Pharma/w2/quiz.html",
      ]),
    );
    const quiz = fileAt(result, "Pharma/w2/quiz.html");
    expect(quiz.outcome).toBe("needs-review");
    expect(quiz.reasons.join(" ")).toMatch(/does not say which/);
  });

  it("attaches unnumbered files when the week has a single numbered lecture", () => {
    const result = classifyScan(
      scanOf(["Pharma/w2/Lecture 3 slides.pdf", "Pharma/w2/study guide.docx"]),
    );
    expect(fileAt(result, "Pharma/w2/study guide.docx")).toMatchObject({
      outcome: "attach",
      lectureNumber: 1,
    });
  });

  it("treats material folders as categories, not lectures", () => {
    const result = classifyScan(
      scanOf(["Pharma/w1/MCQ/quiz one.html", "Pharma/w1/Study Guide/notes.docx"]),
    );
    expect(lecturesOf(result, "pharmacology", 1)).toHaveLength(1);
    expect(fileAt(result, "Pharma/w1/Study Guide/notes.docx").kind).toBe("study-guide");
  });

  it("orders named lecture folders after numbered ones, deterministically", () => {
    const result = classifyScan(
      scanOf(["Pharma/w5/Renal/a.pdf", "Pharma/w5/lecture-2/b.pdf", "Pharma/w5/Cardio/c.pdf"]),
    );
    expect(lecturesOf(result, "pharmacology", 5)?.map((lecture) => lecture.title)).toEqual([
      "Lecture 2",
      "Cardio",
      "Renal",
    ]);
  });

  it("sends files lying next to lecture folders to review", () => {
    const result = classifyScan(
      scanOf(["Pharma/w4/lecture-1/a.pdf", "Pharma/w4/lecture-2/b.pdf", "Pharma/w4/loose.pdf"]),
    );
    expect(fileAt(result, "Pharma/w4/loose.pdf").outcome).toBe("needs-review");
  });
});

describe("folders that cannot be read with confidence", () => {
  const result = classifyScan(
    scanOf([
      "Anatomy/w1/notes.pdf",
      "Pharma/w1/a.pdf",
      "Pharmacology/w1/b.pdf",
      "Pathology/w1/a.pdf",
      "Pathology/Week 1/b.pdf",
      "Pathology/extras/c.pdf",
      "Pathology/syllabus.pdf",
      "readme.pdf",
    ]),
  );

  it("does not assign an unknown course folder", () => {
    expect(fileAt(result, "Anatomy/w1/notes.pdf").outcome).toBe("needs-review");
    expect(result.issues.map((issue) => issue.path)).toContain("Anatomy");
  });

  it("refuses to merge two folders that claim the same course or week", () => {
    expect(fileAt(result, "Pharma/w1/a.pdf").outcome).toBe("needs-review");
    expect(fileAt(result, "Pharmacology/w1/b.pdf").outcome).toBe("needs-review");
    expect(fileAt(result, "Pathology/w1/a.pdf").outcome).toBe("needs-review");
    expect(fileAt(result, "Pathology/Week 1/b.pdf").outcome).toBe("needs-review");
  });

  it("does not place files outside week folders", () => {
    expect(fileAt(result, "Pathology/extras/c.pdf").outcome).toBe("needs-review");
    expect(fileAt(result, "Pathology/syllabus.pdf").outcome).toBe("needs-review");
    expect(fileAt(result, "readme.pdf").reasons).toContain("not inside a course folder");
  });

  it("keeps every file in the result", () => {
    expect(result.files).toHaveLength(8);
  });
});
