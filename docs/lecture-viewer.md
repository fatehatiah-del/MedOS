# The original lecture viewer

Phase 8 shows the university's own lecture PDF inside MedOS. `CLAUDE.md` §10 and `BUILD_PLAN.md`
Phase 8 are the specification; this file describes what was built.

## What it is

```
/courses/<course-slug>/lectures/<lecture-id>/original/<resource-id>[?page=N]
```

The lecture page shows **Open lecture** beside every Original Lecture PDF that was registered by
the sync. The PDF is the authoritative document: MedOS shows it exactly as it is and never
changes it.

`?page=N` opens a page, and the address follows the page you are on, so every page can be linked.
This is the target future Study Guide ↔ slide links will use (see below).

## How it works

- The page is loaded on the server, which checks that the PDF belongs to you, belongs to that
  lecture and course, and is an Original Lecture with registered pages.
- In the browser, [pdf.js](https://mozilla.github.io/pdf.js/) renders the PDF. The file is fetched
  once from MedOS's private file address; pdf.js and its worker are bundled with MedOS, nothing
  comes from a third-party site.
- **Lazy rendering.** Every page starts as an empty box of the right size. Only the pages in view
  and their neighbours are drawn; a page that scrolls far away releases its image. A 277-page
  lecture never draws more than a handful of pages at once.
- Each drawn page gets a **text layer**, so its text can be selected, copied and read by screen
  readers. Pages without text (scanned or image-only slides) say "This page has no selectable
  text".
- **Safety.** pdf.js 6 evaluates no code; XFA forms are disabled; the PDF's own links and form
  fields are not made interactive, so a PDF cannot run anything or send you to another site.

## Controls

| Control         | Mouse / touch                      | Keyboard (focus in the viewer) |
| --------------- | ---------------------------------- | ------------------------------ |
| Previous / next | ‹ and › buttons                    | ← → or Page Up / Page Down     |
| Go to a page    | type the number, press Enter       |                                |
| First / last    |                                    | Home / End                     |
| Zoom            | − / + buttons, or the zoom menu    | − and +                        |
| Fit width       | "Fit width" in the zoom menu       |                                |
| Fullscreen      | the fullscreen button              | F                              |
| Bookmark page   | bookmark button (toggle)           |                                |
| Review later    | clock button (toggle)              |                                |
| Note on page    | note button                        |                                |
| Download        | download button: the original file |                                |

The pages area scrolls on its own and can be focused with Tab. Zooming keeps you on the same page.

## Page bookmarks, notes and Review Later

Bookmarks, notes and Review Later items belong to a page of the PDF. The panel beside the viewer
(a sheet on narrower screens, behind **Pages and notes**) lists them by page; each opens its page,
and notes can be edited or deleted (deleting asks first). One bookmark and one Review Later item
per page; any number of notes.

A page number must exist in the PDF when an item is made. If the file is later re-imported with
fewer pages, an item on a page that no longer exists is kept and marked "no longer in the current
version of the file" rather than moved.

Global pages listing annotations across lectures are Phase 12.

## Resuming

The viewer remembers the last page you were on (saved a moment after you settle on a page). When
you open the lecture again without a page in the address, it offers **Resume at page N**. This is
a position, not progress: it says nothing about how much you studied.

## Lecture completion is not affected

Opening, reading, paging to the end, bookmarking, noting or downloading never changes lecture
completion. Only **Mark lecture complete** does. Database, Server Function and end-to-end tests
check this.

## The file address

`GET /api/resources/<resource-id>/file` (`?download=1` to save):

1. No session: 401.
2. Anything that is not your Original Lecture PDF (someone else's, a Study Guide or quiz, a
   malformed id, a missing file): the same 404.
3. The stored bytes must hash to the SHA-256 recorded at import and start as a PDF; otherwise
   nothing is sent.
4. `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, a sandboxing content
   security policy, and a `Content-Disposition` that carries any file name safely. Storage
   locations are never sent.

The whole file is sent per request; there is no partial (range) loading. Measured on the real
material: see the Phase 8 report.

## Study Guide ↔ slide links (prepared, not active)

Study Guides cite slides ("S17"). `features/original-lecture/slides.ts` answers "which page is
slide N?" only when a mapping has been confirmed for a lecture; until then there is no page and
no link is shown. For PDFs exported from slides, slide N is usually page N (the Pharmacology Week
1 lecture's page 17 is the slide its Study Guide cites as S17), but MedOS does not assume it for
every lecture. When links are enabled, they will point at `?page=N`.

## Storage

| Table                          | One row is                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `original_lecture_annotations` | A bookmark, note or Review Later item on one page of a PDF. |
| `original_lecture_positions`   | The page the user was last on in one PDF.                   |

Both are owned like every study-data table (`user_id`, composite foreign keys, `ON DELETE
RESTRICT`). Pages start at 1; only notes carry text, never empty; one bookmark and one Review
Later item per page.

## Tests

- **Database** (`packages/database/src/access/original-lectures.test.ts`): the PDF, its file and
  the user's layer are private; page ranges; idempotence; constraints; completion unchanged.
- **Web**: the file route (session, ownership, wrong kind, malformed ids, tampered or missing
  files, safe file names), the Server Function logic, and the viewer's rules (pages, zoom, which
  pages are drawn, slide mapping).
- **End to end** (`apps/web/e2e/lecture-viewer.spec.ts`, desktop and mobile): a synthetic 40-page
  PDF imported through MedOS Sync. Lazy rendering, navigation (buttons, page number, keyboard,
  address), zoom, fullscreen, annotations across reload, resuming, download, completion,
  overflow, accessibility in both themes, and privacy.

## Not in Phase 8

- Clickable slide references in Study Guides (prepared above).
- Searching inside the PDF, highlighting or annotating PDF text.
- PowerPoint or other slide formats (not parsed).
- Global annotation pages (Phase 12). The viewer offers the study timer (activity Original
  lecture); see [`study-timer.md`](study-timer.md).
