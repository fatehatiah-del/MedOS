import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HOME_HREF } from "@/config/navigation";
import { WelcomePage } from "@/features/welcome/welcome-page";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: { absolute: "Med OS · Every lecture, already turned into a study system" },
  description:
    "Study guides, practice MCQs, active recall and spaced-repetition flashcards for every lecture, planned around your timetable.",
  // The one page meant to be found: the rest of MedOS stays private.
  robots: { index: true, follow: false },
};

/** Signed in: straight to Today. Signed out: the welcome page. */
export default async function RootPage() {
  if (await getCurrentUser()) redirect(HOME_HREF);
  return <WelcomePage />;
}
