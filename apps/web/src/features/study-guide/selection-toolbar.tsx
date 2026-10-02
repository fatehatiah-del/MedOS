"use client";

import type { AnnotationKind } from "@medos/database";
import { cn } from "@medos/ui";
import { Bookmark, Clock, Highlighter, Layers, StickyNote, X } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useReader } from "./reader-context";
import { type SelectionAnchor, anchorFromSelection } from "./selection";

/*
 * The actions offered for selected Study Guide text: Highlight, Add note,
 * Bookmark and Review Later, plus Create flashcard shown as a later feature.
 *
 * It works with any way of selecting text: mouse, touch, or the keyboard with
 * caret browsing (F7). With text selected, Alt+A moves focus into the
 * toolbar; arrow keys move between its buttons and Escape closes it.
 */

const ROOT_ID = "study-guide-text";
export const TOOLBAR_SHORTCUT = "Alt+A";

type Shown =
  | { status: "anchor"; anchor: SelectionAnchor; rect: DOMRect }
  | { status: "multiple"; rect: DOMRect };

const ACTIONS: { kind: AnnotationKind; label: string; icon: typeof Bookmark }[] = [
  { kind: "highlight", label: "Highlight", icon: Highlighter },
  { kind: "note", label: "Add note", icon: StickyNote },
  { kind: "bookmark", label: "Bookmark", icon: Bookmark },
  { kind: "review-later", label: "Review later", icon: Clock },
];

export function SelectionToolbar() {
  const { annotate, openNoteEditor, pending } = useReader();
  const [shown, setShown] = useState<Shown | null>(null);
  const [coarse, setCoarse] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useLayoutEffect(() => {
    if (shown && toolbar.current) setWidth(toolbar.current.offsetWidth);
  }, [shown]);

  const read = useCallback(() => {
    const root = document.getElementById(ROOT_ID);
    const selection = window.getSelection();
    if (!root) return;
    // Interacting with the toolbar keeps it open.
    if (toolbar.current?.contains(document.activeElement)) return;
    const result = anchorFromSelection(selection, root);
    if (result.status === "none" || !selection || selection.rangeCount === 0) {
      setShown(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setShown(result.status === "anchor" ? { ...result, rect } : { status: "multiple", rect });
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);

    let timer: number | undefined;
    const onSelection = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 120);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "a") {
        const first = toolbar.current?.querySelector<HTMLButtonElement>("button");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("selectionchange", onSelection);
    // Text may already be selected when the reader becomes interactive.
    onSelection();
    document.addEventListener("keydown", onKey);
    // Follow the selection as the page scrolls.
    window.addEventListener("scroll", onSelection, { passive: true });
    return () => {
      window.clearTimeout(timer);
      query.removeEventListener("change", update);
      document.removeEventListener("selectionchange", onSelection);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onSelection);
    };
  }, [read]);

  if (!shown) return null;

  const close = (clearSelection: boolean) => {
    setShown(null);
    if (clearSelection) window.getSelection()?.removeAllRanges();
    document.getElementById(ROOT_ID)?.focus({ preventScroll: true });
  };

  const act = async (kind: AnnotationKind) => {
    if (shown.status !== "anchor" || pending) return;
    const { anchor } = shown;
    if (kind === "note") {
      close(true);
      openNoteEditor({ mode: "create", target: anchor, quote: anchor.quote });
      return;
    }
    if (await annotate(kind, anchor)) close(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(false);
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = [...(toolbar.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      buttons[(index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
    event.preventDefault();
  };

  // Above the selection on desktop; a bar at the bottom on touch screens,
  // where the system's own selection menu sits above the text.
  const style = coarse
    ? undefined
    : {
        top: Math.max(64, shown.rect.top - 52),
        left: Math.min(
          Math.max(8, shown.rect.left + shown.rect.width / 2 - width / 2),
          Math.max(8, window.innerWidth - width - 8),
        ),
      };

  return (
    <div
      ref={toolbar}
      role="toolbar"
      aria-label="Selected text"
      aria-keyshortcuts={TOOLBAR_SHORTCUT}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => event.preventDefault()}
      style={style}
      className={cn(
        "fixed z-40 flex animate-fade-in items-center gap-0.5 rounded-xl border border-border-strong bg-surface p-1 shadow-lg",
        coarse && "inset-x-3 bottom-3 justify-between overflow-x-auto",
      )}
    >
      {shown.status === "multiple" ? (
        <p className="px-2.5 py-1.5 text-[13px] text-fg-muted">
          Select text within one paragraph, item, cell or caption to annotate it.
        </p>
      ) : (
        <>
          {ACTIONS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => void act(kind)}
              aria-disabled={pending || undefined}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg transition-colors duration-150 hover:bg-hover"
            >
              <Icon aria-hidden="true" className="size-4 text-fg-muted" />
              {label}
            </button>
          ))}
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="sg-flashcard-later"
            className="flex h-9 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg-subtle"
          >
            <Layers aria-hidden="true" className="size-4" />
            Create flashcard
          </button>
          <span id="sg-flashcard-later" className="sr-only">
            Arrives with Flashcards in a later phase.
          </span>
        </>
      )}
      <button
        type="button"
        onClick={() => close(false)}
        aria-label="Close"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-hover hover:text-fg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
