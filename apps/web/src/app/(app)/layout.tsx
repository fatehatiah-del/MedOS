import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

/**
 * Layout for the study workspace. Routes outside this group (such as the
 * future /login) render without the application shell.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
