/**
 * A file MedOS cannot turn into study content. The message is shown to the
 * user, so it says what is wrong in plain words and never includes a path,
 * stack trace or internal detail. The original file is always kept.
 */
export class ParseError extends Error {
  constructor(
    /** Stable kebab-case reason, for tests and logs. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/** Upper bounds that keep a malformed or hostile file from exhausting memory. */
export const LIMITS = {
  /** Largest file any parser accepts. */
  maxFileBytes: 200 * 1024 * 1024,
  /** Entries a DOCX may contain. */
  maxZipEntries: 10_000,
  /** Total uncompressed bytes read from one DOCX. */
  maxZipReadBytes: 300 * 1024 * 1024,
  /** Largest single XML part. */
  maxXmlBytes: 60 * 1024 * 1024,
  /** Largest single image extracted. */
  maxImageBytes: 30 * 1024 * 1024,
  /** Largest JSON block read from an HTML quiz. */
  maxJsonBytes: 100 * 1024 * 1024,
  /** Text kept per PDF page, and in total. */
  maxPageTextChars: 20_000,
  maxPdfTextChars: 3_000_000,
  /** Nesting depth of tables inside tables. */
  maxTableDepth: 4,
} as const;
