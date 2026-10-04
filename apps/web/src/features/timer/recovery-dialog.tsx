"use client";

import { CURRENT_SEMESTER } from "@medos/shared";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@medos/ui";
import { useState } from "react";

import { sessionLabel, spokenDuration } from "./clock";
import { useStudyTimer } from "./timer-provider";

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Shown when a running timer stopped hearing from the browser (the tab was
 * closed, the laptop slept). The time is counted only up to the last moment
 * the user was seen, and the user decides what happens next. Closing the
 * prompt leaves the decision for later; the top-bar timer still offers it.
 */
export function RecoveryDialog() {
  const timer = useStudyTimer();
  const { session, pending } = timer;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const open = session?.state === "interrupted" && dismissed !== session.id;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && session) setDismissed(session.id);
      }}
    >
      {session ? (
        <DialogContent>
          <DialogTitle>Your study timer was interrupted</DialogTitle>
          <DialogDescription>
            {sessionLabel(session)} was last active at {TIME.format(session.lastActiveAt)}.{" "}
            {spokenDuration(session.activeSeconds)} is counted up to then; the time since is not.
          </DialogDescription>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void timer.discard()}
            >
              Discard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => void timer.finish()}
            >
              Finish and save
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => void timer.resume()}
            >
              Resume timing
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
