"use client";

import { Button, Notice, Section, Surface } from "@medos/ui";
import { Headphones, LoaderCircle, Play, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { generatePodcast } from "./actions";
import { type PodcastScript, plainText } from "./episodes";

interface EpisodeRow {
  labels: string[];
  version: string;
}

interface Source {
  id: string;
  title: string;
  href: string;
  episodes: EpisodeRow[];
}

const storageEvent = "medos:podcasts";
const emptyStorage = () => "{}";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(storageEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(storageEvent, onChange);
  };
}

const episodeKey = (source: Source, index: number) => source.id + "/" + index;

export function PodcastPlayer({
  accountId,
  lectureId,
  configured,
  naturalVoices,
  sources,
}: {
  accountId: string;
  lectureId: string;
  configured: boolean;
  /** ElevenLabs is configured: signed dialogues play as natural two-host audio. */
  naturalVoices: boolean;
  sources: Source[];
}) {
  const storageKey = "medos:podcasts:v1:" + accountId + ":" + lectureId;
  const cache = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? emptyStorage();
      } catch {
        return emptyStorage();
      }
    },
    emptyStorage,
  );
  const [session, setSession] = useState<Record<string, PodcastScript>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<{ key: string; turn: number } | null>(null);
  const [rate, setRate] = useState(1);
  const [pending, startTransition] = useTransition();
  const playback = useRef<symbol | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrls = useRef(new Map<string, string>());
  const [loading, setLoading] = useState<string | null>(null);
  const speechSupported = useSyncExternalStore(
    subscribe,
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => {
    const urls = audioUrls.current;
    const audio = player.current;
    return () => {
      if (playback.current) {
        playback.current = null;
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      }
      audio?.pause();
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (player.current) player.current.playbackRate = rate;
  }, [rate]);

  const natural = (script: PodcastScript) => naturalVoices && Boolean(script.signature);

  let saved: Record<string, PodcastScript> = {};
  try {
    saved = JSON.parse(cache) ?? {};
  } catch {
    /* A fresh generation replaces invalid cached data. */
  }
  const scripts = { ...saved, ...session };
  const scriptKey = (source: Source, index: number, version: string) =>
    episodeKey(source, index) + "/" + version;
  const ungenerated = sources.flatMap((source) =>
    source.episodes.flatMap(({ version }, index) =>
      scripts[scriptKey(source, index, version)] ? [] : [{ source, index, version }],
    ),
  );

  function generate(queue: typeof ungenerated) {
    const first = queue[0];
    if (pending || !configured || !first) return;
    setError("");
    setStatus("");
    setWorking(episodeKey(first.source, first.index));
    startTransition(async () => {
      let completed = 0;
      try {
        for (const { source, index, version } of queue) {
          setWorking(episodeKey(source, index));
          setStatus("Generating episode " + (completed + 1) + " of " + queue.length + "…");
          const result = await generatePodcast({
            lectureId,
            resourceId: source.id,
            index,
            version,
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          const key = scriptKey(source, index, version);
          setSession((previous) => ({ ...previous, [key]: result.script }));
          try {
            const current = JSON.parse(localStorage.getItem(storageKey) || "{}") ?? {};
            const prefix = episodeKey(source, index) + "/";
            for (const oldKey of Object.keys(current)) {
              if (oldKey.startsWith(prefix)) delete current[oldKey];
            }
            localStorage.setItem(storageKey, JSON.stringify({ ...current, [key]: result.script }));
            window.dispatchEvent(new Event(storageEvent));
          } catch {
            setError(
              "The browser could not save this dialogue. You can still play it on this page.",
            );
          }
          completed += 1;
        }
      } catch {
        setError("Generation was interrupted. Try again to continue.");
      } finally {
        setWorking(null);
        setStatus(
          completed
            ? completed + (completed === 1 ? " episode created." : " episodes created.")
            : "",
        );
      }
    });
  }

  function stop() {
    playback.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    player.current?.pause();
    setLoading(null);
    setPlaying(null);
  }

  async function playNatural(key: string, script: PodcastScript, active: symbol) {
    const audio = player.current;
    if (!audio) return;
    const cacheKey = script.signature ?? key;
    let url = audioUrls.current.get(cacheKey);
    if (!url) {
      setLoading(key);
      try {
        const response = await fetch("/api/podcasts/audio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turns: script.turns, signature: script.signature }),
        });
        if (!response.ok) throw new Error(await response.text());
        url = URL.createObjectURL(await response.blob());
        audioUrls.current.set(cacheKey, url);
      } catch (problem) {
        if (playback.current !== active) return;
        playback.current = null;
        setLoading(null);
        setError(
          (problem instanceof Error && problem.message) ||
            "The natural voices could not be loaded. Try again in a moment.",
        );
        return;
      }
      if (playback.current !== active) return;
      setLoading(null);
    }
    audio.src = url;
    audio.playbackRate = rate;
    audio.onended = () => {
      if (playback.current !== active) return;
      playback.current = null;
      setPlaying(null);
    };
    setPlaying({ key, turn: 0 });
    await audio.play().catch(() => {
      if (playback.current !== active) return;
      playback.current = null;
      setPlaying(null);
      setError("The browser blocked playback. Press Play again.");
    });
  }

  function play(key: string, script: PodcastScript) {
    stop();
    setError("");
    const active = Symbol();
    playback.current = active;
    if (natural(script)) {
      void playNatural(key, script, active);
      return;
    }
    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.localService && /^en(?:-|$)/i.test(voice.lang));
    const first = voices.find((voice) => voice.default) ?? voices[0];
    const second = voices.find((voice) => voice.voiceURI !== first?.voiceURI);

    function speak(index: number, offset = 0) {
      if (playback.current !== active) return;
      const turn = script.turns[index];
      if (!turn) {
        playback.current = null;
        setPlaying(null);
        return;
      }
      const remaining = plainText(turn.text).slice(offset);
      const space = remaining.lastIndexOf(" ", 200);
      const length = remaining.length <= 200 ? remaining.length : space > 0 ? space : 200;
      const utterance = new SpeechSynthesisUtterance(remaining.slice(0, length));
      utterance.lang = "en";
      utterance.voice = (turn.host === "A" ? first : (second ?? first)) ?? null;
      utterance.pitch = turn.host === "B" && !second ? 1.13 : 1;
      utterance.rate = rate;
      utterance.onend = () => {
        if (length < remaining.length) speak(index, offset + length);
        else speak(index + 1);
      };
      utterance.onerror = () => {
        if (playback.current !== active) return;
        playback.current = null;
        setPlaying(null);
        setError("The browser could not play this episode. Try again or open the transcript.");
      };
      setPlaying({ key, turn: index + 1 });
      window.speechSynthesis.speak(utterance);
    }
    speak(0);
  }

  return (
    <div className="space-y-6">
      <audio ref={player} preload="none" className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="max-w-xl text-sm text-fg-muted">
          {naturalVoices
            ? "Dialogues are AI-generated and saved in this browser. Episodes play as a natural two-host conversation; the first play of an episode takes a little longer while it is voiced."
            : "Dialogues are AI-generated and saved in this browser. Playback uses your device’s available voices."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            Playback speed
            <select
              className="rounded-lg border border-border bg-surface p-1.5 text-fg"
              value={rate}
              disabled={!(speechSupported || naturalVoices)}
              onChange={(event) => setRate(Number(event.target.value))}
            >
              {[0.8, 1, 1.2, 1.5].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </label>
          {ungenerated.length > 1 && (
            <Button
              type="button"
              disabled={pending || !configured}
              onClick={() => generate(ungenerated)}
            >
              Generate all episodes
            </Button>
          )}
        </div>
      </div>
      <div aria-live="polite" className="text-sm text-fg-muted empty:hidden">
        {status}
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {sources.map((source) => (
        <Section
          key={source.id}
          title={source.title}
          aside={
            <Link
              href={source.href}
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Open source
            </Link>
          }
        >
          <Surface>
            <ol className="divide-y divide-border">
              {source.episodes.map(({ labels, version }, index) => {
                const key = episodeKey(source, index);
                const script = scripts[scriptKey(source, index, version)];
                const active = playing?.key === key || loading === key;
                const canPlay = script ? natural(script) || speechSupported : false;
                const title = labels.join(" / ");
                return (
                  <li key={key} className="space-y-3 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 basis-52 items-start gap-3">
                        <Headphones
                          aria-hidden="true"
                          className="mt-1 size-4 shrink-0 text-accent"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold break-words text-fg">{title}</h3>
                          <p className="text-xs text-fg-subtle">
                            Episode {index + 1}
                            {loading === key
                              ? " · Preparing natural voices…"
                              : active && script && playing?.turn
                                ? " · Turn " + playing.turn + " of " + script.turns.length
                                : active
                                  ? " · Playing"
                                  : ""}
                          </p>
                        </div>
                      </div>
                      {script ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {naturalVoices && !script.signature && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending || working !== null || !configured}
                              aria-label={"Regenerate " + title + " with natural voices"}
                              onClick={() => generate([{ source, index, version }])}
                            >
                              {working === key ? "Generating…" : "Regenerate for natural voices"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={!canPlay}
                            aria-label={(active ? "Stop " : "Play ") + title}
                            onClick={() => (active ? stop() : play(key, script))}
                          >
                            {loading === key ? (
                              <LoaderCircle className="animate-spin" />
                            ) : active ? (
                              <Square />
                            ) : (
                              <Play />
                            )}
                            {active ? "Stop" : canPlay ? "Play" : "Audio unavailable"}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pending || working !== null || !configured}
                          aria-label={"Generate " + title}
                          onClick={() => generate([{ source, index, version }])}
                        >
                          {working === key ? "Generating…" : "Generate"}
                        </Button>
                      )}
                    </div>
                    {script && (
                      <details className="ml-7 text-sm text-fg-muted">
                        <summary className="w-fit cursor-pointer font-medium">Transcript</summary>
                        <p className="mt-2 text-xs text-fg-subtle">
                          AI-generated with {script.provider} · {script.model}
                          {natural(script) ? " · voiced by ElevenLabs" : ""}
                        </p>
                        <ol className="my-3 max-w-prose space-y-2">
                          {script.turns.map((turn, turnIndex) => (
                            <li key={turnIndex}>
                              <strong className="text-fg">Host {turn.host}.</strong>{" "}
                              {plainText(turn.text)}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          </Surface>
        </Section>
      ))}
    </div>
  );
}
