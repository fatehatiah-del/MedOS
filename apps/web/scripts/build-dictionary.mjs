// Builds public/dictionary/en-v1.txt, the notebook autocorrect's word list.
//
//   node scripts/build-dictionary.mjs <en_50k.txt> <words.txt>
//
// en_50k.txt: hermitdave/FrequencyWords, content/2018/en (CC BY-SA 4.0),
//   "word count" per line, most frequent first.
// words.txt:  the word-list npm package, v4.1.0 (MIT), one word per line.
//
// Output: one lowercase word per line. The first line is "#<n>": the next n
// words are ranked by frequency (most common first); the rest are valid but
// rare, in alphabetical order.
import { readFileSync, writeFileSync } from "node:fs";

const [freqPath, wordsPath] = process.argv.slice(2);
const plain = /^[a-z]+$/;

const valid = new Set(
  readFileSync(wordsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => plain.test(word)),
);
valid.add("a");
valid.add("i");

// Misspellings common enough to be in a subtitle corpus: never "valid".
const TYPOS = new Set([
  "dont",
  "im",
  "ive",
  "iike",
  "youre",
  "thats",
  "alot",
  "untill",
  "doin",
  "ofthe",
]);

const ranked = [];
const seen = new Set();
let rank = 0;
for (const line of readFileSync(freqPath, "utf8").split(/\r?\n/)) {
  const word = line.split(" ")[0]?.toLowerCase() ?? "";
  if (!plain.test(word)) continue;
  rank += 1;
  if (seen.has(word) || TYPOS.has(word)) continue;
  // Words outside the word list (names, slang, "ok") only when common: the
  // corpus's rarer entries include typos such as "fo" and "yhe".
  if (!valid.has(word) && (rank > 8000 || word.length === 1)) continue;
  seen.add(word);
  ranked.push(word);
}
const rest = [...valid].filter((word) => !seen.has(word)).sort();

const out = new URL("../public/dictionary/en-v1.txt", import.meta.url);
writeFileSync(out, `#${ranked.length}\n${ranked.join("\n")}\n${rest.join("\n")}\n`);
console.log(`${ranked.length} ranked + ${rest.length} more words`);
