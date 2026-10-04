"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  Input,
} from "@medos/ui";
import { Plus, RotateCcw, X } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { ACTIVITY_LABELS } from "@/features/timer/clock";

import {
  addPlanItem,
  clearPlanSuggestions,
  refreshStudyPlan,
  setStudyAvailability,
} from "./actions";

const selectClasses =
  "h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg focus:border-accent focus:outline-none";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (result.ok) onOk?.();
        else setError(result.error ?? "That change could not be saved.");
      } catch {
        setError("MedOS could not be reached. Check your connection and try again.");
      }
    });
  return { pending, error, run };
}

/** Add, refresh and clear: the day-level controls of the plan. */
export function PlanActions({
  date,
  courses,
}: {
  date: string;
  courses: readonly { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add item
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => refreshStudyPlan({ date }))}
        >
          <RotateCcw aria-hidden="true" />
          Refresh suggestions
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm("Remove every suggestion from this day's plan? Your own items stay.")
            ) {
              run(() => clearPlanSuggestions({ date }));
            }
          }}
        >
          <X aria-hidden="true" />
          Clear suggestions
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding ? (
          <DialogContent>
            <DialogTitle>Add to the plan</DialogTitle>
            <DialogDescription>
              Your own items are kept whatever the suggestions do.
            </DialogDescription>
            <AddItemForm date={date} courses={courses} onDone={() => setAdding(false)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function AddItemForm({
  date,
  courses,
  onDone,
}: {
  date: string;
  courses: readonly { id: string; name: string }[];
  onDone: () => void;
}) {
  const id = useId();
  const { pending, error, run } = useAction();
  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(
          () =>
            addPlanItem({
              date,
              title: String(data.get("title") ?? ""),
              activity: String(data.get("activity") ?? "other"),
              courseId: String(data.get("courseId") ?? "") || null,
              minutes: Number(data.get("minutes")),
            }),
          onDone,
        );
      }}
    >
      <Field label="What" htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} name="title" required maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Activity" htmlFor={`${id}-activity`}>
          <select
            id={`${id}-activity`}
            name="activity"
            className={selectClasses}
            defaultValue="revision"
          >
            {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course" htmlFor={`${id}-course`}>
          <select id={`${id}-course`} name="courseId" className={selectClasses} defaultValue="">
            <option value="">No course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Minutes" htmlFor={`${id}-minutes`}>
          <Input
            id={`${id}-minutes`}
            name="minutes"
            type="number"
            min={5}
            max={720}
            step={5}
            required
            defaultValue={30}
          />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          Add to plan
        </Button>
      </div>
    </form>
  );
}

const hoursOf = (minutes: number) => (minutes / 60).toString();

/** The study time available per day, in hours, editable. */
export function AvailabilityForm({
  weekdayMinutes,
  weekendMinutes,
}: {
  weekdayMinutes: number;
  weekendMinutes: number;
}) {
  const id = useId();
  const { pending, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const minutes = (name: string) => Math.round(Number(data.get(name)) * 60);
        setSaved(false);
        run(
          () =>
            setStudyAvailability({
              weekdayMinutes: minutes("weekday"),
              weekendMinutes: minutes("weekend"),
            }),
          () => setSaved(true),
        );
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weekdays (hours)" htmlFor={`${id}-weekday`}>
          <Input
            id={`${id}-weekday`}
            name="weekday"
            type="number"
            min={0}
            max={24}
            step={0.25}
            required
            defaultValue={hoursOf(weekdayMinutes)}
          />
        </Field>
        <Field label="Weekends (hours)" htmlFor={`${id}-weekend`}>
          <Input
            id={`${id}-weekend`}
            name="weekend"
            type="number"
            min={0}
            max={24}
            step={0.25}
            required
            defaultValue={hoursOf(weekendMinutes)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Save study time
        </Button>
        {saved ? (
          <p role="status" className="text-[13px] text-fg-muted">
            Saved. Refresh suggestions to fit a plan already made to it.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
