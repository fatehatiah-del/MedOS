"use client";

import { type ReactNode, useEffect, useState } from "react";
import styles from "./welcome-motion.module.css";

export function WelcomeHeader({ children }: { children: ReactNode }) {
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("welcome-hero");
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setPastHero(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 0)),
      { rootMargin: "-66px 0px 0px" },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <header className={styles.glassHeader} data-past-hero={pastHero}>
      {children}
    </header>
  );
}
