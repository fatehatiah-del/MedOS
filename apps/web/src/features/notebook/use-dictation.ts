"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatDictation } from "./dictation";

/*
 * Dictation into the notebook with the browser's own speech recognition
 * (Chrome, Edge and Safari; the speech is turned into text by the browser's
 * provider). A tap of Alt on its own starts or stops it, as does the
 * microphone button; Escape stops it. What is being heard shows as a preview
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
    "MedOS may not use the microphone. Allow it with the icon at the left of the address bar, then press Alt again.",
  "service-not-allowed":
    "This browser does not allow dictation here. Try Chrome or Edge.",
  "audio-capture": "No microphone was found. Check that one is connected and switched on.",
  network: "Dictation needs an internet connection.",
};

/** Text written somewhere other than the notebook: Alt there is left alone. */
function typingElsewhere(target: EventTarget | null, editor: Editor): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (editor.view.dom.contains(target)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

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
      setError(ERRORS[event.error] ?? "Dictation stopped because of an error. Press Alt to try again.");
    };
    r.onend = () => {
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
      setError("Dictation could not start. Press Alt to try again.");
    }
  }, [editor]);

  const toggle = useCallback(() => {
    if (wanted.current) stop();
    else start();
  }, [start, stop]);

  // Alt pressed and let go on its own (not Alt+something, not AltGr) toggles dictation.
  useEffect(() => {
    if (!editor) return;
    let armed = false;
    const onDown = (event: KeyboardEvent) => {
      if (event.key === "Alt" && !event.repeat) {
        armed = !event.ctrlKey && !event.shiftKey && !event.metaKey;
        if (armed) event.preventDefault();
        return;
      }
      armed = false;
      if (event.key === "Escape" && wanted.current) stop();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || !armed) return;
      armed = false;
      if (typingElsewhere(event.target, editor)) return;
      event.preventDefault(); // keeps Firefox's menu bar from opening
      toggle();
    };
    const disarm = () => {
      armed = false;
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("mousedown", disarm, true);
    window.addEventListener("blur", disarm);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("mousedown", disarm, true);
      window.removeEventListener("blur", disarm);
    };
  }, [editor, toggle, stop]);

  // Leaving the notebook ends dictation.
  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
      recognition.current = null;
    },
    [editor],
  );

  return { supported, listening, interim, error, clearError: () => setError(null), toggle };
}
