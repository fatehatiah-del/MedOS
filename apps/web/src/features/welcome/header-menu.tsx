"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import styles from "./welcome-motion.module.css";

const LINKS = [
  ["#how-it-works", "How it works"],
  ["#features", "Features"],
  ["#pricing", "Pricing"],
  ["#faq", "FAQ"],
] as const;

/**
 * Below laptop width the header keeps one row (wordmark, trial button, this menu). The section links, sign-in
 * and the display controls live in a panel that drops from the bar. The panel stays mounted while
 * closed so the controls inside it keep their state.
 */
export function HeaderMenu({ loginHref, controls }: { loginHref: string; controls: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={root} className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-full text-fg transition-colors duration-150 hover:bg-hover"
      >
        {open ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </button>
      <div id={panelId} hidden={!open} className={styles.headerPanel}>
        <nav aria-label="Welcome sections">
          <ul>
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={close}>
                  {label}
                </a>
              </li>
            ))}
            <li>
              <Link href={loginHref} onClick={close}>
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
        <div className={styles.headerPanelControls}>
          <span>Display</span>
          <div className="flex items-center gap-1">{controls}</div>
        </div>
      </div>
    </div>
  );
}
