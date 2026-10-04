"use client";

import type { AnnotationKind, HubSource } from "@medos/database";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@medos/ui";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { CourseMark } from "@/components/course-mark";

import { practiseReviewQuestion, removeReviewItem } from "./actions";

/*
 * The annotation hub: every Review Later item, note, highlight and bookmark,
 * by kind, filterable by course, each with where it came from. Open goes to
 * the exact place; Remove (Done, for Review Later) deletes the item. Nothing
 * here changes a score or lecture completion.
 */

export interface HubEntry {
  id: string;
  source: HubSource;
  kind: AnnotationKind;
  excerpt: string;
  location: string | null;
  note: string | null;
  createdAt: string;
  resourceLabel: string;
  lectureTitle: string;
  weekNumber: number;
  course: { slug: string; shortName: string; colorToken: string | null };
  /** Where Open goes; null for an orphan or an MCQ. */
  href: string | null;
  /** For an MCQ: a one-question Learn session starts, then this session page opens. */
  practise: { resourceId: string; questionKey: string; sessionBase: string } | null;
}

export const HUB_TABS: readonly { kind: AnnotationKind; label: string; empty: string }[] = [
  {
    kind: "review-later",
    label: "Review later",
    empty:
      "Nothing saved for later. Mark Study Guide text, a lecture page, an MCQ or a Question Bank question to come back to it.",
  },
  {
    kind: "note",
    label: "Notes",
    empty: "No notes yet. Add them to Study Guide text or sections, or to lecture pages.",
  },
  {
    kind: "highlight",
    label: "Highlights",
    empty: "No highlights yet. Select Study Guide text and choose Highlight.",
  },
  {
    kind: "bookmark",
    label: "Bookmarks",
    empty: "No bookmarks yet. Bookmark Study Guide text, sections or lecture pages.",
  },
];

const SOURCE_LABEL: Record<HubSource, string> = {
  "study-guide": "Study Guide",
  "original-lecture": "Lecture",
  mcq: "MCQ",
  "question-bank": "Question Bank",
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  day: "numeric",
  month: "short",
});

function Entry({ entry }: { entry: HubEntry }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const orphaned = entry.href === null && entry.practise === null;
  const done = entry.kind === "review-later";
  const what = `${SOURCE_LABEL[entry.source]}: ${entry.excerpt.slice(0, 60)}`;

  const remove = () => {
    if (pending) return;
    if (
      entry.kind === "note" &&
      !window.confirm("Delete this note? Its text cannot be recovered.")
    ) {
      return;
    }
    startTransition(async () => {
      const result = await removeReviewItem({ source: entry.source, id: entry.id });
      if (!result.ok) setError(result.error);
    });
  };

  const practise = () => {
    if (!entry.practise || pending) return;
    const { resourceId, questionKey, sessionBase } = entry.practise;
    startTransition(async () => {
      const result = await practiseReviewQuestion({ resourceId, questionKey });
      if (result.ok) router.push(`${sessionBase}/${result.value.sessionId}`);
      else setError(result.error);
    });
  };

  return (
    <li className="space-y-2.5 rounded-xl border border-border bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-fg-subtle">
        <CourseMark token={entry.course.colorToken} />
        <span>{entry.course.shortName}</span>
        <span aria-hidden="true">·</span>
        <span>Week {entry.weekNumber}</span>
        <span aria-hidden="true">·</span>
        <span>{entry.lectureTitle}</span>
      </p>
      <p className="text-[12px] text-fg-muted">
        <span className="font-semibold text-fg-muted">{SOURCE_LABEL[entry.source]}</span>
        {entry.location ? ` · ${entry.location}` : null} · {entry.resourceLabel} · added{" "}
        {DAY.format(new Date(entry.createdAt))}
      </p>
      <p className="text-[14.5px] leading-relaxed text-fg">{entry.excerpt}</p>
      {entry.note ? (
        <p className="border-l-2 border-border-strong pl-3 text-[14px] leading-relaxed whitespace-pre-wrap text-fg-muted">
          {entry.note}
        </p>
      ) : null}
      {orphaned ? (
        <p className="text-[12.5px] text-warning">
          This is no longer in the current version of the file, so it cannot be opened.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {entry.href ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={entry.href} aria-label={`Open ${what}`}>
              <ExternalLink aria-hidden="true" /> Open
            </Link>
          </Button>
        ) : entry.practise ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={practise}
            aria-disabled={pending || undefined}
            aria-label={`Practise ${what}`}
          >
            <ExternalLink aria-hidden="true" /> Practise
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled aria-label={`Open ${what}`}>
            <ExternalLink aria-hidden="true" /> Open
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={remove}
          aria-disabled={pending || undefined}
          aria-label={`${done ? "Done with" : "Remove"} ${what}`}
        >
          {done ? <Check aria-hidden="true" /> : <Trash2 aria-hidden="true" />}{" "}
          {done ? "Done" : "Remove"}
        </Button>
        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ReviewHub({
  entries,
  courses,
  initialTab,
}: {
  entries: readonly HubEntry[];
  /** The user's courses, in order, for the filter. */
  courses: readonly { slug: string; name: string }[];
  initialTab: AnnotationKind;
}) {
  const [tab, setTab] = useState<AnnotationKind>(initialTab);
  const [course, setCourse] = useState("all");
  const courseFilter = useId();
  const shown = entries.filter((entry) => course === "all" || entry.course.slug === course);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as AnnotationKind)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Kind of item" className="flex-wrap">
          {HUB_TABS.map(({ kind, label }) => (
            <TabsTrigger key={kind} value={kind}>
              {label}{" "}
              <span className="ml-1 text-fg-subtle tabular-nums">
                {shown.filter((entry) => entry.kind === kind).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-2 text-[13px] text-fg-muted">
          <label htmlFor={courseFilter}>Course</label>
          <select
            id={courseFilter}
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            className="h-8 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-fg"
          >
            <option value="all">All courses</option>
            {courses.map(({ slug, name }) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {HUB_TABS.map(({ kind, empty }) => {
        const list = shown.filter((entry) => entry.kind === kind);
        return (
          <TabsContent key={kind} value={kind}>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-fg-muted">
                {course === "all" ? empty : "Nothing here for this course."}
              </p>
            ) : (
              <ul className="grid gap-3 @3xl:grid-cols-2">
                {list.map((entry) => (
                  <Entry key={`${entry.source}-${entry.id}`} entry={entry} />
                ))}
              </ul>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
