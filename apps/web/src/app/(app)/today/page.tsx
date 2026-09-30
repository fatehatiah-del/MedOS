import { formatDate } from "@medos/shared";
import { PageHeader } from "@medos/ui";
import type { Metadata } from "next";

import { FixtureNotice } from "@/components/fixture-notice";
import { personalGreeting } from "@/features/auth/messages";
import { getTodayOverview } from "@/features/today/get-today-overview";
import {
  CoursesSection,
  DueReviewSection,
  ExamPeriodsSection,
  PlanSection,
  ProgressSection,
  ScheduleSection,
} from "@/features/today/sections";
import { summariseToday } from "@/features/today/summary";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Today" };

/*
 * Layout: one column on narrow workspaces, two on wide ones. In a single
 * column the sections follow the dashboard priority order (schedule, plan,
 * progress, due review, courses, exams) through `order-*`; in two columns the
 * wrappers become real columns and `order` no longer applies.
 */
const column = "contents @4xl:block @4xl:space-y-10";

export default async function TodayPage() {
  // Who is asking comes from the session. The schedule and plan below are still fixtures.
  const user = await requireUser();
  const today = await getTodayOverview();
  const summary = summariseToday(today);
  const dateLabel = formatDate(today.date, { weekday: true });

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow={summary.week ? `${dateLabel} · Week ${summary.week}` : dateLabel}
        title={personalGreeting(summary.greeting, user.displayName)}
      />

      {today.source === "fixture" ? <FixtureNotice /> : null}

      <div className="flex flex-col gap-10 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_300px] @4xl:gap-14">
        <div className={column}>
          <ScheduleSection schedule={today.schedule} className="order-1" />
          <PlanSection
            plan={today.plan}
            plannedMinutes={summary.plannedMinutes}
            className="order-2"
          />
          <DueReviewSection className="order-4" />
        </div>
        <div className={column}>
          <ProgressSection
            studiedMinutes={today.studiedMinutes}
            availableMinutes={summary.availableMinutes}
            className="order-3"
          />
          <CoursesSection className="order-5" />
          <ExamPeriodsSection periods={summary.examPeriods} className="order-6" />
        </div>
      </div>
    </div>
  );
}
