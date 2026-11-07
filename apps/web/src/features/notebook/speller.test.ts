import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { Lexicon, NOTE_WORDS, correctWord, isNeighbour } from "./speller";

/*
 * The corrector against the real dictionary the notebook downloads.
 */

const lexicon = Lexicon.fromDictionary(
  readFileSync(path.resolve(__dirname, "../../../public/dictionary/en-v1.txt"), "utf8"),
);
lexicon.add(NOTE_WORDS);
const fix = (word: string) => correctWord(word, lexicon);

describe("notebook speller", () => {
  it("knows which keys sit next to each other", () => {
    expect(isNeighbour("e", "w")).toBe(true);
    expect(isNeighbour("g", "h")).toBe(true);
    expect(isNeighbour("a", "p")).toBe(false);
  });

  it("fixes a slip onto the next key", () => {
    expect(fix("thw")).toBe("the");
    expect(fix("tge")).toBe("the");
    expect(fix("rhe")).toBe("the");
    expect(fix("lievr")).toBe("liver");
  });

  it("fixes swapped, doubled and missing letters", () => {
    expect(fix("jsut")).toBe("just");
    expect(fix("becuase")).toBe("because");
    expect(fix("pateint")).toBe("patient");
    expect(fix("bloood")).toBe("blood");
    expect(fix("seperate")).toBe("separate");
    expect(fix("definately")).toBe("definitely");
  });

  it("fixes medical words", () => {
    expect(fix("tachycadria")).toBe("tachycardia");
    expect(fix("erythropoeisis")).toBe("erythropoiesis");
    expect(fix("hypertensoin")).toBe("hypertension");
    expect(fix("infalmmation")).toBe("inflammation");
    expect(fix("hemoglobim")).toBe("hemoglobin");
  });

  it("puts back a missed space", () => {
    expect(fix("thepatient")).toBe("the patient");
    expect(fix("ofthe")).toBe("of the");
  });

  it("leaves real words, note abbreviations and taught words alone", () => {
    for (const word of ["the", "receptor", "glomerulus", "pt", "hx", "dx", "approx", "colour"]) {
      expect(fix(word)).toBeNull();
    }
    const own = Lexicon.fromDictionary("#0\n");
    own.add(["hyperkalemia"]);
    expect(correctWord("hyperkalemia", own)).toBeNull();
  });

  it("leaves a short word alone when it cannot tell which was meant", () => {
    expect(fix("fo")).toBeNull(); // of? for? go? do?
  });

  it("is quick enough to run on every word", () => {
    const start = performance.now();
    for (const word of ["infalmmation", "erythropoeisis", "hypertensoin", "becuase"]) fix(word);
    expect(performance.now() - start).toBeLessThan(400);
  });
});
