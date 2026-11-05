import {
  type Database,
  type Resource,
  type ResourceContent,
  resourceContents,
  resourceMedia,
  resources,
} from "@medos/database";
import {
  type Identification,
  ParseError,
  type ParseResult,
  type ParserInfo,
  identify,
  parseWith,
  sha256,
} from "@medos/parsers";
import { type ContentStats, type ParseIssue, validateContent } from "@medos/parsers/model";
import { and, eq } from "drizzle-orm";

import { ObjectMissingError, type ObjectStore, contentKey } from "@medos/storage";

import {
  ConversionError,
  type PresentationConverter,
  UNAVAILABLE_MESSAGE,
  type ViewCopy,
} from "./convert";

/*
 * The resource pipeline, after a file has been imported:
 *
 *   stored original ─identify─▶ parser ─validate─▶ bytes match the import
 *                   ─parse─▶ content ─normalize─▶ schema-checked model
 *                   ─persist─▶ resource_contents + images ─index─▶ search text
 *
 * A PowerPoint lecture is first saved as PDF (convert.ts); that PDF view copy
 * is what gets parsed, and it is stored by its hash next to the original.
 *
 * It reads only MedOS's own stored copies, never the source folder. A failure
 * changes the resource's status and message and nothing else: the original
 * stays stored and attached, and earlier content is not deleted.
 */

export interface ProcessOptions {
  store: ObjectStore;
  /** Decide what would be processed, without reading files or writing anything. */
  dryRun?: boolean;
  /** Process every material again, including ones that are current or failed before. */
  reprocessAll?: boolean;
  now?: Date;
  /** Called with errors that are not ordinary parse failures, for the command's diagnostics. */
  onUnexpectedError?: (label: string, error: unknown) => void;
  /**
   * Makes PDFs of PowerPoint lectures (the command passes Microsoft PowerPoint's).
   * Without one, PowerPoint lectures stay "unsupported" and are tried again later.
   */
  convertPresentation?: PresentationConverter;
}

export type ProcessReason = "new" | "source-changed" | "parser-updated" | "requested";
export type ProcessOutcome = "parsed" | "failed" | "unsupported";

export interface ProcessedResource {
  resourceId: string;
  /** The file's path relative to the source folder, or its name. */
  label: string;
  reason: ProcessReason;
  /** Absent in a dry run. */
  outcome?: ProcessOutcome;
  /** For failures and unsupported files: what to tell the user. */
  message?: string;
  stats?: ContentStats;
  issues?: ParseIssue[];
}

export interface ProcessReport {
  dryRun: boolean;
  /** Materials considered. */
  total: number;
  /** Already current: nothing to do. */
  upToDate: number;
  /** Failed earlier and not retried (retry with reprocessAll). */
  failedBefore: { label: string; message: string | null }[];
  processed: ProcessedResource[];
}

/** The generic message for a failure that is not a recognised problem with the file. */
export const UNEXPECTED_FAILURE =
  "MedOS could not read this file because of an internal problem. The original is kept; " +
  "run the sync again, and report the problem if it continues.";

const labelOf = (resource: Resource) => resource.sourcePath ?? resource.originalFilename;

/** Why a resource needs processing, or null when its stored state is current. */
export function processingReason(
  resource: Resource,
  content: Pick<ResourceContent, "parser" | "parserVersion" | "sourceContentHash"> | null,
  identification: Identification,
  reprocessAll: boolean,
): ProcessReason | null {
  if (reprocessAll) return "requested";
  if (!identification.supported) {
    return resource.status === "unsupported" && resource.processingError === identification.reason
      ? null
      : "new";
  }
  switch (resource.status) {
    case "pending":
    case "stored":
    case "unsupported":
      return content && content.sourceContentHash !== resource.contentHash
        ? "source-changed"
        : "new";
    case "failed":
      return null;
    case "parsed": {
      if (!content) return "new";
      if (content.sourceContentHash !== resource.contentHash) return "source-changed";
      const { parser } = identification;
      if (content.parser !== parser.id || content.parserVersion < parser.version)
        return "parser-updated";
      return null;
    }
  }
}

export async function processResources(
  db: Database,
  userId: string,
  options: ProcessOptions,
): Promise<ProcessReport> {
  const now = options.now ?? new Date();
  const rows = await db.query.resources.findMany({
    where: eq(resources.userId, userId),
    with: {
      content: {
        columns: { parser: true, parserVersion: true, sourceContentHash: true },
      },
    },
    orderBy: (table, { asc }) => [asc(table.sourcePath), asc(table.createdAt)],
  });

  const report: ProcessReport = {
    dryRun: options.dryRun ?? false,
    total: rows.length,
    upToDate: 0,
    failedBefore: [],
    processed: [],
  };

  for (const { content, ...resource } of rows) {
    const identification = identify(resource.kind, resource.originalFilename);
    const waitingForConverter =
      identification.supported &&
      identification.parser.input === "pdf-view-copy" &&
      !options.convertPresentation &&
      !options.reprocessAll &&
      resource.status === "unsupported" &&
      resource.processingError === UNAVAILABLE_MESSAGE;
    // A PowerPoint already waiting for a converter is not tried again without one.
    const reason = waitingForConverter
      ? null
      : processingReason(resource, content ?? null, identification, options.reprocessAll ?? false);
    if (!reason) {
      if (resource.status === "failed") {
        report.failedBefore.push({ label: labelOf(resource), message: resource.processingError });
      } else {
        report.upToDate += 1;
      }
      continue;
    }
    const entry: ProcessedResource = { resourceId: resource.id, label: labelOf(resource), reason };
    report.processed.push(entry);
    if (options.dryRun) continue;

    if (!identification.supported) {
      await setStatus(db, userId, resource.id, "unsupported", identification.reason);
      Object.assign(entry, { outcome: "unsupported", message: identification.reason });
      continue;
    }

    const outcome = await parseStored(resource, identification.parser, options);
    if (!outcome.ok) {
      const status = outcome.status ?? "failed";
      await setStatus(db, userId, resource.id, status, outcome.message);
      Object.assign(entry, { outcome: status, message: outcome.message });
      continue;
    }

    const { result, parser, viewCopy } = outcome;
    if (viewCopy) {
      try {
        await options.store.putBytes(contentKey(sha256(viewCopy)), viewCopy);
      } catch (error) {
        options.onUnexpectedError?.(labelOf(resource), error);
        const message =
          "The PDF made from this PowerPoint could not be stored, so it cannot be shown yet. " +
          "The original is kept; run the sync again.";
        await setStatus(db, userId, resource.id, "failed", message);
        Object.assign(entry, { outcome: "failed", message });
        continue;
      }
    }
    for (const media of result.media) {
      await options.store.putBytes(contentKey(media.ref.hash), media.bytes);
    }
    await db.transaction(async (tx) => {
      const values = {
        format: result.content.format,
        origin: "source" as const,
        parser: parser.id,
        parserVersion: parser.version,
        sourceContentHash: resource.contentHash,
        content: result.content,
        stats: result.stats,
        issues: result.issues,
        searchText: result.searchText,
        extractedAt: now,
      };
      await tx
        .insert(resourceContents)
        .values({ userId, resourceId: resource.id, ...values })
        .onConflictDoUpdate({
          target: resourceContents.resourceId,
          set: values,
          setWhere: eq(resourceContents.userId, userId),
        });
      await tx
        .delete(resourceMedia)
        .where(and(eq(resourceMedia.resourceId, resource.id), eq(resourceMedia.userId, userId)));
      if (result.media.length > 0) {
        await tx.insert(resourceMedia).values(
          result.media.map((media) => ({
            userId,
            resourceId: resource.id,
            contentHash: media.ref.hash,
            storageKey: contentKey(media.ref.hash),
            mimeType: media.ref.mimeType,
            sizeBytes: media.ref.sizeBytes,
          })),
        );
      }
      await tx
        .update(resources)
        .set({ status: "parsed", processingError: null })
        .where(and(eq(resources.id, resource.id), eq(resources.userId, userId)));
    });
    Object.assign(entry, { outcome: "parsed", stats: result.stats, issues: result.issues });
  }

  return report;
}

type ParseOutcome =
  | { ok: true; result: ParseResult; parser: ParserInfo; viewCopy?: Uint8Array }
  | { ok: false; message: string; status?: "failed" | "unsupported" };

/** Reads the stored original, checks it is the imported file, and parses it. */
async function parseStored(
  resource: Resource,
  parser: ParserInfo,
  options: ProcessOptions,
): Promise<ParseOutcome> {
  let bytes: Uint8Array;
  try {
    bytes = await options.store.read(resource.storageKey ?? contentKey(resource.contentHash));
  } catch (error) {
    if (error instanceof ObjectMissingError) {
      return {
        ok: false,
        message: "MedOS's stored copy of this file is missing. Run a sync to copy it again.",
      };
    }
    options.onUnexpectedError?.(labelOf(resource), error);
    return { ok: false, message: UNEXPECTED_FAILURE };
  }
  if (sha256(bytes) !== resource.contentHash) {
    return {
      ok: false,
      message: "MedOS's stored copy does not match the imported file. Run a sync to copy it again.",
    };
  }

  let viewCopy: ViewCopy | undefined;
  if (parser.input === "pdf-view-copy") {
    try {
      if (!options.convertPresentation)
        throw new ConversionError("unavailable", UNAVAILABLE_MESSAGE);
      viewCopy = await options.convertPresentation(bytes, resource.originalFilename);
    } catch (error) {
      if (error instanceof ConversionError) {
        // Without PowerPoint here, the file stays "unsupported" and is tried again next sync.
        return {
          ok: false,
          message: error.message,
          status: error.code === "unavailable" ? "unsupported" : "failed",
        };
      }
      options.onUnexpectedError?.(labelOf(resource), error);
      return { ok: false, message: UNEXPECTED_FAILURE };
    }
  }

  try {
    const result = viewCopy
      ? await parseWith(parser, viewCopy.pdf, { pageText: viewCopy.slideText })
      : await parseWith(parser, bytes);
    // Normalized content must satisfy its schema before anything is stored.
    validateContent(result.content);
    return viewCopy
      ? { ok: true, result, parser, viewCopy: viewCopy.pdf }
      : { ok: true, result, parser };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, message: error.message };
    options.onUnexpectedError?.(labelOf(resource), error);
    return { ok: false, message: UNEXPECTED_FAILURE };
  }
}

async function setStatus(
  db: Database,
  userId: string,
  resourceId: string,
  status: "failed" | "unsupported",
  message: string,
): Promise<void> {
  await db
    .update(resources)
    .set({ status, processingError: message })
    .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)));
}
