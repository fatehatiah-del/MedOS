"use client";

import type { NotebookView } from "@medos/database";
import { Skeleton, cn } from "@medos/ui";
import { Maximize2, NotebookPen, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from "react";

import { useNotebook, useStoredValue } from "./notebook-context";

/*
 * The lecture notebook beside the Study Guide. On a wide screen it docks to
 * the right of the reader, which narrows (its own columns adapt to the space
 * left) and can be resized by dragging the pane's edge; on a narrow screen it
 * opens over the reader as a sheet. Once opened, the editor stays mounted
 * while closed, so nothing typed is lost by hiding it.
 *
 * The editor is loaded only when the notebook is first opened, so the Study
 * Guide itself is no heavier for it.
 */

const NotebookEditor = dynamic(() => import("./editor").then((module) => module.NotebookEditor), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 p-5">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  ),
});

const WIDE = "(min-width: 1100px)";
const WIDTH_KEY = "medos:notebook-width";
const MIN_WIDTH = 340;

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export function NotebookShell({
  initial,
  notebookHref,
  lectureTitle,
  children,
}: {
  initial: NotebookView;
  notebookHref: string;
  lectureTitle: string;
  children: ReactNode;
}) {
  const notebook = useNotebook();
  const wide = useWide();
  const open = notebook?.open ?? false;
  // Mounted from the first opening on, so hiding the notebook keeps the editor.
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  const [storedWidth, storeWidth] = useStoredValue(WIDTH_KEY, "460");
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? Math.max(MIN_WIDTH, Number(storedWidth) || 460);

  // Alt+N opens and closes the notebook.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        notebook?.toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notebook]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    const max = () => Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.62));
    const onMove = (move: PointerEvent) => {
      latest = Math.min(max(), Math.max(MIN_WIDTH, startWidth + (startX - move.clientX)));
      setDragWidth(latest);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("user-select");
      storeWidth(String(latest));
      setDragWidth(null);
    };
    document.body.style.setProperty("user-select", "none");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const docked = open && wide;

  return (
    <div className={cn(docked && "flex items-start gap-5")}>
      <div className="@container min-w-0 flex-1">{children}</div>

      {mounted && notebook ? (
        <aside
          aria-label="Notebook"
          hidden={!open}
          style={docked ? { width } : undefined}
          className={cn(
            "flex flex-col overflow-hidden border border-border bg-surface",
            docked
              ? "relative sticky top-16 h-[calc(100dvh-5rem)] shrink-0 rounded-xl shadow-xs"
              : "fixed inset-y-0 right-0 z-50 w-full max-w-[42rem] animate-slide-in-right shadow-lg",
            !open && "hidden",
          )}
        >
          {docked ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the notebook"
              onPointerDown={startResize}
              className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-accent/20"
            />
          ) : null}
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <NotebookPen aria-hidden="true" className="size-4 text-accent" />
            <div className="min-w-0">
              <h2 className="font-serif text-[1.05rem] leading-tight font-semibold text-fg">
                Notebook
              </h2>
              <p className="truncate text-[12px] text-fg-subtle">{lectureTitle}</p>
            </div>
            <Link
              href={notebookHref}
              title="Open the notebook on its own page"
              className="ml-auto flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            >
              <Maximize2 aria-hidden="true" className="size-4" />
              <span className="sr-only">Open the notebook on its own page</span>
            </Link>
            <button
              type="button"
              onClick={() => notebook.setOpen(false)}
              title="Close the notebook (Alt+N)"
              className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Close the notebook</span>
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <NotebookEditor
              lectureId={notebook.lectureId}
              initial={initial}
              variant="pane"
              onReady={notebook.registerEditor}
            />
          </div>
        </aside>
      ) : null}

      {notebook && !open ? (
        <button
          type="button"
          onClick={() => notebook.setOpen(true)}
          title="Open the notebook (Alt+N)"
          className="fixed right-5 bottom-5 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[14px] font-medium text-fg shadow-lg transition-colors duration-150 hover:bg-subtle"
        >
          <NotebookPen aria-hidden="true" className="size-4 text-accent" />
          Notebook
        </button>
      ) : null}
    </div>
  );
}

/** A button that opens the notebook, for the reader's header. */
export function NotebookToggle() {
  const notebook = useNotebook();
  if (!notebook) return null;
  return (
    <button
      type="button"
      onClick={notebook.toggle}
      aria-pressed={notebook.open}
      title="Notebook (Alt+N)"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-fg shadow-xs hover:bg-subtle aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-accent"
    >
      <NotebookPen aria-hidden="true" className="size-4" />
      {notebook.open ? "Close notebook" : "Open notebook"}
    </button>
  );
}
