"use client";

import type { WeeklyStudy } from "@medos/database";
import { formatMinutes } from "@medos/shared";
import { useId } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Study time per teaching week: one series, one hue, one axis. Bars are thin
 * with a rounded data end, the grid and axes stay quiet, every bar has a
 * tooltip, and the same numbers are available as a table for screen readers.
 * With nothing recorded there is no chart, only a sentence saying so.
 */

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dateLabel = (date: string) => SHORT.format(new Date(`${date}T00:00:00Z`));

export function WeeklyChart({
  weeks,
  currentWeek,
  label,
}: {
  weeks: readonly WeeklyStudy[];
  /** The week to mark as current, if the term is under way. */
  currentWeek: number | null;
  /** What the bars count, for the accessible description. */
  label: string;
}) {
  const id = useId();
  const total = weeks.reduce((sum, week) => sum + week.minutes, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No study recorded yet. Time from the study timer appears here, week by week.
      </p>
    );
  }
  // Show the term up to the current week (or all of it once it is over).
  const shown = currentWeek ? weeks.slice(0, Math.max(currentWeek, 1)) : weeks;
  const data = shown.map((week) => ({
    name: `W${week.week}`,
    minutes: week.minutes,
    start: week.start,
    current: week.week === currentWeek,
  }));
  const hours = (minutes: number) =>
    minutes === 0 ? "0" : `${Math.round((minutes / 60) * 10) / 10}h`;

  return (
    <figure className="space-y-2">
      <div aria-hidden="true" className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-strong)" }}
              tick={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
              tickFormatter={hours}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--color-hover)" }}
              content={({ active, payload }) => {
                const point = active ? payload?.[0]?.payload : null;
                if (!point) return null;
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] shadow-lg">
                    <p className="font-medium text-fg">
                      Week {point.name.slice(1)}
                      {point.current ? " (this week)" : ""}
                    </p>
                    <p className="text-fg-muted">From {dateLabel(point.start)}</p>
                    <p className="mt-1 text-fg tabular-nums">
                      {formatMinutes(point.minutes)} studied
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="minutes"
              fill="var(--color-chart-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption id={id} className="text-xs text-fg-subtle">
        {label}: {formatMinutes(total)} in total. Active time only, from the study timer.
      </figcaption>
      <table className="sr-only" aria-describedby={id}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Starting</th>
            <th scope="col">Study time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((week) => (
            <tr key={week.name}>
              <th scope="row">{week.name.slice(1)}</th>
              <td>{dateLabel(week.start)}</td>
              <td>{formatMinutes(week.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
