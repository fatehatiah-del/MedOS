import { Notice } from "@medos/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { courseHref } from "@/config/navigation";
import { lectureHref, mcqHref } from "@/features/courses/progress";
import { ExamRunner } from "@/features/mcq/exam-runner";
import { type AnsweredQuestion, LearnRunner } from "@/features/mcq/learn-runner";
import { ResultsView } from "@/features/mcq/results";
import { MODE_LABELS } from "@/features/mcq/selection";
import {
  buildResults,
  feedbackFor,
  sessionQuestions,
  toClientQuestion,
} from "@/features/mcq/views";
import { getWorkspace } from "@/server/workspace";

interface SessionPageProps {
  params: Promise<{ courseSlug: string; lectureId: string; resourceId: string; sessionId: string }>;
}

/**
 * The user's own session on that quiz of that lecture and course, or "not
 * found" for anything else. In progress it shows the runner; afterwards, the
 * results. Answers reach the browser only after answering or submitting.
 */
async function loadSession(
  courseSlug: string,
  lectureId: string,
  resourceId: string,
  sessionId: string,
) {
  const { scope } = await getWorkspace();
  const detail = await scope.lectures.detail(lectureId);
  if (!detail || detail.course.slug !== courseSlug) notFound();
  const quiz = await scope.mcq.get(resourceId);
  if (!quiz || quiz.lectureId !== detail.lecture.id) notFound();
  const view = await scope.mcq.sessions.get(sessionId);
  if (!view || view.session.resourceId !== resourceId) notFound();
  return { detail, quiz, view };
}

export async function generateMetadata({ params }: SessionPageProps): Promise<Metadata> {
  const { courseSlug, lectureId, resourceId, sessionId } = await params;
  const { detail, view } = await loadSession(courseSlug, lectureId, resourceId, sessionId);
  return { title: `${MODE_LABELS[view.session.mode]} · MCQ · ${detail.course.shortName}` };
}

export default async function McqSessionPage({ params }: SessionPageProps) {
  const { courseSlug, lectureId, resourceId, sessionId } = await params;
  const { detail, quiz, view } = await loadSession(courseSlug, lectureId, resourceId, sessionId);
  const { lecture, week, course } = detail;
  const { session, attempts } = view;
  const modeLabel = MODE_LABELS[session.mode];
  const quizHref = mcqHref(course.slug, lecture.id, resourceId);
  const questions = sessionQuestions(quiz.set, session);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: course.shortName, href: courseHref(course.slug) },
            { label: `Week ${week.number}` },
            { label: lecture.title, href: lectureHref(course.slug, lecture.id) },
            { label: "MCQ", href: quizHref },
            { label: modeLabel },
          ]}
        />
        <h1 className="font-serif text-[1.5rem] leading-tight font-semibold text-fg sm:text-[1.75rem]">
          {quiz.set.title ?? quiz.originalFilename} · {modeLabel}
        </h1>
        {questions.length < session.questions.length ? (
          <Notice tone="warning" title="Some questions are no longer in the quiz.">
            The file was imported again and {session.questions.length - questions.length}{" "}
            question(s) of this session are no longer in it.
          </Notice>
        ) : null}
      </header>

      {session.status === "discarded" ? (
        <Notice title="This exam was discarded.">
          It does not count in your results.{" "}
          <Link href={quizHref} className="font-medium text-accent hover:underline">
            Start another session
          </Link>
          .
        </Notice>
      ) : session.status === "submitted" ? (
        <>
          <ResultsView
            results={buildResults(quiz.set, session, attempts)}
            resourceId={resourceId}
            modeLabel={modeLabel}
          />
          <Link
            href={quizHref}
            className="inline-block text-sm font-medium text-accent hover:underline"
          >
            Practise again
          </Link>
        </>
      ) : session.mode === "learn" ? (
        <LearnRunner
          sessionId={session.id}
          resourceId={resourceId}
          questions={questions.map(toClientQuestion)}
          answered={Object.fromEntries(
            attempts.flatMap((attempt): [string, AnsweredQuestion][] => {
              const question = questions.find((candidate) => candidate.key === attempt.questionKey);
              return question && attempt.selectedOption !== null
                ? [
                    [
                      attempt.questionKey,
                      {
                        selected: attempt.selectedOption,
                        feedback: feedbackFor(question, attempt.selectedOption),
                      },
                    ],
                  ]
                : [];
            }),
          )}
        />
      ) : (
        <ExamRunner
          sessionId={session.id}
          resourceId={resourceId}
          modeLabel={modeLabel}
          questions={questions.map(toClientQuestion)}
          draft={session.draft}
          startedAt={session.startedAt.toISOString()}
          timeLimitSeconds={session.timeLimitSeconds}
          serverNow={new Date().toISOString()}
        />
      )}
    </div>
  );
}
