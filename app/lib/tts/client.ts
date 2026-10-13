"use client";

/**
 * Text-to-speech. Turkish goes through the server to PatientDesk's Alania-2
 * when SPEECH_API_KEY is set (api/tts/speak), falling back to EMA Lightning in
 * the browser. English is Paradee-8M (or Piper's hfc_male for the male voice).
 * The local models run in a worker (public/assets/tts/tts-worker.js, built
 * from ./worker) and download once per browser.
 */
import { basePath } from "../client";
import { DEFAULT_ALANIA_MALE_VOICE, DEFAULT_ALANIA_VOICE, isAlaniaVoice, type AlaniaVoiceId } from "@/lib/speech";
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
  worker = new Worker(`${basePath}/assets/tts/tts-worker.js?v=5`, { type: "module" });
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
/** "robot": ring-modulated, a machine voice that suits the Matrix theme. */
export type TtsEffect = "none" | "robot";

/** "male": English in a male voice (Piper hfc_male). */
export type TtsSpeaker = "default" | "male";

export interface TtsVoice {
  tempo: number;
  pitch: number;
  effect?: TtsEffect;
  speaker?: TtsSpeaker;
  /** The Alania-2 voice for Turkish (when the server has a speech key). */
  turkish?: AlaniaVoiceId;
}

export const DEFAULT_TTS_VOICE: TtsVoice = {
  tempo: 1,
  pitch: 1,
  effect: "none",
  speaker: "default",
  turkish: DEFAULT_ALANIA_VOICE,
};
export const TTS_TEMPO_RANGE = [0.6, 1.3] as const;
export const TTS_PITCH_RANGE = [0.75, 1.15] as const;

/** Clamps anything (a setting, or another client's /tts payload) to a sane voice. */
export function clampTtsVoice(voice: unknown): TtsVoice {
  const v = (voice ?? {}) as Partial<Record<keyof TtsVoice, unknown>>;
  const clamp = (value: unknown, [lo, hi]: readonly [number, number]) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : 1;
  return {
    tempo: clamp(v.tempo, TTS_TEMPO_RANGE),
    pitch: clamp(v.pitch, TTS_PITCH_RANGE),
    effect: v.effect === "robot" ? "robot" : "none",
    speaker: v.speaker === "male" ? "male" : "default",
    // Voices saved before Alania had a choice: the male setting carries over.
    turkish: isAlaniaVoice(v.turkish)
      ? v.turkish
      : v.speaker === "male"
        ? DEFAULT_ALANIA_MALE_VOICE
        : DEFAULT_ALANIA_VOICE,
  };
}

/**
 * Applies a voice effect to synthesized audio. "robot" is ring modulation: the
 * voice multiplied by a 50 Hz tone (with a little dry signal kept so words stay
 * clear), then normalised so it is as loud as the original.
 */
export function applyTtsEffect(audio: Float32Array, sampleRate: number, effect: TtsEffect | undefined): Float32Array {
  if (effect !== "robot") return audio;
  const out = new Float32Array(audio.length);
  const step = (2 * Math.PI * 50) / sampleRate;
  let peakIn = 0;
  let peakOut = 0;
  for (let i = 0; i < audio.length; i++) {
    const x = audio[i];
    const y = 0.8 * x * Math.sin(i * step) + 0.2 * x;
    out[i] = y;
    peakIn = Math.max(peakIn, Math.abs(x));
    peakOut = Math.max(peakOut, Math.abs(y));
  }
  if (peakOut > 0) {
    const gain = peakIn / peakOut;
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }
  return out;
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

// ---------- Turkish through the server (PatientDesk Alania-2) ----------

/** Off for this page once the server says it has no key, so we stop asking. */
let remoteTurkish = true;

/** 16-bit PCM samples out of a WAV file, as floats. */
function decodeWav(bytes: ArrayBuffer): TtsAudio {
  const view = new DataView(bytes);
  let sampleRate = 24000;
  let channels = 1;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(bytes, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    } else if (id === "data") {
      // Streamed WAVs may leave the data size as 0 or 0xffffffff: read to the end.
      const end = size && offset + 8 + size <= view.byteLength ? offset + 8 + size : view.byteLength;
      const frames = Math.floor((end - offset - 8) / (2 * channels));
      const audio = new Float32Array(frames);
      for (let i = 0; i < frames; i++) audio[i] = view.getInt16(offset + 8 + i * 2 * channels, true) / 32768;
      return { audio, sampleRate };
    }
    offset += 8 + size + (size & 1);
  }
  throw new Error("The speech service sent no audio.");
}

/** Alania-2 audio, or null to fall back to the in-browser model. */
async function synthesizeRemote(text: string, tempo: number, voice: AlaniaVoiceId | undefined): Promise<TtsAudio | null> {
  if (!remoteTurkish) return null;
  try {
    // The API has no speaking rate, only style presets.
    const style = tempo <= 0.85 ? "slow" : tempo >= 1.15 ? "fast" : undefined;
    const response = await fetch(`${basePath}/api/tts/speak`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice, style }),
    });
    if (response.status === 501) remoteTurkish = false;
    if (!response.ok) return null;
    return decodeWav(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function synthesize(text: string, lang: TtsLanguage, voice: TtsVoice = DEFAULT_TTS_VOICE): Promise<TtsAudio> {
  const { tempo, pitch, effect, speaker, turkish } = clampTtsVoice(voice);
  const remote = lang === "tr" ? await synthesizeRemote(text, tempo, turkish) : null;
  const id = nextId++;
  return (
    remote
      ? Promise.resolve(remote)
      : new Promise<TtsAudio>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          getWorker().postMessage({ type: "speak", id, text, lang, speed: tempo / pitch, speaker });
        })
  ).then(({ audio, sampleRate }) => ({
    audio: applyTtsEffect(audio, sampleRate, effect),
    sampleRate: Math.round(sampleRate * pitch),
  }));
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
