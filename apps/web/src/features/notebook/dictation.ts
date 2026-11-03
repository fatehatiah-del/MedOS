/*
 * Dictation text: what the browser's speech recognition heard, turned into
 * notes. Spoken commands become punctuation and breaks, words are spaced
 * against what is already written, and sentences start with a capital.
 *
 * "Colon" and "period" are not commands: in medical notes they are words.
 */

export type DictationPiece = { text: string } | { break: "paragraph" | "line" };

const COMMANDS: [string[], string][] = [
  [["new", "paragraph"], "\n\n"],
  [["new", "line"], "\n"],
  [["full", "stop"], "."],
  [["question", "mark"], "?"],
  [["exclamation", "mark"], "!"],
  [["exclamation", "point"], "!"],
  [["comma"], ","],
  [["semicolon"], ";"],
  [["open", "bracket"], "("],
  [["close", "bracket"], ")"],
];

const sentenceStart = (before: string) =>
  before.trim() === "" || /[.!?]["”’')\]]*\s*$/u.test(before);

/**
 * Turns one finished piece of speech into text to insert after `before`
 * (the text already in the paragraph, up to the cursor).
 */
export function formatDictation(heard: string, before: string): DictationPiece[] {
  const words = heard.trim().split(/\s+/u).filter(Boolean);
  const pieces: DictationPiece[] = [];
  let text = "";
  let context = before;
  let joinNext = false; // straight after "(": no space

  const flush = () => {
    if (text) pieces.push({ text });
    text = "";
  };

  for (let i = 0; i < words.length; i++) {
    const command = COMMANDS.find(([spoken]) =>
      spoken.every((word, k) => words[i + k]?.toLowerCase().replace(/[.,!?]$/u, "") === word),
    );
    if (command) {
      const [spoken, sign] = command;
      i += spoken.length - 1;
      if (sign === "\n\n" || sign === "\n") {
        flush();
        pieces.push({ break: sign === "\n\n" ? "paragraph" : "line" });
        context = "";
        joinNext = false;
        continue;
      }
      if (sign === "(") {
        const spaced = context !== "" && !/[\s(]$/u.test(context) ? ` (` : "(";
        text += spaced;
        context += spaced;
        joinNext = true;
        continue;
      }
      // Punctuation sits on the word before it.
      text = text.replace(/\s+$/u, "");
      text += sign;
      context = context.replace(/\s+$/u, "") + sign;
      joinNext = false;
      continue;
    }

    let word = words[i]!;
    if (word === "i" || /^i['’]/u.test(word)) word = "I" + word.slice(1);
    if (sentenceStart(context) && /^\p{Ll}/u.test(word)) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }
    const space = context !== "" && !joinNext && !/\s$/u.test(context) ? " " : "";
    text += space + word;
    context += space + word;
    joinNext = false;
  }
  flush();
  return pieces;
}
