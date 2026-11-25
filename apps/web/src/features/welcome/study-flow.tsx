"use client";

import { BookOpenText, Brain, CalendarDays, GraduationCap, ListChecks } from "lucide-react";
import { useEffect, useRef } from "react";
import styles from "./welcome-motion.module.css";

const stages = [
  { icon: BookOpenText, name: "Understand", detail: "Study guide" },
  { icon: ListChecks, name: "Practise", detail: "MCQs and active recall" },
  { icon: Brain, name: "Remember", detail: "Spaced flashcards" },
  { icon: CalendarDays, name: "Refocus", detail: "Weak spots and study plan" },
  { icon: GraduationCap, name: "Build confidence", detail: "Exam prep and clinical reasoning" },
];

const ECG = "M2 14h12l4-5 5 11 6-17 6 11h14l-5-5m5 5-5 5";

export function StudyFlow() {
  const flow = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = flow.current;
    if (!list || !("IntersectionObserver" in window)) return;
    // The signal runs every time the flow is on screen, and rests while it is not.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) list.dataset.active = String(entry.isIntersecting);
      },
      { threshold: 0.35 },
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <ol ref={flow} aria-label="The Med OS learning cycle" className={styles.studyFlow}>
      {stages.map(({ icon: Icon, name, detail }, index) => (
        <li key={name} className={styles.flowStage}>
          <span className={styles.flowIcon}>
            <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
          </span>
          <span className="block font-display text-lg font-semibold text-fg">{name}</span>
          <span className="block text-sm leading-snug text-fg-muted">{detail}</span>
          {index < stages.length - 1 ? (
            <svg aria-hidden="true" className={styles.flowArrow} viewBox="0 0 52 24" fill="none">
              <path d={ECG} stroke="currentColor" strokeWidth="1.3" />
              <path d={ECG} pathLength={1} className={styles.flowSignal} strokeWidth="2.1" />
            </svg>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
