"use client";

import { cn } from "@medos/ui";
import { Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";

import { CALLOUT_STYLES } from "@/features/study-guide/callouts";

import { CALLOUT_KINDS, NOTEBOOK_CALLOUTS, type NotebookCalloutKind } from "./document";

/*
 * A callout box in a notebook: Important, Exam trap, Clinical link and the
 * rest, drawn with the same border, tint and icon as the Study Guide's own
 * boxes. The label can be changed from the box itself.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Wraps the selected blocks in a callout of the kind, or changes the kind of the one around them. */
      setCallout: (kind: NotebookCalloutKind) => ReturnType;
      /** Removes the callout around the selection, keeping its content. */
      unsetCallout: () => ReturnType;
    };
  }
}

const labelOf = (kind: string) =>
  NOTEBOOK_CALLOUTS.find((callout) => callout.kind === kind)?.label ?? "Note";

function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const kind = CALLOUT_KINDS.has(node.attrs.kind)
    ? (node.attrs.kind as NotebookCalloutKind)
    : "important";
  const style = CALLOUT_STYLES[kind];
  const Icon = style.icon;
  return (
    <NodeViewWrapper
      data-callout={kind}
      className={cn("nb-callout my-4 rounded-xl border px-4 py-3.5 sm:px-5", style.box)}
    >
      <div contentEditable={false} className="mb-2 flex items-center gap-2 select-none">
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", style.accent)} />
        {editor.isEditable ? (
          <select
            aria-label="Kind of box"
            value={kind}
            onChange={(event) => updateAttributes({ kind: event.target.value })}
            className="-ml-1 cursor-pointer appearance-none rounded bg-transparent px-1 text-[12.5px] font-semibold tracking-wide text-fg uppercase hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
          >
            {NOTEBOOK_CALLOUTS.map((option) => (
              <option key={option.kind} value={option.kind}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[12.5px] font-semibold tracking-wide text-fg uppercase">
            {labelOf(kind)}
          </span>
        )}
      </div>
      <NodeViewContent className="nb-callout-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "important",
        parseHTML: (element) => element.getAttribute("data-callout") ?? "important",
        renderHTML: (attributes) => ({ "data-callout": attributes.kind }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ editor, commands }) =>
          editor.isActive(this.name)
            ? commands.updateAttributes(this.name, { kind })
            : commands.wrapIn(this.name, { kind }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
