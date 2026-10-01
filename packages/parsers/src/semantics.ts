import type { SemanticKind } from "./model";

/*
 * Recognising the study-guide vocabulary. A kind is assigned only when the
 * source's own label or heading says it, word for word (ignoring case,
 * decoration and numbering). Nothing is inferred from colours or content.
 */

const LABELS: Record<string, SemanticKind> = {
  "big picture": "big-picture",
  "the big picture": "big-picture",
  "learning objectives": "learning-objectives",
  "learning objective": "learning-objectives",
  "learning outcomes": "learning-objectives",
  "key concepts": "key-concepts",
  "key concept": "key-concepts",
  important: "important",
  "important facts": "important",
  "important fact": "important",
  "clinical link": "clinical-link",
  "clinical links": "clinical-link",
  "clinical correlation": "clinical-link",
  "clinical correlations": "clinical-link",
  "exam tip": "exam-tip",
  "exam tips": "exam-tip",
  "exam trap": "exam-trap",
  "exam traps": "exam-trap",
  "memory hook": "memory-hook",
  "memory hooks": "memory-hook",
  "how it's tested": "how-its-tested",
  "how it is tested": "how-its-tested",
  "exam snapshot": "exam-snapshot",
  "exam snapshots": "exam-snapshot",
  "golden points": "golden-points",
  "golden point": "golden-points",
  "what to see": "what-to-see",
  "detailed notes": "detailed-notes",
  summary: "summary",
};

/** A label without its decoration: leading symbols ("⚠ "), numbering and a trailing colon. */
export function bareLabel(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^(\d+[.)]?\s+)+/, "")
    .replace(/[\s:.\-–—]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The kind a label or heading names, or null when it names none. */
export function semanticKindOf(text: string): SemanticKind | null {
  return LABELS[bareLabel(text).toLowerCase()] ?? null;
}

/**
 * Whether a short line reads as a box label: a known label, or a few words
 * in capitals ("KEY POINT"). Ordinary sentences are not labels.
 */
export function looksLikeLabel(text: string): boolean {
  const bare = bareLabel(text);
  if (bare.length === 0 || bare.length > 40) return false;
  if (semanticKindOf(text) !== null) return true;
  const letters = bare.replace(/[^\p{L}]/gu, "");
  return (
    letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
  );
}
