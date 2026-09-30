import { CURRENT_SEMESTER, DEFAULT_STUDY_AVAILABILITY } from "@medos/shared";
import { Badge, Button, Field, Input, PageHeader, fieldHintId } from "@medos/ui";
import type { Metadata } from "next";
import { type ReactNode, useId } from "react";

import { ThemeSetting } from "@/components/theme/theme-setting";
import { env } from "@/env";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { ShortcutsDialog } from "@/features/settings/shortcuts-dialog";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

const AI_FEATURES = [
  "Ask MedOS",
  "Explain This",
  "Generate Flashcards",
  "Generate USMLE Questions",
  "Generate Study Guide",
] as const;

const EXPORT_FORMATS = ["JSON", "CSV", "Markdown"] as const;

interface SettingsSectionProps {
  title: string;
  description: string;
  /** Status shown beside the title, e.g. a "Not yet available" badge. */
  status?: ReactNode;
  children: ReactNode;
}

function SettingsSection({ title, description, status, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-5 border-t border-border py-8 @3xl:grid-cols-[260px_minmax(0,1fr)] @3xl:gap-12"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id={headingId} className="text-[15px] font-medium text-fg">
            {title}
          </h2>
          {status}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const notAvailable = <Badge tone="outline">Not yet available</Badge>;

export default async function SettingsPage() {
  const user = await requireUser();
  const { weekdayMinutes, weekendMinutes } = DEFAULT_STUDY_AVAILABILITY;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Preferences for this device and your study routine."
      />

      <div>
        <SettingsSection
          title="Appearance"
          description="Choose a theme, or follow your system setting. Saved on this device."
        >
          <ThemeSetting />
        </SettingsSection>

        <SettingsSection
          title="Study availability"
          description="How much time you can study each day. The planner fits its recommendations to this."
          status={notAvailable}
        >
          <div className="grid max-w-md gap-5 sm:grid-cols-2">
            <Field
              label="Weekdays"
              htmlFor="availability-weekday"
              hint="Minutes per day. Default value."
            >
              <Input
                id="availability-weekday"
                inputMode="numeric"
                value={weekdayMinutes}
                aria-describedby={fieldHintId("availability-weekday")}
                disabled
                readOnly
              />
            </Field>
            <Field
              label="Weekends"
              htmlFor="availability-weekend"
              hint="Minutes per day. Default value."
            >
              <Input
                id="availability-weekend"
                inputMode="numeric"
                value={weekendMinutes}
                aria-describedby={fieldHintId("availability-weekend")}
                disabled
                readOnly
              />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Sync"
          description="Study material is imported from your local S5 folder by a separate sync tool."
          status={notAvailable}
        >
          <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
            No sync tool is connected. The hosted app cannot read folders on your computer, so a
            small local program will scan the folder and upload changes.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Account"
          description="Your study data is private to this account. Signing out ends the session on this device."
        >
          <dl className="space-y-2.5 text-sm">
            {user.displayName ? (
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-fg-subtle">Name</dt>
                <dd className="min-w-0 truncate text-fg">{user.displayName}</dd>
              </div>
            ) : null}
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-fg-subtle">Email</dt>
              <dd className="min-w-0 truncate text-fg">{user.email}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-fg-subtle">Programme</dt>
              <dd className="text-fg-muted">
                {CURRENT_SEMESTER.programme}, {CURRENT_SEMESTER.academicYear}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-fg-subtle">Semester</dt>
              <dd className="text-fg-muted">
                {CURRENT_SEMESTER.label} · {CURRENT_SEMESTER.name} · Group {CURRENT_SEMESTER.group}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <SignOutButton />
          </div>
        </SettingsSection>

        <SettingsSection
          title="AI provider"
          description="Optional. MedOS works fully without AI, and AI content is always labelled as such."
          status={<Badge tone="outline">AI provider not configured</Badge>}
        >
          <p className="text-sm text-fg-muted">
            Provider: <span className="font-medium text-fg">{env.AI_PROVIDER}</span>
          </p>
          <ul aria-label="AI features, unavailable" className="mt-4 flex flex-wrap gap-2">
            {AI_FEATURES.map((feature) => (
              <li key={feature}>
                <Button size="sm" disabled>
                  {feature}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle">
            Coming soon. Disabled until a provider is set.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Export and backup"
          description="Your notes, flashcards, history and progress stay yours, in open formats."
          status={<Badge tone="outline">Coming soon</Badge>}
        >
          <ul aria-label="Export formats, unavailable" className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((format) => (
              <li key={format}>
                <Button size="sm" disabled>
                  Export {format}
                </Button>
              </li>
            ))}
          </ul>
        </SettingsSection>

        <SettingsSection
          title="Keyboard"
          description="MedOS is designed to be used comfortably without a mouse."
        >
          <ShortcutsDialog />
        </SettingsSection>
      </div>
    </div>
  );
}
