import { Button } from "@medos/ui";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { LOGIN_PATH, SIGNUP_PATH } from "@/server/auth/routes";

import { CycleTabs } from "./cycle-tabs";
import { PRICE, TRIAL_DAYS } from "./pricing";
import { Screenshot } from "./screenshot";

const COURSES = [
  "Pathology",
  "Pathophysiology",
  "Medical Microbiology",
  "Pharmacology",
  "Public & Global Health",
  "Communication Skills",
];

const FEATURES: readonly { title: string; body: string }[] = [
  {
    title: "Notebook",
    body: "Notes beside the study guide, with formulas, images, tables and dictation.",
  },
  {
    title: "Search, from anywhere",
    body: "Press Ctrl K and search lectures, guides, questions, flashcards and your own notes at once.",
  },
  {
    title: "Ask AI",
    body: "Ask a question while you study, without leaving the page you are on.",
  },
  {
    title: "Study timer",
    body: "Counts only active study time. Pauses, idle time and background tabs are left out.",
  },
  {
    title: "Export",
    body: "Take your notes, highlights and flashcards with you, including to Anki.",
  },
  {
    title: "Private by design",
    body: "Your notes, answers, flashcards and progress belong to your account only.",
  },
];

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "What exactly is Med OS?",
    a: "A study system for medical school. Instead of a folder of slides, every lecture comes with a study guide, practice MCQs, active-recall questions and a flashcard deck, and Med OS plans each day around your timetable and the topics you find hardest.",
  },
  {
    q: "Which courses are included?",
    a: `The included material follows Year 3, Semester 5 of the MD curriculum at the medical school where Med OS was built: ${COURSES.join(", ")}. It arrives already organised by week and lecture. If your programme is different, every study tool still works, but the included lectures follow this curriculum.`,
  },
  {
    q: "Who can join?",
    a: "Med OS is open to Year 3 medical students for now, because the included material follows the Year 3 curriculum. Years 1 and 2 are coming later.",
  },
  {
    q: "Is my study data private?",
    a: "Yes. Your notes, highlights, answers, flashcards and progress belong to your account. Nobody else can see them.",
  },
  {
    q: `What happens after the ${TRIAL_DAYS}-day trial?`,
    a: `Med OS costs ${PRICE} a month after the trial. Billing is not switched on yet, so nothing is charged while you try it.`,
  },
  {
    q: "Does it work on my phone?",
    a: "Med OS runs in the browser. It is designed for a laptop, and works on phones and tablets for reviewing on the go.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Med OS runs in your browser: create an account and the included courses are already there.",
  },
];

const CONTAINER = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

function SectionIntro({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl space-y-3">
      <h2
        id={id}
        className="font-display text-[32px] leading-[1.1] font-semibold text-balance text-fg sm:text-[40px]"
      >
        {title}
      </h2>
      <p className="text-[17px] leading-relaxed text-pretty text-fg-muted">{children}</p>
    </div>
  );
}

function StartButton({
  children = `Start ${TRIAL_DAYS}-day free trial`,
}: {
  children?: ReactNode;
}) {
  return (
    <Button asChild variant="primary" className="h-11 px-5 text-[15px] [&_svg]:size-[18px]">
      <Link href={SIGNUP_PATH}>
        {children}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

/** The public front door: what MedOS is, shown with its real screens, and how to start. */
export function WelcomePage() {
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <a
        href="#welcome-main"
        className="sr-only z-50 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
        <div className={`${CONTAINER} flex h-16 items-center gap-6`}>
          <Link href="/" aria-label="Med OS home" className="rounded-lg">
            <BrandMark />
          </Link>
          <nav aria-label="Welcome" className="hidden md:block">
            <ul className="flex items-center gap-1 text-[14px] font-medium text-fg-muted">
              {[
                ["#how-it-works", "How it works"],
                ["#features", "Features"],
                ["#pricing", "Pricing"],
                ["#faq", "FAQ"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-hover hover:text-fg"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeMenu />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href={LOGIN_PATH}>Sign in</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href={SIGNUP_PATH}>Start free trial</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="welcome-main" tabIndex={-1} className="focus:outline-none">
        {/* Hero: the offer, the action, and the real Today screen breaking the fold. */}
        <section aria-labelledby="hero-title" className="overflow-hidden pt-16 sm:pt-24">
          <div className={CONTAINER}>
            <div className="max-w-[62rem]">
              <h1
                id="hero-title"
                className="max-w-[16ch] animate-rise-in font-display text-[38px] leading-[1.05] font-semibold text-fg sm:text-[60px] sm:leading-[1.02] lg:max-w-none lg:text-[72px]"
              >
                Every lecture, already turned into a study system.
              </h1>
              <p className="mt-6 max-w-[38rem] animate-rise-in text-[18px] leading-relaxed text-pretty text-fg-muted [animation-delay:60ms] sm:text-[19px]">
                Med OS gives each lecture of your semester a study guide, practice MCQs,
                active-recall questions and spaced-repetition flashcards, then plans your day around
                your real timetable.
              </p>
              <div className="mt-9 flex animate-rise-in flex-wrap items-center gap-3 [animation-delay:120ms]">
                <StartButton />
                <Button asChild variant="secondary" className="h-11 px-5 text-[15px]">
                  <Link href={LOGIN_PATH}>Sign in</Link>
                </Button>
              </div>
              <p className="mt-4 animate-rise-in text-[13.5px] text-fg-muted [animation-delay:160ms]">
                Open to Year 3 students. {TRIAL_DAYS} days free, then {PRICE}/month. No card needed
                to start.
              </p>
            </div>

            <div className="relative mt-14 animate-rise-in [animation-delay:220ms] sm:mt-16">
              <Screenshot
                name="today"
                priority
                mobileCrop
                alt="The Med OS Today screen: the day's university schedule, a recommended study plan, today's progress and upcoming exams."
              />
              <p className="mt-3 text-center text-[12.5px] text-fg-muted">
                Screens from a sample account.
              </p>
            </div>
          </div>
        </section>

        {/* What is included, stated plainly. */}
        <section aria-labelledby="courses-title" className="border-y border-border bg-surface">
          <div
            className={`${CONTAINER} flex flex-col gap-4 py-8 md:flex-row md:items-center md:gap-10`}
          >
            <h2 id="courses-title" className="shrink-0 text-[14px] font-semibold text-fg">
              Follows one medical school&rsquo;s Year 3 MD curriculum · Semester 5
            </h2>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-fg-muted">
              {COURSES.map((course) => (
                <li key={course} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 text-accent" strokeWidth={2.2} />
                  {course}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The learning cycle: the product's mechanism, step by step. */}
        <section aria-labelledby="how-it-works" className="scroll-mt-16 bg-surface py-24 sm:py-32">
          <div className={`${CONTAINER} space-y-12`}>
            <SectionIntro id="how-it-works" title="One lecture, the whole learning cycle.">
              Documents are inputs; learning is the product. Every lecture moves from first read to
              exam-ready through the same steps, each with its own tool.
            </SectionIntro>
            <CycleTabs />
          </div>
        </section>

        {/* Timetable. */}
        <section aria-labelledby="timetable-title" className="py-24 sm:py-32">
          <div
            className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:items-center lg:gap-16`}
          >
            <div className="space-y-5">
              <h2
                id="timetable-title"
                className="font-display text-[32px] leading-[1.1] font-semibold text-balance text-fg sm:text-[40px]"
              >
                Built around your real timetable.
              </h2>
              <p className="text-[17px] leading-relaxed text-pretty text-fg-muted">
                Lectures, labs and exam periods are already in your calendar. Med OS knows what was
                taught today and what is due, so Today always opens on the right lecture.
              </p>
              <ul className="space-y-2.5 pt-1 text-[15px] text-fg">
                {[
                  "Your group's timetable and academic dates",
                  "Exams with a countdown, and your own study sessions",
                  "Day, week, month and semester views",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-[18px] shrink-0 text-accent"
                      strokeWidth={2.2}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Screenshot
              name="calendar"
              sizes="(min-width: 1280px) 720px, 100vw"
              alt="The Med OS week calendar with colour-coded lectures and labs for each course."
            />
          </div>
        </section>

        {/* Everything else, as a list rather than a wall of cards. */}
        <section
          aria-labelledby="features"
          className="scroll-mt-16 border-t border-border bg-surface py-24 sm:py-32"
        >
          <div className={`${CONTAINER} space-y-14`}>
            <SectionIntro id="features" title="Everything else a semester needs.">
              The small tools that make long study days work, all in one place.
            </SectionIntro>
            <ul className="grid gap-x-12 gap-y-0 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="border-t border-border py-6">
                  <div className="space-y-1.5">
                    <h3 className="text-[15.5px] font-semibold text-fg">{feature.title}</h3>
                    <p className="text-[15px] leading-relaxed text-pretty text-fg-muted">
                      {feature.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing: the owner's real price, and the honest state of billing. */}
        <section aria-labelledby="pricing" className="scroll-mt-16 py-24 sm:py-32">
          <div className={`${CONTAINER} space-y-12`}>
            <SectionIntro id="pricing" title="One plan. Everything included.">
              Try every part of Med OS free for {TRIAL_DAYS} days.
            </SectionIntro>
            <div className="grid overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
              <div className="flex flex-col gap-6 border-b border-border p-8 sm:p-10 md:border-r md:border-b-0">
                <div className="space-y-1">
                  <h3 className="text-[15px] font-semibold text-fg">Med OS</h3>
                  <p className="text-[14px] text-fg-subtle">
                    One account, every included course and every tool.
                  </p>
                </div>
                <p className="flex items-baseline gap-2">
                  <span
                    className="font-display text-[56px] leading-none font-semibold text-fg"
                    data-numeric
                  >
                    {PRICE}
                  </span>
                  <span className="text-[15px] text-fg-muted">/ month</span>
                </p>
                <p className="text-[15px] font-medium text-fg">
                  {TRIAL_DAYS} days free, then {PRICE} a month.
                </p>
                <div className="mt-auto space-y-3">
                  <StartButton>Start free trial</StartButton>
                  <p className="text-[13px] leading-relaxed text-fg-subtle">
                    Billing is not switched on yet, so nothing is charged while you try Med OS.
                  </p>
                </div>
              </div>
              <ul className="grid content-start gap-3.5 p-8 text-[15px] text-fg sm:p-10">
                {[
                  "Every included course, organised by week and lecture",
                  "Study guides, MCQs, Question Bank and flashcards for each lecture",
                  "Learn, Exam and USMLE practice modes",
                  "FSRS spaced repetition",
                  "Daily study plan, calendar and study timer",
                  "Statistics and weak-spot detection",
                  "Notebook, search, Ask AI and export",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-[18px] shrink-0 text-accent"
                      strokeWidth={2.2}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Questions. */}
        <section
          aria-labelledby="faq"
          className="scroll-mt-16 border-t border-border bg-surface py-24 sm:py-32"
        >
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]`}>
            <div className="space-y-3">
              <h2
                id="faq"
                className="font-display text-[32px] leading-[1.1] font-semibold text-fg sm:text-[40px]"
              >
                Questions
              </h2>
              <p className="text-[17px] leading-relaxed text-fg-muted">The short answers.</p>
            </div>
            <div className="divide-y divide-border border-y border-border">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium text-fg transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden="true" className="relative size-4 shrink-0 text-fg-subtle">
                      <span className="absolute top-1/2 left-0 h-[1.5px] w-4 -translate-y-1/2 rounded-full bg-current" />
                      <span className="absolute top-0 left-1/2 h-4 w-[1.5px] -translate-x-1/2 rounded-full bg-current transition-transform duration-200 ease-out group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-6 text-[15.5px] leading-relaxed text-pretty text-fg-muted">
                    {a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Close. */}
        <section aria-labelledby="close-title" className="py-24 sm:py-32">
          <div
            className={`${CONTAINER} flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between`}
          >
            <div className="max-w-2xl space-y-4">
              <h2
                id="close-title"
                className="font-display text-[36px] leading-[1.06] font-semibold text-balance text-fg sm:text-[52px]"
              >
                Your semester is ready when you are.
              </h2>
              <p className="text-[17px] text-fg-muted">
                {TRIAL_DAYS} days free, then {PRICE}/month.
              </p>
            </div>
            <StartButton />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div
          className={`${CONTAINER} flex flex-col gap-6 py-10 text-[14px] text-fg-subtle sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className="flex items-center gap-4">
            <BrandMark size="sm" />
            <span>© {new Date().getFullYear()} Med OS</span>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              <li>
                <a href="#pricing" className="hover:text-fg">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-fg">
                  FAQ
                </a>
              </li>
              <li>
                <Link href={LOGIN_PATH} className="hover:text-fg">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href={SIGNUP_PATH} className="hover:text-fg">
                  Create account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
