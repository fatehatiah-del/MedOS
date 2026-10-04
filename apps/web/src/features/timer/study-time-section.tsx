import { STUDY_ACTIVITIES, type UserScope } from "@medos/database";
import { CURRENT_SEMESTER, formatMinutes } from "@medos/shared";
import { Section } from "@medos/ui";

import { ACTIVITY_LABELS } from "./clock";
import { DeleteSessionButton } from "./delete-session-button";
import { StartTimerButton } from "./start-timer-button";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Activities a lecture's timer can be started for. */
const LECTURE_ACTIVITIES = STUDY_ACTIVITIES.filter((activity) => activity !== "other");

const minutesOf = (seconds: number) => formatMinutes(Math.floor(seconds / 60));

/**
 * A lecture's study time: the total by activity, the recent sessions, and a
 * way to start timing. Active time only; shown for information, it never
 * completes the lecture.
 */
export async function StudyTimeSection({
  scope,
  lectureId,
  courseId,
}: {
  scope: UserScope;
  lectureId: string;
  courseId: string;
}) {
  const [summary, recent] = await Promise.all([
    scope.studySessions.summary({ lectureId }),
    scope.studySessions.recent({ lectureId, limit: 8 }),
  ]);
  const byActivity = STUDY_ACTIVITIES.flatMap((activity) => {
    const seconds = summary.byActivity[activity];
    return seconds ? [{ activity, seconds }] : [];
  });

  return (
    <Section
      title="Study time"
      aside={
        <StartTimerButton
          activities={LECTURE_ACTIVITIES}
          lectureId={lectureId}
          courseId={courseId}
        />
      }
    >
      {summary.sessionCount === 0 ? (
        <p className="text-sm text-fg-muted">
          No study time recorded yet. Start the timer here or from the lecture&rsquo;s material.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            <span className="text-[22px] leading-none font-medium text-fg tabular-nums">
              {minutesOf(summary.totalSeconds)}
            </span>{" "}
            of active study
          </p>
          {byActivity.length > 0 ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
              {byActivity.map(({ activity, seconds }) => (
                <li key={activity}>
                  {ACTIVITY_LABELS[activity]}{" "}
                  <span className="text-fg tabular-nums">{minutesOf(seconds)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {recent.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {recent.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="text-fg">{ACTIVITY_LABELS[session.activity]}</span>
                    <span className="text-fg-subtle">{WHEN.format(session.startedAt)}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-[13px] text-fg tabular-nums">
                      {minutesOf(session.activeSeconds)}
                    </span>
                    <DeleteSessionButton
                      sessionId={session.id}
                      label={`${ACTIVITY_LABELS[session.activity]} session of ${WHEN.format(session.startedAt)}`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <p className="text-xs text-fg-subtle">
        Only active time counts: paused, idle and background time are left out. Study time never
        marks the lecture complete.
      </p>
    </Section>
  );
}
