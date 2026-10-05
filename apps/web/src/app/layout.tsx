import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // This request's Content Security Policy nonce (see src/proxy.ts). Reading it renders every
  // page per request, which a private app does anyway, so no page is served without its nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The boot script sets data-theme before hydration, so the attribute differs from the server HTML.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      {/*
        Browser extensions (Grammarly, for one) add attributes to <body> before React hydrates.
        suppressHydrationWarning covers this element's own attributes only; mismatches in anything
        rendered inside it are still reported.
      */}
      <body suppressHydrationWarning>
        {children}
        <ThemeWatcher />
      </body>
    </html>
  );
}
