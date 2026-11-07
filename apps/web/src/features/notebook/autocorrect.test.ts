// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { notebookExtensions } from "./extensions";
import { Lexicon, NOTE_WORDS, setLexicon } from "./speller";

/*
 * Autocorrect, typed one character at a time as a person would: each key
 * goes through the editor's input handling, where the corrections run.
 */

let editor: Editor;

function setup(html = "<p></p>") {
  editor = new Editor({ extensions: notebookExtensions(), content: html });
  editor.commands.focus("end");
  return editor;
}

function type(text: string) {
  const { view } = editor;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handle) =>
      handle(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

const text = () => editor.getText();

afterEach(() => {
  editor?.destroy();
  setLexicon(null);
});

function withDictionary() {
  const lexicon = Lexicon.fromDictionary(
    readFileSync(path.resolve(__dirname, "../../../public/dictionary/en-v1.txt"), "utf8"),
  );
  lexicon.add(NOTE_WORDS);
  setLexicon(lexicon);
}

function backspace() {
  const { view } = editor;
  const event = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
  view.someProp("handleKeyDown", (handle) => handle(view, event));
}

describe("notebook autocorrect with the dictionary", () => {
  it("fixes any misspelt word, not only listed ones", () => {
    withDictionary();
    setup();
    type("thw pateint has tachycadria adn a fevr ");
    expect(text()).toBe("The patient has tachycardia and a fever ");
  });

  it("keeps a sentence's capital and fixes a missed space", () => {
    withDictionary();
    setup();
    type("Ok. Hwat is thepatient doing? ");
    expect(text()).toBe("Ok. What is the patient doing? ");
  });

  it("leaves names, abbreviations and mixed-case words alone", () => {
    withDictionary();
    setup();
    type("Seen by Virchow, pt hx of HTN and pH 7.2 ");
    expect(text()).toBe("Seen by Virchow, pt hx of HTN and pH 7.2 ");
  });

  it("drops a little word typed twice", () => {
    withDictionary();
    setup();
    type("in the the kidney ");
    expect(text()).toBe("In the kidney ");
  });

  it("puts the word back on Backspace and learns it", () => {
    withDictionary();
    window.localStorage.clear();
    setup();
    type("a lievr ");
    expect(text()).toBe("A liver ");
    backspace();
    expect(text()).toBe("A lievr ");
    type("then lievr ");
    expect(text()).toBe("A lievr then lievr ");
    expect(window.localStorage.getItem("medos:notebook-words")).toContain("lievr");
  });
});

afterEach(() => editor?.destroy());

describe("notebook autocorrect", () => {
  it("fixes common typos, keeping their capitalisation", () => {
    setup();
    type("Teh pateint has symtoms adn signs ");
    expect(text()).toBe("The patient has symptoms and signs ");
  });

  it("starts sentences with a capital, but not after abbreviations", () => {
    setup();
    type("neutrophils rise. they fall, e.g. aspirin works. ");
    expect(text()).toBe("Neutrophils rise. They fall, e.g. aspirin works. ");
  });

  it("never changes words with capitals inside", () => {
    setup();
    type("pH is low. mRNA is made. ");
    expect(text()).toBe("pH is low. mRNA is made. ");
  });

  it("writes I on its own and contractions", () => {
    setup();
    type("So i think i'm right and dont know ");
    expect(text()).toBe("So I think I’m right and don’t know ");
  });

  it("turns typed signs into symbols and quotes into curly ones", () => {
    setup();
    type('Na -> K <= 5 +- 1 -- "low" isn\'t ok...');
    expect(text()).toBe("Na → K ≤ 5 ± 1 — “low” isn’t ok…");
  });

  it("can be switched off", () => {
    setup();
    editor.storage.autocorrect.enabled = false;
    type("teh -> x ");
    expect(text()).toBe("teh -> x ");
  });

  it("leaves code alone", () => {
    setup("<pre><code></code></pre>");
    type("teh -> x ");
    expect(text().trim()).toBe("teh -> x");
  });
});
