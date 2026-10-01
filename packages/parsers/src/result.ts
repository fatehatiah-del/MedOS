import type { ExtractedMedia } from "./media";
import type { ContentStats, ParseIssue, ParsedContent } from "./model";

/** What a parser produces from one source file. */
export interface ParseResult<Content extends ParsedContent = ParsedContent> {
  content: Content;
  /** Images to store, referenced from the content by hash. */
  media: ExtractedMedia[];
  /** Things noticed and worked around, shown with the content. */
  issues: ParseIssue[];
  stats: ContentStats;
  /** Plain text of the whole content, for search. */
  searchText: string;
}

/** Search text is capped so one huge file cannot dominate storage. */
export const MAX_SEARCH_TEXT = 2_000_000;

export function capSearchText(text: string): string {
  const normalized = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length > MAX_SEARCH_TEXT ? normalized.slice(0, MAX_SEARCH_TEXT) : normalized;
}
