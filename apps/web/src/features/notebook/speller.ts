/*
 * The spelling corrector behind the notebook's autocorrect.
 *
 * It knows ~275,000 English words (medical vocabulary included), the words in
 * the user's own lectures and notes, and the words they have taught it by
 * undoing a correction. A word it does not know is replaced by the closest
 * known word, where "close" is measured the way fast typing goes wrong on a
 * QWERTY keyboard: the key next to the right one, two letters swapped, a
 * doubled or missing letter, a missed space ("thepatient"). Common words win
 * ties over rare ones. When nothing is clearly closest, the word is left alone.
 */

/** Rank given to valid words with no frequency information. */
const RARE = 200_000;
/** Rank given to the user's own vocabulary: as likely as a fairly common word. */
const OWN = 3_000;
/** How much a word's rarity counts against it, per log-rank. */
const RARITY = 0.08;

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
/** The keys around each letter on a QWERTY keyboard. */
const NEIGHBOURS: Record<string, Set<string>> = (() => {
  // Row offsets of a real keyboard: each row starts a little further right.
  const offset = [0, 0.25, 0.75];
  const keys: { key: string; x: number; y: number }[] = [];
  ROWS.forEach((row, y) =>
    [...row].forEach((key, i) => keys.push({ key, x: i + (offset[y] ?? 0), y })),
  );
  const map: Record<string, Set<string>> = {};
  for (const a of keys) {
    map[a.key] = new Set(
      keys
        .filter((b) => b !== a && Math.abs(b.y - a.y) <= 1 && Math.abs(b.x - a.x) <= 1.1)
        .map((b) => b.key),
    );
  }
  return map;
})();

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const VOWELS = new Set("aeiou");

export const isNeighbour = (a: string, b: string) => NEIGHBOURS[a]?.has(b) ?? false;

/** The words MedOS knows, each with a frequency rank (1 = most common). */
export class Lexicon {
  private readonly ranks = new Map<string, number>();

  /** Loads the dictionary file built by scripts/build-dictionary.mjs. */
  static fromDictionary(text: string): Lexicon {
    const lexicon = new Lexicon();
    const lines = text.split("\n");
    const ranked = Number(/^#(\d+)/.exec(lines[0] ?? "")?.[1] ?? 0);
    for (let i = 1; i < lines.length; i++) {
      const word = lines[i]?.trim();
      if (word) lexicon.ranks.set(word, i <= ranked ? i : RARE);
    }
    return lexicon;
  }

  /** Adds words as known (the user's lectures, notes and taught words). */
  add(words: Iterable<string>, rank = OWN): void {
    for (const raw of words) {
      const word = raw.toLowerCase();
      if (!/^\p{L}+$/u.test(word)) continue;
      const before = this.ranks.get(word);
      if (before === undefined || before > rank) this.ranks.set(word, rank);
    }
  }

  has(word: string): boolean {
    return this.ranks.has(word);
  }

  rank(word: string): number {
    return this.ranks.get(word) ?? Infinity;
  }

  get size(): number {
    return this.ranks.size;
  }
}

/** Every single edit of `word` with its cost: cheap for the mistakes fast typing makes. */
function edits(word: string, into: Map<string, number>, base = 0, limit = Infinity) {
  const add = (candidate: string, cost: number) => {
    const total = base + cost;
    if (total > limit) return;
    const before = into.get(candidate);
    if (before === undefined || before > total) into.set(candidate, total);
  };
  const n = word.length;
  for (let i = 0; i < n; i++) {
    const c = word[i]!;
    const prev = word[i - 1];
    const next = word[i + 1];
    // An extra letter: a double tap, or the finger catching the next key.
    const extra =
      c === prev || c === next
        ? 0.4
        : isNeighbour(c, prev ?? "") || isNeighbour(c, next ?? "")
          ? 0.6
          : 1;
    add(word.slice(0, i) + word.slice(i + 1), extra);
    // Two letters swapped.
    if (next && next !== c) add(word.slice(0, i) + next + c + word.slice(i + 2), 0.5);
    // The wrong letter: the key next door, a vowel for a vowel, or anything.
    for (const r of ALPHABET) {
      if (r === c) continue;
      const cost = isNeighbour(c, r) ? 0.6 : VOWELS.has(c) && VOWELS.has(r) ? 0.8 : 1.1;
      add(word.slice(0, i) + r + word.slice(i + 1), cost);
    }
  }
  // A missing letter: a doubled one ("ocur" → "occur") is the cheapest.
  for (let i = 0; i <= n; i++) {
    for (const r of ALPHABET) {
      const cost = r === word[i - 1] || r === word[i] ? 0.5 : 0.8;
      add(word.slice(0, i) + r + word.slice(i), cost);
    }
  }
}

/** The most an edit may cost for a word of this length. */
const allowance = (n: number) => (n <= 3 ? 0.6 : n <= 5 ? 1.1 : 1.3);

/**
 * The correction for a lowercase word, or null to leave it as typed.
 * A missed space comes back as two words ("the patient").
 */
export function correctWord(word: string, lexicon: Lexicon): string | null {
  const n = word.length;
  if (n < 2 || n > 30 || !/^[a-z]+$/.test(word) || lexicon.has(word)) return null;
  const limit = allowance(n);

  const near = new Map<string, number>();
  edits(word, near, 0, limit);
  if (n >= 4) {
    for (const [first, cost] of [...near]) {
      if (cost <= 0.6) edits(first, near, cost, limit);
    }
  }

  const scored: { word: string; score: number }[] = [];
  for (const [candidate, cost] of near) {
    const rank = lexicon.rank(candidate);
    if (rank === Infinity) continue;
    // Short words only become common words: "fo" → "of", never → some rarity.
    if (n <= 4 && rank >= RARE) continue;
    scored.push({ word: candidate, score: cost + RARITY * Math.log(rank) });
  }

  // A missed space: two common words run together.
  for (let i = 1; i < n; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if ((a.length < 2 && a !== "a") || (b.length < 2 && b !== "a")) continue;
    const worst = Math.max(lexicon.rank(a), lexicon.rank(b));
    if (worst > 20_000) continue;
    scored.push({ word: `${a} ${b}`, score: 0.7 + RARITY * Math.log(worst) });
  }

  if (scored.length === 0) return null;
  scored.sort((x, y) => x.score - y.score);
  const [best, second] = scored;
  // Two equally good answers for a short word: guessing would be worse than leaving it.
  if (second && n <= 4 && second.score - best!.score < 0.1) return null;
  return best!.word;
}

/**
 * Lowercase abbreviations notes use that are not dictionary words: never
 * "corrected". (All-capital ones, ECG or COPD, are left alone anyway.)
 */
export const NOTE_WORDS = (
  "approx incl resp diff vs eg ie etc cf dx ddx tx rx hx sx fx bx px abx pt pts " +
  "bp hr rr spo temp iv po im sc sl pr prn bid tid qid qd od bd npo sob cp gi gu " +
  "uti uri cns pns ecg ekg mi chf copd ckd aki dm htn cad pe dvt cva tia gcs abg " +
  "cbc fbc lft lfts rft ua cxr ct mri us ca mg mcg ml dl kg mmol meq mmhg hb hgb " +
  "hct wbc rbc plt inr ptt aptt esr crp ldh alt ast alp ggt bun egfr tsh acth adh " +
  "gh lh fsh hcg ace arb ccb nsaid nsaids ppi ssri snri maoi tca otc dna rna mrna " +
  "atp adp gtp camp cgmp nadh nadph fadh"
).split(" ");

/* ---------------------------------------------------------------------------
 * The shared lexicon in the browser: loaded once, on first use.
 */

const TAUGHT_KEY = "medos:notebook-words";
const MAX_TAUGHT = 5_000;
let shared: Lexicon | null = null;
let loading: Promise<Lexicon | null> | null = null;

/** The lexicon, once loaded; until then autocorrect uses its typo list alone. */
export const currentLexicon = (): Lexicon | null => shared;

/** For tests: use this lexicon instead of the downloaded one. */
export function setLexicon(lexicon: Lexicon | null): void {
  shared = lexicon;
}

function readTaught(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(TAUGHT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers a word the user put back after a correction, so it is never corrected again. */
export function teachWord(word: string): void {
  const lower = word.toLowerCase();
  shared?.add([lower], 1_500);
  try {
    const words = readTaught().filter((w) => w !== lower);
    words.push(lower);
    window.localStorage.setItem(TAUGHT_KEY, JSON.stringify(words.slice(-MAX_TAUGHT)));
  } catch {
    // Private browsing: remembered for this visit only.
  }
}

/**
 * Downloads the dictionary and the user's own vocabulary (their lectures and
 * notes). Safe to call often: it loads once. A failure leaves the typo list.
 */
export function loadLexicon(): Promise<Lexicon | null> {
  if (shared) return Promise.resolve(shared);
  loading ??= (async () => {
    try {
      const [dictionary, vocabulary] = await Promise.all([
        fetch("/dictionary/en-v1.txt").then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
        fetch("/api/notebook-vocabulary", { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ words?: unknown }>) : { words: [] }))
          .catch(() => ({ words: [] })),
      ]);
      const lexicon = Lexicon.fromDictionary(dictionary);
      const own = Array.isArray(vocabulary.words) ? vocabulary.words : [];
      lexicon.add(own.filter((w): w is string => typeof w === "string"));
      lexicon.add(NOTE_WORDS);
      lexicon.add(readTaught(), 1_500);
      shared = lexicon;
      return lexicon;
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}
