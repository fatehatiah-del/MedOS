import { CURRENT_SEMESTER, academicPeriods, formatDateRange } from "@medos/shared";
import {
  EmptyState,
  PageHeader,
  Section,
  Surface,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@medos/ui";
import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_VIEWS,
  type CalendarEventOrigin,
} from "@/features/calendar/event-types";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Calendar" };

const ORIGINS: readonly { origin: CalendarEventOrigin; title: string; marker: string }[] = [
  // University events are solid; the user's own sessions are outlined.
  { origin: "university", title: "University", marker: "bg-fg" },
  { origin: "personal", title: "Your sessions", marker: "border-accent border-2" },
];

export default async function CalendarPage() {
  await requireUser();

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={`${CURRENT_SEMESTER.name} · Group ${CURRENT_SEMESTER.group}`}
        title="Calendar"
        description="University timetable and your own study sessions, side by side."
      />

      <Tabs defaultValue="week">
        <TabsList aria-label="Calendar view">
          {CALENDAR_VIEWS.map((view) => (
            <TabsTrigger key={view.id} value={view.id}>
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CALENDAR_VIEWS.map((view) => (
          <TabsContent key={view.id} value={view.id}>
            <Surface>
              <EmptyState
                headingLevel={2}
                icon={<CalendarDays />}
                title={`${view.label} view is not available yet`}
                description={`${view.emptyDescription} The timetable is imported in a later phase.`}
              />
            </Surface>
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid gap-10 @3xl:grid-cols-2 @3xl:gap-14">
        <Section title="Academic calendar">
          <dl className="divide-y divide-border border-y border-border">
            {academicPeriods().map((period) => (
              <div key={period.kind} className="flex items-baseline justify-between gap-6 py-3.5">
                <dt className="text-sm text-fg">{period.label}</dt>
                <dd className="text-right text-[13px] text-fg-muted tabular-nums">
                  {formatDateRange(period.range)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-fg-subtle">
            Individual course examination dates are added by hand once the university releases them.
          </p>
        </Section>

        <Section title="Event types">
          <div className="grid gap-8 sm:grid-cols-2">
            {ORIGINS.map(({ origin, title, marker }) => (
              <div key={origin}>
                <h3 className="text-sm font-medium text-fg">{title}</h3>
                <ul className="mt-3 space-y-2.5">
                  {CALENDAR_EVENT_TYPES.filter((type) => type.origin === origin).map((type) => (
                    <li key={type.id} className="flex items-center gap-2.5 text-sm text-fg-muted">
                      <span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", marker)} />
                      {type.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
