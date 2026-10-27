// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { isNotebookDocument } from "./document";
import { notebookExtensions } from "./extensions";

/*
 * What the server accepts must cover everything the editor can produce,
 * and nothing else.
 */

function editorWith(html: string) {
  return new Editor({ extensions: notebookExtensions(), content: html });
}

describe("notebook documents", () => {
  it("accept everything the editor produces", () => {
    const editor = editorWith(`
      <h1>Neutrophils</h1>
      <p><strong>Bold</strong> <em>italic</em> <u>under</u> <s>strike</s> <code>x</code>
        <mark data-color="var(--highlight)" style="background-color: var(--highlight)">hl</mark>
        <a href="https://example.org">link</a><br>after break</p>
      <ul><li><p>bullet</p></li></ul>
      <ol><li><p>number</p></li></ol>
      <ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>task</p></li></ul>
      <blockquote><p>quote</p></blockquote>
      <pre><code>code</code></pre>
      <hr>
      <table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>
      <div data-callout="exam-trap"><p>Trap</p></div>
    `);
    const json = editor.getJSON();
    expect(isNotebookDocument(json)).toBe(true);
    // And after the trip through a Server Function, which sends plain JSON.
    expect(isNotebookDocument(JSON.parse(JSON.stringify(json)))).toBe(true);
    editor.destroy();
  });

  it("accept an empty notebook", () => {
    const editor = editorWith("");
    expect(isNotebookDocument(editor.getJSON())).toBe(true);
    editor.destroy();
  });

  it("refuse unknown nodes, marks, callout kinds and unsafe links", () => {
    const doc = (content: unknown[]) => ({ type: "doc", content });
    expect(isNotebookDocument(doc([{ type: "iframe" }]))).toBe(false);
    expect(
      isNotebookDocument(
        doc([
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "script" }] }],
          },
        ]),
      ),
    ).toBe(false);
    expect(
      isNotebookDocument(doc([{ type: "callout", attrs: { kind: "nope" }, content: [] }])),
    ).toBe(false);
    expect(
      isNotebookDocument(
        doc([
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ]),
      ),
    ).toBe(false);
    expect(isNotebookDocument({ type: "paragraph" })).toBe(false);
  });
});
