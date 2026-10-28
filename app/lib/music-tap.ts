"use client";

import { eqDbAt } from "@/lib/winamp-eq";

/**
 * The music bot's sound as this browser hears it, for things that dance to it
 * for real: the Winamp theme's analyser and the club's Winamp wall. The voice
 * playback hands over the bot's stream (setMusicStream); whoever wants to
 * look at it opens a reader, and while at least one is open a quiet analyser
 * listens in (it is never connected to the speakers).
 *
 * Nothing to read when the bot doesn't stream to this browser: not in voice
 * with it, or the music plays from the page's own <audio> (a fallback with no
 * CORS, which Web Audio may not read).
 */

let stream: MediaStream | null = null;
let readers = 0;
let tap: { context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; stream: MediaStream } | null = null;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let freq: Uint8Array<ArrayBuffer> | null = null;
let time: Uint8Array<ArrayBuffer> | null = null;
/** The EQ curve as heard (dB per band), so the analyser shows what the sliders do. */
let heardEq: readonly number[] | null = null;

const MIN_DB = -88;
const MAX_DB = -22;

function untap() {
  if (!tap) return;
  tap.source.disconnect();
  void tap.context.close().catch(() => undefined);
  tap = null;
}

function connect() {
  if (!stream || readers === 0 || !stream.getAudioTracks().some((track) => track.readyState === "live")) { untap(); return; }
  if (tap?.stream === stream) return;
  untap();
  try {
    const context = new AudioContext({ latencyHint: "playback" });
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = MIN_DB;
    analyser.maxDecibels = MAX_DB;
    source.connect(analyser);
    tap = { context, source, analyser, stream };
    if (context.state !== "running") {
      // Autoplay rules: the first tap or key wakes it.
      const wake = () => { void context.resume().catch(() => undefined); };
      window.addEventListener("pointerdown", wake, { once: true });
      window.addEventListener("keydown", wake, { once: true });
      wake();
    }
  } catch {
    tap = null;
  }
}

/** The voice playback: the music bot's stream now, or null. */
export function setMusicStream(next: MediaStream | null) {
  if (next === stream) return;
  stream = next;
  connect();
}

/** The voice playback: the equalizer the music goes through here (ten bands, dB), or null. */
export function setHeardEq(bands: readonly number[] | null) {
  heardEq = bands;
}

export interface MusicReader {
  /**
   * Fills `out` with its length of bands, spaced evenly on a log scale from `low` to `high` Hz, each 0..1
   * (the equalizer included); false (and `out` untouched) when there's no music to read here.
   */
  bands(out: Float32Array, low?: number, high?: number): boolean;
  /** Fills `out` with the waveform, -1..1; false when there's no music to read here. */
  wave(out: Float32Array): boolean;
  close(): void;
}

export function openMusicReader(): MusicReader {
  readers++;
  clearTimeout(closeTimer);
  connect();
  let open = true;
  const live = () => {
    if (!tap || tap.context.state !== "running") return null;
    const analyser = tap.analyser;
    if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
    if (!time || time.length !== analyser.fftSize) time = new Uint8Array(analyser.fftSize);
    return analyser;
  };
  return {
    bands(out, low = 40, high = 16000) {
      const analyser = live();
      if (!analyser || !freq) return false;
      analyser.getByteFrequencyData(freq);
      const hzPerBin = tap!.context.sampleRate / analyser.fftSize;
      const n = out.length;
      const span = Math.log(high / low);
      for (let i = 0; i < n; i++) {
        const f0 = low * Math.exp((span * i) / n);
        const f1 = low * Math.exp((span * (i + 1)) / n);
        const b0 = Math.max(1, Math.floor(f0 / hzPerBin));
        const b1 = Math.max(b0, Math.min(freq.length - 1, Math.ceil(f1 / hzPerBin)));
        let peak = 0;
        for (let b = b0; b <= b1; b++) if (freq[b] > peak) peak = freq[b];
        let level = peak / 255;
        if (heardEq) level += eqDbAt(Math.sqrt(f0 * f1), heardEq) / (MAX_DB - MIN_DB);
        // The highs carry less energy; tilt them up a little, as Winamp's analyser looked.
        level *= 0.92 + 0.25 * (i / n);
        out[i] = level < 0 ? 0 : level > 1 ? 1 : level;
      }
      return true;
    },
    wave(out) {
      const analyser = live();
      if (!analyser || !time) return false;
      analyser.getByteTimeDomainData(time);
      const step = time.length / out.length;
      for (let i = 0; i < out.length; i++) out[i] = (time[Math.floor(i * step)] - 128) / 128;
      return true;
    },
    close() {
      if (!open) return;
      open = false;
      readers--;
      // A view that closes and opens again straight away (a re-render, a venue change) keeps the same tap.
      if (readers === 0) closeTimer = setTimeout(() => { if (readers === 0) untap(); }, 3000);
    },
  };
}
