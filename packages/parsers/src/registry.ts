import type { ContentFormat } from "./model";
import { parseMcqHtml } from "./mcq/parse";
import { parsePdf } from "./pdf/parse";
import { parseQuestionBankDocx } from "./question-bank/parse";
import type { ParseResult } from "./result";
import { parseStudyGuideDocx } from "./study-guide/parse";

/*
 * Which parser reads which material. A parser is chosen by the material's
 * kind (from the sync's classification, which stays authoritative) and the
 * file's type. Anything else is reported as unsupported, with the reason.
 *
 * Bump a parser's version whenever its output changes; stored content made by
 * an older version is then processed again.
 */

/** Resource kinds, as the database records them. Kept local so parsers need no database. */
export type MaterialKind =
  | "study-guide"
  | "original-lecture"
  | "mcq"
  | "question-bank"
  | "flashcards"
  | "image"
  | "supplementary";

export interface ParserInfo {
  id: string;
  version: number;
  format: ContentFormat;
}

interface ParserEntry extends ParserInfo {
  kind: MaterialKind;
  extensions: readonly string[];
  parse(bytes: Uint8Array): ParseResult | Promise<ParseResult>;
}

const PARSERS: readonly ParserEntry[] = [
  {
    id: "docx-study-guide",
    version: 1,
    format: "study-guide",
    kind: "study-guide",
    extensions: [".docx"],
    parse: parseStudyGuideDocx,
  },
  {
    id: "docx-question-bank",
    version: 1,
    format: "question-bank",
    kind: "question-bank",
    extensions: [".docx"],
    parse: parseQuestionBankDocx,
  },
  {
    id: "html-mcq",
    version: 1,
    format: "mcq-set",
    kind: "mcq",
    extensions: [".html", ".htm"],
    parse: parseMcqHtml,
  },
  {
    id: "pdf-registration",
    version: 1,
    format: "pdf",
    kind: "original-lecture",
    extensions: [".pdf"],
    parse: parsePdf,
  },
];

export type Identification =
  { supported: true; parser: ParserInfo } | { supported: false; reason: string };

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

/** Chooses the parser for a material, or explains why there is none. */
export function identify(kind: MaterialKind, filename: string): Identification {
  const extension = extensionOf(filename);
  const entry = PARSERS.find(
    (parser) => parser.kind === kind && parser.extensions.includes(extension),
  );
  if (entry) {
    const { id, version, format } = entry;
    return { supported: true, parser: { id, version, format } };
  }
  return { supported: false, reason: unsupportedReason(kind, extension) };
}

function unsupportedReason(kind: MaterialKind, extension: string): string {
  if (extension === ".doc") {
    return "Older Word documents (.doc) are not read yet. Save it as .docx in Word to import its content. The original is kept.";
  }
  if (extension === ".ppt" || extension === ".pptx") {
    return "PowerPoint files are kept as originals, but MedOS does not read their content yet.";
  }
  switch (kind) {
    case "study-guide":
      return "Study Guides are read from Word (.docx) files. This file is kept as the original.";
    case "question-bank":
      return "Question Banks are read from Word (.docx) files. This file is kept as the original.";
    case "mcq":
      return "MCQs are read from HTML quiz files. This file is kept as the original.";
    case "original-lecture":
      return "Only PDF lectures are registered so far. This file is kept as the original.";
    case "flashcards":
      return "Imported flashcard files are kept as originals; reading them arrives with flashcards.";
    case "image":
    case "supplementary":
      return "Kept as an original. MedOS does not extract content from this kind of file.";
  }
}

/**
 * Parses one material with the parser `identify` chose. Throws ParseError,
 * with a message for the user, when the file cannot be read.
 */
export async function parseWith(parser: ParserInfo, bytes: Uint8Array): Promise<ParseResult> {
  const entry = PARSERS.find((candidate) => candidate.id === parser.id);
  if (!entry) throw new Error(`Unknown parser ${parser.id}.`);
  return entry.parse(bytes);
}

/** The current version of every parser, for deciding what to process again. */
export const PARSER_VERSIONS: Readonly<Record<string, number>> = Object.fromEntries(
  PARSERS.map((parser) => [parser.id, parser.version]),
);
