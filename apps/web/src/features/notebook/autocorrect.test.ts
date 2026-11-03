// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { notebookExtensions } from "./extensions";

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
