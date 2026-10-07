"use client";

/**
 * The microphone, with everything that happens to it before anyone hears you.
 *
 * A Huddle room is a full mesh with no server in the audio path, so the mic is
 * processed once here and every peer — plus "Clip that!" and the session
 * recorder, which read the same track — gets the result for free.
 *
 * The chain is an AudioWorklet (see `public/mic-worklet.js`) between the raw
 * capture and a destination node whose stream is what actually goes on the
 * wire. Every part of it is optional and every failure falls back to the raw
 * microphone: losing the denoiser should cost you the denoiser, not the call.
 */

import { basePath } from "./client";
import { microphoneConstraints, savedDevice } from "./devices";
import { buildVoiceEffect, type VoiceEffect } from "./voice-effects";

export type SuppressionMode = "off" | "browser" | "rnnoise" | "voice";

export interface MicSettings {
  mode: SuppressionMode;
  /** Manual input gain in dB, used when autoGain is off. */
  gainDb: number;
  autoGain: boolean;
  /** Gate threshold in dBFS, or "auto" to let voice detection decide. */
  sensitivity: number | "auto";
  gate: boolean;
  /**
   * The browser's echo cancellation. Only worth turning off on headphones,
   * where there is no echo to cancel but it still dulls you slightly while
   * someone else is talking at the same time.
   */
  echoCancellation: boolean;
  /** Trim the rumble and low-end boom a close-up mic adds (see the worklet). */
  clarity: boolean;
  /** A character effect on your voice, applied after all cleanup (see voice-effects.ts). */
  voiceEffect: VoiceEffect;
}

export interface MicTelemetry {
  /** Level arriving at the gate, which is what a threshold is compared against. */
  inputDb: number;
  /** Level leaving the chain — what other people actually receive. */
  outputDb: number;
  floorDb: number;
  vad: number;
  gateOpen: boolean;
  gainDb: number;
}

export interface MicChain {
  /** The processed track. This is what goes to peers and recordings. */
  stream: MediaStream;
  /** The untouched capture, kept only so stop() can genuinely release the mic. */
  raw: MediaStream;
  /** False when we fell back and the raw mic is being used as-is. */
  processing: boolean;
  /** True once RNNoise is loaded and running. */
  rnnoise: boolean;
  /** False while the processing graph is stopped, so `stream` carries silence. */
  readonly live: boolean;
  update(next: Partial<MicSettings>): void;
  onTelemetry(listener: (telemetry: MicTelemetry) => void): () => void;
  /**
   * Wakes the processing graph. A phone suspends (iOS: "interrupts") every
   * AudioContext while the page is in the background and does not always
   * restart it on return, which leaves the processed track silent.
   */
  resume(): void;
  stop(): void;
}

const KEYS = {
  mode: "huddle-noise",
  gain: "huddle-mic-gain",
  autoGain: "huddle-mic-auto-gain",
  sensitivity: "huddle-mic-sensitivity",
  gate: "huddle-mic-gate",
  echoCancellation: "huddle-mic-echo-cancellation",
  clarity: "huddle-mic-clarity",
  voiceEffect: "huddle-voice-effect",
};

export const DEFAULT_SETTINGS: MicSettings = {
  mode: "browser",
  gainDb: 0,
  autoGain: true,
  sensitivity: "auto",
  gate: true,
  echoCancellation: true,
  clarity: true,
  voiceEffect: "none",
};

export const GAIN_RANGE = { min: -12, max: 30 };
export const SENSITIVITY_RANGE = { min: -80, max: -10 };

/**
 * Reads the saved input settings. These live per-machine rather than per
 * account, on the same reasoning as the device pickers: which microphone is
 * plugged in, and how loud the room is, are properties of where you are
 * sitting. (`voice_prefs` in D1 is the other direction — how you hear others.)
 */
export function readMicSettings(): MicSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  const store = window.localStorage;

  // "on"/"off" predate the third option, so an existing choice still reads.
  const saved = store.getItem(KEYS.mode);
  const mode: SuppressionMode =
    saved === "off"
      ? "off"
      : saved === "ai"
        ? "rnnoise"
        : saved === "voice"
          ? "voice"
          : "browser";

  const gainDb = Number(store.getItem(KEYS.gain));
  const sensitivityRaw = store.getItem(KEYS.sensitivity);
  const sensitivity = Number(sensitivityRaw);

  return {
    mode,
    gainDb: Number.isFinite(gainDb) ? clamp(gainDb, GAIN_RANGE.min, GAIN_RANGE.max) : 0,
    autoGain: store.getItem(KEYS.autoGain) !== "off",
    sensitivity:
      sensitivityRaw && sensitivityRaw !== "auto" && Number.isFinite(sensitivity)
        ? clamp(sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max)
        : "auto",
    gate: store.getItem(KEYS.gate) !== "off",
    echoCancellation: store.getItem(KEYS.echoCancellation) !== "off",
    clarity: store.getItem(KEYS.clarity) !== "off",
    voiceEffect: (["vampire", "gramophone"] as const).find((id) => id === store.getItem(KEYS.voiceEffect)) || "none",
  };
}

export function writeMicSettings(next: Partial<MicSettings>): MicSettings {
  const merged = { ...readMicSettings(), ...next };
  if (typeof window === "undefined") return merged;
  const store = window.localStorage;

  store.setItem(
    KEYS.mode,
    merged.mode === "off"
      ? "off"
      : merged.mode === "browser"
        ? "on"
        : merged.mode === "voice"
          ? "voice"
          : "ai",
  );
  store.setItem(KEYS.gain, String(merged.gainDb));
  store.setItem(KEYS.autoGain, merged.autoGain ? "on" : "off");
  store.setItem(KEYS.sensitivity, String(merged.sensitivity));
  store.setItem(KEYS.gate, merged.gate ? "on" : "off");
  store.setItem(KEYS.echoCancellation, merged.echoCancellation ? "on" : "off");
  store.setItem(KEYS.clarity, merged.clarity ? "on" : "off");
  store.setItem(KEYS.voiceEffect, merged.voiceEffect);
  return merged;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * The RNNoise binary, fetched at most once per page.
 *
 * The published build is closure-compiled down to two imports and exports its
 * own memory, so only the 112 KB binary is needed — the 1.9 MB of emscripten
 * glue that usually accompanies it is replaced by twenty lines in the worklet.
 *
 * Bytes rather than a compiled module on purpose: a worklet is its own agent
 * cluster, and a `WebAssembly.Module` sent across that boundary is dropped
 * silently, with no error raised on either side. The worklet compiles it.
 */
let rnnoisePromise: Promise<ArrayBuffer> | null = null;

function loadRnnoise(): Promise<ArrayBuffer> {
  rnnoisePromise ||= fetch(`${basePath}/rnnoise.wasm`).then((response) => {
    if (!response.ok) throw new Error(`rnnoise.wasm: ${response.status}`);
    return response.arrayBuffer();
  });
  return rnnoisePromise;
}

/**
 * Fired on `window` whenever a chain's processing graph starts or stops, so
 * whoever put its track on the wire can react (see `MicChain.live`).
 */
export const MIC_STATE_EVENT = "huddle-mic-state";

/**
 * Where auto-gain settled on a given microphone last time. Handing it to the
 * next chain means the first words of a call already come out at the right
 * level, instead of the room hearing the gain find its feet.
 */
function gainKey(): string {
  return `huddle-mic-agc-gain:${savedDevice("microphone") || "default"}`;
}

function readSettledGain(): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(gainKey()));
    return Number.isFinite(value) ? clamp(value, GAIN_RANGE.min, GAIN_RANGE.max) : 0;
  } catch {
    return 0;
  }
}

function saveSettledGain(gainDb: number): void {
  try {
    window.localStorage.setItem(gainKey(), gainDb.toFixed(1));
  } catch {
    // Private mode; the next call just starts from 0 dB.
  }
}

/**
 * Re-applies the capture-level constraints to a live track.
 *
 * Switching suppression modes changes what the browser's own processing should
 * be doing, and `applyConstraints` changes it on the running device — reopening
 * the microphone instead would mean a new track, and a new track in a mesh call
 * means every peer renegotiates and everyone hears the gap.
 */
function applyCapture(raw: MediaStream, settings: MicSettings, worklet: boolean): void {
  const intent = {
    mode: settings.mode,
    browserGain: !worklet && settings.autoGain,
    echoCancellation: settings.echoCancellation,
  };
  for (const track of raw.getAudioTracks()) {
    void track.applyConstraints(microphoneConstraints(intent)).catch(() => {
      // A browser that will not retune mid-flight keeps the old settings; the
      // worklet half of the chain still responds.
    });
  }
}

/**
 * A chain that passes the microphone through untouched, for when the worklet or
 * Web Audio is unavailable.
 *
 * It still meters the input if it possibly can: the settings dialog draws its
 * sensitivity slider over a live meter, and a dead meter there is worse than a
 * missing feature — it looks like a broken microphone.
 */
function browserFallback(settings: MicSettings): MicSettings {
  return settings.mode === "off" ? settings : { ...settings, mode: "browser" };
}

function rawChain(raw: MediaStream, context: AudioContext | null): MicChain {
  // Auto-gain included: with no worklet the browser's is the only one left,
  // and a raw microphone with none at all is quieter than anyone expects.
  applyCapture(raw, browserFallback(readMicSettings()), false);
  const listeners = new Set<(telemetry: MicTelemetry) => void>();
  let meter: { context: AudioContext; timer: number } | null = null;

  try {
    const own = context && context.state === "running" ? context : new AudioContext();
    const analyser = own.createAnalyser();
    analyser.fftSize = 512;
    own.createMediaStreamSource(raw).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const timer = window.setInterval(() => {
      if (!listeners.size) return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const db = 20 * Math.log10(Math.sqrt(energy / samples.length) + 1e-10);
      const telemetry: MicTelemetry = {
        inputDb: db,
        outputDb: db,
        floorDb: -100,
        vad: 0,
        gateOpen: true,
        gainDb: 0,
      };
      for (const listener of listeners) listener(telemetry);
    }, 50);
    meter = { context: own, timer };
  } catch {
    // No meter, then. The microphone itself still works, which is the point.
  }

  return {
    stream: raw,
    raw,
    processing: false,
    rnnoise: false,
    live: true,
    update(next) {
      // The browser's own processing is the only thing left to steer here, so
      // it stands in for the neural modes rather than leaving you unfiltered.
      applyCapture(raw, browserFallback({ ...readMicSettings(), ...next }), false);
    },
    onTelemetry(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resume() {
      // Only the meter runs through Web Audio here; the call itself does not.
      if (meter && meter.context.state !== "running") {
        void meter.context.resume().catch(() => undefined);
      }
    },
    stop() {
      listeners.clear();
      if (meter) window.clearInterval(meter.timer);
      raw.getTracks().forEach((track) => track.stop());
      void meter?.context.close().catch(() => undefined);
      if (context && context !== meter?.context) {
        void context.close().catch(() => undefined);
      }
    },
  };
}

/**
 * Opens the microphone and builds the processing chain around it.
 *
 * Callers get back a stream they can hand straight to `addTrack` or a
 * `MediaRecorder`, and must call `stop()` when finished — the raw capture is
 * not reachable from the returned stream, so nothing else can release it.
 */
export async function openMicrophone(
  overrides: Partial<MicSettings> = {},
): Promise<MicChain> {
  const settings = { ...readMicSettings(), ...overrides };

  // Opened as if the worklet will run; the fallback re-tunes it if not.
  const constraints = microphoneConstraints({
    mode: settings.mode,
    browserGain: false,
    echoCancellation: settings.echoCancellation,
  });
  let raw: MediaStream;
  try {
    raw = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (error) {
    // The chosen microphone is unplugged. Join on the system default rather
    // than not at all; plugging it back in offers to switch back.
    const name = (error as DOMException)?.name;
    if (!constraints.deviceId || (name !== "NotFoundError" && name !== "OverconstrainedError")) {
      throw error;
    }
    const anyDevice = { ...constraints };
    delete anyDevice.deviceId;
    raw = await navigator.mediaDevices.getUserMedia({ audio: anyDevice });
  }

  let context: AudioContext | null = null;
  try {
    // RNNoise is 48 kHz only. Asking for it explicitly also stops the browser
    // resampling the mic twice on hardware that runs at 44.1.
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running" || context.sampleRate !== 48000) {
      throw new Error(`unusable context: ${context.state} @ ${context.sampleRate}`);
    }

    // Versioned so a browser holding an older copy in its cache picks up a
    // retuned worklet; bump it whenever `public/mic-worklet.js` changes.
    await context.audioWorklet.addModule(`${basePath}/mic-worklet.js?v=4`);

    const source = context.createMediaStreamSource(raw);
    const node = new AudioWorkletNode(context, "mic-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { ...settings, initialGainDb: readSettledGain() },
    });
    const destination = new MediaStreamAudioDestinationNode(context, {
      channelCount: 1,
    });
    source.connect(node);
    // The effect sits between the cleaned-up voice and the wire. Swapping it
    // rewires these nodes only; `destination` (and so the track) stays put.
    let effect = buildVoiceEffect(context, settings.voiceEffect);
    node.connect(effect.input);
    effect.output.connect(destination);

    let current = settings;
    const listeners = new Set<(telemetry: MicTelemetry) => void>();
    let rnnoiseReady = false;
    let settledGain: number | null = null;
    let savedAt = 0;
    node.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "telemetry") {
        const telemetry = message as MicTelemetry;
        // Only while you talk: that is when auto-gain is actually learning.
        if (current.autoGain && telemetry.vad > 0) {
          settledGain = telemetry.gainDb;
          if (Date.now() - savedAt > 5000) {
            savedAt = Date.now();
            saveSettledGain(settledGain);
          }
        }
        for (const listener of listeners) listener(telemetry);
      } else if (message?.type === "rnnoise") {
        rnnoiseReady = Boolean(message.ready);
      }
    };

    // Fetched for everyone: besides denoising in its own modes, RNNoise is the
    // speech detector the gate relies on in all of them, so a swallow or a sip
    // of tea does not open your mic. The mode argument is kept so a failed
    // fetch is retried on the next change.
    let requested = false;
    const ensureRnnoise = (_mode: SuppressionMode) => {
      if (requested) return;
      requested = true;
      loadRnnoise().then(
        // A copy, not a transfer: the buffer is cached for the next chain.
        (bytes) => node.port.postMessage({ type: "wasm", bytes: bytes.slice(0) }),
        () => {
          requested = false;
        },
      );
    };
    ensureRnnoise(settings.mode);

    context.onstatechange = () => window.dispatchEvent(new Event(MIC_STATE_EVENT));

    const chain: MicChain = {
      stream: destination.stream,
      raw,
      processing: true,
      get rnnoise() {
        return rnnoiseReady;
      },
      get live() {
        return context?.state === "running";
      },
      update(next) {
        // Live settings: a slider moving must not rebuild the track, or every
        // peer renegotiates and the room hears a dropout.
        node.port.postMessage({ type: "settings", ...next });
        if (next.mode) ensureRnnoise(next.mode);

        const previous = current;
        current = { ...current, ...next };
        if (current.mode !== previous.mode) applyCapture(raw, current, true);
        if (context && current.voiceEffect !== previous.voiceEffect) {
          try {
            node.disconnect();
          } catch {
            // Not connected.
          }
          effect.dispose();
          effect = buildVoiceEffect(context, current.voiceEffect);
          node.connect(effect.input);
          effect.output.connect(destination);
        }
      },
      onTelemetry(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      resume() {
        if (context && context.state !== "running") {
          void context.resume().catch(() => undefined);
        }
      },
      stop() {
        listeners.clear();
        node.port.onmessage = null;
        if (settledGain !== null) saveSettledGain(settledGain);
        if (context) context.onstatechange = null;
        try {
          source.disconnect();
          node.disconnect();
          effect.dispose();
        } catch {
          // Already torn down.
        }
        destination.stream.getTracks().forEach((track) => track.stop());
        raw.getTracks().forEach((track) => track.stop());
        void context?.close().catch(() => undefined);
      },
    };
    return chain;
  } catch (error) {
    // Anything at all going wrong here costs the processing, never the call.
    console.warn("[huddle] microphone processing unavailable", error);
    return rawChain(raw, context);
  }
}
