import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  type ExportCard,
  type ExportSnapshot,
  type ExportSource,
  csvField,
  exportFile,
  toAnkiText,
  toCsv,
  toCsvFiles,
  toMarkdown,
} from "./index";

/* Invented records: structure only. */

const source: ExportSource = {
  courseId: "c1",
  course: "Pharmacology I",
  courseSlug: "pharmacology",
  week: 3,
  lectureId: "l1",
  lecture: 2,
  lectureTitle: "GPCR signalling",
  resourceId: "r1",
  resourceKind: "study-guide",
  file: "StudyGuide.docx",
  fileContentHash: "a".repeat(64),
};

const card = (overrides: Partial<ExportCard> = {}): ExportCard => ({
  id: "card-1",
  deckId: "deck-1",
  deck: "Lecture 2",
  front: "What does a ligand do?",
  back: "Binds a receptor\nand activates it",
  origin: "study-guide",
  sourceSection: "Alpha",
  sourceSectionId: "alpha",
  sourceQuote: "binds receptor",
  fsrs: {
    state: "review",
    due: "2026-10-08T08:00:00.000Z",
    stability: 3.2,
    difficulty: 5.1,
    scheduledDays: 3,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    lastReview: "2026-10-05T08:00:00.000Z",
  },
  deletedAt: null,
  createdAt: "2026-10-05T07:00:00.000Z",
  updatedAt: "2026-10-05T08:00:00.000Z",
  source,
  ...overrides,
});

const snapshot: ExportSnapshot = {
  format: "medos-export",
  schemaVersion: 1,
  exportedAt: "2026-10-05T09:00:00.000Z",
  generator: "MedOS",
  user: { email: "student@example.test", displayName: "Student" },
  semesters: [],
  courses: [
    {
      id: "c1",
      semesterId: "s1",
      slug: "pharmacology",
      name: "Pharmacology I",
      shortName: "Pharma",
      code: null,
      weeks: [
        {
          id: "w3",
          number: 3,
          startsOn: null,
          endsOn: null,
          lectures: [
            { id: "l1", number: 2, title: "GPCR signalling", heldOn: null, completedAt: null },
          ],
        },
      ],
    },
    {
      id: "c2",
      semesterId: "s1",
      slug: "pathology",
      name: "Pathology I",
      shortName: "Patho",
      code: null,
      weeks: [],
    },
  ],
  annotations: [
    {
      id: "n1",
      on: "study-guide",
      kind: "note",
      quote: "Ligand binds receptor.",
      prefix: "",
      suffix: "",
      section: "Alpha",
      sectionId: "alpha",
      page: null,
      note: 'Ask about *Gs*, "Gi", and =SUM(A1)',
      createdAt: "2026-10-05T07:00:00.000Z",
      updatedAt: "2026-10-05T07:00:00.000Z",
      source,
    },
    {
      id: "n2",
      on: "lecture-page",
      kind: "bookmark",
      quote: null,
      prefix: null,
      suffix: null,
      section: null,
      sectionId: null,
      page: 12,
      note: null,
      createdAt: "2026-10-05T07:30:00.000Z",
      updatedAt: "2026-10-05T07:30:00.000Z",
      source: {
        ...source,
        resourceId: "r2",
        resourceKind: "original-lecture",
        file: "Lecture.pdf",
      },
    },
  ],
  flashcards: {
    decks: [{ id: "deck-1", name: "Lecture 2", source, createdAt: "2026-10-05T07:00:00.000Z" }],
    cards: [
      card(),
      card({ id: "card-2", front: "Deleted", deletedAt: "2026-10-05T08:30:00.000Z" }),
    ],
    reviews: [],
  },
  mcq: { sessions: [], attempts: [] },
  questionBank: { attempts: [] },
  reviewLater: [],
  progress: { studyGuides: [], originalLectures: [] },
  studySessions: [],
  calendar: [],
  planner: { availability: null, days: [] },
  difficultConcepts: [],
};

/** A strict RFC 4180 reader, to prove the files parse back to what was written. */
function parseCsv(text: string): string[][] {
  expect(text.startsWith("﻿")).toBe(true);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.slice(1);
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && body[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else field += char;
  }
  expect(field).toBe("");
  return rows;
}

describe("CSV", () => {
  it("quotes fields with commas, quotes and line breaks", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(false)).toBe("false");
  });

  it("keeps a spreadsheet from running text as a formula, but leaves numbers alone", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvField(`${start}1+1`).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvField(-3)).toBe("-3");
    expect(csvField(2.5)).toBe("2.5");
  });

  it("parses back to the same rows", () => {
    const rows = [
      { a: "x, y", b: 'say "hi"' },
      { a: "line\r\nbreak", b: null },
    ];
    const text = toCsv<(typeof rows)[number]>(
      [
        ["a", (row) => row.a],
        ["b", (row) => row.b],
      ],
      rows,
    );
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["line\r\nbreak", ""],
    ]);
  });

  it("writes one file per kind, each with the source columns and every record", () => {
    const files = toCsvFiles(snapshot);
    expect(Object.keys(files)).toContain("annotations.csv");
    const annotations = parseCsv(files["annotations.csv"]!);
    expect(annotations[0]).toEqual([
      "id",
      "on",
      "kind",
      "course",
      "week",
      "lecture",
      "lecture_title",
      "file",
      "section",
      "page",
      "quote",
      "note",
      "created_at",
      "updated_at",
    ]);
    expect(annotations).toHaveLength(3);
    expect(annotations[1]?.slice(3, 9)).toEqual([
      "Pharmacology I",
      "3",
      "2",
      "GPCR signalling",
      "StudyGuide.docx",
      "Alpha",
    ]);
    // The whole note survives, including what looks like a formula inside it.
    expect(annotations[1]?.[11]).toBe('Ask about *Gs*, "Gi", and =SUM(A1)');
    for (const [name, text] of Object.entries(files)) {
      const rows = parseCsv(text);
      expect(new Set(rows.map((row) => row.length)).size, name).toBe(1);
    }
    expect(parseCsv(files["flashcards.csv"]!)).toHaveLength(3);
  });
});

describe("Anki text", () => {
  const lines = toAnkiText(snapshot).trimEnd().split("\n");

  it("starts with the headers Anki reads instead of asking", () => {
    expect(lines.slice(0, 7)).toEqual([
      "#separator:tab",
      "#html:true",
      "#notetype:Basic",
      "#columns:Front\tBack\tDeck\tTags\tGUID",
      "#deck column:3",
      "#tags column:4",
      "#guid column:5",
    ]);
  });

  it("writes one note per live card, with the course deck and source tags", () => {
    const notes = lines.slice(7);
    expect(notes).toEqual([
      [
        "What does a ligand do?",
        "Binds a receptor<br>and activates it",
        "MedOS::Pharmacology I::Lecture 2",
        "MedOS::pharmacology::week-3::lecture-2 MedOS::from-study-guide",
        "card-1",
      ].join("\t"),
    ]);
  });

  it("escapes HTML and keeps every note on one line", () => {
    const text = toAnkiText({
      ...snapshot,
      flashcards: {
        ...snapshot.flashcards,
        cards: [card({ front: "<b>Na⁺</b> & K⁺\tpump", back: "a\r\nb", deck: "Deck::Sub" })],
      },
    });
    const note = text.trimEnd().split("\n").at(-1)!;
    expect(note.split("\t")).toEqual([
      "&lt;b&gt;Na⁺&lt;/b&gt; &amp; K⁺ pump",
      "a<br>b",
      "MedOS::Pharmacology I::Deck:Sub",
      "MedOS::pharmacology::week-3::lecture-2 MedOS::from-study-guide",
      "card-1",
    ]);
  });
});

describe("Markdown", () => {
  const markdown = toMarkdown(snapshot);

  it("groups items under course, then week and lecture, with their source", () => {
    expect(markdown).toContain("## Pharmacology I");
    expect(markdown).toContain("### Week 3 · Lecture 2: GPCR signalling");
    expect(markdown).toContain("- **Note** · Alpha · StudyGuide.docx");
    expect(markdown).toContain("  > Ligand binds receptor.");
    expect(markdown).toContain("- **Bookmark** · page 12 · Lecture.pdf");
    expect(markdown).toContain("#### Flashcards (1)");
    expect(markdown).not.toContain("Deleted");
    // A course with nothing to show is left out.
    expect(markdown).not.toContain("Pathology I");
  });

  it("escapes Markdown in the user's own words", () => {
    expect(markdown).toContain("Note: Ask about \\*Gs\\*");
  });

  it("says so when there is nothing yet", () => {
    const empty = toMarkdown({
      ...snapshot,
      annotations: [],
      flashcards: { decks: [], cards: [], reviews: [] },
    });
    expect(empty).toContain("Nothing to show yet");
  });
});

describe("downloads", () => {
  it("names files by the export date", () => {
    expect(exportFile(snapshot, "json").filename).toBe("medos-export-2026-10-05.json");
    expect(exportFile(snapshot, "markdown").filename).toBe("medos-export-2026-10-05.md");
    expect(exportFile(snapshot, "anki").filename).toBe("medos-flashcards-anki-2026-10-05.txt");
    expect(exportFile(snapshot, "csv").filename).toBe("medos-export-2026-10-05-csv.zip");
  });

  it("JSON parses back to the snapshot", () => {
    expect(JSON.parse(strFromU8(exportFile(snapshot, "json").body))).toEqual(snapshot);
  });

  it("the full zip holds every format and a README", () => {
    const files = unzipSync(exportFile(snapshot, "all").body);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "README.txt",
        "medos-export.json",
        "medos-notes.md",
        "flashcards-anki.txt",
        "csv/annotations.csv",
        "csv/flashcards.csv",
        "csv/calendar.csv",
      ]),
    );
    expect(JSON.parse(strFromU8(files["medos-export.json"]!))).toEqual(snapshot);
    expect(strFromU8(files["README.txt"]!)).toContain("schemaVersion");
  });

  it("the CSV zip holds only the CSV files and the README", () => {
    const names = Object.keys(unzipSync(exportFile(snapshot, "csv").body));
    expect(names.every((name) => name === "README.txt" || /^csv\/[a-z_]+\.csv$/.test(name))).toBe(
      true,
    );
  });
});
