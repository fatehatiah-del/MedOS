import { describe, expect, it } from "vitest";

import { formatDictation } from "./dictation";

describe("dictation text", () => {
  it("starts a sentence with a capital and spaces after what is written", () => {
    expect(formatDictation("neutrophils rise in infection", "")).toEqual([
      { text: "Neutrophils rise in infection" },
    ]);
    expect(formatDictation("in sepsis", "Neutrophils rise")).toEqual([{ text: " in sepsis" }]);
    expect(formatDictation("they fall", "Neutrophils rise. ")).toEqual([{ text: "They fall" }]);
    expect(formatDictation("they fall", "Neutrophils rise.")).toEqual([{ text: " They fall" }]);
  });

  it("turns spoken punctuation into signs", () => {
    expect(
      formatDictation(
        "aspirin comma ibuprofen full stop what about paracetamol question mark",
        "",
      ),
    ).toEqual([{ text: "Aspirin, ibuprofen. What about paracetamol?" }]);
    expect(formatDictation("ANC open bracket absolute count close bracket", "")).toEqual([
      { text: "ANC (absolute count)" },
    ]);
  });

  it("breaks lines and paragraphs on command", () => {
    expect(formatDictation("first point new line second new paragraph next", "Notes:")).toEqual([
      { text: " first point" },
      { break: "line" },
      { text: "Second" },
      { break: "paragraph" },
      { text: "Next" },
    ]);
  });

  it("keeps medical words that sound like commands, and writes I", () => {
    expect(formatDictation("the refractory period of the colon i think", "So")).toEqual([
      { text: " the refractory period of the colon I think" },
    ]);
  });
});
