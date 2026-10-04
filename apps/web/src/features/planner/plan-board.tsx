"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlanItemView, StudyActivity } from "@medos/database";
import { formatMinutes } from "@medos/shared";
import { Badge, cn } from "@medos/ui";
import { ArrowRight, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

import { CourseMark } from "@/components/course-mark";
import { ACTIVITY_LABELS } from "@/features/timer/clock";
import { StartTimerButton } from "@/features/timer/start-timer-button";

import {
  postponePlanItem,
  removePlanItem,
  reorderPlanItems,
  setPlanItemDone,
  updatePlanItem,
} from "./actions";

/*
 * The day's plan as an ordered list the user owns. Items can be dragged, or
 * moved from the keyboard (focus the handle, Space to pick up, arrows to
 * move, Space to drop). Every change is saved at once; the list shows the
 * new order straight away and goes back if the save fails.
 */

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240];

export function PlanBoard({
  date,
  items: initial,
  editable,
}: {
  date: string;
  items: readonly PlanItemView[];
  /** False for past days: the plan is shown as it was. */
  editable: boolean;
}) {
  const [items, setItems] = useState<PlanItemView[]>(() => [...initial]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, startTransition] = useTransition();
  // Changes show at once and save in the background: leaving mid-save asks first.
  useEffect(() => {
    if (!saving) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (action: () => Promise<{ ok: boolean; error?: string }>, undo?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (!result.ok) {
          undo?.();
          setError(result.error ?? "That change could not be saved.");
        }
      } catch {
        undo?.();
        setError("MedOS could not be reached. Check your connection and try again.");
      }
    });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const before = items;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    const next = arrayMove(items, from, to);
    setItems(next);
    save(
      () => reorderPlanItems({ date, itemIds: next.map((item) => item.id) }),
      () => setItems(before),
    );
  };

  const titleOf = (id: string | number) => items.find((item) => item.id === id)?.title ?? "item";

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {message}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} is now at position ${items.findIndex((item) => item.id === over.id) + 1} of ${items.length}.`
                : `${titleOf(active.id)} is no longer over the list.`,
            onDragEnd: ({ active, over }) =>
              over
                ? `${titleOf(active.id)} dropped at position ${items.findIndex((item) => item.id === over.id) + 1} of ${items.length}.`
                : `${titleOf(active.id)} dropped.`,
            onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
          },
          screenReaderInstructions: {
            draggable:
              "To move this item, press Space, use the arrow keys to choose its place, then press Space again. Press Escape to cancel.",
          },
        }}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol aria-label="Plan items" className="space-y-2">
            {items.map((item, index) => (
              <PlanRow
                key={item.id}
                item={item}
                position={index + 1}
                editable={editable}
                onDone={(done) => {
                  const before = items;
                  setItems(
                    items.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, status: done ? "done" : "planned" }
                        : entry,
                    ),
                  );
                  setMessage(done ? `${item.title} done.` : `${item.title} not done.`);
                  save(
                    () => setPlanItemDone({ itemId: item.id, done }),
                    () => setItems(before),
                  );
                }}
                onMinutes={(minutes) => {
                  const before = items;
                  setItems(
                    items.map((entry) => (entry.id === item.id ? { ...entry, minutes } : entry)),
                  );
                  save(
                    () => updatePlanItem({ itemId: item.id, minutes }),
                    () => setItems(before),
                  );
                }}
                onPostpone={() => {
                  const before = items;
                  setItems(items.filter((entry) => entry.id !== item.id));
                  setMessage(`${item.title} moved to tomorrow.`);
                  save(
                    () => postponePlanItem({ itemId: item.id }),
                    () => setItems(before),
                  );
                }}
                onRemove={() => {
                  const before = items;
                  setItems(items.filter((entry) => entry.id !== item.id));
                  setMessage(`${item.title} removed.`);
                  save(
                    () => removePlanItem({ itemId: item.id }),
                    () => setItems(before),
                  );
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PlanRow({
  item,
  position,
  editable,
  onDone,
  onMinutes,
  onPostpone,
  onRemove,
}: {
  item: PlanItemView;
  position: number;
  editable: boolean;
  onDone: (done: boolean) => void;
  onMinutes: (minutes: number) => void;
  onPostpone: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [why, setWhy] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editable });
  const done = item.status === "done";
  const durations = DURATIONS.includes(item.minutes)
    ? DURATIONS
    : [...DURATIONS, item.minutes].sort((a, b) => a - b);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border border-border bg-surface",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap">
        {editable ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move ${item.title}, position ${position}`}
            className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-fg-subtle hover:bg-hover hover:text-fg active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <input
          id={`${id}-done`}
          type="checkbox"
          checked={done}
          disabled={!editable}
          onChange={(change) => onDone(change.target.checked)}
          className="size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <div className="min-w-0 flex-1 basis-48">
          <label
            htmlFor={`${id}-done`}
            className={cn(
              "flex items-center gap-2 text-[15px] font-medium text-fg",
              done && "text-fg-muted line-through",
            )}
          >
            {item.course ? <CourseMark token={item.course.colorToken} /> : null}
            <span className="truncate">{item.title}</span>
          </label>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-[18px] text-[12.5px] text-fg-subtle">
            {item.course ? <span>{item.course.shortName}</span> : null}
            {item.source === "manual" ? <span>Added by you</span> : null}
            {item.source === "postponed" && item.postponedFrom ? <span>Postponed</span> : null}
            <button
              type="button"
              aria-expanded={why}
              aria-controls={`${id}-why`}
              onClick={() => setWhy(!why)}
              className="font-medium text-accent hover:underline"
            >
              Why?
            </button>
          </p>
        </div>
        <Badge className="hidden sm:inline-flex">
          {ACTIVITY_LABELS[item.activity as StudyActivity]}
        </Badge>
        <label htmlFor={`${id}-minutes`} className="sr-only">
          Minutes for {item.title}
        </label>
        <select
          id={`${id}-minutes`}
          value={item.minutes}
          disabled={!editable}
          onChange={(change) => onMinutes(Number(change.target.value))}
          className="h-8 rounded-lg border border-border-strong bg-surface px-1.5 text-[13px] text-fg tabular-nums focus:border-accent focus:outline-none"
        >
          {durations.map((value) => (
            <option key={value} value={value}>
              {formatMinutes(value)}
            </option>
          ))}
        </select>
        {editable && !done ? (
          <div className="flex items-center gap-1">
            <StartTimerButton
              activities={[item.activity as StudyActivity]}
              courseId={item.course?.id}
              lectureId={item.lecture?.id}
            />
            <button
              type="button"
              onClick={onPostpone}
              aria-label={`Postpone ${item.title} to tomorrow`}
              title="Postpone to tomorrow"
              className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-fg"
            >
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${item.title}`}
              title="Remove"
              className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover hover:text-danger"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
      {why ? (
        <div
          id={`${id}-why`}
          className="border-t border-border px-4 py-3 text-[13px] text-fg-muted"
        >
          {item.source === "manual" ? (
            <p>You added this item.</p>
          ) : (
            <>
              <ul className="list-disc space-y-0.5 pl-5">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {item.score !== null ? (
                <p className="mt-1.5 text-[12px] text-fg-subtle">
                  Priority {item.score}: the sum of the reasons above.
                  {item.postponedFrom ? ` Postponed from ${item.postponedFrom}.` : ""}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
