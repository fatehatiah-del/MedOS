/*
 * The shape of a lecture notebook document, checked on the server before it
 * is stored. The editor saves ProseMirror JSON; only the nodes and marks the
 * notebook editor itself offers are accepted, so a stored notebook always
 * opens in it. Free of editor code, so the server can import it.
 */

export const NOTEBOOK_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "callout",
]);

export const NOTEBOOK_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
  "subscript",
  "superscript",
]);

/** Callout kinds a notebook offers, styled exactly like the Study Guide's own boxes. */
export const NOTEBOOK_CALLOUTS = [
  { kind: "important", label: "Important" },
  { kind: "exam-tip", label: "Exam tip" },
  { kind: "exam-trap", label: "Exam trap" },
  { kind: "clinical-link", label: "Clinical link" },
  { kind: "memory-hook", label: "Memory hook" },
  { kind: "key-concepts", label: "Key concept" },
  { kind: "how-its-tested", label: "How it's tested" },
  { kind: "summary", label: "Summary" },
] as const;

export type NotebookCalloutKind = (typeof NOTEBOOK_CALLOUTS)[number]["kind"];

export const CALLOUT_KINDS = new Set<string>(NOTEBOOK_CALLOUTS.map(({ kind }) => kind));

const MAX_DEPTH = 40;
const MAX_NODES = 60_000;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True when `value` is a notebook document made only of what the editor offers. */
export function isNotebookDocument(value: unknown): boolean {
  if (!isObject(value) || value.type !== "doc") return false;
  let count = 0;

  function node(item: unknown, depth: number): boolean {
    if (!isObject(item) || typeof item.type !== "string" || !NOTEBOOK_NODES.has(item.type)) {
      return false;
    }
    if (++count > MAX_NODES || depth > MAX_DEPTH) return false;
    if (item.type === "text" && typeof item.text !== "string") return false;
    if (item.attrs !== undefined && !isObject(item.attrs)) return false;
    if (item.type === "callout" && !CALLOUT_KINDS.has(String(item.attrs?.kind))) return false;
    if (item.marks !== undefined) {
      if (!Array.isArray(item.marks)) return false;
      for (const mark of item.marks) {
        if (!isObject(mark) || typeof mark.type !== "string" || !NOTEBOOK_MARKS.has(mark.type)) {
          return false;
        }
        if (mark.type === "link" && !isSafeHref(isObject(mark.attrs) ? mark.attrs.href : null)) {
          return false;
        }
      }
    }
    if (item.content !== undefined) {
      if (!Array.isArray(item.content)) return false;
      for (const child of item.content) if (!node(child, depth + 1)) return false;
    }
    return true;
  }

  return node(value, 0);
}

/** Links in notes may only go to web pages, mail, or somewhere in MedOS. */
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== "string" || href.length > 2000) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}
