import { CURRENT_SEMESTER } from "@medos/shared";
import { Badge, Notice, Section } from "@medos/ui";
import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CourseMark } from "@/components/course-mark";
import { courseHref } from "@/config/navigation";
import { lectureHref, mcqHref } from "@/features/courses/progress";
import { DiscardButton } from "@/features/mcq/discard-button";
import { MODE_LABELS, isUsmleQuestion, quizTopics } from "@/features/mcq/selection";
import { StartForm } from "@/features/mcq/start-form";
import { buildResults } from "@/features/mcq/views";
import { AIAction } from "@/features/ai/ai-action";
import { aiConfigured } from "@/server/ai";
import { getWorkspace } from "@/server/workspace";

interface McqPageProps {
  params: Promise<{ courseSlug: string; lectureId: string; resourceId: string }>;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: CURRENT_SEMESTER.timeZone,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** The user's quiz of that lecture and course, or "not found" for anything else. */
async function loadQuiz(courseSlug: string, lectureId: string, resourceId: string) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const quiz = await scope.mcq.get(resourceId);
  if (!quiz || quiz.lectureId !== detail.lecture.id) notFound();
  return { scope, detail, quiz };
}

export async function generateMetadata({ params }: McqPageProps): Promise<Metadata> {
  const { courseSlug, lectureId, resourceId } = await params;
  const { detail, quiz } = await loadQuiz(courseSlug, lectureId, resourceId);
  return { title: `${quiz.set.title ?? "MCQ"} · ${detail.course.shortName}` };
}

export default async function McqPage({ params }: McqPageProps) {
  const { courseSlug, lectureId, resourceId } = await params;
  const { scope, detail, quiz } = await loadQuiz(courseSlug, lectureId, resourceId);
  const { lecture, week, course } = detail;
  const base = mcqHref(course.slug, lecture.id, resourceId);

  const sessions = await scope.mcq.sessions.list(resourceId);
  const history = await Promise.all(
    sessions.slice(0, 20).map(async (session) => {
      if (session.status !== "submitted") return { session, percent: null as number | null };
      const view = await scope.mcq.sessions.get(session.id);
      return {
        session,
        percent: view ? buildResults(quiz.set, view.session, view.attempts).percent : null,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lectureHref(course.slug, lecture.id) },
            { label: "MCQ" },
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
          <span>MCQ</span>
        </p>
        <h1 className="font-serif text-[1.7rem] leading-tight font-semibold text-fg sm:text-[2rem]">
          {quiz.set.title ?? quiz.originalFilename}
        </h1>
        {quiz.set.subtitle ? (
          <p className="text-[15px] text-fg-muted">{quiz.set.subtitle}</p>
        ) : null}
        <p className="text-[12.5px] text-fg-subtle">
          From {quiz.originalFilename} · {quiz.set.questions.length} questions
        </p>
        {!quiz.current ? (
          <Notice tone="warning" icon={<TriangleAlert />} title="The file has changed.">
            These questions were read from an earlier version of the file. They are read again on
            the next sync.
          </Notice>
        ) : null}
      </header>

      <Section title="Practise">
        <StartForm
          resourceId={resourceId}
          total={quiz.set.questions.length}
          usmleCount={quiz.set.questions.filter(isUsmleQuestion).length}
          topics={quizTopics(quiz.set)}
          sessionHref={`${base}/session/SESSION`}
        />
        <AIAction
          feature="generate-usmle-questions"
          configured={aiConfigured()}
          context={{ lectureId: lecture.id, resourceId }}
        />
      </Section>

      <Section title="Your sessions">
        {history.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No sessions yet. Each session and every answer is kept.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {history.map(({ session, percent }) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  <span className="font-medium">{MODE_LABELS[session.mode]}</span>
                  <span className="text-fg-subtle">{WHEN.format(session.startedAt)}</span>
                  <span className="text-fg-subtle">· {session.questions.length} questions</span>
                  {session.status === "submitted" && session.mode !== "learn" ? (
                    <Badge tone="accent">{percent}%</Badge>
                  ) : session.status === "submitted" ? (
                    <Badge tone="neutral">Finished</Badge>
                  ) : session.status === "discarded" ? (
                    <Badge tone="outline">Discarded</Badge>
                  ) : (
                    <Badge tone="warning">In progress</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {session.status === "in-progress" && session.mode !== "learn" ? (
                    <DiscardButton sessionId={session.id} />
                  ) : null}
                  {session.status !== "discarded" ? (
                    <Link
                      href={`${base}/session/${session.id}`}
                      className="text-[13px] font-medium text-accent hover:underline"
                    >
                      {session.status === "in-progress" ? "Resume" : "View results"}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-subtle">
          Practising never marks the lecture complete; only you do, on the lecture page.
        </p>
      </Section>
    </div>
  );
}
