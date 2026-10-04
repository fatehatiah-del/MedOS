"use client";

import type { StudyActivity, StudySessionView } from "@medos/database";
import { formatClock } from "@medos/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@medos/ui";
import { ChevronDown, Pause, Play, Square, Timer } from "lucide-react";
import { useState } from "react";

import { ACTIVITY_LABELS, sessionLabel, spokenDuration, stateDot, stateText } from "./clock";
import { type StartRequest, useStudyTimer, useTimerSeconds } from "./timer-provider";

/*
 * Starts the study timer from where the user is studying, so the course,
 * lecture and activity are filled in. Nothing starts on its own: the timer
 * only runs after this is pressed. When the open timer is already for this
 * place, its time and controls are shown instead.
 */

export interface StartTimerButtonProps {
  /** One activity starts with a single press; several offer a choice. */
  activities: readonly StudyActivity[];
  courseId?: string;
  lectureId?: string;
  className?: string;
}

function matches(session: StudySessionView, props: StartTimerButtonProps): boolean {
  if (!props.activities.includes(session.activity)) return false;
  if (props.lectureId) return session.lecture?.id === props.lectureId;
  if (props.courseId) return session.course?.id === props.courseId && session.lecture === null;
  return session.course === null;
}

export function StartTimerButton(props: StartTimerButtonProps) {
  const { activities, courseId, lectureId, className } = props;
  const timer = useStudyTimer();
  const seconds = useTimerSeconds();
  const [conflict, setConflict] = useState<{
    open: StudySessionView;
    request: StartRequest;
  } | null>(null);
  const { session, pending } = timer;

  const start = async (activity: StudyActivity) => {
    const request = { activity, courseId: courseId ?? null, lectureId: lectureId ?? null };
    const result = await timer.start(request);
    if (result.status === "conflict") setConflict({ open: result.open, request });
  };

  if (session && matches(session, props)) {
    return (
      <div
        className={cn(
          "inline-flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-1.5",
          className,
        )}
      >
        <span className="flex items-center gap-2 text-[13px] text-fg">
          <span aria-hidden="true" className={cn("size-2 rounded-full", stateDot(session))} />
          <span className="font-medium tabular-nums" aria-hidden="true">
            {formatClock(seconds)}
          </span>
          <span className="sr-only">{spokenDuration(seconds)}</span>
          <span className="text-fg-muted">
            {ACTIVITY_LABELS[session.activity]} · {stateText(session)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => void (session.state === "running" ? timer.pause() : timer.resume())}
          >
            {session.state === "running" ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {session.state === "running" ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void timer.finish()}>
            <Square aria-hidden="true" />
            Finish
          </Button>
        </span>
      </div>
    );
  }

  return (
    <>
      {activities.length === 1 && activities[0] ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          className={className}
          onClick={() => void start(activities[0] as StudyActivity)}
        >
          <Timer aria-hidden="true" />
          Start timer
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" disabled={pending} className={className}>
              <Timer aria-hidden="true" />
              Start timer
              <ChevronDown aria-hidden="true" className="text-fg-subtle" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {activities.map((activity) => (
              <DropdownMenuItem key={activity} onSelect={() => void start(activity)}>
                {ACTIVITY_LABELS[activity]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
        {conflict ? (
          <DialogContent>
            <DialogTitle>A timer is already running</DialogTitle>
            <DialogDescription>
              {sessionLabel(conflict.open)} has {spokenDuration(conflict.open.activeSeconds)} on it.
              Only one timer runs at a time: finish it and save its time, then start timing{" "}
              {ACTIVITY_LABELS[conflict.request.activity]} here?
            </DialogDescription>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConflict(null)}>
                Keep the current timer
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={async () => {
                  const request = conflict.request;
                  setConflict(null);
                  await timer.start({ ...request, replaceOpen: true });
                }}
              >
                Finish it and start
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
