"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@medos/ui";
import { ListTree, PanelRight } from "lucide-react";
import { useRef, useState } from "react";

import { ContextPanel } from "./context-panel";
import { ReaderToc } from "./reader-toc";
import { revealSection } from "./reveal";
import type { TocEntry } from "./structure";

/*
 * On narrower screens the contents and the context panel move into sheets,
 * opened from a bar that stays above the text. Each button hides itself once
 * the reader is wide enough to show its panel in place.
 */

const BUTTON =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-fg shadow-xs hover:bg-subtle";

export function ReaderBar({ toc }: { toc: readonly TocEntry[] }) {
  const [contentsOpen, setContentsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // A section chosen in the drawer; focus moves there once the drawer has closed.
  const target = useRef<string | null>(null);

  return (
    <div className="sticky top-14 z-20 -mx-1 flex items-center gap-2 bg-canvas/90 px-1 py-2 backdrop-blur-md @min-[63rem]:hidden">
      <Dialog open={contentsOpen} onOpenChange={setContentsOpen}>
        <DialogTrigger className={`${BUTTON} @min-[48rem]:hidden`}>
          <ListTree aria-hidden="true" className="size-4" />
          Contents
        </DialogTrigger>
        <DialogContent
          placement="left"
          closeLabel="Close contents"
          className="overflow-y-auto p-4 pt-5"
          onCloseAutoFocus={(event) => {
            const id = target.current;
            if (!id) return;
            target.current = null;
            event.preventDefault();
            revealSection(id);
          }}
        >
          <DialogTitle className="sr-only">Contents</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a section to go to it in the Study Guide.
          </DialogDescription>
          <ReaderToc
            entries={toc}
            onNavigate={(id) => {
              target.current = id;
              setContentsOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogTrigger className={`${BUTTON} ml-auto`}>
          <PanelRight aria-hidden="true" className="size-4" />
          Notes &amp; progress
        </DialogTrigger>
        <DialogContent placement="right" closeLabel="Close notes and progress" className="p-5 pt-6">
          <DialogTitle className="mb-4">Notes &amp; progress</DialogTitle>
          <DialogDescription className="sr-only">
            Your reading progress, bookmarks, notes, Review Later items and highlights in this Study
            Guide.
          </DialogDescription>
          <ContextPanel onNavigate={() => setPanelOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
