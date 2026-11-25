"use client";

import { Pause, Play } from "lucide-react";
import styles from "./welcome-motion.module.css";
import { type ReactNode, useEffect, useRef, useState } from "react";

export function HeroDemo({ children }: { children: ReactNode }) {
  const player = useRef<HTMLVideoElement>(null);
  const playbackOverride = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    const video = player.current;
    if (!video) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Phones show the readable crop of Today instead: the desktop recording is too small there.
    const wide = window.matchMedia("(min-width: 640px)");
    let inView = !("IntersectionObserver" in window);
    const updatePlayback = () => {
      const shouldPlay = wide.matches && (playbackOverride.current ?? !preference.matches);
      if (!inView || document.hidden || !shouldPlay) {
        video.pause();
        return;
      }

      const source = `/welcome/demo-${document.documentElement.dataset.theme === "dark" ? "dark" : "light"}.webm`;
      if (video.getAttribute("src") !== source) {
        video.setAttribute("src", source);
      }
      video.muted = true;
      void video.play().catch(() => undefined);
    };

    const viewportObserver =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              inView = Boolean(entry && entry.intersectionRatio >= 0.25);
              updatePlayback();
            },
            { threshold: 0.25 },
          )
        : null;
    viewportObserver?.observe(video);
    const themeObserver = new MutationObserver(updatePlayback);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    preference.addEventListener("change", updatePlayback);
    wide.addEventListener("change", updatePlayback);
    document.addEventListener("visibilitychange", updatePlayback);
    updatePlayback();

    return () => {
      viewportObserver?.disconnect();
      themeObserver.disconnect();
      preference.removeEventListener("change", updatePlayback);
      wide.removeEventListener("change", updatePlayback);
      document.removeEventListener("visibilitychange", updatePlayback);
      video.pause();
    };
  }, []);

  function togglePlayback() {
    const video = player.current;
    if (!video) return;

    if (!video.paused) {
      playbackOverride.current = false;
      video.pause();
      return;
    }

    playbackOverride.current = true;
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const source = `/welcome/demo-${theme}.webm`;
    if (video.getAttribute("src") !== source) video.setAttribute("src", source);
    else if (video.error) video.load();
    video.muted = true;
    void video.play().catch(() => undefined);
  }

  return (
    <div className="relative isolate">
      {children}
      {buffering && !hasFrame && (
        <span className={styles.previewLoading} role="status" aria-label="Loading walkthrough" />
      )}
      <video
        ref={player}
        loop
        playsInline
        muted
        preload="none"
        aria-label="Silent Med OS product walkthrough"
        className="absolute inset-1.5 h-[calc(100%-0.75rem)] w-[calc(100%-0.75rem)] rounded-[10px] bg-canvas object-contain sm:inset-2 sm:h-[calc(100%-1rem)] sm:w-[calc(100%-1rem)]"
        style={{ opacity: hasFrame ? 1 : 0, transition: "opacity 220ms ease-out" }}
        onLoadStart={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false);
          setHasFrame(true);
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          setBuffering(false);
        }}
        onEmptied={() => {
          setHasFrame(false);
          setPlaying(false);
        }}
        onError={() => {
          setBuffering(false);
          setHasFrame(false);
          setPlaying(false);
        }}
      />
      <button
        type="button"
        aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
        title={playing ? "Pause walkthrough" : "Play walkthrough"}
        className="absolute right-3 bottom-3 hidden size-11 items-center justify-center rounded-full border border-white/25 bg-[#121638] text-white transition-colors hover:bg-[#252d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex"
        onClick={togglePlayback}
      >
        {playing ? (
          <Pause aria-hidden="true" className="size-[18px]" />
        ) : (
          <Play aria-hidden="true" className="size-[18px]" />
        )}
      </button>
    </div>
  );
}
