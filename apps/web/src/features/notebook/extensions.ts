import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { StarterKit } from "@tiptap/starter-kit";

import { Autocorrect, AutocorrectLearning } from "./autocorrect";
import { Callout } from "./callout-node";
import { isNotebookImageSrc, isSafeHref } from "./document";

export type MathClick = (kind: "inline" | "block", node: ProseMirrorNode, pos: number) => void;

/**
 * Images in a notebook are only ever the user's own, kept in MedOS. An image
 * pasted from another site is left out rather than loaded from there.
 */
const NotebookImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) =>
          isNotebookImageSrc((element as HTMLElement).getAttribute("src")) ? null : false,
      },
    ];
  },
});

/** Everything a notebook can contain. What the server accepts (document.ts) must match it. */
export function notebookExtensions(placeholder = "", onMathClick?: MathClick) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeHref(url),
      },
    }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    NotebookImage.configure({
      inline: false,
      allowBase64: false,
      resize: {
        enabled: true,
        directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
        alwaysPreserveAspectRatio: true,
        minWidth: 48,
        minHeight: 48,
      },
    }),
    Mathematics.configure({
      // KaTeX without `trust`: no links, no HTML, nothing that runs.
      katexOptions: { throwOnError: false, trust: false, strict: "ignore", maxExpand: 500 },
      inlineOptions: { onClick: (node, pos) => onMathClick?.("inline", node, pos) },
      blockOptions: { onClick: (node, pos) => onMathClick?.("block", node, pos) },
    }),
    CharacterCount,
    Autocorrect,
    AutocorrectLearning,
    Placeholder.configure({ placeholder }),
    Callout,
  ];
}

/** Formulas are kept as their LaTeX in the plain-text copy, so search finds them. */
export const NOTEBOOK_TEXT_SERIALIZERS = {
  inlineMath: ({ node }: { node: ProseMirrorNode }) => String(node.attrs.latex ?? ""),
  blockMath: ({ node }: { node: ProseMirrorNode }) => String(node.attrs.latex ?? ""),
  image: ({ node }: { node: ProseMirrorNode }) => (node.attrs.alt ? `[${node.attrs.alt}]` : ""),
};
