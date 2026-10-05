import { strToU8, zipSync } from "fflate";

import { toAnkiText } from "./anki";
import { toCsvFiles } from "./csv";
import { toMarkdown } from "./markdown";
import { EXPORT_SCHEMA_VERSION, type ExportSnapshot } from "./snapshot";

/** What can be downloaded. CSV and "all" are several files, so they come as a zip. */
export const EXPORT_KINDS = ["all", "json", "csv", "markdown", "anki"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Uint8Array;
}

const README = `MedOS export
============

Your MedOS data in open formats. Nothing here needs MedOS to be read.

medos-export.json
  Everything, exactly as recorded: the course outline with lecture
  completion, highlights, notes, bookmarks, Review Later items, flashcards
  with their full FSRS scheduling state and review history, MCQ sessions
  and attempts, Question Bank attempts, reading progress, study sessions,
  calendar events and exams, daily plans and difficult concepts.
  Times are ISO 8601 in UTC; dates are YYYY-MM-DD. "format" and
  "schemaVersion" at the top name the version of this layout (now ${EXPORT_SCHEMA_VERSION}).

csv/
  The same records as spreadsheets, one file per kind (UTF-8, comma-
  separated). Text starting with = + - or @ is prefixed with an apostrophe
  so a spreadsheet never runs it as a formula; the JSON is unaltered.

medos-notes.md
  Highlights, notes, bookmarks, Review Later questions and flashcards,
  grouped by course, week and lecture, to read.

flashcards-anki.txt
  Flashcards for Anki: File > Import, choose this file. Decks are
  MedOS::<course>::<deck>; tags name the week and lecture. Importing a
  newer export updates the same notes. Anki starts them as new cards.

Provenance
  Every item that belongs to a lecture names its course, week, lecture and
  the file it came from (Study Guide, Quiz, Question Bank or lecture PDF),
  with the file's SHA-256 so it can be matched to the file on disk. The
  original files are not included: they are in your own folders.
`;

const encode = (text: string) => strToU8(text);

/** The date part of the export time, for file names. */
const day = (snapshot: ExportSnapshot) => snapshot.exportedAt.slice(0, 10);

function zip(snapshot: ExportSnapshot, files: Record<string, string>): Uint8Array {
  const mtime = new Date(snapshot.exportedAt);
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, [encode(text), { mtime }]]),
    ),
    { level: 6 },
  );
}

/** The pretty-printed JSON export. */
export function toJson(snapshot: ExportSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/** One downloadable export file of the given kind. */
export function exportFile(snapshot: ExportSnapshot, kind: ExportKind): ExportFile {
  const base = `medos-export-${day(snapshot)}`;
  const csv = () =>
    Object.fromEntries(
      Object.entries(toCsvFiles(snapshot)).map(([name, text]) => [`csv/${name}`, text]),
    );

  switch (kind) {
    case "json":
      return {
        filename: `${base}.json`,
        contentType: "application/json; charset=utf-8",
        body: encode(toJson(snapshot)),
      };
    case "markdown":
      return {
        filename: `${base}.md`,
        contentType: "text/markdown; charset=utf-8",
        body: encode(toMarkdown(snapshot)),
      };
    case "anki":
      return {
        filename: `medos-flashcards-anki-${day(snapshot)}.txt`,
        contentType: "text/plain; charset=utf-8",
        body: encode(toAnkiText(snapshot)),
      };
    case "csv":
      return {
        filename: `${base}-csv.zip`,
        contentType: "application/zip",
        body: zip(snapshot, { "README.txt": README, ...csv() }),
      };
    case "all":
      return {
        filename: `${base}.zip`,
        contentType: "application/zip",
        body: zip(snapshot, {
          "README.txt": README,
          "medos-export.json": toJson(snapshot),
          "medos-notes.md": toMarkdown(snapshot),
          "flashcards-anki.txt": toAnkiText(snapshot),
          ...csv(),
        }),
      };
  }
}
