import { Extension, InputRule } from "@tiptap/core";

import { currentLexicon, correctWord, teachWord } from "./speller";

/*
 * Autocorrect while typing, as a word processor does: common typos, the
 * first letter of a sentence, "i" on its own, curly quotes, dashes and the
 * arrows and signs notes use all the time. Backspace straight after a
 * correction puts back what was typed. Nothing happens in code, and it can
 * be switched off (the choice is kept in this browser).
 *
 * Words with capitals inside (pH, mRNA, HbA1c) are never changed, and US and
 * UK spellings are both left alone: only plain mistakes are corrected.
 *
 * Beyond the typo list, any word the dictionary does not know is replaced by
 * the closest one it does (see speller.ts), so a slip onto the next key is
 * fixed without going back. Backspace straight after such a correction puts
 * the word back and teaches it, so it is never corrected again. Capitalised
 * words mid-sentence (names) and all-capital abbreviations are left alone.
 */

declare module "@tiptap/core" {
  interface Storage {
    autocorrect: {
      enabled: boolean;
      /** The last dictionary correction, for Backspace to undo and learn from. */
      last: { typed: string; text: string; at: number } | null;
    };
  }
  interface Commands<ReturnType> {
    autocorrect: {
      /** Switches autocorrect on or off for this editor. */
      setAutocorrect: (enabled: boolean) => ReturnType;
    };
  }
}

/** Typos and their corrections. Lowercase; the typed capitalisation is kept. */
export const TYPOS: Record<string, string> = {
  teh: "the",
  hte: "the",
  adn: "and",
  nad: "and",
  taht: "that",
  thta: "that",
  wiht: "with",
  whit: "with",
  waht: "what",
  wich: "which",
  whcih: "which",
  becuase: "because",
  beacuse: "because",
  becasue: "because",
  recieve: "receive",
  recieved: "received",
  reciever: "receiver",
  receptro: "receptor",
  beleive: "believe",
  acheive: "achieve",
  occured: "occurred",
  occurence: "occurrence",
  untill: "until",
  thier: "their",
  theyre: "they’re",
  dont: "don’t",
  doesnt: "doesn’t",
  didnt: "didn’t",
  isnt: "isn’t",
  wasnt: "wasn’t",
  shouldnt: "shouldn’t",
  couldnt: "couldn’t",
  wouldnt: "wouldn’t",
  ive: "I’ve",
  seperate: "separate",
  definately: "definitely",
  accross: "across",
  alot: "a lot",
  goverment: "government",
  enviroment: "environment",
  existance: "existence",
  independant: "independent",
  neccessary: "necessary",
  necesary: "necessary",
  noticable: "noticeable",
  wierd: "weird",
  similiar: "similar",
  succesful: "successful",
  tommorow: "tomorrow",
  usualy: "usually",
  finaly: "finally",
  basicaly: "basically",
  increse: "increase",
  decrese: "decrease",
  incresed: "increased",
  decresed: "decreased",
  pateint: "patient",
  patinet: "patient",
  pateints: "patients",
  patinets: "patients",
  diagnosos: "diagnosis",
  diagnosys: "diagnosis",
  symtom: "symptom",
  symtoms: "symptoms",
  sympton: "symptom",
  symptons: "symptoms",
  infecton: "infection",
  infectoin: "infection",
  bacterai: "bacteria",
  bacteira: "bacteria",
  inflamation: "inflammation",
  inflamatory: "inflammatory",
  imunity: "immunity",
  imune: "immune",
  hormon: "hormone",
  recpetor: "receptor",
  receptos: "receptors",
  mechansim: "mechanism",
  mechanim: "mechanism",
  treatmnet: "treatment",
  treatement: "treatment",
  syndrom: "syndrome",
  diseae: "disease",
  desease: "disease",
  deseases: "diseases",
  medicaton: "medication",
  medicatoin: "medication",
  antibiotc: "antibiotic",
  antibiotcs: "antibiotics",
  phsyiology: "physiology",
  physiolgy: "physiology",
  pathalogy: "pathology",
  pharmocology: "pharmacology",
  pharmacolgy: "pharmacology",
  metabolsim: "metabolism",
  concentraton: "concentration",
  absorbtion: "absorption",
  excreton: "excretion",
  secreton: "secretion",
  proteine: "protein",
  protien: "protein",
  protiens: "proteins",
  bloood: "blood",
  hepatits: "hepatitis",
  ischemai: "ischemia",
  neutrophl: "neutrophil",
  lymphocye: "lymphocyte",
  erythrocye: "erythrocyte",
  platlet: "platelet",
  platlets: "platelets",
};

/** Little words typed twice by accident ("the the"); "had had" and "that that" are English. */
const DOUBLES = new Set(
  "the a an and of to in is it on for with as at by be are was or from this".split(" "),
);

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "vs.",
  "etc.",
  "approx.",
  "cf.",
  "dr.",
  "prof.",
  "fig.",
  "no.",
  "max.",
  "min.",
  "incl.",
  "resp.",
  "a.k.a.",
]);

const SYMBOLS: [RegExp, string][] = [
  [/<->$/, "↔"],
  [/←>$/, "↔"],
  [/<=>$/, "⇔"],
  [/->$/, "→"],
  [/<-$/, "←"],
  [/=>$/, "⇒"],
  [/<=$/, "≤"],
  [/>=$/, "≥"],
  [/!=$/, "≠"],
  [/\+-$/, "±"],
  [/~=$/, "≈"],
  [/\.\.\.$/, "…"],
  [/(?<![-—])--$/, "—"],
  [/\(c\)$/i, "©"],
];

const LETTER = "\\p{L}\\p{N}";

/** True when the text before `index` ends a sentence (or there is no text before it). */
function startsSentence(input: string, index: number): boolean {
  const before = input.slice(0, index);
  if (before.trim() === "") return true;
  const match = /([.!?])["”’')\]]*\s+$/u.exec(before);
  if (!match) return false;
  if (match[1] !== ".") return true;
  const word = /(\S+)\s*$/u.exec(before.trimEnd())?.[1]?.toLowerCase() ?? "";
  if (ABBREVIATIONS.has(word.replace(/["”’')\]]+$/u, ""))) return false;
  // Single letters and initials ("A. Fleming") and numbers ("1. ") are not sentence ends.
  if (/^(\p{L}|\d+)\.$/u.test(word)) return false;
  return true;
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The correction keeps how the typo was capitalised: Teh → The, TEH → THE. */
function matchCase(typed: string, fixed: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase()) return fixed.toUpperCase();
  if (typed.charAt(0) === typed.charAt(0).toUpperCase()) return capitalise(fixed);
  return fixed;
}

export const Autocorrect = Extension.create({
  name: "autocorrect",

  addStorage() {
    return { enabled: true, last: null };
  },

  addCommands() {
    return {
      setAutocorrect:
        (enabled) =>
        ({ editor, tr }) => {
          editor.storage.autocorrect.enabled = enabled;
          // A change of setting, not of the notes: lets the toolbar show it.
          tr.setMeta("autocorrect", enabled);
          return true;
        },
    };
  },

  addInputRules() {
    const editor = this.editor;
    const on = () => editor.storage.autocorrect.enabled;

    // A word just finished by a space or punctuation.
    const word = new InputRule({
      find: new RegExp(`(^|[^${LETTER}'’])([${LETTER}'’]+)([\\s.,;:!?)])$`, "u"),
      handler: ({ state, range, match }) => {
        if (!on()) return null;
        const [, lead = "", typed = "", end = ""] = match;
        const index = (match.index ?? 0) + lead.length;
        let fixed = typed;
        const before = (match.input ?? "").slice(0, index);
        const sentenceStart = startsSentence(match.input ?? "", index);
        const typo = TYPOS[typed.toLowerCase()];
        // Mixed-case words (pH, mRNA) are names, never typos.
        const plain =
          typed === typed.toLowerCase() || typed.slice(1) === typed.slice(1).toLowerCase();
        const start = range.from + lead.length;
        editor.storage.autocorrect.last = null;

        // "the the": the second one goes.
        const previous = /(\p{L}+)\s+$/u.exec(before)?.[1];
        if (
          /\s/u.test(end) &&
          previous?.toLowerCase() === typed.toLowerCase() &&
          DOUBLES.has(typed.toLowerCase()) &&
          range.to - range.from === lead.length + typed.length + end.length
        ) {
          state.tr.delete(start, range.to);
          return;
        }

        let learnable = false;
        if (typo && plain) fixed = matchCase(typed, typo);
        else if (
          // Plain lowercase, or capitalised only because a sentence starts.
          (typed === typed.toLowerCase() ||
            (sentenceStart &&
              typed.length > 1 &&
              typed.slice(1) === typed.slice(1).toLowerCase())) &&
          // "approx." and "resp." are abbreviations, not typos.
          !(end === "." && typed.length <= 6)
        ) {
          const lexicon = currentLexicon();
          const lower = typed.toLowerCase();
          const correction = lexicon ? correctWord(lower, lexicon) : null;
          if (correction) {
            fixed = matchCase(typed, correction);
            learnable = true;
          }
        }
        if (fixed.toLowerCase() === "i" || /^i['’]/i.test(fixed)) fixed = capitalise(fixed);
        if (
          end !== "." && // "e.g." is still being typed
          fixed === fixed.toLowerCase() &&
          /^\p{Ll}/u.test(fixed) &&
          sentenceStart
        ) {
          fixed = capitalise(fixed);
        }
        if (fixed === typed) return null;
        // The typed key is already in the document: the range is the whole match.
        if (range.to - range.from !== lead.length + typed.length + end.length) return null;
        state.tr.insertText(fixed + end, start, range.to);
        if (learnable) {
          const text = fixed + end;
          editor.storage.autocorrect.last = { typed, text, at: start + text.length };
        }
      },
    });

    const symbols = SYMBOLS.map(
      ([find, replace]) =>
        new InputRule({
          find,
          handler: ({ state, range }) => {
            if (!on()) return null;
            state.tr.insertText(replace, range.from, range.to);
          },
        }),
    );

    // Curly quotes: opening after a space or bracket, closing otherwise.
    const quote = (find: RegExp, open: string, close: string) =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          if (!on()) return null;
          const opening = match[1] !== undefined && /^$|[\s([{“‘—-]$/u.test(match[1]);
          state.tr.insertText(opening ? open : close, range.to - 1, range.to);
        },
      });

    // Symbols first, so "(c)" becomes © before the word rule sees ")".
    return [...symbols, word, quote(/(^|.)"$/u, "“", "”"), quote(/(^|.)'$/u, "‘", "’")];
  },
});

/**
 * Backspace straight after a dictionary correction: the core keymap puts the
 * typed word back (undoing the input rule); this remembers the word first, so
 * it is not corrected again. Runs before the core keymap and never stops it.
 */
export const AutocorrectLearning = Extension.create({
  name: "autocorrectLearning",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const storage = editor.storage.autocorrect;
        const last = storage?.last;
        if (!last) return false;
        storage.last = null;
        const { selection, doc } = editor.state;
        const from = last.at - last.text.length;
        if (
          selection.empty &&
          selection.from === last.at &&
          from >= 0 &&
          doc.textBetween(from, last.at, "\n") === last.text
        ) {
          teachWord(last.typed);
        }
        return false;
      },
    };
  },
});
