import type { ContentStats, ParseIssue, ParsedContent } from "@medos/parsers/model";
import { CONTENT_FORMATS } from "@medos/parsers/model";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { id, oneOf, timestamps } from "./columns";
import { resources } from "./resources";
import { ownerId } from "./users";
import { CONTENT_ORIGINS } from "./values";

/**
 * The structured content parsed from one resource: a study guide's sections,
 * a quiz's questions, a question bank's items, or a PDF's registration.
 *
 * It is a derivative. The original file stays in storage and in `resources`;
 * this row can always be rebuilt from it, and is replaced (never duplicated)
 * when the resource is processed again. `source_content_hash` and
 * `parser_version` record exactly what it was made from, so content made from
 * an earlier version of the file, or by an older parser, is recognisably stale.
 *
 * User data (notes, highlights, attempts, completion) is never stored here, so
 * re-processing cannot erase it.
 */
export const resourceContents = pgTable(
  "resource_contents",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    format: text("format", { enum: CONTENT_FORMATS }).notNull(),
    /** Where the content comes from: the imported source, or (later) an AI provider. */
    origin: text("origin", { enum: CONTENT_ORIGINS }).notNull().default("source"),
    /** The parser that produced it, e.g. "docx-study-guide", and its version. */
    parser: text("parser").notNull(),
    parserVersion: integer("parser_version").notNull(),
    /** SHA-256 of the original file this was parsed from. */
    sourceContentHash: text("source_content_hash").notNull(),
    /** The parsed content, validated against its format's schema on write and on read. */
    content: jsonb("content").$type<ParsedContent>().notNull(),
    /** Summary counts, e.g. { "questions": 40, "unresolved": 0 }. */
    stats: jsonb("stats").$type<ContentStats>().notNull().default({}),
    /** What the parser noticed and worked around, in words for the user. */
    issues: jsonb("issues").$type<ParseIssue[]>().notNull().default([]),
    /** Plain text of the content, for search. */
    searchText: text("search_text").notNull().default(""),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "resource_contents_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    // One current parse per resource: re-processing replaces it.
    unique("resource_contents_resource_unique").on(table.resourceId),
    check("resource_contents_format_valid", oneOf(table.format, CONTENT_FORMATS)),
    check("resource_contents_origin_valid", oneOf(table.origin, CONTENT_ORIGINS)),
    check("resource_contents_parser_version_positive", sql`${table.parserVersion} > 0`),
    check(
      "resource_contents_source_hash_format",
      sql`${table.sourceContentHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * An image extracted from a resource (a study guide figure, a quiz diagram),
 * stored in object storage under its SHA-256. Parsed content refers to images
 * by hash; this table says which resource, and so which user, each belongs to,
 * so an image is only ever served to the owner of a resource that uses it.
 */
export const resourceMedia = pgTable(
  "resource_media",
  {
    id: id(),
    userId: ownerId(),
    resourceId: uuid("resource_id").notNull(),
    contentHash: text("content_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "resource_media_resource_fk",
      columns: [table.resourceId, table.userId],
      foreignColumns: [resources.id, resources.userId],
    }).onDelete("restrict"),
    unique("resource_media_resource_hash_unique").on(table.resourceId, table.contentHash),
    index("resource_media_hash_idx").on(table.contentHash),
    check("resource_media_hash_format", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    // Raster images only: SVG can carry script.
    check("resource_media_type_valid", sql`${table.mimeType} ~ '^image/(png|jpeg|gif|webp)$'`),
    check("resource_media_size_not_negative", sql`${table.sizeBytes} >= 0`),
  ],
);

export type ResourceContent = typeof resourceContents.$inferSelect;
export type NewResourceContent = typeof resourceContents.$inferInsert;
export type ResourceMedia = typeof resourceMedia.$inferSelect;
