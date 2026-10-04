"use client";

import type { StudyActivity } from "@medos/database";
import { formatClock } from "@medos/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@medos/ui";
import { BookOpen, Pause, Play, Square, Timer, Trash2 } from "lucide-react";
import Link from "next/link";

import { lectureHref } from "@/features/courses/progress";

import { ACTIVITY_LABELS, sessionLabel, spokenDuration, stateDot, stateText } from "./clock";
import { RecoveryDialog } from "./recovery-dialog";
import { useStudyTimer, useTimerSeconds } from "./timer-provider";

/*
 * The study timer in the top bar, on every page: the open session's time and
 * controls, or a way to start timing study that belongs to no lecture. It
 * also carries the announcements for screen readers and the recovery prompt.
 */

/** Activities that make sense without a lecture. */
const GENERAL_ACTIVITIES: StudyActivity[] = ["revision", "other"];

export const DISCARD_CONFIRMATION = "Discard this timer? The time on it will not be saved.";

export function TimerPill() {
  const timer = useStudyTimer();
  const seconds = useTimerSeconds();
  const { session, pending } = timer;

  return (
    <>
      <p role="status" className="sr-only">
        {timer.announcement}
      </p>
      {timer.error ? (
        <p role="alert" className="hidden max-w-56 text-[12px] leading-snug text-danger md:block">
          {timer.error}
        </p>
      ) : null}

      {!session ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Start a study timer"
            disabled={pending}
            className="flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
          >
            <Timer aria-hidden="true" className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuLabel>Start a timer</DropdownMenuLabel>
            {GENERAL_ACTIVITIES.map((activity) => (
              <DropdownMenuItem key={activity} onSelect={() => void timer.start({ activity })}>
                <Play aria-hidden="true" />
                {ACTIVITY_LABELS[activity]}
              </DropdownMenuItem>
            ))}
            <p className="px-2.5 pt-1 pb-1.5 text-[11.5px] leading-snug text-fg-subtle">
              To time a lecture, start the timer from the lecture or its material.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex h-8 items-center rounded-full border border-border bg-surface shadow-xs">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Study timer: ${sessionLabel(session)}. ${stateText(session)}, ${spokenDuration(seconds)}.`}
              className="flex h-full items-center gap-2 rounded-l-full pr-2 pl-3 transition-colors duration-150 hover:bg-hover"
            >
              <span aria-hidden="true" className={cn("size-2 rounded-full", stateDot(session))} />
              <span className="text-[13px] font-medium text-fg tabular-nums">
                {formatClock(seconds)}
              </span>
              <span className="hidden max-w-44 truncate text-[12.5px] text-fg-muted xl:inline">
                {sessionLabel(session)}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              <div className="space-y-0.5 px-2.5 pt-1.5 pb-2">
                <p className="text-[13px] font-medium text-fg">{sessionLabel(session)}</p>
                {session.course ? (
                  <p className="text-[12px] text-fg-subtle">{session.course.name}</p>
                ) : null}
                <p className="text-[12px] text-fg-muted">{stateText(session)}</p>
              </div>
              {session.lecture && session.course ? (
                <DropdownMenuItem asChild>
                  <Link href={lectureHref(session.course.slug, session.lecture.id)}>
                    <BookOpen aria-hidden="true" />
                    Go to lecture
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={pending} onSelect={() => void timer.finish()}>
                <Square aria-hidden="true" />
                Finish and save
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={() => {
                  if (window.confirm(DISCARD_CONFIRMATION)) void timer.discard();
                }}
              >
                <Trash2 aria-hidden="true" />
                Discard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            aria-label={session.state === "running" ? "Pause timer" : "Resume timer"}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (pending) return;
              void (session.state === "running" ? timer.pause() : timer.resume());
            }}
            className="flex h-full w-8 items-center justify-center rounded-r-full border-l border-border text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
          >
            {session.state === "running" ? (
              <Pause aria-hidden="true" className="size-3.5" />
            ) : (
              <Play aria-hidden="true" className="size-3.5" />
            )}
          </button>
        </div>
      )}

      <RecoveryDialog />
    </>
  );
}
