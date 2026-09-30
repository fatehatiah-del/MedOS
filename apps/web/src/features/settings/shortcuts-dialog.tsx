"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Kbd,
} from "@medos/ui";
import { Keyboard } from "lucide-react";

const SHORTCUTS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ["Ctrl", "K"], action: "Open search" },
  { keys: ["Tab"], action: "Move to the next control" },
  { keys: ["Esc"], action: "Close a menu or dialog" },
];

export function ShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Keyboard aria-hidden="true" />
          View shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Available anywhere in MedOS.</DialogDescription>
        <dl className="mt-5 divide-y divide-border border-t border-border">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm text-fg">{shortcut.action}</dt>
              <dd className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
