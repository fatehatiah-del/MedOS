# The Study Guide reader

Phase 7 turns a parsed Study Guide into a reading environment. `CLAUDE.md` §7–9 and
`BUILD_PLAN.md` Phase 7 are the specification; this file describes what was built and how it
behaves.

## What it is

```
/courses/<course-slug>/lectures/<lecture-id>/study-guide/<resource-id>
```

The lecture page shows **Open Study Guide** for each Study Guide whose content has been read,
with how far you have read it. A lecture can have more than one Study Guide; the address names
one.

The reader shows the guide exactly as MedOS parsed it (see [`parsing.md`](parsing.md)). It does
not summarise, reorder, relabel or correct anything. Everything you add (highlights, notes,
bookmarks, Review Later, reading progress) is stored separately, and the parsed content, the
stored original and your study folder are never changed.

## Layout

| Width of the workspace | Layout                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- |
| 63rem and wider        | Contents · the guide (at most 44rem wide) · context panel.                         |
| 48rem to 63rem         | Contents · the guide. **Notes & progress** opens the panel as a sheet.             |
| Narrower (mobile)      | The guide alone. **Contents** and **Notes & progress** open as a drawer and sheet. |

Widths are those of the workspace, not the screen (container queries), so the layout follows the
sidebar being expanded, collapsed or hidden. On a 1366px or 1440px laptop with the sidebar open
all three columns are shown. The reader page marks itself `data-layout="wide"`, which lets the
workspace grow beyond its usual 1080px for this page only.

Nothing on the page scrolls sideways: a wide table scrolls inside its own region.

## How the guide is rendered

Server components render the whole guide into the first HTML response; there is no client-side
rendering of content and nothing is ever inserted as HTML.

| Parsed content         | Rendered as                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title, subtitle        | The page's `<h1>` and the line below it, verbatim.                                                                                                                                                           |
| Preamble               | First, in a box marked "From the document". The source's own CONTENTS page is kept as source text, separate from MedOS's navigation.                                                                         |
| Section                | `<section>` with a heading one level below the page title (level 1 → `<h2>`, …), whose `id` is the section's stable id, so `#4-gpcr-signalling` links to it.                                                 |
| Paragraph              | `<p>`, with bold, italic, underline, superscript and subscript as `<strong>`, `<em>`, `<u>`, `<sup>`, `<sub>`, and line breaks as `<br>`.                                                                    |
| Slide reference        | The source text ("S17", "S52– S55") in a small chip set apart from the sentence; hovering says "Lecture slides 52–55". Not yet a link (that needs the Phase 8 viewer).                                       |
| List                   | `<ul>`/`<ol>`, nested by level. Ordered lists that carry the source's own numbers ("1.", "20.") show them as text, so nothing is renumbered.                                                                 |
| Table                  | A real `<table>`: header rows in `<thead>` with `<th scope="col">`; column spans and vertically merged cells as `colspan`/`rowspan`. Empty header cells stay `<td>`. No caption or row headers are invented. |
| Callout (labelled box) | A box with `role="note"`, named by its label. The label is the source's, verbatim ("What to see" and "WHAT TO SEE" stay as written). Each known kind has its own icon and colour.                            |
| Unlabelled box         | A plain box with no label. MedOS does not invent one.                                                                                                                                                        |
| Flow                   | An ordered list of steps with arrows: across on wide screens, down on narrow ones.                                                                                                                           |
| Figure                 | `<figure>` with its image(s) and `<figcaption>`; the notes beside it ("WHAT TO SEE") follow directly. Opens full size in a dialog.                                                                           |
| Missing image          | A visible note giving the parser's reason.                                                                                                                                                                   |

Semantic kinds and their look (from `features/study-guide/callouts.ts`). A kind appears only when
the source's own label or heading names it; ordinary content is never reclassified.

| Kind                                                    | Icon                         | Colour  |
| ------------------------------------------------------- | ---------------------------- | ------- |
| Big Picture, Learning Objectives, Key Concepts, Summary | telescope, target, key, list | blue    |
| Important, Exam Tip                                     | alert, light bulb            | amber   |
| Exam Trap                                               | warning triangle             | red     |
| Clinical Link                                           | stethoscope                  | green   |
| Memory Hook, Golden Points                              | brain, star                  | violet  |
| How It's Tested, Exam Snapshot, What to See             | clipboard, camera, eye       | teal    |
| Detailed Notes, unknown labels, no label                | none or notebook             | neutral |

Colour is never the only signal: the label is text and each kind has its own icon.

## Images

Images are served by `GET /api/resources/<resource-id>/media/<sha256>`:

1. No session: 401.
2. The image must be recorded (`resource_media`) as belonging to that resource, and the resource
   must belong to the signed-in user. Anything else (another user's resource, the user's own
   image asked for through a different resource, a malformed id or hash, a missing file) is the
   same 404.
3. The bytes are read from MedOS storage using the stored key, never a path from the request. They
   must hash to the requested SHA-256 and be the recorded type (PNG, JPEG, GIF or WebP, checked
   from the bytes); otherwise nothing is sent.
4. The response is `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
   `Content-Disposition: inline`, with a `sandbox` content security policy.

Storage keys and file locations never reach the browser. The web app reads the same storage
folder as MedOS Sync (`MEDOS_STORAGE_DIR`, default `.medos/objects`); both use
`@medos/storage`. Images are shown with a plain `<img>`, not Next.js image optimisation, which
would fetch them without the user's session. Their accessible name is the source's own
description if it has one, otherwise the figure's caption. MedOS does not write descriptions of
its own.

## Navigation

- **Contents**: built from the guide's headings, nested by level, without slide references. The
  current section is highlighted (`aria-current="location"`) while you scroll. Choosing an entry
  scrolls to the heading, moves focus to it and puts its id in the address.
- **Deep links**: `…/study-guide/<id>#<section-id>`.
- **Resume where you left off** in the panel goes to the last section you reached.
- A **Skip to the Study Guide text** link comes first on the page.
- Smooth scrolling is turned off when the system asks for reduced motion.

## Annotations

| Action       | From a text selection | From a section heading | Shown in the text as          |
| ------------ | --------------------- | ---------------------- | ----------------------------- |
| Highlight    | yes                   | no                     | a tinted background           |
| Add note     | yes                   | yes                    | a tint and a dotted underline |
| Bookmark     | yes                   | yes (toggle)           | a solid underline             |
| Review later | yes                   | yes (toggle)           | a wavy underline              |

**Create flashcard** appears in the selection toolbar but is disabled: flashcards arrive in Phase
11, and Phase 7 creates no flashcard data. The **Study timer** appears in the panel as a later
feature for the same reason (Phase 13).

Selecting text in one paragraph, list item, table cell, flow step, caption or heading opens the
toolbar above it (at the bottom of the screen on touch devices). A selection that spills a little
past one passage, as a triple click does, is trimmed to it; one that covers several passages is
refused with an explanation.

Keyboard: the buttons beside every section heading need no selection. With text selected (for
example with caret browsing, F7), **Alt+A** moves into the toolbar; arrow keys move between its
buttons and Escape closes it. Notes are written in a dialog.

The panel lists bookmarks, notes, Review Later items and highlights for this guide. Each one can
be opened (scrolling to and briefly outlining the passage), removed, or for notes edited. Deleting
a note asks first. Managing annotations across guides (global pages) is Phase 12.

### Anchors

An annotation points at the source; it never copies or changes it. It stores:

- the section's stable id (empty for the preamble);
- the **text unit**: the passage's path within the section, e.g. `3.r1.c2.b0` (table 3, row 1,
  cell 2, first paragraph). Paths are defined once in `@medos/parsers/model` (`text-units.ts`) and
  used by both the renderer and the server;
- character offsets within the unit, counting each line break as one character;
- the quoted text, 32 characters either side, and the SHA-256 of the file it was made against.

When you save one, the server recomputes the text at those offsets from the guide itself and
refuses the request unless it matches what you selected, so an annotation always marks the source
text it claims to.

When the page is shown, each annotation is resolved against the current guide: first at its
recorded offsets, then (if the file was re-imported and the text moved) by finding the quote,
preferring the place whose surrounding text matches best, in its section and then anywhere. If the
text is gone, it is listed as "no longer in the current version of the guide" and is not attached
to other words.

## Reading progress

**Study Guide reading progress is not lecture completion.**

- Reaching the end of a section counts it as read. Progress is how far through the guide you
  have reached ("14 of 23 sections read", 60%). It only moves forward; the last section reached is
  kept separately for resuming.
- 100% means the end of the guide was reached. The panel then says that this does not complete the
  lecture, with a link to the lecture page.
- The lecture page shows "60% read" beside the guide as information only.
- Lecture completion is still only `lecture_progress.completed_at`, set by **Mark lecture
  complete**. Nothing in the reader writes to it: reading, scrolling, opening images, annotating,
  reaching 100% or reopening the guide. Database, server-function and end-to-end tests check that
  completion is unchanged after each of these.

Progress is saved every two seconds while you read and when the page is hidden.

## Storage

Two tables, owned like every study-data table (`user_id`, composite foreign keys, `ON DELETE
RESTRICT`); see [`database.md`](database.md).

| Table                     | One row is                                                               |
| ------------------------- | ------------------------------------------------------------------------ |
| `study_guide_annotations` | A highlight, note, bookmark or Review Later item on one study guide.     |
| `study_guide_progress`    | How far the user has read one study guide, and the last section reached. |

Constraints: kinds are a controlled list; a passage has a unit and a non-empty range and a whole
section has neither; only notes carry text, and it is never empty; quotes are 1–5000 characters
and notes at most 10,000; a highlight, bookmark or Review Later item exists once per place (notes
may be several); progress lies between 1 and the number of sections.

## Privacy

- The page checks the session itself and reads only through the user's scope. Another user's
  guide, a guide addressed through the wrong lecture or course, material that is not a Study
  Guide, and malformed or unknown ids all show the same "Page not found".
- The Server Functions behind annotations and progress verify the session themselves, parse their
  input, ignore anything such as a user id, and act only through the user's scope.
- The reader is rendered per request and never cached.

## Tests

- **Content model** (`packages/parsers/src/model/text-units.test.ts`): unit paths and anchor
  resolution (moved text, ambiguous quotes, orphans, renamed sections).
- **Database** (`packages/database/src/access/study-guides.test.ts`): loading guides, images,
  annotations and progress for their owner only; text checks; idempotence; constraints; parsed
  content unchanged; completion unchanged.
- **Web** (`apps/web/src/features/study-guide/*.test.*`, `features/resources/media-response.test.ts`):
  the renderer (every text unit renders exactly its source text; headings, lists, tables, every
  semantic kind, figures, flows, marks), selections to anchors, table and list layout, the
  Server Function logic, and the image route (session, ownership, wrong resource, malformed input,
  tampered or missing file).
- **End to end** (`apps/web/e2e/reader.spec.ts`, desktop and mobile): a synthetic guide imported
  through MedOS Sync into the scratch database before the server starts
  (`e2e/support/reader-fixture.ts`). Covers opening, structure, images, navigation, annotations
  persisting across reload, keyboard use, reading progress without completion, overflow,
  accessibility in both themes, and privacy.

Automated tests never use real course material.

## Not in Phase 7

- PDF viewer, slide links from slide references (Phase 8).
- MCQ and Question Bank practice (Phases 9 and 10).
- Flashcards, including creating one from a selection (Phase 11).
- Global annotation pages and cross-guide management (Phase 12).
- Study timer (Phase 13). Search (Phase 17).
