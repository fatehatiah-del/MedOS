"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatDictation } from "./dictation";

/*
 * Dictation into the notebook with the browser's own speech recognition
 * (Chrome, Edge and Safari; the speech is turned into text by the browser's
 * provider). The microphone button starts or stops it; Escape stops it. What is being heard shows as a preview
 * and goes into the notes, at the cursor, once each phrase is finished.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed":
    "MedOS may not use the microphone. Allow it with the icon at the left of the address bar, then press the microphone button again.",
  "service-not-allowed":
    "This browser does not allow dictation here. Try Chrome or Edge.",
  "audio-capture": "No microphone was found. Check that one is connected and switched on.",
  network: "Dictation needs an internet connection.",
};

function insertHeard(editor: Editor, heard: string) {
  const { $from } = editor.state.selection;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const pieces = formatDictation(heard, before);
  if (pieces.length === 0) return;
  let chain = editor.chain();
  for (const piece of pieces) {
    if ("text" in piece) chain = chain.insertContent({ type: "text", text: piece.text });
    else chain = piece.break === "paragraph" ? chain.splitBlock() : chain.setHardBreak();
  }
  chain.scrollIntoView().run();
}

export function useDictation(editor: Editor | null) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The microphone is on and sound is arriving (until then: "Starting the microphone…").
  const [hearing, setHearing] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);

  useEffect(() => {
    // Known only in the browser, after the page has been drawn the same way as on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(recognitionConstructor() !== null);
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!editor || editor.isDestroyed) return;
    if (!Constructor) {
      setError("Dictation works in Chrome, Edge and Safari, not in this browser.");
      return;
    }
    setError(null);
    const r = new Constructor();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = true;
    let gotAudio = false;
    let failed = false;
    r.onaudiostart = () => {
      gotAudio = true;
      setHearing(true);
    };
    r.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) insertHeard(editor, result[0].transcript);
        else pending += result[0].transcript;
      }
      setInterim(pending.trim());
    };
    r.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      wanted.current = false;
      failed = true;
      setError(ERRORS[event.error] ?? "Dictation stopped because of an error. Press the microphone button to try again.");
    };
    r.onend = () => {
      // Ended before any sound came in, with no reason given: say so rather than go quiet.
      if (!gotAudio && !failed && wanted.current) {
        wanted.current = false;
        setError(
          "The microphone did not start. Check that MedOS may use it (the icon at the left of the address bar) and that no other app is using it, then try again.",
        );
      }
      // The browser ends a session after a silence: carry on until asked to stop.
      if (wanted.current && recognition.current === r) {
        try {
          r.start();
          return;
        } catch {
          wanted.current = false;
        }
      }
      if (recognition.current === r) recognition.current = null;
      setListening(false);
      setHearing(false);
      setInterim("");
    };
    recognition.current?.abort();
    recognition.current = r;
    wanted.current = true;
    try {
      r.start();
      setListening(true);
      if (!editor.isFocused) editor.commands.focus();
    } catch {
      wanted.current = false;
      setError("Dictation could not start. Press the microphone button to try again.");
    }
  }, [editor]);

  const toggle = useCallback(() => {
    if (wanted.current) stop();
    else start();
  }, [start, stop]);

  // Escape stops dictation.
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && wanted.current) stop();
    };
    window.addEventListener("keydown", onDown, true);
    return () => window.removeEventListener("keydown", onDown, true);
  }, [stop]);

  // Leaving the notebook ends dictation.
  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
      recognition.current = null;
    },
    [editor],
  );

  return { supported, listening, hearing, interim, error, clearError: () => setError(null), toggle };
}
