"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent } from "@/lib/protocol";
import {
  duyuAvailable,
  getCaptionPrefs,
  onCaptionPrefsChange,
  startDuyuCaptions,
  type CaptionPrefs,
} from "../lib/stt/duyu";

/**
 * Live captions for voice rooms.
 *
 * Each speaker's own speech is turned into text either by Duyu (PatientDesk's
 * Turkish speech-to-text, streamed through the worker when the server has a
 * SPEECH_API_KEY) or by the browser's Web Speech API (Chrome, Edge, Safari);
 * Settings → Text-to-speech picks which. The hub only relays a few short lines
 * of text to the people in the same room. Sharing is opt-in per person, and
 * stops whenever their mic is muted.
 */

export interface CaptionLine {
  connectionId: string;
  name: string;
  text: string;
  final: boolean;
  at: number;
  self?: boolean;
}

interface SpeechResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognizerClass(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** A caption disappears this long after its speaker last said anything. */
const LINE_TTL_MS = 7000;
/** At most this often an unfinished line is sent while someone talks. */
const INTERIM_EVERY_MS = 450;
const SHOW_KEY = "huddle-captions-show";

export function useLiveCaptions(options: {
  /** The voice room you are seated in, or null. */
  roomId: string | null;
  /** Your mic is muted (by you, a moderator or the stage). */
  muted: boolean;
  send: (event: ClientEvent) => void;
  selfConnectionId: string | null;
  onError?: (message: string) => void;
}) {
  const { roomId, muted, send, selfConnectionId, onError } = options;
  const [browserSupported] = useState(() => recognizerClass() !== null);
  const [prefs, setPrefs] = useState<CaptionPrefs>(() =>
    typeof window === "undefined" ? { engine: "auto", language: "tr" } : getCaptionPrefs(),
  );
  const [duyuReady, setDuyuReady] = useState(false);
  useEffect(() => onCaptionPrefsChange(() => setPrefs(getCaptionPrefs())), []);
  useEffect(() => {
    if (!roomId || prefs.engine === "browser") return;
    let live = true;
    void duyuAvailable().then((ok) => live && setDuyuReady(ok));
    return () => {
      live = false;
    };
  }, [roomId, prefs.engine]);
  // Duyu when chosen (or on auto) and the server has it; otherwise the browser.
  const engine: "duyu" | "browser" | null =
    prefs.engine !== "browser" && duyuReady ? "duyu" : browserSupported ? "browser" : null;
  const supported = engine !== null;
  const [sharing, setSharing] = useState(false);
  const [showing, setShowing] = useState(() => {
    try {
      return localStorage.getItem(SHOW_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [lines, setLines] = useState<CaptionLine[]>([]);

  const sendRef = useRef(send);
  sendRef.current = send;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const upsert = useCallback((line: CaptionLine) => {
    setLines((current) => {
      const now = Date.now();
      const rest = current.filter(
        (item) => item.connectionId !== line.connectionId && now - item.at < LINE_TTL_MS,
      );
      return [...rest, line].slice(-4);
    });
  }, []);

  /** A caption from someone else in the room (from the hub). */
  const receive = useCallback(
    (event: { channelId: string; connectionId: string; displayName: string; text: string; final: boolean }) => {
      if (!roomId || event.channelId !== roomId) return;
      upsert({
        connectionId: event.connectionId,
        name: event.displayName,
        text: event.text,
        final: event.final,
        at: Date.now(),
      });
    },
    [roomId, upsert],
  );

  // Old lines fade out.
  useEffect(() => {
    if (!lines.length) return;
    const timer = window.setInterval(() => {
      setLines((current) => {
        const now = Date.now();
        const kept = current.filter((item) => now - item.at < LINE_TTL_MS);
        return kept.length === current.length ? current : kept;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lines.length]);

  // Leaving the room clears the board and stops sharing.
  useEffect(() => {
    setLines([]);
    if (!roomId) setSharing(false);
  }, [roomId]);

  // Your own speech -> captions, while sharing, seated and unmuted.
  const listening = sharing && Boolean(roomId) && !muted && supported;
  useEffect(() => {
    if (!listening) return;
    let lastInterim = 0;
    const emit = (text: string, final: boolean) => {
      const now = Date.now();
      if (!final && now - lastInterim < INTERIM_EVERY_MS) return;
      if (!final) lastInterim = now;
      // Keep the tail of a long run-on sentence; that is what is being said.
      const clipped = text.length > 220 ? `…${text.slice(-220)}` : text;
      sendRef.current({ t: "caption", text: clipped, final });
      upsert({
        connectionId: selfConnectionId || "self",
        name: "You",
        text: clipped,
        final,
        at: now,
        self: true,
      });
    };

    if (engine === "duyu") {
      return startDuyuCaptions({
        language: prefs.language,
        onText: emit,
        onFatal: (message) => {
          setSharing(false);
          onErrorRef.current?.(message);
        },
      });
    }

    const Recognition = recognizerClass();
    if (!Recognition) return;
    let stopped = false;
    const recognizer = new Recognition();
    recognizer.lang = navigator.language || "en-US";
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (text) emit(text, result.isFinal);
      }
    };
    recognizer.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true;
        setSharing(false);
        onErrorRef.current?.("Captions need microphone access for speech recognition.");
      } else if (event.error === "language-not-supported") {
        stopped = true;
        setSharing(false);
        onErrorRef.current?.("Your browser cannot caption this language.");
      }
      // no-speech / network / aborted: onend restarts it.
    };
    // The browser ends recognition after silence or a minute; pick it back up.
    recognizer.onend = () => {
      if (stopped) return;
      window.setTimeout(() => {
        if (stopped) return;
        try {
          recognizer.start();
        } catch {
          /* already started */
        }
      }, 250);
    };
    try {
      recognizer.start();
    } catch {
      /* already started */
    }
    return () => {
      stopped = true;
      recognizer.onend = null;
      try {
        recognizer.abort();
      } catch {
        /* not running */
      }
    };
  }, [listening, engine, prefs.language, selfConnectionId, upsert]);

  const toggleShowing = useCallback(() => {
    setShowing((current) => {
      const next = !current;
      try {
        localStorage.setItem(SHOW_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  const toggleSharing = useCallback(() => {
    setSharing((current) => {
      const next = !current;
      // Sharing your own captions implies wanting to see them.
      if (next) {
        setShowing(true);
        try {
          localStorage.setItem(SHOW_KEY, "1");
        } catch {
          /* private mode */
        }
      }
      return next;
    });
  }, []);

  return { supported, engine, sharing, showing, listening, lines, receive, toggleShowing, toggleSharing };
}

export type LiveCaptions = ReturnType<typeof useLiveCaptions>;
