import { CURRENT_SEMESTER } from "@medos/shared";
import { Notice, Section } from "@medos/ui";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { lectureHref } from "@/features/courses/progress";
import {
  RATINGS,
  itemStatuses,
  practiceOrder,
  toClientItem,
} from "@/features/question-bank/recall";
import { RecallRunner } from "@/features/question-bank/recall-runner";
import { getWorkspace } from "@/server/workspace";
import { StartTimerButton } from "@/features/timer/start-timer-button";

interface QuestionBankPageProps {
  params: Promise<{ courseSlug: string; lectureId: string; resourceId: string }>;
  /** `item=q3` puts that question first (from the Review page). */
  searchParams: Promise<{ item?: string | string[] }>;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const RATING_LABEL = Object.fromEntries(RATINGS.map(({ rating, label }) => [rating, label]));

/** The user's question bank of that lecture and course, or "not found" for anything else. */
async function loadBank(courseSlug: string, lectureId: string, resourceId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const bank = await scope.questionBanks.get(resourceId);
  if (!bank || bank.lectureId !== detail.lecture.id) notFound();
  return { scope, detail, bank };
}

export async function generateMetadata({ params }: QuestionBankPageProps): Promise<Metadata> {
  const { courseSlug, lectureId, resourceId } = await params;
  const { detail, bank } = await loadBank(courseSlug, lectureId, resourceId);
  return { title: `${bank.bank.title ?? "Question Bank"} · ${detail.course.shortName}` };
}

export default async function QuestionBankPracticePage({
  params,
  searchParams,
}: QuestionBankPageProps) {
  const { courseSlug, lectureId, resourceId } = await params;
  const { item: requested } = await searchParams;
  const { scope, detail, bank } = await loadBank(courseSlug, lectureId, resourceId);
  const { lecture, week, course } = detail;

  const attempts = await scope.questionBanks.history(resourceId);
  const statuses = itemStatuses(bank.bank.items, attempts);
  const usual = practiceOrder(bank.bank.items, statuses);
  const first = typeof requested === "string" && usual.includes(requested) ? requested : null;
  const order = first ? [first, ...usual.filter((key) => key !== first)] : usual;
  const reviewLater = (await scope.review.questions.list(resourceId)).map(
    (entry) => entry.questionKey,
  );
  const byKey = new Map(bank.bank.items.map((item) => [item.key, item]));
  const practised = [...statuses.values()].filter((status) => status.attempts > 0).length;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lectureHref(course.slug, lecture.id) },
            { label: "Question Bank" },
          ]}
        />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-fg-subtle">
          <CourseMark token={course.colorToken} />
          <span>{course.name}</span>
          <span aria-hidden="true">·</span>
          <span>Week {week.number}</span>
          <span aria-hidden="true">·</span>
          <span>{lecture.title}</span>
          <span aria-hidden="true">·</span>
          <span>Question Bank</span>
        </p>
        <h1 className="font-serif text-[1.7rem] leading-tight font-semibold text-fg sm:text-[2rem]">
          {bank.bank.title ?? bank.originalFilename}
        </h1>
        <p className="text-[12.5px] text-fg-subtle">
          From {bank.originalFilename} · {bank.bank.items.length} questions · {practised} practised
        </p>
        <StartTimerButton
          activities={["question-bank"]}
          lectureId={lecture.id}
          courseId={course.id}
        />
        {!bank.current ? (
          <Notice tone="warning" icon={<TriangleAlert />} title="The file has changed.">
            These questions were read from an earlier version of the file. They are read again on
            the next sync.
          </Notice>
        ) : null}
      </header>

      <Section title="Active recall">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          Questions you have not practised come first, then those you last rated Again, then Hard,
          then the rest, longest ago first.
        </p>
        <RecallRunner
          resourceId={resourceId}
          reviewLater={reviewLater}
          items={order.flatMap((key) => {
            const item = byKey.get(key);
            return item ? [toClientItem(item)] : [];
          })}
        />
      </Section>

      <Section title="Your record">
        {attempts.length === 0 ? (
          <p className="text-sm text-fg-muted">No questions practised yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {bank.bank.items.map((item, position) => {
              const status = statuses.get(item.key);
              const own = attempts.filter(
                (attempt) => attempt.itemFingerprint === item.fingerprint,
              );
              if (!status || own.length === 0) return null;
              return (
                <li key={item.key} className="px-4 py-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg">
                      <span className="font-medium">Question {item.number ?? position + 1}</span>
                      <span className="text-fg-subtle">
                        {status.attempts} {status.attempts === 1 ? "time" : "times"}
                      </span>
                      <span className="text-fg-muted">
                        Last: {status.lastRating ? RATING_LABEL[status.lastRating] : "not rated"}
                      </span>
                    </summary>
                    <ol className="mt-2 space-y-1.5 pl-4 text-[13px] text-fg-muted">
                      {own.map((attempt) => (
                        <li key={attempt.id}>
                          {WHEN.format(attempt.revealedAt)} ·{" "}
                          {attempt.rating ? RATING_LABEL[attempt.rating] : "not rated"}
                          {attempt.typedAnswer ? (
                            <span className="block whitespace-pre-wrap text-fg">
                              “{attempt.typedAnswer}”
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-subtle">
          Practising never marks the lecture complete; only you do, on the lecture page.
        </p>
      </Section>
    </div>
  );
}
