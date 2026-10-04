"use client";

import type { AnnotationKind } from "@medos/database";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@medos/ui";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

const noSubscription = () => () => {};

import { addFlashcardFromStudyGuide } from "@/features/flashcards/actions";
import { CardEditor } from "@/features/flashcards/card-editor";

import { addStudyGuideAnnotation, editStudyGuideNote, removeStudyGuideAnnotation } from "./actions";
import type { SelectionAnchor } from "./selection";
import type { ProgressSnapshot } from "./annotations";
import type { ReaderAnnotation } from "./reader-model";

/*
 * Shared state of the reader's interactive parts: the user's annotations (as
 * the server last rendered them), reading progress, the note editor, and a
 * live region that announces what happened. The Study Guide text itself is
 * server-rendered and never changed here; after a change the server renders
 * the page again with the marks in place.
 */

/** Where a new annotation points: a passage, or a whole section (unitPath null). */
export interface AnnotationTarget {
  sectionId: string | null;
  unitPath: string | null;
  start: number | null;
  end: number | null;
  quote: string | null;
}

type NoteEditor =
  | { mode: "create"; target: AnnotationTarget; quote: string }
  | { mode: "edit"; annotationId: string; note: string; quote: string };

const KIND_ADDED: Record<AnnotationKind, string> = {
  highlight: "Highlight added.",
  note: "Note saved.",
  bookmark: "Bookmark added.",
  "review-later": "Added to Review Later.",
};

interface ReaderState {
  resourceId: string;
  lectureHref: string;
  annotations: readonly ReaderAnnotation[];
  progress: ProgressSnapshot;
  setProgress: (progress: ProgressSnapshot) => void;
  pending: boolean;
  /** Saves an annotation. Resolves to whether it was saved. */
  annotate: (kind: AnnotationKind, target: AnnotationTarget) => Promise<boolean>;
  remove: (annotation: ReaderAnnotation) => Promise<boolean>;
  openNoteEditor: (editor: NoteEditor) => void;
  /** Opens the flashcard editor for a selected passage. Nothing is saved until the user saves. */
  openFlashcardEditor: (anchor: SelectionAnchor) => void;
  announce: (message: string) => void;
}

const ReaderContext = createContext<ReaderState | null>(null);

export function useReader(): ReaderState {
  const state = useContext(ReaderContext);
  if (!state) throw new Error("useReader must be used inside <ReaderProvider>.");
  return state;
}

const REMOVED: Record<AnnotationKind, string> = {
  highlight: "Highlight removed.",
  note: "Note deleted.",
  bookmark: "Bookmark removed.",
  "review-later": "Removed from Review Later.",
};

export function ReaderProvider({
  resourceId,
  lectureHref,
  annotations,
  initialProgress,
  children,
}: {
  resourceId: string;
  lectureHref: string;
  annotations: readonly ReaderAnnotation[];
  initialProgress: ProgressSnapshot;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<NoteEditor | null>(null);
  const [cardSource, setCardSource] = useState<SelectionAnchor | null>(null);
  const [draft, setDraft] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // False while server-rendered, true once the browser has made the reader interactive.
  const interactive = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const clearTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string) => {
    // Clearing first makes a repeated message be announced again.
    setMessage("");
    window.clearTimeout(clearTimer.current);
    window.setTimeout(() => setMessage(text), 30);
    clearTimer.current = window.setTimeout(() => setMessage(""), 5000);
  }, []);

  const annotate = useCallback(
    (kind: AnnotationKind, target: AnnotationTarget, note?: string) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const result = await addStudyGuideAnnotation({ resourceId, kind, ...target, note });
          announce(result.ok ? KIND_ADDED[kind] : result.error);
          resolve(result.ok);
        });
      }),
    [announce, resourceId],
  );

  const remove = useCallback(
    (annotation: ReaderAnnotation) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const result = await removeStudyGuideAnnotation({ annotationId: annotation.id });
          announce(result.ok ? REMOVED[annotation.kind] : result.error);
          resolve(result.ok);
        });
      }),
    [announce],
  );

  const openNoteEditor = useCallback((next: NoteEditor) => {
    setEditor(next);
    setDraft(next.mode === "edit" ? next.note : "");
    setEditorError(null);
  }, []);

  const saveNote = () => {
    if (!editor || pending) return;
    if (!draft.trim()) {
      setEditorError("Write something in the note before saving it.");
      return;
    }
    startTransition(async () => {
      const result =
        editor.mode === "create"
          ? await addStudyGuideAnnotation({
              resourceId,
              kind: "note",
              ...editor.target,
              note: draft,
            })
          : await editStudyGuideNote({ annotationId: editor.annotationId, note: draft });
      if (result.ok) {
        setEditor(null);
        announce("Note saved.");
      } else {
        setEditorError(result.error);
      }
    });
  };

  const value = useMemo<ReaderState>(
    () => ({
      resourceId,
      lectureHref,
      annotations,
      progress,
      setProgress,
      pending,
      annotate: (kind, target) => annotate(kind, target),
      remove,
      openNoteEditor,
      openFlashcardEditor: setCardSource,
      announce,
    }),
    [
      resourceId,
      lectureHref,
      annotations,
      progress,
      pending,
      annotate,
      remove,
      openNoteEditor,
      announce,
    ],
  );

  return (
    <ReaderContext.Provider value={value}>
      {children}
      {/* Marks when the reader's controls are live (used by the end-to-end tests). */}
      <span hidden data-reader-ready={interactive ? "" : undefined} />
      {/* Shown on screen too, so a failed save is never silent. */}
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
      <Dialog
        open={cardSource !== null}
        onOpenChange={(open) => (open ? null : setCardSource(null))}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>Create flashcard</DialogTitle>
          <DialogDescription>
            The answer starts as the passage you selected. Write the question, edit either side,
            then save. It goes into this lecture&apos;s deck.
          </DialogDescription>
          {cardSource ? (
            <div className="mt-4">
              <CardEditor
                initialBack={cardSource.quote}
                submitLabel="Save flashcard"
                onCancel={() => setCardSource(null)}
                onSave={async (card) => {
                  const result = await addFlashcardFromStudyGuide({
                    resourceId,
                    ...cardSource,
                    ...card,
                  });
                  if (result.ok) announce(`Flashcard saved to ${result.value.deckName}.`);
                  return result;
                }}
                onSaved={() => setCardSource(null)}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={editor !== null} onOpenChange={(open) => (open ? null : setEditor(null))}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{editor?.mode === "edit" ? "Edit note" : "Add note"}</DialogTitle>
          <DialogDescription>
            Your note is private and is kept beside the source text.
          </DialogDescription>
          {editor ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                saveNote();
              }}
            >
              <blockquote className="max-h-32 overflow-y-auto rounded-lg border-l-2 border-border-strong bg-subtle/60 px-3 py-2 text-[13.5px] leading-relaxed text-fg-muted">
                {editor.quote}
              </blockquote>
              <label htmlFor="sg-note" className="block text-sm font-medium text-fg">
                Note
              </label>
              <textarea
                id="sg-note"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                maxLength={10_000}
                aria-describedby={editorError ? "sg-note-error" : undefined}
                aria-invalid={editorError ? true : undefined}
                className="block w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-fg focus:border-accent focus:outline-none"
              />
              {editorError ? (
                <p id="sg-note-error" role="alert" className="text-sm text-danger">
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
          ) : null}
        </DialogContent>
      </Dialog>
    </ReaderContext.Provider>
  );
}
