"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from "@medos/ui";
import katex from "katex";
import { useMemo, useRef, useState } from "react";

import { MAX_FORMULA_LENGTH } from "./document";

/*
 * Writing or changing a formula. LaTeX on the left of the user's mind, the
 * typeset result right under it as they type, and buttons for the pieces
 * that are tedious to remember. KaTeX runs without `trust`, so a formula can
 * never contain a link or HTML.
 */

export interface FormulaRequest {
  /** Inline sits in the sentence; display is a centred line of its own. */
  display: boolean;
  latex: string;
  /** Set when changing a formula already in the notes. */
  pos?: number;
}

const SNIPPETS: { label: string; latex: string; title: string }[] = [
  { label: "a⁄b", latex: "\\frac{a}{b}", title: "Fraction" },
  { label: "√x", latex: "\\sqrt{x}", title: "Square root" },
  { label: "xⁿ", latex: "x^{n}", title: "Power" },
  { label: "xₙ", latex: "x_{n}", title: "Subscript" },
  { label: "×", latex: "\\times", title: "Times" },
  { label: "÷", latex: "\\div", title: "Divide" },
  { label: "±", latex: "\\pm", title: "Plus or minus" },
  { label: "≈", latex: "\\approx", title: "Approximately" },
  { label: "≤", latex: "\\le", title: "Less than or equal" },
  { label: "≥", latex: "\\ge", title: "Greater than or equal" },
  { label: "→", latex: "\\rightarrow", title: "Arrow" },
  { label: "⇌", latex: "\\rightleftharpoons", title: "Equilibrium" },
  { label: "↑", latex: "\\uparrow", title: "Increase" },
  { label: "↓", latex: "\\downarrow", title: "Decrease" },
  { label: "Δ", latex: "\\Delta", title: "Delta" },
  { label: "α", latex: "\\alpha", title: "Alpha" },
  { label: "β", latex: "\\beta", title: "Beta" },
  { label: "γ", latex: "\\gamma", title: "Gamma" },
  { label: "μ", latex: "\\mu", title: "Mu" },
  { label: "π", latex: "\\pi", title: "Pi" },
  { label: "σ", latex: "\\sigma", title: "Sigma" },
  { label: "Σ", latex: "\\sum_{i=1}^{n}", title: "Sum" },
  { label: "∫", latex: "\\int_{a}^{b}", title: "Integral" },
  { label: "log", latex: "\\log_{10}", title: "Logarithm" },
  { label: "[ ]", latex: "\\left[ x \\right]", title: "Concentration brackets" },
  { label: "text", latex: "\\text{word}", title: "Words inside a formula" },
];

const EXAMPLES = [
  {
    label: "Henderson–Hasselbalch",
    latex: "\\text{pH} = \\text{p}K_a + \\log_{10}\\frac{[\\text{A}^-]}{[\\text{HA}]}",
  },
  { label: "Clearance", latex: "C = \\frac{U \\times V}{P}" },
  { label: "Half-life", latex: "t_{1/2} = \\frac{0.693 \\times V_d}{CL}" },
  { label: "Fick", latex: "CO = \\frac{\\dot{V}O_2}{C_aO_2 - C_vO_2}" },
];

export function FormulaDialog({
  request,
  onClose,
  onSubmit,
  onDelete,
}: {
  request: FormulaRequest | null;
  onClose: () => void;
  onSubmit: (request: FormulaRequest) => void;
  onDelete: (request: FormulaRequest) => void;
}) {
  const [latex, setLatex] = useState("");
  const [display, setDisplay] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  // A new request starts from its own formula (state adjusted while rendering, not in an effect).
  const [shown, setShown] = useState<FormulaRequest | null>(null);
  if (request !== shown) {
    setShown(request);
    if (request) {
      setLatex(request.latex);
      setDisplay(request.display);
    }
  }

  const preview = useMemo(() => {
    if (!latex.trim()) return { html: "", error: null as string | null };
    try {
      return {
        html: katex.renderToString(latex, {
          displayMode: true,
          throwOnError: true,
          trust: false,
          strict: "ignore",
          maxExpand: 500,
        }),
        error: null,
      };
    } catch (error) {
      return {
        html: "",
        error:
          error instanceof Error
            ? error.message.replace(/^KaTeX parse error: /, "")
            : "Not readable",
      };
    }
  }, [latex]);

  const insertSnippet = (snippet: string) => {
    const element = input.current;
    if (!element) {
      setLatex((value) => value + snippet);
      return;
    }
    const start = element.selectionStart ?? latex.length;
    const end = element.selectionEnd ?? latex.length;
    const next = latex.slice(0, start) + snippet + latex.slice(end);
    setLatex(next);
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + snippet.length;
      element.setSelectionRange(caret, caret);
    });
  };

  const editing = request?.pos !== undefined;
  const submit = () => {
    if (!request || !latex.trim()) return;
    onSubmit({ ...request, latex: latex.trim(), display });
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{editing ? "Edit formula" : "Insert formula"}</DialogTitle>
        <DialogDescription>
          Written in LaTeX. Tip: type <code className="font-mono">$$x^2$$</code> straight in the
          notes for an inline formula.
        </DialogDescription>

        {editing ? null : (
          <div className="mt-4 inline-flex rounded-lg border border-border p-0.5 text-[13px]">
            {[
              { value: false, label: "In the line" },
              { value: true, label: "On its own line" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={display === option.value}
                onClick={() => setDisplay(option.value)}
                className={cn(
                  "h-7 rounded-md px-3 text-fg-muted hover:text-fg",
                  display === option.value && "bg-accent-soft text-accent",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1">
          {SNIPPETS.map((snippet) => (
            <button
              key={snippet.title}
              type="button"
              title={snippet.title}
              onClick={() => insertSnippet(snippet.latex)}
              className="h-7 min-w-8 rounded-md border border-border px-1.5 text-[13px] text-fg hover:bg-hover"
            >
              {snippet.label}
            </button>
          ))}
        </div>

        <textarea
          ref={input}
          autoFocus
          aria-label="Formula in LaTeX"
          value={latex}
          maxLength={MAX_FORMULA_LENGTH}
          onChange={(event) => setLatex(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit();
            }
          }}
          rows={3}
          spellCheck={false}
          placeholder="e.g. \frac{a}{b}"
          className="mt-3 w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-[13.5px] text-fg focus-visible:outline-2 focus-visible:outline-accent"
        />

        <div
          aria-live="polite"
          className="mt-3 flex min-h-16 items-center justify-center overflow-x-auto rounded-lg bg-subtle px-3 py-2 text-fg"
        >
          {preview.error ? (
            <span className="text-[13px] text-danger">{preview.error}</span>
          ) : preview.html ? (
            <span dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <span className="text-[13px] text-fg-subtle">The formula appears here.</span>
          )}
        </div>

        {editing ? null : (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-subtle">
            Examples:
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setLatex(example.latex)}
                className="rounded-md px-1.5 py-0.5 text-accent hover:bg-hover"
              >
                {example.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          {editing && request ? (
            <button
              type="button"
              onClick={() => onDelete(request)}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-danger hover:bg-danger-soft"
            >
              Delete formula
            </button>
          ) : null}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border-strong px-3 text-[13px] font-medium text-fg hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!latex.trim() || Boolean(preview.error)}
            onClick={submit}
            title="Ctrl+Enter"
            className="h-9 rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {editing ? "Update" : "Insert"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
