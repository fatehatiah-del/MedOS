import type { ExportCard, ExportSnapshot } from "./snapshot";

/*
 * Flashcards as an Anki "Notes in Plain Text" file (File → Import in Anki
 * 2.1.55 or later). The header lines tell Anki everything, so the import
 * needs no settings: tab-separated, HTML fields, the Basic note type, and
 * which column holds the deck, the tags and the GUID.
 *
 * - Decks become MedOS::<course>::<deck>, so courses stay separate.
 * - Tags carry the source: MedOS::<course>::week-<n>::lecture-<n>.
 * - The GUID is the card's MedOS id, so importing a newer export updates
 *   the same notes instead of duplicating them.
 *
 * Deleted cards are left out. Scheduling is not carried over: Anki starts
 * the cards as new. The full FSRS state is in the JSON export.
 */

const HEADER = [
  "#separator:tab",
  "#html:true",
  "#notetype:Basic",
  "#columns:Front\tBack\tDeck\tTags\tGUID",
  "#deck column:3",
  "#tags column:4",
  "#guid column:5",
];

/** A field as HTML on one line: escaped, line breaks as <br>, no tabs. */
function field(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replace(/\r\n|\r|\n/g, "<br>")
    .replaceAll("\t", " ");
}

/** A deck name part: "::" separates Anki deck levels, so it cannot appear inside one. */
const deckPart = (name: string) => name.replace(/:{2,}/g, ":").replace(/\s+/g, " ").trim();
/** A tag part: tags are space-separated, so spaces become hyphens. */
const tagPart = (name: string) => name.replace(/:{2,}/g, ":").trim().replace(/\s+/g, "-");

function tags(card: ExportCard): string {
  const { source } = card;
  const path = ["MedOS", tagPart(source.courseSlug)];
  if (source.week !== null) path.push(`week-${source.week}`);
  if (source.lecture !== null) path.push(`lecture-${source.lecture}`);
  const all = [path.join("::")];
  if (card.origin === "study-guide") all.push("MedOS::from-study-guide");
  return all.join(" ");
}

/** The Anki import file. */
export function toAnkiText(snapshot: ExportSnapshot): string {
  const rows = snapshot.flashcards.cards
    .filter((card) => card.deletedAt === null)
    .map((card) =>
      [
        field(card.front),
        field(card.back),
        ["MedOS", deckPart(card.source.course), deckPart(card.deck)].join("::"),
        tags(card),
        card.id,
      ].join("\t"),
    );
  return `${[...HEADER, ...rows].join("\n")}\n`;
}
