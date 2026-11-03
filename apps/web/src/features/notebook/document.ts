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
  "image",
  "inlineMath",
  "blockMath",
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
  "textStyle",
]);

/** Largest image a notebook accepts, before any downsizing in the browser. */
export const NOTEBOOK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_SRC = /^\/api\/notebook-images\/[0-9a-f]{64}$/;

/** Where a notebook image is served from: only the user's own, from MedOS. */
export const notebookImageSrc = (hash: string) => `/api/notebook-images/${hash}`;
export const isNotebookImageSrc = (src: unknown) => typeof src === "string" && IMAGE_SRC.test(src);

/** Longest formula a notebook keeps, in LaTeX characters. */
export const MAX_FORMULA_LENGTH = 4000;

const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

/*
 * Style values the notebook stores. Only plain CSS values: no url(), no
 * expressions, nothing that can reach outside the page.
 */
const COLOR =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,24})$/i;
const FONT_SIZE = /^\d{1,3}(\.\d{1,3})?(px|pt|em|rem|%)$/;
const FONT_FAMILY = /^(var\(--[a-z0-9-]+\)|[\w\s,"'-]{1,200})$/;

const isNullOr = (value: unknown, test: (v: string) => boolean) =>
  value === null || value === undefined || (typeof value === "string" && test(value));

export const isSafeColor = (value: unknown) => isNullOr(value, (v) => COLOR.test(v));
export const isSafeFontSize = (value: unknown) => isNullOr(value, (v) => FONT_SIZE.test(v));
export const isSafeFontFamily = (value: unknown) => isNullOr(value, (v) => FONT_FAMILY.test(v));

const isDimension = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10_000);

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
    if (!nodeAttrsAreSafe(item)) return false;
    if (item.marks !== undefined) {
      if (!Array.isArray(item.marks)) return false;
      for (const mark of item.marks) {
        if (!isObject(mark) || typeof mark.type !== "string" || !NOTEBOOK_MARKS.has(mark.type)) {
          return false;
        }
        if (!markIsSafe(mark)) return false;
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

/** Attributes a node may carry that could otherwise point outside MedOS or break the page. */
function nodeAttrsAreSafe(item: Json): boolean {
  const attrs = isObject(item.attrs) ? item.attrs : {};
  if (attrs.textAlign !== undefined && attrs.textAlign !== null) {
    if (!ALIGNMENTS.has(String(attrs.textAlign))) return false;
  }
  if (item.type === "image") {
    return isNotebookImageSrc(attrs.src) && isDimension(attrs.width) && isDimension(attrs.height);
  }
  if (item.type === "inlineMath" || item.type === "blockMath") {
    return typeof attrs.latex === "string" && attrs.latex.length <= MAX_FORMULA_LENGTH;
  }
  return true;
}

function markIsSafe(mark: Json): boolean {
  const attrs = isObject(mark.attrs) ? mark.attrs : {};
  switch (mark.type) {
    case "link":
      return isSafeHref(attrs.href);
    case "highlight":
      return isSafeColor(attrs.color);
    case "textStyle":
      return (
        isSafeColor(attrs.color) &&
        isSafeColor(attrs.backgroundColor) &&
        isSafeFontSize(attrs.fontSize) &&
        isSafeFontFamily(attrs.fontFamily)
      );
    default:
      return true;
  }
}

/**
 * The document with anything the server would refuse taken out: style values
 * it does not keep (from text pasted from elsewhere) and images that are not
 * the user's own. The text itself is never removed. Run before every save.
 */
export function cleanNotebookDocument<T>(value: T): T {
  function clean(item: unknown): unknown {
    if (!isObject(item)) return item;
    const next: Json = { ...item };
    if (isObject(next.attrs)) {
      const attrs = { ...next.attrs };
      if (attrs.textAlign != null && !ALIGNMENTS.has(String(attrs.textAlign)))
        attrs.textAlign = null;
      next.attrs = attrs;
    }
    if (Array.isArray(next.marks)) {
      next.marks = next.marks
        .map((mark) => {
          if (!isObject(mark) || (mark.type !== "textStyle" && mark.type !== "highlight"))
            return mark;
          const attrs: Json = { ...(isObject(mark.attrs) ? mark.attrs : {}) };
          if (!isSafeColor(attrs.color)) attrs.color = null;
          if (!isSafeColor(attrs.backgroundColor)) attrs.backgroundColor = null;
          if (!isSafeFontSize(attrs.fontSize)) attrs.fontSize = null;
          if (!isSafeFontFamily(attrs.fontFamily)) attrs.fontFamily = null;
          return { ...mark, attrs };
        })
        .filter((mark) => mark !== null);
    }
    if (Array.isArray(next.content)) {
      next.content = next.content
        .filter(
          (child) =>
            !(
              isObject(child) &&
              child.type === "image" &&
              !isNotebookImageSrc(child.attrs && (child.attrs as Json).src)
            ),
        )
        .map(clean);
    }
    return next;
  }
  return clean(value) as T;
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
