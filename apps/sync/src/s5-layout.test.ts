import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Classification, classifyScan, summariseCourseFolders } from "./classify/classify";
import { courseForFolder } from "./classify/names";
import { formatScanReport } from "./report";
import { type ScanResult, scanSource } from "./scan/walk";
import { createSourceTree, removeFolder, snapshotTree, type TreeEntry } from "./test-support";

/*
 * Phase 5A: the Semester 5 folder as it really is laid out — six course
 * folders under their full names, four of them still empty, a Pathophysiology
 * week with a lecture PDF and an archive, and a Pharmacology week with all
 * four kinds of material. File contents are synthetic.
 */

const PATHOPHYS_PDF = "Pathophysiology/w1/EUC Pathophysiology&Semiology Anemias.pdf";
const PATHOPHYS_ZIP = "Pathophysiology/w1/files.zip";
const PHARMA_QB = "Pharmacology/w1/Pharmacodynamics_W1_QuestionBank.docx";
const PHARMA_QUIZ = "Pharmacology/w1/Pharmacodynamics_W1_Quiz.html";
const PHARMA_GUIDE = "Pharmacology/w1/Pharmacodynamics_W1_StudyGuide.docx";
const PHARMA_PDF =
  "Pharmacology/w1/W1_Introduction to the course and Pharmacodynamics_ΑΥ_28092026.pdf";

let root: string;
let before: TreeEntry[];
let scan: ScanResult;
let result: Classification;

beforeAll(async () => {
  root = createSourceTree({
    "Communication Skills/": "",
    "Microbiology/": "",
    "Pathology/": "",
    [PATHOPHYS_PDF]: "%PDF-1.4 synthetic",
    // Not a real archive: the scanner must never look inside it either way.
    [PATHOPHYS_ZIP]: "PK\u0003\u0004 synthetic",
    [PHARMA_QB]: "synthetic question bank",
    [PHARMA_QUIZ]: "<html>synthetic quiz</html>",
    [PHARMA_GUIDE]: "synthetic study guide",
    [PHARMA_PDF]: "%PDF-1.4 synthetic",
    "Public Health/": "",
  });
  before = snapshotTree(root);
  scan = await scanSource(root);
  result = classifyScan(scan);
});

afterAll(() => removeFolder(root));

const fileAt = (relativePath: string) => {
  const file = result.files.find((entry) => entry.relativePath === relativePath);
  if (!file) throw new Error(`no ${relativePath}`);
  return file;
};
const courseOf = (slug: string) => result.courses.find((course) => course.slug === slug);

describe("course folders under their full names", () => {
  it("discovers all six courses, including the four empty ones", () => {
    expect(result.courses.map((course) => [course.slug, course.folder])).toEqual([
      ["communication-skills", "Communication Skills"],
      ["microbiology", "Microbiology"],
      ["pathology", "Pathology"],
      ["pathophysiology", "Pathophysiology"],
      ["pharmacology", "Pharmacology"],
      ["public-health", "Public Health"],
    ]);
    expect(result.issues).toEqual([]);
  });

  it("maps each canonical folder name exactly", () => {
    expect(courseForFolder("Pathology")).toBe("pathology");
    expect(courseForFolder("Pathophysiology")).toBe("pathophysiology");
    expect(courseForFolder("Microbiology")).toBe("microbiology");
    expect(courseForFolder("Pharmacology")).toBe("pharmacology");
    expect(courseForFolder("Public Health")).toBe("public-health");
    expect(courseForFolder("Communication Skills")).toBe("communication-skills");
  });

  it("matches canonical names regardless of case", () => {
    expect(courseForFolder("PATHOPHYSIOLOGY")).toBe("pathophysiology");
    expect(courseForFolder("pathology")).toBe("pathology");
    expect(courseForFolder("pharmacology")).toBe("pharmacology");
    expect(courseForFolder("public health")).toBe("public-health");
    expect(courseForFolder("COMMUNICATION SKILLS")).toBe("communication-skills");
  });

  it("keeps Pathology and Pathophysiology distinct, with no prefix matching", () => {
    expect(courseOf("pathology")?.folder).toBe("Pathology");
    expect(courseOf("pathophysiology")?.folder).toBe("Pathophysiology");
    expect(courseForFolder("Patho")).toBeNull();
    expect(courseForFolder("Pathologyx")).toBeNull();
    expect(courseForFolder("Pathophysiologyx")).toBeNull();
    expect(courseForFolder("Pharmacol")).toBeNull();
  });

  it("keeps Public Health and Communication Skills distinct", () => {
    expect(courseOf("public-health")?.folder).toBe("Public Health");
    expect(courseOf("communication-skills")?.folder).toBe("Communication Skills");
  });

  it("still accepts the existing aliases, each for its own course", () => {
    expect(courseForFolder("Pharma")).toBe("pharmacology");
    expect(courseForFolder("Pharm")).toBe("pharmacology");
    expect(courseForFolder("Path")).toBe("pathology");
    expect(courseForFolder("Pathophys")).toBe("pathophysiology");
    expect(courseForFolder("Micro")).toBe("microbiology");
    expect(courseForFolder("Communication")).toBe("communication-skills");
  });
});

describe("source identity", () => {
  it("keeps the full source folder name, never an abbreviation", () => {
    expect(fileAt(PATHOPHYS_PDF)).toMatchObject({
      courseSlug: "pathophysiology",
      courseFolder: "Pathophysiology",
      weekFolder: "Pathophysiology/w1",
    });
    expect(fileAt(PHARMA_GUIDE)).toMatchObject({
      courseSlug: "pharmacology",
      courseFolder: "Pharmacology",
      weekFolder: "Pharmacology/w1",
    });
  });

  it("keeps every relative path exactly as it is on disk", () => {
    expect(scan.files.map((file) => file.relativePath)).toEqual([
      PATHOPHYS_PDF,
      PATHOPHYS_ZIP,
      PHARMA_QB,
      PHARMA_QUIZ,
      PHARMA_GUIDE,
      PHARMA_PDF,
    ]);
    for (const file of result.files) {
      expect(file.relativePath.startsWith(`${file.courseFolder}/`)).toBe(true);
      expect(file.relativePath).not.toMatch(/^(Patho|Pharma)\//);
    }
  });
});

describe("empty courses", () => {
  it("are valid and reported as empty", () => {
    const summary = summariseCourseFolders(result);
    expect(summary.withMaterial.map((course) => course.slug)).toEqual([
      "pathophysiology",
      "pharmacology",
    ]);
    expect(summary.empty.map((course) => course.slug)).toEqual([
      "pathology",
      "microbiology",
      "public-health",
      "communication-skills",
    ]);
    expect(summary.notFound).toEqual([]);
  });

  it("get no invented weeks, lectures or files", () => {
    for (const slug of ["pathology", "microbiology", "public-health", "communication-skills"]) {
      expect(courseOf(slug)?.weeks).toEqual([]);
      expect(result.files.filter((file) => file.courseSlug === slug)).toEqual([]);
    }
  });
});

describe("weeks and lectures", () => {
  it("finds Week 1 separately in Pathophysiology and Pharmacology", () => {
    expect(courseOf("pathophysiology")?.weeks).toEqual([
      {
        number: 1,
        folder: "Pathophysiology/w1",
        lectures: [{ number: 1, title: null, folder: null }],
      },
    ]);
    expect(courseOf("pharmacology")?.weeks).toEqual([
      {
        number: 1,
        folder: "Pharmacology/w1",
        lectures: [{ number: 1, title: null, folder: null }],
      },
    ]);
  });

  it("puts the four Pharmacology materials in one lecture", () => {
    const placed = [PHARMA_QB, PHARMA_QUIZ, PHARMA_GUIDE, PHARMA_PDF].map(fileAt);
    for (const file of placed) {
      expect(file).toMatchObject({ outcome: "attach", weekNumber: 1, lectureNumber: 1 });
    }
  });
});

describe("material kinds", () => {
  it.each([
    [PHARMA_GUIDE, "study-guide"],
    [PHARMA_QUIZ, "mcq"],
    [PHARMA_QB, "question-bank"],
    [PHARMA_PDF, "original-lecture"],
    [PATHOPHYS_PDF, "original-lecture"],
  ])("classifies %s as %s", (relativePath, kind) => {
    expect(fileAt(relativePath)).toMatchObject({ kind, outcome: "attach" });
  });

  it("keeps the MCQ and the Question Bank as separate kinds", () => {
    expect(fileAt(PHARMA_QUIZ).kind).not.toBe(fileAt(PHARMA_QB).kind);
  });
});

describe("the archive", () => {
  it("stays visible as unsupported and needing review", () => {
    expect(fileAt(PATHOPHYS_ZIP)).toMatchObject({ kind: null, outcome: "needs-review" });
    expect(fileAt(PATHOPHYS_ZIP).reasons.join("; ")).toMatch(/unsupported file type \(\.zip\)/);
  });

  it("is not extracted: nothing inside it is listed, and nothing is created next to it", () => {
    expect(
      scan.files
        .filter((file) => file.relativePath.startsWith("Pathophysiology/"))
        .map((file) => file.relativePath),
    ).toEqual([PATHOPHYS_PDF, PATHOPHYS_ZIP]);
    expect(scan.directories).toEqual([
      "Communication Skills",
      "Microbiology",
      "Pathology",
      "Pathophysiology",
      "Pathophysiology/w1",
      "Pharmacology",
      "Pharmacology/w1",
      "Public Health",
    ]);
  });
});

describe("the source folder", () => {
  it("is identical after the scan", () => {
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe("scan report", () => {
  const report = () => formatScanReport(scan, result, true);

  it("separates courses with material from empty ones", () => {
    expect(report()).toMatch(/Courses discovered\s+6\n\s+with material\s+2\n\s+empty\s+4\n/);
    expect(report()).toContain(
      [
        "Empty courses (folder found, no material yet):",
        "  Pathology  (Pathology)",
        "  Microbiology  (Microbiology)",
        "  Public Health  (Public Health)",
        "  Communication Skills  (Communication Skills)",
      ].join("\n"),
    );
    expect(report()).not.toContain("Courses without a folder");
  });

  it("shows the true folder names and lists the archive for review", () => {
    expect(report()).toContain("pathophysiology  (Pathophysiology)");
    expect(report()).toContain("pharmacology  (Pharmacology)");
    expect(report()).not.toMatch(/\((Patho|Pharma)\)|\b(Patho|Pharma)\//);
    expect(report()).toMatch(/Needs review:\n\s+Pathophysiology\/w1\/files\.zip: /);
  });
});
