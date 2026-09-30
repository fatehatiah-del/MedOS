/** Every route of the Phase 1 shell with the heading it must show. */
export const ROUTES = [
  { path: "/today", heading: "Good afternoon, Test", nav: "Today" },
  { path: "/courses", heading: "Courses", nav: "Courses" },
  { path: "/courses/pharmacology", heading: "Pharmacology I", nav: "Pharmacology" },
  { path: "/calendar", heading: "Calendar", nav: "Calendar" },
  { path: "/study-plan", heading: "Study Plan", nav: "Study Plan" },
  { path: "/review", heading: "Review", nav: "Review" },
  { path: "/question-bank", heading: "Question Bank", nav: "Question Bank" },
  { path: "/flashcards", heading: "Flashcards", nav: "Flashcards" },
  { path: "/search", heading: "Search", nav: "Search" },
  { path: "/statistics", heading: "Statistics", nav: "Statistics" },
  { path: "/settings", heading: "Settings", nav: "Settings" },
] as const;

export const COURSE_NAV_LABELS = [
  "Pathology",
  "Pathophysiology",
  "Microbiology",
  "Pharmacology",
  "Public Health",
  "Communication Skills",
] as const;
