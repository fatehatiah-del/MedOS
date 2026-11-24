"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@medos/ui";
import {
  BookOpenText,
  ChartNoAxesColumn,
  Layers,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestionMark,
  SquareCheckBig,
} from "lucide-react";
import { useState } from "react";

import { type ScreenName, Screenshot } from "./screenshot";

interface Step {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  body: string;
  screen: ScreenName;
  alt: string;
}

const STEPS: readonly Step[] = [
  {
    id: "guide",
    label: "Study guide",
    icon: BookOpenText,
    title: "Understand it",
    body: "Each lecture arrives as a structured study guide: the big picture first, then mechanisms, tables and Golden Points. Bookmarks, highlights and notes stay pinned to the passage they belong to.",
    screen: "guide-v2",
    alt: "The MedOS Study Guide reader open on an anaemia lecture, with its contents on the left and reading progress on the right.",
  },
  {
    id: "mcq",
    label: "MCQs",
    icon: SquareCheckBig,
    title: "Test it",
    body: "Practise the lecture's questions in Learn, Exam or USMLE mode. Every answer is kept and explained, including why the other options are wrong.",
    screen: "mcq",
    alt: "An MCQ in Learn mode showing the chosen answer, the correct answer and the explanation.",
  },
  {
    id: "recall",
    label: "Active recall",
    icon: MessageCircleQuestionMark,
    title: "Retrieve it",
    body: "Question Bank items make you answer in your head first, then check yourself against the model answer and rate how it went.",
    screen: "recall",
    alt: "A Question Bank item with a graph, the options and the model answer revealed.",
  },
  {
    id: "cards",
    label: "Flashcards",
    icon: Layers,
    title: "Keep it",
    body: "Turn any passage into a flashcard. FSRS spaced repetition schedules each card for the moment you are about to forget it.",
    screen: "cards",
    alt: "A flashcard review showing the answer and the Again, Hard, Good and Easy ratings with their next intervals.",
  },
  {
    id: "plan",
    label: "Study plan",
    icon: ListChecks,
    title: "Plan it",
    body: "Every day gets a suggested plan from today's lectures, unfinished work, due cards and weak topics. Reorder it, resize it or replace it: it is yours.",
    screen: "plan",
    alt: "The Study Plan for today with suggested items, their durations and the rules that ranked them.",
  },
  {
    id: "stats",
    label: "Weak spots",
    icon: ChartNoAxesColumn,
    title: "Fix it",
    body: "Statistics come only from what you actually did: MCQ accuracy, repeated errors, flashcard retention and study time, course by course.",
    screen: "stats",
    alt: "The Statistics page with study streak, questions answered, MCQ accuracy and lectures complete.",
  },
];

/** The learning cycle, one step at a time, each with the real screen that does it. */
export function CycleTabs() {
  const [active, setActive] = useState(STEPS[0]!.id);
  return (
    <Tabs value={active} onValueChange={setActive} className="space-y-8">
      <TabsList
        aria-label="Steps of the learning cycle"
        className="flex w-fit max-w-full flex-wrap justify-start gap-1 overflow-visible rounded-xl p-1"
      >
        {STEPS.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="inline-flex h-9 shrink-0 flex-row items-center gap-2 px-3.5 text-[13.5px] [&_svg]:size-4"
          >
            <Icon aria-hidden="true" strokeWidth={1.9} />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {STEPS.map((step) => (
        <TabsContent
          key={step.id}
          value={step.id}
          className={cn(
            "grid gap-8 focus-visible:outline-offset-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] lg:items-start lg:gap-12",
          )}
        >
          <div className="animate-fade-in space-y-3 lg:pt-6">
            <h3 className="font-display text-[24px] leading-tight font-semibold text-fg">
              {step.title}
            </h3>
            <p className="text-[15.5px] leading-relaxed text-pretty text-fg-muted">{step.body}</p>
          </div>
          <Screenshot
            name={step.screen}
            alt={step.alt}
            sizes="(min-width: 1280px) 820px, 100vw"
            className="animate-pop-in"
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
