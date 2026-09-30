import { Notice } from "@medos/ui";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

/** Marks a screen whose content is development fixture data rather than the user's own. */
export function FixtureNotice({ children }: { children?: ReactNode }) {
  return (
    <Notice icon={<FlaskConical />} title="Development preview.">
      {children ??
        "This screen shows fixture data to demonstrate the layout. It is not your real schedule or progress."}
    </Notice>
  );
}
