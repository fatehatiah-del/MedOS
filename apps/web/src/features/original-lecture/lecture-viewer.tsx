"use client";

import type { PageAnnotationKind } from "@medos/database";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  cn,
} from "@medos/ui";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Maximize,
  Minimize,
  PanelRight,
  StickyNote,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type * as PdfJsModule from "pdfjs-dist";
import type { PDFDocumentProxy, TextLayer as PdfTextLayer } from "pdfjs-dist";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  addPageAnnotation,
  deletePageAnnotation,
  editPageNote,
  saveViewerPosition,
} from "./actions";
import { PageList, type ViewerAnnotation } from "./page-list";
import { type PageSize, PdfPage } from "./pdf-page";
import {
  type Zoom,
  ZOOM_STEPS,
  clampPage,
  fitScale,
  pageHref,
  pagesToDraw,
  stepZoom,
} from "./pages";

/*
 * The original lecture viewer. The PDF is fetched once from MedOS's private
 * file address and rendered in the browser with pdf.js, whose worker is
 * served by MedOS itself. Only pages near the screen are drawn.
 *
 * pdf.js 6 evaluates no code; XFA forms are disabled, and the PDF's own
 * links and form fields are not made interactive, so a PDF cannot run code or
 * send the reader elsewhere.
 */

type PdfJs = typeof PdfJsModule;

let pdfjsModule: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsModule ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
    }
    return pdfjs;
  });
  return pdfjsModule;
}

const KIND_ADDED: Record<PageAnnotationKind, string> = {
  bookmark: "Page bookmarked.",
  note: "Note saved.",
  "review-later": "Page added to Review Later.",
};

export interface LectureViewerProps {
  resourceId: string;
  title: string;
  fileUrl: string;
  downloadUrl: string;
  /** This viewer's address without a page, for `?page=` links. */
  baseHref: string;
  pageCount: number;
  /** The page asked for in the address, if any. */
  initialPage: number | null;
  /** Where the user was last time, if not the first page. */
  savedPage: number | null;
  pagesWithoutText: readonly number[];
  annotations: readonly ViewerAnnotation[];
}

type NoteEditor =
  { mode: "create"; page: number } | { mode: "edit"; id: string; page: number; note: string };

export function LectureViewer({
  resourceId,
  title,
  fileUrl,
  downloadUrl,
  baseHref,
  pageCount,
  initialPage,
  savedPage,
  pagesWithoutText,
  annotations,
}: LectureViewerProps) {
  const [document_, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [textLayer, setTextLayer] = useState<typeof PdfTextLayer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Map<number, PageSize>>(new Map());
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState<Set<number>>(new Set([initialPage ?? 1]));
  const [current, setCurrent] = useState(initialPage ?? 1);
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  const [fullscreen, setFullscreen] = useState(false);
  const [resumeOffer, setResumeOffer] = useState(
    initialPage === null && savedPage !== null && savedPage > 1,
  );
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<NoteEditor | null>(null);
  const [draft, setDraft] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [panelOpen, setPanelOpen] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  // Whether the reader has moved from the page the viewer opened on.
  const moved = useRef(false);
  const messageTimer = useRef<number | undefined>(undefined);
  const noText = useMemo(() => new Set(pagesWithoutText), [pagesWithoutText]);

  const announce = useCallback((text: string) => {
    setMessage("");
    window.clearTimeout(messageTimer.current);
    window.setTimeout(() => setMessage(text), 30);
    messageTimer.current = window.setTimeout(() => setMessage(""), 5000);
  }, []);

  // Open the PDF once.
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        task = pdfjs.getDocument({
          url: fileUrl,
          enableXfa: false,
          disableRange: true,
          disableStream: true,
          disableAutoFetch: true,
        });
        const document = await task.promise;
        if (cancelled) return;
        const first = await document.getPage(1);
        const natural = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setSizes(new Map([[1, { width: natural.width, height: natural.height }]]));
        setTextLayer(() => pdfjs.TextLayer);
        setDocument(document);
      } catch {
        if (!cancelled) {
          setLoadError(
            "The lecture could not be opened. Reload the page to try again; the original file is kept.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileUrl]);

  // Follow the space available for "fit width".
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const baseSize = sizes.get(1) ?? { width: 612, height: 792 };
  const scale = zoom === "fit" ? fitScale(width - 32, baseSize.width) : zoom;
  const sizeOf = (page: number) => sizes.get(page) ?? baseSize;

  const onSize = useCallback((page: number, size: PageSize) => {
    setSizes((previous) => {
      const known = previous.get(page);
      if (known && known.width === size.width && known.height === size.height) return previous;
      const next = new Map(previous);
      next.set(page, size);
      return next;
    });
  }, []);

  // Which pages are near the screen, and which one the reader is on.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !document_) return;
    const shown = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) shown.add(page);
          else shown.delete(page);
        }
        setVisible(new Set(shown));
      },
      { root: element, rootMargin: "50% 0px" },
    );
    element.querySelectorAll<HTMLElement>("[data-page]").forEach((page) => observer.observe(page));

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const line = element.getBoundingClientRect().top + element.clientHeight * 0.3;
        let page = 1;
        for (const box of element.querySelectorAll<HTMLElement>("[data-page]")) {
          if (box.getBoundingClientRect().top <= line) page = Number(box.dataset.page);
          else break;
        }
        setCurrent(page);
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [document_, pageCount]);

  const goTo = useCallback(
    (page: number, { announcePage = true } = {}) => {
      const target = clampPage(page, pageCount);
      const element = scroller.current?.querySelector<HTMLElement>(`[data-page="${target}"]`);
      const container = scroller.current;
      if (!element || !container) return;
      // Measured on screen, so it holds whatever sits between the page and the scroller.
      const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTo({ top: container.scrollTop + offset - 12, behavior: "auto" });
      setCurrent(target);
      setPageInput(String(target));
      if (announcePage) announce(`Page ${target} of ${pageCount}`);
    },
    [announce, pageCount],
  );

  // Open at the page asked for, once the pages have their size.
  useEffect(() => {
    if (!document_ || placed.current) return;
    placed.current = true;
    if (initialPage && initialPage > 1) {
      window.requestAnimationFrame(() => goTo(initialPage, { announcePage: false }));
    }
  }, [document_, initialPage, goTo]);

  // Keep the address and the remembered position in step with the page.
  useEffect(() => {
    if (!document_) return;
    setPageInput((value) =>
      root.current?.contains(window.document.activeElement) &&
      window.document.activeElement?.id === "pdf-page-input"
        ? value
        : String(current),
    );
    const address = window.setTimeout(() => {
      window.history.replaceState(null, "", pageHref(baseHref, current));
    }, 250);
    // Opening the lecture is not a position: only save once the reader has moved,
    // so a page they meant to resume at is not overwritten by merely looking.
    if (current !== (initialPage ?? 1)) moved.current = true;
    const save = moved.current
      ? window.setTimeout(() => {
          void saveViewerPosition({ resourceId, page: current }).catch(() => undefined);
        }, 1500)
      : undefined;
    return () => {
      window.clearTimeout(address);
      window.clearTimeout(save);
    };
  }, [current, document_, baseHref, resourceId, initialPage]);

  // Keep the reading position when the zoom changes.
  const zoomTo = (next: Zoom) => {
    const page = current;
    setZoom(next);
    window.requestAnimationFrame(() => goTo(page, { announcePage: false }));
    announce(next === "fit" ? "Fit to width" : `Zoom ${Math.round(next * 100)}%`);
  };

  useEffect(() => {
    const onChange = () => setFullscreen(window.document.fullscreenElement === root.current);
    window.document.addEventListener("fullscreenchange", onChange);
    return () => window.document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
    else
      void root.current
        ?.requestFullscreen?.()
        .catch(() => announce("Fullscreen is not available here."));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (target.closest("input, textarea, select, [role=dialog]")) return;
    const actions: Record<string, () => void> = {
      ArrowRight: () => goTo(current + 1),
      PageDown: () => goTo(current + 1),
      ArrowLeft: () => goTo(current - 1),
      PageUp: () => goTo(current - 1),
      Home: () => goTo(1),
      End: () => goTo(pageCount),
      "+": () => zoomTo(stepZoom(scale, 1)),
      "=": () => zoomTo(stepZoom(scale, 1)),
      "-": () => zoomTo(stepZoom(scale, -1)),
      f: toggleFullscreen,
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const onPageSubmit = (event: FormEvent) => {
    event.preventDefault();
    const page = Number(pageInput);
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) goTo(page);
    else {
      setPageInput(String(current));
      announce(`Enter a page from 1 to ${pageCount}.`);
    }
  };

  const onPage = (kind: "bookmark" | "review-later") =>
    annotations.find((annotation) => annotation.kind === kind && annotation.page === current);
  const bookmark = onPage("bookmark");
  const later = onPage("review-later");

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await work();
      announce(result.ok ? success : (result.error ?? "This could not be saved."));
    });

  const toggle = (kind: "bookmark" | "review-later") => {
    const existing = kind === "bookmark" ? bookmark : later;
    if (existing) {
      run(
        () => deletePageAnnotation({ annotationId: existing.id }),
        kind === "bookmark" ? "Bookmark removed." : "Removed from Review Later.",
      );
    } else {
      run(() => addPageAnnotation({ resourceId, kind, page: current }), KIND_ADDED[kind]);
    }
  };

  const openEditor = (next: NoteEditor) => {
    setEditor(next);
    setDraft(next.mode === "edit" ? next.note : "");
    setEditorError(null);
  };

  const saveNote = () => {
    if (!editor || pending) return;
    if (!draft.trim()) {
      setEditorError("Write something in the note before saving it.");
      return;
    }
    startTransition(async () => {
      const result =
        editor.mode === "create"
          ? await addPageAnnotation({ resourceId, kind: "note", page: editor.page, note: draft })
          : await editPageNote({ annotationId: editor.id, note: draft });
      if (result.ok) {
        setEditor(null);
        announce("Note saved.");
      } else {
        setEditorError(result.error);
      }
    });
  };

  const removeAnnotation = (annotation: ViewerAnnotation) => {
    if (
      annotation.kind === "note" &&
      !window.confirm("Delete this note? Its text cannot be recovered.")
    ) {
      return;
    }
    run(() => deletePageAnnotation({ annotationId: annotation.id }), "Removed.");
  };

  const draw = pagesToDraw(visible, pageCount);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const iconButton =
    "flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40 aria-pressed:text-accent";

  const pageList = (onNavigate?: () => void) => (
    <PageList
      annotations={annotations}
      pageCount={pageCount}
      onGoTo={(page) => {
        onNavigate?.();
        window.setTimeout(() => goTo(page), onNavigate ? 50 : 0);
      }}
      onEdit={(annotation) =>
        openEditor({
          mode: "edit",
          id: annotation.id,
          page: annotation.page,
          note: annotation.note ?? "",
        })
      }
      onRemove={removeAnnotation}
    />
  );

  return (
    <div className="grid gap-6 @min-[63rem]:grid-cols-[minmax(0,1fr)_15rem]">
      <div
        ref={root}
        onKeyDown={onKeyDown}
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-subtle/50",
          fullscreen ? "h-screen rounded-none bg-canvas" : "h-[calc(100dvh-11rem)] min-h-[26rem]",
        )}
      >
        <div
          role="group"
          aria-label="Lecture viewer controls"
          className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5"
        >
          <button
            type="button"
            className={iconButton}
            aria-label="Previous page"
            onClick={() => goTo(current - 1)}
            disabled={current <= 1}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <form
            onSubmit={onPageSubmit}
            className="flex items-center gap-1.5 text-[13px] text-fg-muted"
          >
            <label htmlFor="pdf-page-input" className="sr-only">
              Page number
            </label>
            <input
              id="pdf-page-input"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => setPageInput(String(current))}
              inputMode="numeric"
              className="h-8 w-12 rounded-md border border-border-strong bg-surface text-center text-[13px] text-fg tabular-nums focus:border-accent focus:outline-none"
            />
            <span className="tabular-nums">of {pageCount}</span>
          </form>
          <button
            type="button"
            className={iconButton}
            aria-label="Next page"
            onClick={() => goTo(current + 1)}
            disabled={current >= pageCount}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            className={iconButton}
            aria-label="Zoom out"
            onClick={() => zoomTo(stepZoom(scale, -1))}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <label htmlFor="pdf-zoom" className="sr-only">
            Zoom
          </label>
          <select
            id="pdf-zoom"
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(event) =>
              zoomTo(event.target.value === "fit" ? "fit" : Number(event.target.value))
            }
            className="h-8 rounded-md border border-border-strong bg-surface px-1.5 text-[13px] text-fg focus:border-accent focus:outline-none"
          >
            <option value="fit">Fit width</option>
            {ZOOM_STEPS.map((step) => (
              <option key={step} value={String(step)}>
                {Math.round(step * 100)}%
              </option>
            ))}
            {zoom !== "fit" && !(ZOOM_STEPS as readonly number[]).includes(zoom) ? (
              <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>
            ) : null}
          </select>
          <button
            type="button"
            className={iconButton}
            aria-label="Zoom in"
            onClick={() => zoomTo(stepZoom(scale, 1))}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize aria-hidden="true" className="size-4" />
            ) : (
              <Maximize aria-hidden="true" className="size-4" />
            )}
          </button>

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            className={iconButton}
            aria-pressed={bookmark !== undefined}
            aria-label={`Bookmark page ${current}`}
            title={bookmark ? "Remove bookmark" : "Bookmark this page"}
            onClick={() => toggle("bookmark")}
          >
            {bookmark ? (
              <BookmarkCheck aria-hidden="true" className="size-4" />
            ) : (
              <Bookmark aria-hidden="true" className="size-4" />
            )}
          </button>
          <button
            type="button"
            className={iconButton}
            aria-pressed={later !== undefined}
            aria-label={`Review page ${current} later`}
            title={later ? "Remove from Review Later" : "Review this page later"}
            onClick={() => toggle("review-later")}
          >
            <Clock aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={`Add note to page ${current}`}
            title="Add a note to this page"
            onClick={() => openEditor({ mode: "create", page: current })}
          >
            <StickyNote aria-hidden="true" className="size-4" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <a
              href={downloadUrl}
              download
              className={iconButton}
              aria-label={`Download original: ${title}`}
              title="Download the original file"
            >
              <Download aria-hidden="true" className="size-4" />
            </a>
            <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
              <DialogTrigger
                className={cn(iconButton, "@min-[63rem]:hidden")}
                aria-label="Pages and notes"
              >
                <PanelRight aria-hidden="true" className="size-4" />
              </DialogTrigger>
              <DialogContent
                placement="right"
                closeLabel="Close pages and notes"
                className="p-5 pt-6"
              >
                <DialogTitle className="mb-4">Pages and notes</DialogTitle>
                <DialogDescription className="sr-only">
                  Your bookmarks, notes and Review Later pages in this lecture.
                </DialogDescription>
                {pageList(() => setPanelOpen(false))}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {resumeOffer ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-accent-soft/60 px-3 py-2 text-[13px] text-fg">
            <span>You were on page {savedPage} last time.</span>
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => {
                setResumeOffer(false);
                if (savedPage) goTo(savedPage);
              }}
            >
              Resume at page {savedPage}
            </button>
            <button
              type="button"
              className="text-fg-muted hover:text-fg"
              onClick={() => setResumeOffer(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div
          ref={scroller}
          tabIndex={0}
          aria-label={`Pages of ${title}`}
          role="region"
          data-viewer-ready={document_ ? "" : undefined}
          className="relative min-h-0 flex-1 overflow-auto px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {loadError ? (
            <p
              role="alert"
              className="mx-auto max-w-md rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg"
            >
              {loadError}
            </p>
          ) : !document_ ? (
            <p className="py-10 text-center text-sm text-fg-muted">Opening the lecture…</p>
          ) : (
            <div className="flex flex-col gap-5">
              {pages.map((page) => (
                <PdfPage
                  key={page}
                  document={document_}
                  textLayer={textLayer}
                  number={page}
                  pageCount={pageCount}
                  scale={scale}
                  size={sizeOf(page)}
                  draw={draw.has(page)}
                  hasText={!noText.has(page)}
                  onSize={onSize}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <aside aria-label="Pages and notes" className="hidden @min-[63rem]:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6">
          {pageList()}
        </div>
      </aside>

      <p
        role="status"
        aria-live="polite"
        className={
          message
            ? "fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm text-fg shadow-lg"
            : "sr-only"
        }
      >
        {message}
      </p>

      <Dialog open={editor !== null} onOpenChange={(open) => (open ? null : setEditor(null))}>
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {editor?.mode === "edit" ? "Edit note" : "Add note"}
            {editor ? ` · page ${editor.page}` : null}
          </DialogTitle>
          <DialogDescription>
            Your note is private and is kept beside the lecture page.
          </DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveNote();
            }}
          >
            <label htmlFor="pdf-note" className="block text-sm font-medium text-fg">
              Note
            </label>
            <textarea
              id="pdf-note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              maxLength={10_000}
              aria-describedby={editorError ? "pdf-note-error" : undefined}
              aria-invalid={editorError ? true : undefined}
              className="block w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-fg focus:border-accent focus:outline-none"
            />
            {editorError ? (
              <p id="pdf-note-error" role="alert" className="text-sm text-danger">
                {editorError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" aria-disabled={pending || undefined}>
                Save note
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
