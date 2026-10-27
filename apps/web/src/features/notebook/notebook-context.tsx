"use client";

import type { Editor, JSONContent } from "@tiptap/react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

/*
 * The lecture notebook beside a Study Guide: whether it is open, and a way
 * for the reader to send it a passage. A passage sent while the notebook is
 * still loading waits until its editor is ready.
 */

export interface NotebookPassage {
  quote: string;
  /** The section it came from, as the reader shows it. */
  section: string | null;
}

interface NotebookContextValue {
  lectureId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  sendPassage: (passage: NotebookPassage) => void;
  /** Called by the editor once it is ready, and with null when it goes away. */
  registerEditor: (editor: Editor | null) => void;
}

const NotebookContext = createContext<NotebookContextValue | null>(null);

const OPEN_KEY = "medos:notebook-open";
const STORED_EVENT = "medos:stored-value";

function subscribeStored(onChange: () => void) {
  window.addEventListener(STORED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A small preference kept in this browser (whether the notebook is open, its
 * width). The server renders `fallback`; the stored value takes over once the
 * page is interactive. Storage may be unavailable, which leaves `fallback`.
 */
export function useStoredValue(key: string, fallback: string): [string, (next: string) => void] {
  const value = useSyncExternalStore(
    subscribeStored,
    () => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Remembering is a convenience only.
      }
      window.dispatchEvent(new Event(STORED_EVENT));
    },
    [key],
  );
  return [value, set];
}

function passageContent({ quote, section }: NotebookPassage): JSONContent[] {
  const quoted: JSONContent[] = [{ type: "paragraph", content: [{ type: "text", text: quote }] }];
  if (section) {
    quoted.push({
      type: "paragraph",
      content: [{ type: "text", text: `— ${section}`, marks: [{ type: "italic" }] }],
    });
  }
  return [{ type: "blockquote", content: quoted }, { type: "paragraph" }];
}

export function insertPassage(editor: Editor, passage: NotebookPassage) {
  const end = editor.state.doc.content.size;
  editor.chain().insertContentAt(end, passageContent(passage)).focus("end").scrollIntoView().run();
}

export function NotebookProvider({
  lectureId,
  children,
}: {
  lectureId: string;
  children: ReactNode;
}) {
  const [stored, store] = useStoredValue(OPEN_KEY, "0");
  const open = stored === "1";
  const editor = useRef<Editor | null>(null);
  const waiting = useRef<NotebookPassage[]>([]);

  const setOpen = useCallback((next: boolean) => store(next ? "1" : "0"), [store]);
  // Stable, so the editor is not handed over again each time the notebook opens or closes.
  const registerEditor = useCallback((next: Editor | null) => {
    editor.current = next;
    if (!next) return;
    for (const passage of waiting.current.splice(0)) insertPassage(next, passage);
  }, []);

  const value = useMemo<NotebookContextValue>(
    () => ({
      lectureId,
      open,
      setOpen,
      toggle: () => setOpen(!open),
      sendPassage: (passage) => {
        if (editor.current && !editor.current.isDestroyed) {
          insertPassage(editor.current, passage);
        } else {
          waiting.current.push(passage);
        }
        setOpen(true);
      },
      registerEditor,
    }),
    [lectureId, open, setOpen, registerEditor],
  );

  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}

/** The notebook beside the reader, or null on a page without one. */
export function useNotebook(): NotebookContextValue | null {
  return useContext(NotebookContext);
}
