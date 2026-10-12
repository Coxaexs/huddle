"use client";

/**
 * Live captions with Duyu (PatientDesk's Turkish speech-to-text), streamed
 * through the worker at /api/stt/stream so the API key stays on the server.
 * The microphone is downsampled to 16 kHz 16-bit PCM and sent in ~85 ms
 * chunks; Duyu answers with partial and final lines.
 */
import { basePath } from "../client";
import type { DuyuLanguage } from "@/lib/speech";

const TARGET_RATE = 16000;
/** Reconnect backoff after a dropped stream, capped. */
const RETRY_MS = [500, 1500, 4000, 10000];

// ---------- preferences ----------

/** "auto": Duyu when the server has a speech key, else the browser's own. */
export type CaptionEngine = "auto" | "duyu" | "browser";
export interface CaptionPrefs {
  engine: CaptionEngine;
  language: DuyuLanguage;
}

const PREFS_KEY = "huddle-captions-engine";
const PREFS_EVENT = "huddle-captions-prefs";

export function getCaptionPrefs(): CaptionPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null") as Partial<CaptionPrefs> | null;
    return {
      engine: raw?.engine === "duyu" || raw?.engine === "browser" ? raw.engine : "auto",
      language: raw?.language === "auto" ? "auto" : "tr",
    };
  } catch {
    return { engine: "auto", language: "tr" };
  }
}

export function setCaptionPrefs(prefs: CaptionPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the choice just does not stick.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function onCaptionPrefsChange(listener: () => void): () => void {
  window.addEventListener(PREFS_EVENT, listener);
  return () => window.removeEventListener(PREFS_EVENT, listener);
}

let availability: Promise<boolean> | null = null;

/** Whether this server can caption with Duyu (asked once per page). */
export function duyuAvailable(): Promise<boolean> {
  availability ??= fetch(`${basePath}/api/stt`)
    .then((response) => (response.ok ? (response.json() as Promise<{ configured?: boolean }>) : { configured: false }))
    .then((body: { configured?: boolean }) => Boolean(body.configured))
    .catch(() => false);
  return availability;
}

// ---------- streaming ----------

export interface DuyuCaptionOptions {
  language: DuyuLanguage;
  onText: (text: string, final: boolean) => void;
  /** A problem that stops captioning for good (no microphone, refused). */
  onFatal: (message: string) => void;
}

/** Starts captioning your microphone; returns a stop function. */
export function startDuyuCaptions({ language, onText, onFatal }: DuyuCaptionOptions): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let ready = false;
  let attempt = 0;
  let retryTimer = 0;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;

  const connect = () => {
    if (stopped) return;
    const url = new URL(`${basePath}/api/stt/stream`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    socket = ws;
    ready = false;
    ws.onopen = () => {
      // Turkish is Duyu's default; only "auto" needs saying.
      ws.send(
        JSON.stringify({ type: "start", sampleRate: TARGET_RATE, partials: true, ...(language === "auto" ? { language } : {}) }),
      );
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let message: { type?: string; text?: string; message?: string; code?: string };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        ready = true;
        attempt = 0;
      } else if (message.type === "partial" && message.text?.trim()) {
        onText(message.text.trim(), false);
      } else if (message.type === "final" && message.text?.trim()) {
        onText(message.text.trim(), true);
      } else if (message.type === "error" && /quota|auth|key|unauthori/i.test(`${message.code} ${message.message}`)) {
        stopped = true;
        onFatal(message.message || "Duyu refused the caption stream.");
        ws.close();
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      ready = false;
      if (stopped) return;
      retryTimer = window.setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
    };
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      if (!stopped) onFatal("Captions need microphone access.");
      return;
    }
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but runs everywhere without a module file;
    // 4096 frames at 48 kHz is ~85 ms, inside Duyu's 40–100 ms chunk window.
    const processor = context.createScriptProcessor(4096, 1, 1);
    const ratio = context.sampleRate / TARGET_RATE;
    processor.onaudioprocess = (event) => {
      if (!ready || socket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const frames = Math.floor(input.length / ratio);
      const pcm = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        // Average each run of samples: a cheap low-pass before decimating.
        const from = Math.floor(i * ratio);
        const to = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = from; j < to; j++) sum += input[j];
        const sample = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      socket.send(pcm.buffer);
    };
    // A muted gain keeps the processor running without playing the mic back.
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(processor).connect(silent).connect(context.destination);
    connect();
  })();

  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "stop" }));
      } catch {
        // Closing anyway.
      }
    }
    socket?.close();
    socket = null;
    stream?.getTracks().forEach((track) => track.stop());
    void context?.close().catch(() => undefined);
  };
}
