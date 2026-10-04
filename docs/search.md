# Search

One search across the study environment (specification §26, BUILD_PLAN Phase 17), at `/search`
or with **Ctrl+K** (⌘K) from anywhere.

## What it covers

| Kind          | Searched in                                          | Opens at                                |
| ------------- | ---------------------------------------------------- | --------------------------------------- |
| Courses       | name, short name                                     | the course                              |
| Lectures      | title                                                | the lecture page                        |
| Study Guides  | each section's heading and text                      | that section of the reader (`#section`) |
| MCQs          | stem, options, explanation, topic                    | the quiz                                |
| Question Bank | question, choices and model answer                   | that question (`?item=`)                |
| Flashcards    | front and back                                       | the card's deck                         |
| Notes         | your note and the passage it is on (guides and PDFs) | the passage (`?annotation=`) or page    |
| Bookmarks     | the bookmarked passage, or the PDF and page          | the passage or page                     |

**Every word must match** (in any order, any case); `%` and `_` are plain characters. Results come
grouped by kind, at most eight per kind, best matches first (the whole query in the title, then all
words in the title, then matches in the text). Each shows its type, its course, week and lecture,
and the matched words highlighted. The query stays in the address (`/search?q=…`), so Back returns
to the results.

**Keyboard:** Ctrl+K focuses the field; ↓ moves into the results and between them, ↑ back to the
field; Enter opens.

## How

Parsed material is searched through a derived index, `search_entries` (one row per section,
question or item, as plain text). Before each search, any resource whose parsed content changed
since it was indexed is indexed again (compared by content hash), and entries of content that no
longer exists are removed, so the index follows every sync and re-parse without any change to the
sync. The original files and parsed content stay the source of truth. Your own small tables
(courses, lectures, flashcards, notes, bookmarks) are searched directly.

Code: `packages/database/src/access/search.ts`, `apps/web/src/features/search/`.
