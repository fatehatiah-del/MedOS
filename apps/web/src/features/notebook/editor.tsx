"use client";

import type { NotebookView } from "@medos/database";
import { cn } from "@medos/ui";
import {
  type Editor,
  EditorContent,
  type JSONContent,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import {
  Bold,
  Check,
  ChevronDown,
  CloudOff,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareDashed,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { CALLOUT_STYLES } from "@/features/study-guide/callouts";

import { saveLectureNotebook } from "./actions";
import { NOTEBOOK_CALLOUTS, isSafeHref } from "./document";
import { notebookExtensions } from "./extensions";

/*
 * The lecture notebook editor. Notes are written in the Study Guide's own
 * typography (serif headings, the reader's body text, its tables and callout
 * boxes) and saved automatically a moment after typing stops.
 *
 * A save names the revision it was based on; if the notes were changed in
 * another tab meanwhile, nothing is overwritten and the user chooses which
 * version to keep. Until a save succeeds, the latest text is also kept in
 * this browser, so a closed tab or a lost connection never loses notes.
 */

const SAVE_DELAY = 800;
const RETRY_DELAY = 5000;

const HIGHLIGHTS = [
  { label: "Yellow", color: "var(--highlight)" },
  { label: "Green", color: "var(--success-soft)" },
  { label: "Blue", color: "var(--accent-soft)" },
  { label: "Pink", color: "var(--danger-soft)" },
  { label: "Violet", color: "var(--violet-soft)" },
];

type Status =
  | { kind: "saved"; at: Date | null }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; current: NotebookView };

interface Draft {
  content: JSONContent;
  baseRevision: number;
}

const draftKey = (lectureId: string) => `medos:notebook-draft:${lectureId}`;

function readDraft(lectureId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(lectureId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(lectureId: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(lectureId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(lectureId));
  } catch {
    // The server copy is what counts; the draft is a safety net only.
  }
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export interface NotebookEditorProps {
  lectureId: string;
  initial: NotebookView;
  /** "pane" beside the Study Guide, or "page" on its own. */
  variant: "pane" | "page";
  onReady?: (editor: Editor | null) => void;
  placeholder?: string;
}

export function NotebookEditor({
  lectureId,
  initial,
  variant,
  onReady,
  placeholder = "Write your notes. Select text in the Study Guide and choose “To notebook” to quote it here.",
}: NotebookEditorProps) {
  const [status, setStatus] = useState<Status>({ kind: "saved", at: initial.updatedAt });
  // Notes left in this browser by a save that never arrived: restored at once
  // if they were based on the notes as saved now, otherwise offered.
  const [recovered] = useState(() => {
    const draft = readDraft(lectureId);
    if (!draft) return { restore: null, older: null };
    if (JSON.stringify(draft.content) === JSON.stringify(initial.content)) {
      writeDraft(lectureId, null);
      return { restore: null, older: null };
    }
    return draft.baseRevision === initial.revision
      ? { restore: draft, older: null }
      : { restore: null, older: draft };
  });
  const [olderDraft, setOlderDraft] = useState<Draft | null>(recovered.older);
  const revision = useRef(initial.revision);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveRef.current(), delay);
  }, []);

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed || !dirty.current) return;
    if (saving.current) {
      schedule(SAVE_DELAY);
      return;
    }
    saving.current = true;
    dirty.current = false;
    setStatus({ kind: "saving" });
    try {
      const result = await saveLectureNotebook({
        lectureId,
        content: JSON.stringify(editor.getJSON()),
        plainText: editor.getText({ blockSeparator: "\n" }),
        baseRevision: revision.current,
      });
      if (result.status === "saved") {
        revision.current = result.revision;
        if (dirty.current) {
          setStatus({ kind: "unsaved" });
          schedule(SAVE_DELAY);
        } else {
          writeDraft(lectureId, null);
          setStatus({ kind: "saved", at: new Date(result.updatedAt) });
        }
      } else if (result.status === "conflict") {
        dirty.current = true;
        setStatus({ kind: "conflict", current: result.current });
      } else {
        dirty.current = true;
        setStatus({
          kind: "error",
          message:
            result.status === "invalid" ? result.message : "This lecture could not be found.",
        });
      }
    } catch {
      // No connection, or the server did not answer: keep the draft and try again.
      dirty.current = true;
      setStatus({ kind: "offline" });
      schedule(RETRY_DELAY);
    } finally {
      saving.current = false;
    }
  }, [lectureId, schedule]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: notebookExtensions(placeholder),
    content: initial.content as JSONContent,
    editorProps: {
      attributes: {
        class: "nb-prose focus:outline-none",
        "aria-label": "Lecture notebook",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      dirty.current = true;
      setStatus((before) => (before.kind === "conflict" ? before : { kind: "unsaved" }));
      writeDraft(lectureId, { content: current.getJSON(), baseRevision: revision.current });
      schedule(SAVE_DELAY);
    },
  });

  // Hand the editor to the page, and recover notes that never reached the server.
  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    if (recovered.restore)
      editor.commands.setContent(recovered.restore.content, { emitUpdate: true });
    onReady?.(editor);
    return () => {
      // Leaving the page: send what is unsaved while the editor can still be read.
      void saveRef.current();
      onReady?.(null);
      editorRef.current = null;
    };
  }, [editor, recovered, onReady]);

  // Save before the page is hidden, and warn before leaving with unsaved notes.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void save();
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save]);

  const loadNewer = (current: NotebookView) => {
    if (!editor) return;
    revision.current = current.revision;
    editor.commands.setContent(current.content as JSONContent, { emitUpdate: false });
    dirty.current = false;
    writeDraft(lectureId, null);
    setStatus({ kind: "saved", at: current.updatedAt ? new Date(current.updatedAt) : null });
  };

  const keepMine = (current: NotebookView) => {
    revision.current = current.revision;
    dirty.current = true;
    void save();
  };

  return (
    <div className={cn("flex min-h-0 flex-col", variant === "pane" && "h-full")}>
      <Toolbar editor={editor} status={status} sticky={variant === "page"} />
      {status.kind === "conflict" ? (
        <Banner tone="warning">
          These notes were changed in another tab or on another device.
          <span className="mt-2 flex flex-wrap gap-2">
            <BannerButton onClick={() => loadNewer(status.current)}>
              Show the newer notes
            </BannerButton>
            <BannerButton onClick={() => keepMine(status.current)}>Keep what is here</BannerButton>
          </span>
        </Banner>
      ) : null}
      {status.kind === "error" ? <Banner tone="danger">{status.message}</Banner> : null}
      {olderDraft ? (
        <Banner tone="warning">
          Notes from an earlier visit were never saved.
          <span className="mt-2 flex flex-wrap gap-2">
            <BannerButton
              onClick={() => {
                editor?.commands.setContent(olderDraft.content, { emitUpdate: true });
                setOlderDraft(null);
              }}
            >
              Restore them
            </BannerButton>
            <BannerButton
              onClick={() => {
                writeDraft(lectureId, null);
                setOlderDraft(null);
              }}
            >
              Discard
            </BannerButton>
          </span>
        </Banner>
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1 cursor-text",
          variant === "pane" ? "overflow-y-auto px-5 pt-4 pb-24" : "px-1 pt-6 pb-32",
        )}
        onMouseDown={(event) => {
          // Clicking the empty space below the notes puts the cursor at their end.
          if (event.target === event.currentTarget) {
            event.preventDefault();
            editor?.chain().focus("end").run();
          }
        }}
      >
        <EditorContent editor={editor} className="mx-auto max-w-[44rem]" />
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "mx-3 mt-3 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed text-fg",
        tone === "warning"
          ? "border-warning/30 bg-warning-soft/70"
          : "border-danger/30 bg-danger-soft/70",
      )}
    >
      {children}
    </div>
  );
}

function BannerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-fg hover:bg-subtle"
    >
      {children}
    </button>
  );
}

function StatusText({ status }: { status: Status }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  let text: ReactNode;
  switch (status.kind) {
    case "saved":
      text = status.at ? (
        <>
          <Check aria-hidden="true" className="size-3.5" />
          Saved {TIME.format(status.at)}
        </>
      ) : (
        "Nothing written yet"
      );
      break;
    case "unsaved":
      text = "Editing…";
      break;
    case "saving":
      text = "Saving…";
      break;
    case "offline":
      text = (
        <>
          <CloudOff aria-hidden="true" className="size-3.5" />
          Offline · kept on this device
        </>
      );
      break;
    default:
      text = "Not saved";
  }
  return (
    <span
      aria-live="polite"
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-1 pl-2 text-[12px] whitespace-nowrap text-fg-subtle",
        (status.kind === "error" || status.kind === "conflict") && "text-danger",
      )}
    >
      {text}
    </span>
  );
}

function ToolButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
  shortcut,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

function Menu({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1 rounded-md px-1.5 text-[13px] text-fg-muted hover:bg-hover hover:text-fg"
      >
        {trigger}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full left-0 z-50 mt-1 min-w-44 animate-fade-in rounded-lg border border-border-strong bg-surface p-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg hover:bg-hover"
    >
      {children}
    </button>
  );
}

const BLOCKS = [
  { label: "Text", icon: Pilcrow, level: 0 },
  { label: "Heading 1", icon: Heading1, level: 1 },
  { label: "Heading 2", icon: Heading2, level: 2 },
  { label: "Heading 3", icon: Heading3, level: 3 },
] as const;

function Toolbar({
  editor,
  status,
  sticky,
}: {
  editor: Editor | null;
  status: Status;
  sticky: boolean;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            level: ([1, 2, 3] as const).find((level) => e.isActive("heading", { level })) ?? 0,
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            highlight: e.isActive("highlight"),
            link: e.isActive("link"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            task: e.isActive("taskList"),
            quote: e.isActive("blockquote"),
            callout: e.isActive("callout"),
            table: e.isActive("table"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });
  const block = BLOCKS.find((item) => item.level === (state?.level ?? 0)) ?? BLOCKS[0];
  const chain = () => editor!.chain().focus();
  const off = !editor || !state;

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link address", previous ?? "https://");
    if (href === null) return;
    if (href.trim() === "") {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isSafeHref(href.trim())) {
      window.alert("Links can go to web pages (https://…) or to a page in MedOS.");
      return;
    }
    chain().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        "z-10 flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-surface/95 px-2 py-1.5 backdrop-blur-md",
        sticky && "sticky top-14 rounded-t-xl border border-border",
      )}
    >
      <Menu
        label="Text style"
        trigger={
          <>
            <block.icon aria-hidden="true" className="size-4" />
            <span className="hidden w-[4.6rem] text-left sm:inline">{block.label}</span>
          </>
        }
      >
        {(close) =>
          BLOCKS.map((item) => (
            <MenuItem
              key={item.label}
              onClick={() => {
                if (item.level === 0) chain().setParagraph().run();
                else chain().toggleHeading({ level: item.level }).run();
                close();
              }}
            >
              <item.icon aria-hidden="true" className="size-4 text-fg-muted" />
              <span className={cn(item.level > 0 && "font-serif font-semibold")}>{item.label}</span>
            </MenuItem>
          ))
        }
      </Menu>
      <Divider />
      <ToolButton
        label="Bold"
        shortcut="Ctrl+B"
        icon={Bold}
        active={state?.bold}
        disabled={off}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolButton
        label="Italic"
        shortcut="Ctrl+I"
        icon={Italic}
        active={state?.italic}
        disabled={off}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolButton
        label="Underline"
        shortcut="Ctrl+U"
        icon={Underline}
        active={state?.underline}
        disabled={off}
        onClick={() => chain().toggleUnderline().run()}
      />
      <ToolButton
        label="Strikethrough"
        icon={Strikethrough}
        active={state?.strike}
        disabled={off}
        onClick={() => chain().toggleStrike().run()}
      />
      <Menu
        label="Highlight"
        trigger={
          <Highlighter
            aria-hidden="true"
            className={cn("size-4", state?.highlight && "text-accent")}
          />
        }
      >
        {(close) => (
          <>
            {HIGHLIGHTS.map((item) => (
              <MenuItem
                key={item.label}
                onClick={() => {
                  chain().setHighlight({ color: item.color }).run();
                  close();
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded border border-border"
                  style={{ background: item.color }}
                />
                {item.label}
              </MenuItem>
            ))}
            <MenuItem
              onClick={() => {
                chain().unsetHighlight().run();
                close();
              }}
            >
              <RemoveFormatting aria-hidden="true" className="size-4 text-fg-muted" />
              No highlight
            </MenuItem>
          </>
        )}
      </Menu>
      <ToolButton
        label="Inline code"
        icon={Code}
        active={state?.code}
        disabled={off}
        onClick={() => chain().toggleCode().run()}
      />
      <ToolButton label="Link" icon={Link2} active={state?.link} disabled={off} onClick={setLink} />
      <Divider />
      <ToolButton
        label="Bulleted list"
        icon={List}
        active={state?.bullet}
        disabled={off}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolButton
        label="Numbered list"
        icon={ListOrdered}
        active={state?.ordered}
        disabled={off}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolButton
        label="Checklist"
        icon={ListChecks}
        active={state?.task}
        disabled={off}
        onClick={() => chain().toggleTaskList().run()}
      />
      <ToolButton
        label="Quote"
        icon={Quote}
        active={state?.quote}
        disabled={off}
        onClick={() => chain().toggleBlockquote().run()}
      />
      <Menu
        label="Box"
        trigger={
          <SquareDashed
            aria-hidden="true"
            className={cn("size-4", state?.callout && "text-accent")}
          />
        }
      >
        {(close) => (
          <>
            {NOTEBOOK_CALLOUTS.map((item) => {
              const Icon = CALLOUT_STYLES[item.kind].icon;
              return (
                <MenuItem
                  key={item.kind}
                  onClick={() => {
                    chain().setCallout(item.kind).run();
                    close();
                  }}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4", CALLOUT_STYLES[item.kind].accent)}
                  />
                  {item.label}
                </MenuItem>
              );
            })}
            {state?.callout ? (
              <MenuItem
                onClick={() => {
                  chain().unsetCallout().run();
                  close();
                }}
              >
                <RemoveFormatting aria-hidden="true" className="size-4 text-fg-muted" />
                Remove box
              </MenuItem>
            ) : null}
          </>
        )}
      </Menu>
      <Menu
        label="Table"
        trigger={
          <Table2 aria-hidden="true" className={cn("size-4", state?.table && "text-accent")} />
        }
      >
        {(close) => {
          const run = (action: () => void) => () => {
            action();
            close();
          };
          return state?.table ? (
            <>
              <MenuItem onClick={run(() => chain().addRowAfter().run())}>Add row below</MenuItem>
              <MenuItem onClick={run(() => chain().addColumnAfter().run())}>
                Add column right
              </MenuItem>
              <MenuItem onClick={run(() => chain().deleteRow().run())}>Delete row</MenuItem>
              <MenuItem onClick={run(() => chain().deleteColumn().run())}>Delete column</MenuItem>
              <MenuItem onClick={run(() => chain().toggleHeaderRow().run())}>
                Toggle header row
              </MenuItem>
              <MenuItem onClick={run(() => chain().deleteTable().run())}>Delete table</MenuItem>
            </>
          ) : (
            <>
              <MenuItem
                onClick={run(() =>
                  chain().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
                )}
              >
                Table, 2 columns
              </MenuItem>
              <MenuItem
                onClick={run(() =>
                  chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
                )}
              >
                Table, 3 columns
              </MenuItem>
              <MenuItem
                onClick={run(() =>
                  chain().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run(),
                )}
              >
                Table, 4 columns
              </MenuItem>
            </>
          );
        }}
      </Menu>
      <ToolButton
        label="Divider line"
        icon={Minus}
        disabled={off}
        onClick={() => chain().setHorizontalRule().run()}
      />
      <Divider />
      <ToolButton
        label="Undo"
        shortcut="Ctrl+Z"
        icon={Undo2}
        disabled={!state?.canUndo}
        onClick={() => chain().undo().run()}
      />
      <ToolButton
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        icon={Redo2}
        disabled={!state?.canRedo}
        onClick={() => chain().redo().run()}
      />
      <StatusText status={status} />
    </div>
  );
}
