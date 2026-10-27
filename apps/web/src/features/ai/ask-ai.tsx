"use client";

import { CHAT_LIMITS, type ChatMessage } from "@medos/ai";
import { cn } from "@medos/ui";
import { ArrowUp, Check, Copy, RotateCcw, Sparkles, Square, TextQuote, X } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Ask AI: a button in the top bar of every page that opens a conversation
 * about what is on screen. Each question sends the page's visible text (and
 * any text the user selected, which takes priority) to MedOS, which passes it
 * to the configured provider. Answers are always labelled as AI-generated,
 * apart from the lecture material, and nothing is stored on the server; the
 * conversation lives in this tab and survives moving between pages.
 */

const MAIN_ID = "main-content";
const PANEL_ID = "ask-ai-panel";
const STORE_KEY = "medos:ask-ai";
export const ASK_AI_SHORTCUT = "Alt+Q";

const SUGGESTIONS = [
  "Explain this page simply",
  "What are the exam traps here?",
  "Summarise this in 5 bullet points",
  "Quiz me on this, one question at a time",
];

interface Turn extends ChatMessage {
  /** The page the question was asked on. */
  page?: string;
  /** A passage the question was about. */
  selection?: string | null;
  provider?: string;
  error?: boolean;
}

function readStore(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

function writeStore(turns: Turn[]) {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.slice(-40)));
  } catch {
    // Keeping the conversation across reloads is a convenience only.
  }
}

/** The visible text of the page, without the AI panel itself. */
function pageText(): string {
  const main = document.getElementById(MAIN_ID);
  return (main?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, CHAT_LIMITS.pageText);
}

const noSubscription = () => () => {};

function pageTitle(): string {
  return document.title.replace(/\s*·\s*MedOS\s*$/, "");
}

export function AskAI({
  configured,
  providerLabel,
}: {
  configured: boolean;
  providerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // The panel is drawn into the page body, which only exists in the browser.
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  // The conversation of this tab, restored after a reload. The panel is never
  // part of the server's HTML, so reading storage here cannot mismatch it.
  const [turns, setTurns] = useState<Turn[]>(() =>
    typeof window === "undefined" ? [] : readStore(),
  );
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Remember the latest text selected on the page (not in the panel).
  useEffect(() => {
    const onSelection = () => {
      const current = window.getSelection();
      const text = current?.toString().trim() ?? "";
      if (!text || !current?.anchorNode) return;
      const panel = document.getElementById(PANEL_ID);
      if (panel?.contains(current.anchorNode)) return;
      if (!document.getElementById(MAIN_ID)?.contains(current.anchorNode)) return;
      setSelection(text.slice(0, CHAT_LIMITS.selection));
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  // Alt+Q opens and closes the panel.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape" && open && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  // Focus moves into the panel when it opens, and back to the button only when it closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 30);
    else if (wasOpen.current) button.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns]);

  const update = useCallback((next: (before: Turn[]) => Turn[]) => {
    setTurns((before) => {
      const after = next(before);
      writeStore(after);
      return after;
    });
  }, []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy || !configured) return;
    const asked: Turn = { role: "user", content: text, page: pageTitle(), selection };
    const history = [...turns.filter((turn) => !turn.error), asked];
    update(() => [...history, { role: "assistant", content: "" }]);
    setDraft("");
    setSelection(null);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;

    const setAnswer = (patch: Partial<Turn>) =>
      update((before) => {
        const copy = [...before];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, ...patch };
        return copy;
      });

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          page: {
            title: pageTitle(),
            path: window.location.pathname,
            text: pageText(),
            selection: asked.selection ?? null,
          },
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok || !response.body) {
        setAnswer({
          content: (await response.text()) || "Ask AI is unavailable right now.",
          error: true,
        });
        return;
      }
      const provider = response.headers.get("x-ai-provider") ?? providerLabel;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setAnswer({ content: answer, provider });
      }
      if (!answer.trim())
        setAnswer({ content: "No answer came back. Try asking again.", error: true });
    } catch {
      if (controller.signal.aborted) {
        update((before) => {
          const last = before[before.length - 1];
          return last?.role === "assistant" && !last.content ? before.slice(0, -1) : before;
        });
      } else {
        setAnswer({ content: "The connection was lost. Try asking again.", error: true });
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(draft);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        title={`Ask AI about this page (${ASK_AI_SHORTCUT})`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors duration-150 sm:px-3",
          open
            ? "border-accent/40 bg-accent-soft text-accent"
            : "border-border-strong bg-surface text-fg shadow-xs hover:bg-subtle",
        )}
      >
        <Sparkles aria-hidden="true" className="size-4 text-accent" />
        <span className="hidden sm:inline">Ask AI</span>
        <span className="sr-only sm:hidden">Ask AI</span>
      </button>

      {mounted && open
        ? createPortal(
            <aside
              id={PANEL_ID}
              aria-label="Ask AI"
              className="fixed inset-y-0 right-0 z-50 flex w-full animate-slide-in-right flex-col border-l border-border bg-canvas shadow-lg sm:w-[28rem]"
            >
              <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                <Sparkles aria-hidden="true" className="size-4 text-accent" />
                <div className="min-w-0">
                  <h2 className="font-serif text-[1.05rem] leading-tight font-semibold text-fg">
                    Ask AI
                  </h2>
                  <p className="truncate text-[12px] text-fg-subtle">
                    {configured
                      ? `${providerLabel} · reads the page on your screen`
                      : "Not set up yet"}
                  </p>
                </div>
                {turns.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      abort.current?.abort();
                      update(() => []);
                    }}
                    title="Start a new conversation"
                    className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    New chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title={`Close (${ASK_AI_SHORTCUT})`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg",
                    turns.length === 0 && "ml-auto",
                  )}
                >
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">Close Ask AI</span>
                </button>
              </header>

              <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {!configured ? (
                  <div className="space-y-2 rounded-xl border border-border bg-surface p-4 text-[13.5px] leading-relaxed text-fg-muted">
                    <p className="font-medium text-fg">Ask AI needs an AI service.</p>
                    <p>
                      Add <code className="rounded bg-subtle px-1">AI_PROVIDER</code> (gemini or
                      deepseek) and <code className="rounded bg-subtle px-1">AI_API_KEY</code> to
                      the deployment&apos;s environment variables, then redeploy. Until then nothing
                      is sent anywhere.
                    </p>
                  </div>
                ) : turns.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-[13.5px] leading-relaxed text-fg-muted">
                      Ask anything about what is on your screen. Select text on the page first to
                      ask about that passage.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void ask(suggestion)}
                          className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-left text-[13px] text-fg hover:bg-subtle"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  turns.map((turn, index) => (
                    <TurnView
                      key={index}
                      turn={turn}
                      streaming={busy && index === turns.length - 1}
                    />
                  ))
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(draft);
                }}
                className="shrink-0 space-y-2 border-t border-border bg-surface px-3 pt-2.5 pb-3"
              >
                {selection ? (
                  <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft/60 px-2.5 py-1.5 text-[12.5px] text-fg">
                    <TextQuote
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-accent"
                    />
                    <span className="line-clamp-2 min-w-0 flex-1">
                      <span className="font-medium">About the selection: </span>
                      {selection}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelection(null)}
                      className="shrink-0 rounded p-0.5 text-fg-subtle hover:text-fg"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                      <span className="sr-only">Ask about the whole page instead</span>
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <label htmlFor="ask-ai-input" className="sr-only">
                    Your question
                  </label>
                  <textarea
                    id="ask-ai-input"
                    ref={input}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={!configured}
                    rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                    maxLength={CHAT_LIMITS.message}
                    placeholder={configured ? "Ask about this page…" : "Ask AI is not set up"}
                    className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-border-strong bg-canvas px-3 py-2 text-[14px] leading-snug text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-60"
                  />
                  {busy ? (
                    <button
                      type="button"
                      onClick={() => abort.current?.abort()}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-fg hover:bg-subtle"
                    >
                      <Square aria-hidden="true" className="size-4" />
                      <span className="sr-only">Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!configured || !draft.trim()}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                    >
                      <ArrowUp aria-hidden="true" className="size-4" />
                      <span className="sr-only">Ask</span>
                    </button>
                  )}
                </div>
                <p className="px-0.5 text-[11.5px] text-fg-subtle">
                  AI answers can be wrong. Check them against your lecture.
                </p>
              </form>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}

function TurnView({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  if (turn.role === "user") {
    return (
      <div className="ml-8 space-y-1">
        {turn.selection ? (
          <p className="line-clamp-2 border-l-2 border-accent/40 pl-2 text-[12px] text-fg-subtle">
            {turn.selection}
          </p>
        ) : null}
        <p className="rounded-xl rounded-br-sm bg-accent-soft px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-fg">
          {turn.content}
        </p>
        {turn.page ? (
          <p className="truncate text-right text-[11px] text-fg-subtle">On: {turn.page}</p>
        ) : null}
      </div>
    );
  }
  if (turn.error) {
    return (
      <p
        role="status"
        className="rounded-lg border border-danger/30 bg-danger-soft/60 px-3 py-2 text-[13px] text-fg"
      >
        {turn.content}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg-subtle">
        <Sparkles aria-hidden="true" className="size-3" />
        AI-generated{turn.provider ? ` · ${turn.provider}` : ""}
      </p>
      {turn.content ? (
        <div className="nb-prose ai-answer">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="tableWrapper">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {turn.content}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="flex items-center gap-1 text-[13px] text-fg-subtle" role="status">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
          Reading the page…
        </p>
      )}
      {turn.content && !streaming ? (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(turn.content).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-subtle hover:bg-hover hover:text-fg"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </div>
  );
}
