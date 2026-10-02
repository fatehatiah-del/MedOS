"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogPlacement = "center" | "left" | "right";

const placements: Record<DialogPlacement, string> = {
  center:
    "top-1/2 left-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 animate-pop-in",
  left: "inset-y-0 left-0 w-[min(20rem,calc(100vw-3rem))] border-r animate-slide-in-left",
  right:
    "inset-y-0 right-0 w-[min(22rem,calc(100vw-3rem))] overflow-y-auto border-l animate-slide-in-right",
};

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  /** `center` is a modal dialog; `left` is a navigation drawer; `right` is a side sheet. */
  placement?: DialogPlacement;
  /** Accessible label for the close button. */
  closeLabel?: string;
}

export function DialogContent({
  placement = "center",
  closeLabel = "Close",
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 border-border bg-surface text-fg shadow-lg focus:outline-none",
          placements[placement],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-150 hover:bg-hover hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 text-base font-semibold text-fg", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1.5 text-sm leading-relaxed text-fg-muted", className)}
      {...props}
    />
  );
}
