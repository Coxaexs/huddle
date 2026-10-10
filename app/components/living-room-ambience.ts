/**
 * The Living Room's own sounds: recorded fire, rain, wind, computer fans and a
 * night city (CC0 recordings from BigSoundBank, see public/sounds/living-room/
 * SOURCES.txt), each placed where it belongs in the room and heard from where
 * you stand. Plays only in the viewer's own browser; nothing goes over the call.
 */
import { ROOM_HALF_X, ROOM_HALF_Z, type LoungePose } from "../lib/living-room";
import type { RoomTheme } from "../hooks/use-living-room";

type Clip = "fire" | "rain" | "wind" | "computer" | "city" | "clock";

interface Placed {
  clip: Clip;
  at: [number, number, number];
  gain: number;
  /** Heard through the window glass: the top end is gone. */
  muffle?: number;
  /** Rhythmic sounds (a clock) loop end to end; a crossfade would double the ticks. */
  seamless?: boolean;
}

const WINDOW: [number, number, number] = [ROOM_HALF_X - 0.1, 1.7, 2.6];
const HEARTH: [number, number, number] = [0, 0.4, -ROOM_HALF_Z + 0.65];

const isNight = (date = new Date()) => date.getHours() >= 20 || date.getHours() < 6;

/** What each room sounds like. Matrix and Cyberpunk fires are holograms: silent. */
export function ambienceFor(theme: RoomTheme, night = isNight()): Placed[] {
  switch (theme) {
    case "vampire":
      return [
        { clip: "fire", at: HEARTH, gain: 1 },
        { clip: "wind", at: WINDOW, gain: 0.75, muffle: 2800 },
      ];
    case "matrix":
      return [
        { clip: "computer", at: [ROOM_HALF_X - 0.5, 1.0, -2.6], gain: 0.9 },
      ];
    case "academia":
      // The library: the fire, rain that never stops, and the grandfather clock.
      return [
        { clip: "fire", at: HEARTH, gain: 0.9 },
        { clip: "rain", at: WINDOW, gain: 0.5, muffle: 2200 },
        { clip: "clock", at: [-ROOM_HALF_X + 0.4, 1.6, -1.4], gain: 0.6, seamless: true },
      ];
    case "cyberpunk":
      return [
        { clip: "city", at: WINDOW, gain: 0.85, muffle: 3200 },
        { clip: "rain", at: WINDOW, gain: 0.45, muffle: 2600 },
      ];
    default:
      return night
        ? [{ clip: "fire", at: HEARTH, gain: 1 }, { clip: "rain", at: WINDOW, gain: 0.55, muffle: 2400 }]
        : [{ clip: "fire", at: HEARTH, gain: 1 }];
  }
}

/** Every loop crossfades into its own start over this long, so no seam is heard. */
const CROSSFADE = 2.5;

const buffers = new Map<string, Promise<AudioBuffer>>();

function load(context: BaseAudioContext, clip: Clip): Promise<AudioBuffer> {
  const url = `/sounds/living-room/${clip}.mp3`;
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    // A failed fetch may succeed next time.
    pending.catch(() => buffers.delete(url));
    buffers.set(url, pending);
  }
  return pending;
}

type MovableListener = AudioListener & {
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
};

export class RoomAmbience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private sources: AudioBufferSourceNode[] = [];
  private disposed = false;
  private volume = 0.5;
  private muted = false;

  constructor(theme: RoomTheme) {
    try {
      this.context = new AudioContext({ latencyHint: "playback" });
    } catch {
      return;
    }
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
    for (const placed of ambienceFor(theme)) void this.start(placed);
    this.applyVolume();
  }

  private resume = () => { void this.context?.resume().catch(() => undefined); };

  private async start(placed: Placed) {
    const context = this.context;
    if (!context || !this.master) return;
    let buffer: AudioBuffer;
    try { buffer = await load(context, placed.clip); } catch { return; }
    if (this.disposed) return;
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.rolloffFactor = 1;
    panner.maxDistance = 30;
    panner.positionX.value = placed.at[0];
    panner.positionY.value = placed.at[1];
    panner.positionZ.value = placed.at[2];
    const level = context.createGain();
    level.gain.value = placed.gain;
    let head: AudioNode = level;
    if (placed.muffle) {
      const glass = context.createBiquadFilter();
      glass.type = "lowpass";
      glass.frequency.value = placed.muffle;
      level.connect(glass);
      head = glass;
    }
    head.connect(panner).connect(this.master);
    if (placed.seamless) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(level);
      source.start(context.currentTime + 0.05);
      this.sources.push(source);
      return;
    }
    this.loop(buffer, level, context.currentTime + 0.05, true);
  }

  /** Plays the buffer, and schedules the next pass to fade in as this one fades out. */
  private loop(buffer: AudioBuffer, out: AudioNode, when: number, first: boolean) {
    const context = this.context;
    if (!context || this.disposed) return;
    const fade = Math.min(CROSSFADE, buffer.duration / 4);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const envelope = context.createGain();
    // Start each pass somewhere new so a short loop never repeats in step.
    const offset = first ? Math.random() * buffer.duration * 0.5 : 0;
    const length = buffer.duration - offset;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, when + fade);
    envelope.gain.setValueAtTime(1, when + length - fade);
    envelope.gain.linearRampToValueAtTime(0, when + length);
    source.connect(envelope).connect(out);
    source.start(when, offset);
    source.stop(when + length + 0.05);
    this.sources.push(source);
    source.onended = () => { this.sources = this.sources.filter((s) => s !== source); envelope.disconnect(); };
    const next = when + length - fade;
    const wait = Math.max(0, (next - context.currentTime - 1) * 1000);
    this.timers = this.timers.slice(-8);
    this.timers.push(setTimeout(() => this.loop(buffer, out, Math.max(next, context.currentTime + 0.02), false), wait));
  }

  /** Puts the listener where the viewer stands, facing where they face. */
  setListener(pose: LoungePose, eye: number) {
    const context = this.context;
    if (!context) return;
    const listener = context.listener as MovableListener;
    const fx = Math.sin(pose.facing);
    const fz = -Math.cos(pose.facing);
    const now = context.currentTime;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(pose.x, now, 0.05);
      listener.positionY.setTargetAtTime(eye, now, 0.05);
      listener.positionZ.setTargetAtTime(pose.z, now, 0.05);
      listener.forwardX.setTargetAtTime(fx, now, 0.05);
      listener.forwardY.setTargetAtTime(0, now, 0.05);
      listener.forwardZ.setTargetAtTime(fz, now, 0.05);
      listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
    } else {
      listener.setPosition?.(pose.x, eye, pose.z);
      listener.setOrientation?.(fx, 0, fz, 0, 1, 0);
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  /** Deafened means deafened: the room goes quiet too. */
  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume() {
    const context = this.context;
    if (!context || !this.master) return;
    // Squared so the slider feels even; ambience sits well under the voices.
    const target = this.muted ? 0 : this.volume * this.volume * 0.7;
    this.master.gain.setTargetAtTime(target, context.currentTime, 0.4);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("pointerdown", this.resume);
    window.removeEventListener("keydown", this.resume);
    for (const timer of this.timers) clearTimeout(timer);
    const context = this.context;
    const master = this.master;
    if (context && master) {
      // Fade out rather than click off.
      master.gain.setTargetAtTime(0, context.currentTime, 0.15);
      setTimeout(() => void context.close().catch(() => undefined), 600);
    }
    this.context = null;
  }
}
