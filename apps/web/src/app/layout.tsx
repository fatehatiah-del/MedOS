import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
