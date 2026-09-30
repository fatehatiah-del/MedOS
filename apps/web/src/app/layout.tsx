import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { BOOT_SCRIPT } from "@/components/theme/theme-config";
import { ThemeWatcher } from "@/components/theme/theme-watcher";
import { env } from "@/env";

export const metadata: Metadata = {
  title: {
    default: "MedOS",
    template: "%s · MedOS",
  },
  description: "A personal medical-school study operating system.",
  ...(env.APP_URL ? { metadataBase: new URL(env.APP_URL) } : {}),
  // Study data is private and must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets data-theme before hydration, so the attribute differs from the server HTML.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ThemeWatcher />
      </body>
    </html>
  );
}
