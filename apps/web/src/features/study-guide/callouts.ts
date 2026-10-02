import type { SemanticKind } from "@medos/parsers/model";
import {
  Brain,
  Camera,
  CircleAlert,
  ClipboardCheck,
  Eye,
  KeyRound,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  NotebookText,
  Star,
  Stethoscope,
  Target,
  Telescope,
  TriangleAlert,
} from "lucide-react";

/*
 * How each semantic kind of study content looks. A kind is only ever set by
 * the parser when the source's own label names it; the label shown is always
 * the source's, verbatim. Colour is never the only signal: every kind also
 * has its own icon, and the label is text.
 */

export interface CalloutStyle {
  icon: LucideIcon;
  /** Box border and background. */
  box: string;
  /** Icon colour. */
  accent: string;
}

const TONES = {
  accent: { box: "border-accent/30 bg-accent-soft/60", accent: "text-accent" },
  success: { box: "border-success/30 bg-success-soft/70", accent: "text-success" },
  warning: { box: "border-warning/30 bg-warning-soft/70", accent: "text-warning" },
  danger: { box: "border-danger/30 bg-danger-soft/70", accent: "text-danger" },
  violet: { box: "border-violet/30 bg-violet-soft/70", accent: "text-violet" },
  teal: { box: "border-teal/30 bg-teal-soft/70", accent: "text-teal" },
  neutral: { box: "border-border-strong bg-subtle/60", accent: "text-fg-muted" },
} as const;

export const CALLOUT_STYLES: Record<SemanticKind, CalloutStyle> = {
  "big-picture": { icon: Telescope, ...TONES.accent },
  "learning-objectives": { icon: Target, ...TONES.accent },
  "key-concepts": { icon: KeyRound, ...TONES.accent },
  summary: { icon: ListChecks, ...TONES.accent },
  "detailed-notes": { icon: NotebookText, ...TONES.neutral },
  important: { icon: CircleAlert, ...TONES.warning },
  "exam-tip": { icon: Lightbulb, ...TONES.warning },
  "exam-trap": { icon: TriangleAlert, ...TONES.danger },
  "clinical-link": { icon: Stethoscope, ...TONES.success },
  "memory-hook": { icon: Brain, ...TONES.violet },
  "golden-points": { icon: Star, ...TONES.violet },
  "how-its-tested": { icon: ClipboardCheck, ...TONES.teal },
  "exam-snapshot": { icon: Camera, ...TONES.teal },
  "what-to-see": { icon: Eye, ...TONES.teal },
};

/** A box whose label names no known kind, or that has no label: plain and unadorned. */
export const PLAIN_CALLOUT = TONES.neutral;
