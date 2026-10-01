/*
 * MedOS parsers: source file → validated, source-faithful structured content.
 *
 *   identify → validate → parse → normalize (typed model, schema-checked)
 *
 * Parsers are pure: bytes in, content out. They read no files, touch no
 * database and fetch nothing. Storing and indexing the result is the
 * pipeline's job (apps/sync/src/process).
 */
export { LIMITS, ParseError } from "./errors";
export { type ExtractedMedia, sha256, sniffImageType } from "./media";
export {
  type Identification,
  type MaterialKind,
  type ParserInfo,
  PARSER_VERSIONS,
  identify,
  parseWith,
} from "./registry";
export { type ParseResult, MAX_SEARCH_TEXT } from "./result";
export { parseMcqHtml } from "./mcq/parse";
export { parsePdf } from "./pdf/parse";
export { parseQuestionBankDocx } from "./question-bank/parse";
export { parseStudyGuideDocx } from "./study-guide/parse";
