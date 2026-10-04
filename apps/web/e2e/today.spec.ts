import {
  CURRENT_SEMESTER,
  COURSES,
  type IsoDate,
  availableMinutesFor,
  formatDate,
  formatMinutes,
  semesterWeekFor,
  universityEvents,
} from "@medos/shared";

import { expect, test } from "./support/test";

/*
 * Today shows the real campus date and the day's real Group A schedule, so
 * the expectations are worked out from the same university calendar data for
 * whatever day the tests run on. The study plan is still a fixture.
 */

const ZONE = CURRENT_SEMESTER.timeZone;
const local = (instant: Date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}` as IsoDate,
    time: `${parts.hour}:${parts.minute}`,
  };
};
const today = local(new Date()).date;
const todaysSessions = universityEvents().filter(
  (event) => !event.allDay && local(event.startsAt).date === today,
);

test.describe("Today", () => {
  test("presents the dashboard sections in priority order", async ({ page, isMobile }) => {
    await page.goto("/today");

    const week = semesterWeekFor(today);
    const dateLabel = formatDate(today, { weekday: true });
    await expect(page.getByText(week ? `${dateLabel} · Week ${week}` : dateLabel)).toBeVisible();
    // Everything on Today is the user's own data now: no development notice.
    await expect(page.getByText("Development preview")).toHaveCount(0);

    const regions = page.getByRole("region");
    await expect(regions).toHaveCount(6);
    const layout = await regions.evaluateAll((elements) =>
      elements.map((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const box = element.getBoundingClientRect();
        return {
          name: labelledBy ? (document.getElementById(labelledBy)?.textContent ?? "") : "",
          left: Math.round(box.left),
          top: Math.round(box.top),
        };
      }),
    );
    const byTop = (items: typeof layout) =>
      [...items].sort((a, b) => a.top - b.top).map((item) => item.name);

    if (isMobile) {
      // One column: the specified priority order, top to bottom.
      expect(byTop(layout)).toEqual([
        "Today's university schedule",
        "Recommended study plan",
        "Today's progress",
        "Due for review",
        "Courses",
        "Exam periods",
      ]);
    } else {
      // Two columns: what to do on the left, status on the right.
      const leftEdge = Math.min(...layout.map((item) => item.left));
      expect(byTop(layout.filter((item) => item.left === leftEdge))).toEqual([
        "Today's university schedule",
        "Recommended study plan",
        "Due for review",
      ]);
      expect(byTop(layout.filter((item) => item.left !== leftEdge))).toEqual([
        "Today's progress",
        "Courses",
        "Exam periods",
      ]);
    }
  });

  test("shows the real schedule, the plan and progress", async ({ page }) => {
    await page.goto("/today");

    const schedule = page.getByRole("region", { name: "Today's university schedule" });
    if (todaysSessions.length === 0) {
      await expect(schedule).toContainText("No university activity today");
    } else {
      await expect(schedule.getByRole("listitem")).toHaveCount(todaysSessions.length);
      for (const session of todaysSessions) {
        await expect(schedule).toContainText(
          `${local(session.startsAt).time}–${local(session.endsAt).time}`,
        );
        const course = COURSES.find((entry) => entry.id === session.courseId);
        await expect(schedule).toContainText(course?.name ?? "");
      }
    }

    // The real plan, suggested from this account's own study (its contents are tested on the Study Plan).
    const plan = page.getByRole("region", { name: "Recommended study plan" });
    await expect(plan.getByRole("link", { name: "Open the Study Plan" })).toBeVisible();

    // Study time is real (the study timer), not part of the fixture; this account has none.
    const progress = page.getByRole("progressbar", { name: "Study time today" });
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await expect(progress).toHaveAttribute(
      "aria-valuetext",
      `0m of ${formatMinutes(availableMinutesFor(today))}`,
    );

    const exams = page.getByRole("region", { name: "Exam periods" });
    if (today < "2026-11-19") await expect(exams).toContainText("12–18 November 2026");
    await expect(exams).toContainText("18–29 January 2027");
  });

  test("links to each of the six courses", async ({ page }) => {
    await page.goto("/today");
    const courses = page.getByRole("region", { name: "Courses" });
    await expect(courses.getByRole("link")).toHaveCount(6);
    await courses.getByRole("link", { name: "Communication Skills" }).click();
    await expect(page).toHaveURL(/\/courses\/communication-skills$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Communication Skills" }),
    ).toBeVisible();
  });
});
