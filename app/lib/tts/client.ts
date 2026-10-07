"use client";

/**
 * Text-to-speech, entirely in the browser: Turkish with EMA Lightning,
 * English with Paradee-8M. The models run in a worker
 * (public/assets/tts/tts-worker.js, built from ./worker) and download once
 * per browser; nothing is sent anywhere to be spoken.
 */
import { basePath } from "../client";
/** /tts: the sender picks (a "tr"/"en" prefix, or the dialog). /say also guesses first. */
export type TtsLanguage = "tr" | "en";

export { detectLanguage } from "./language";

/** Longest text spoken from one message, so nobody can read a novel at the room. */
export const TTS_MAX_CHARS = 400;

export interface TtsAudio {
  audio: Float32Array;
  sampleRate: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (audio: TtsAudio) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(`${basePath}/assets/tts/tts-worker.js?v=3`, { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | { type: "audio"; id: number; audio: Float32Array; sampleRate: number }
      | { type: "error"; id: number; message: string };
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.type === "audio") entry.resolve({ audio: data.audio, sampleRate: data.sampleRate });
    else entry.reject(new Error(data.message));
  };
  worker.onerror = (event) => {
    for (const entry of pending.values()) entry.reject(new Error(event.message || "The voice engine crashed."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  worker.postMessage({ type: "init", basePath });
  return worker;
}

/** Text cleaned for reading aloud: no links, markup or emoji shortcodes. */
export function speakableText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<a?:\w+:\d+>|:[\w+-]+:/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\/?\w+(?:=[^\]]*)?\]/g, "")
    .replace(/[*_~`|>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TTS_MAX_CHARS);
}

// ---------- voice: tempo and depth ----------

/**
 * How a voice sounds. `tempo` is the speaking rate (1 = normal, lower is
 * slower); `pitch` below 1 makes it deeper. Depth costs nothing extra: the
 * model speaks a little faster and the audio is played back a little slower,
 * which lowers the pitch while the tempo lands where it was asked to.
 */
export interface TtsVoice {
  tempo: number;
  pitch: number;
}

export const DEFAULT_TTS_VOICE: TtsVoice = { tempo: 1, pitch: 1 };
export const TTS_TEMPO_RANGE = [0.6, 1.3] as const;
export const TTS_PITCH_RANGE = [0.75, 1.15] as const;

/** Clamps anything (a setting, or another client's /tts payload) to a sane voice. */
export function clampTtsVoice(voice: unknown): TtsVoice {
  const v = (voice ?? {}) as Partial<Record<keyof TtsVoice, unknown>>;
  const clamp = (value: unknown, [lo, hi]: readonly [number, number]) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : 1;
  return { tempo: clamp(v.tempo, TTS_TEMPO_RANGE), pitch: clamp(v.pitch, TTS_PITCH_RANGE) };
}

const VOICE_KEY = "huddle_tts_voice";

/** This device's voice for /tts and /say. */
export function getTtsVoice(): TtsVoice {
  try {
    return clampTtsVoice(JSON.parse(window.localStorage.getItem(VOICE_KEY) || "null"));
  } catch {
    return DEFAULT_TTS_VOICE;
  }
}

export function setTtsVoice(voice: TtsVoice) {
  try {
    window.localStorage.setItem(VOICE_KEY, JSON.stringify(clampTtsVoice(voice)));
  } catch {
    // Private mode: the voice just does not stick.
  }
}

export function synthesize(text: string, lang: TtsLanguage, voice: TtsVoice = DEFAULT_TTS_VOICE): Promise<TtsAudio> {
  const { tempo, pitch } = clampTtsVoice(voice);
  const id = nextId++;
  return new Promise<TtsAudio>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "speak", id, text, lang, speed: tempo / pitch });
  }).then(({ audio, sampleRate }) => ({ audio, sampleRate: Math.round(sampleRate * pitch) }));
}

// ---------- hearing /tts messages ----------

const PLAYBACK_KEY = "huddle_tts_playback";

/** Whether /tts messages are read aloud on this device (on unless turned off). */
export function ttsPlaybackEnabled(): boolean {
  try {
    return window.localStorage.getItem(PLAYBACK_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTtsPlaybackEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(PLAYBACK_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode: the toggle just does not stick.
  }
}

let playbackContext: AudioContext | null = null;
let playbackEndsAt = 0;
let waiting = 0;
/** Bumped by a force-stop, so speech still being synthesized is dropped too. */
let generation = 0;
const playing = new Set<AudioBufferSourceNode>();

/** Cuts off every /tts playing or queued on this device (an admin's /ttsstop). */
export function stopTtsPlayback() {
  generation++;
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      // Already ended.
    }
  }
  playing.clear();
  playbackEndsAt = 0;
}

export interface TtsPlaybackHooks {
  /** When this clip actually starts (after anything queued before it). */
  onStart?: () => void;
  onEnd?: () => void;
}

/** Plays audio on this device, after anything already queued. */
export async function playTts({ audio, sampleRate }: TtsAudio, volume = 1, hooks: TtsPlaybackHooks = {}): Promise<void> {
  playbackContext ??= new AudioContext();
  const context = playbackContext;
  await context.resume().catch(() => undefined);
  const buffer = context.createBuffer(1, audio.length, sampleRate);
  buffer.copyToChannel(new Float32Array(audio), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(context.destination);
  const startAt = Math.max(context.currentTime + 0.03, playbackEndsAt);
  playing.add(source);
  source.onended = () => {
    playing.delete(source);
    hooks.onEnd?.();
  };
  source.start(startAt);
  playbackEndsAt = startAt + buffer.duration;
  if (hooks.onStart) window.setTimeout(hooks.onStart, Math.max(0, (startAt - context.currentTime) * 1000));
}

/**
 * Reads a /tts message aloud here. A burst of them is capped so a spammer
 * cannot queue minutes of speech.
 */
export async function speakMessage(
  text: string,
  lang: TtsLanguage,
  hooks: TtsPlaybackHooks = {},
  voice: TtsVoice = DEFAULT_TTS_VOICE,
): Promise<void> {
  const clean = speakableText(text);
  if (!clean || waiting >= 3) return;
  waiting++;
  const started = generation;
  try {
    const speech = await synthesize(clean, lang, voice);
    // Force-stopped while it was being made: never play it.
    if (started !== generation) return;
    await playTts(speech, 1, hooks);
  } finally {
    waiting--;
  }
}
