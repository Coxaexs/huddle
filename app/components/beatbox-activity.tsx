"use client";

/**
 * Hoffle Beatbox: a 16-step drum machine and acid bassline a voice room
 * programs together.
 *
 * The pattern and the knobs live in the room's activity state, so everyone
 * edits the same groove. Sound never travels: each browser synthesises it
 * with the Web Audio API (no samples) and runs its own transport.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Dices, Play, Square, Trash2, Volume2 } from "lucide-react";
import type { RoomActivity } from "@/lib/activities";
import {
  BEATBOX_BPM_MAX,
  BEATBOX_BPM_MIN,
  BEATBOX_CUTOFF_MAX,
  BEATBOX_CUTOFF_MIN,
  BEATBOX_NOTE_MAX,
  BEATBOX_NOTE_MIN,
  BEATBOX_RESONANCE_MAX,
  BEATBOX_RESONANCE_MIN,
  BEATBOX_STEPS,
  beatboxNoteName,
  beatboxState,
  emptyBeatboxPattern,
  randomBeatboxPattern,
  type BeatboxDrum,
  type BeatboxPattern,
  type BeatboxState,
  type BeatboxWave,
} from "@/lib/beatbox";
import { TIMER_WORKER_SOURCE } from "../lib/worker-timers";

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

/** How often the scheduler wakes up. */
const LOOKAHEAD_MS = 25;
/** How far ahead of the audio clock it books notes, in seconds. */
const SCHEDULE_AHEAD = 0.1;
/** The six square waves of an 808's hi-hat, in Hz. */
const HAT_PARTIALS = [205.3, 304.4, 369.6, 522.7, 540, 800];

function midiHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/**
 * Calls back every 25 ms. The waiting happens in a worker, whose timers keep
 * running when the tab is in the background (someone tabbed into a game with
 * the beat still going); the page's own timer takes over if no worker starts.
 */
function startTicker(callback: () => void): () => void {
  let worker: Worker | null = null;
  let url = "";
  let native: number | null = null;
  const fallback = () => {
    worker?.terminate();
    worker = null;
    if (native === null) native = window.setInterval(callback, LOOKAHEAD_MS);
  };
  try {
    url = URL.createObjectURL(new Blob([TIMER_WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = () => callback();
    worker.onerror = fallback;
    worker.postMessage({ op: "set", id: 1, delay: LOOKAHEAD_MS, repeat: true });
  } catch {
    fallback();
  }
  return () => {
    worker?.terminate();
    worker = null;
    if (url) URL.revokeObjectURL(url);
    if (native !== null) window.clearInterval(native);
    native = null;
  };
}

/**
 * The drum voices, the bass voice and the step scheduler.
 *
 * Timing follows Chris Wilson's "A Tale of Two Clocks": a coarse timer wakes
 * every 25 ms, and each time books every step that starts within the next
 * 100 ms at an exact time on the audio clock. The timer may be late; the notes
 * are not.
 */
export class BeatboxEngine {
  private readonly out: GainNode;
  private readonly noise: AudioBuffer;
  private readonly metal: AudioBuffer;
  private readonly bassOsc: OscillatorNode;
  private readonly bassPre: GainNode;
  private readonly bassFilters: [BiquadFilterNode, BiquadFilterNode];
  private readonly bassVca: GainNode;

  private playing = false;
  private step = 0;
  private nextTime = 0;
  private stopTicker: (() => void) | null = null;
  private frame: number | null = null;
  /** Steps booked but not yet heard, for the playhead. */
  private queue: Array<{ step: number; time: number }> = [];
  private shownStep = -1;

  /** The hat that is ringing, so the next one can cut it off. */
  private hatGain: GainNode | null = null;
  private bassFreq = 0;
  /** The bass gate was left open for a slide into the next step. */
  private bassHeld = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly read: () => BeatboxState,
    private readonly onStep: (step: number) => void = () => {},
  ) {
    // Everything meets in a limiter so a resonant bass note can't clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    // The limiter adds make-up gain and lets the first few ms of a hit
    // through, so leave headroom after it.
    const trim = ctx.createGain();
    trim.gain.value = 0.85;
    limiter.connect(trim).connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(limiter);

    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const white = this.noise.getChannelData(0);
    for (let index = 0; index < length; index += 1) white[index] = Math.random() * 2 - 1;
    // Hi-hat source: the 808's cluster of squares, roughened with noise.
    this.metal = ctx.createBuffer(1, length, ctx.sampleRate);
    const metal = this.metal.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const seconds = index / ctx.sampleRate;
      let sum = 0;
      for (const partial of HAT_PARTIALS) sum += (seconds * partial) % 1 < 0.5 ? 1 : -1;
      metal[index] = (sum / HAT_PARTIALS.length) * 0.65 + (Math.random() * 2 - 1) * 0.35;
    }

    // Bass: one oscillator that never stops, so a slide is a pitch ramp.
    // Two 12 dB/oct low-passes in a row make the 24 dB/oct filter.
    this.bassOsc = ctx.createOscillator();
    this.bassOsc.type = "sawtooth";
    this.bassOsc.frequency.value = midiHz(BEATBOX_NOTE_MIN);
    this.bassPre = ctx.createGain();
    const first = ctx.createBiquadFilter();
    const second = ctx.createBiquadFilter();
    for (const filter of [first, second]) {
      filter.type = "lowpass";
      filter.frequency.value = 700;
    }
    this.bassFilters = [first, second];
    // A soft clip after the filter rounds the resonance peak off into grit.
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let index = 0; index < curve.length; index += 1) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    drive.curve = curve;
    drive.oversample = "2x";
    this.bassVca = ctx.createGain();
    this.bassVca.gain.value = 0;
    this.bassOsc.connect(this.bassPre).connect(first).connect(second).connect(drive).connect(this.bassVca).connect(this.out);
    this.bassOsc.start();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setVolume(volume: number): void {
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.02);
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.queue = [];
    this.stopTicker = startTicker(this.tick);
    this.tick();
    this.frame = requestAnimationFrame(this.draw);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.stopTicker?.();
    this.stopTicker = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.queue = [];
    this.shownStep = -1;
    const now = this.ctx.currentTime;
    this.bassVca.gain.cancelScheduledValues(now);
    this.bassVca.gain.setTargetAtTime(0, now, 0.012);
    this.hatGain?.gain.setTargetAtTime(0, now, 0.01);
    this.bassHeld = false;
    this.onStep(-1);
  }

  dispose(): void {
    this.stop();
    try {
      this.bassOsc.stop();
    } catch {
      // Already stopped with its context.
    }
    this.out.disconnect();
  }

  /** The scheduler: book every step that begins inside the lookahead window. */
  private readonly tick = (): void => {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // After a stall (a suspended tab, a sleeping laptop) pick the beat up from
    // now instead of firing every missed step at once.
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.02;
    while (this.nextTime < now + SCHEDULE_AHEAD) {
      const state = this.read();
      this.scheduleStep(this.step, this.nextTime, state);
      this.queue.push({ step: this.step, time: this.nextTime });
      if (this.queue.length > 64) this.queue.shift();
      this.nextTime += 60 / state.bpm / 4;
      this.step = (this.step + 1) % BEATBOX_STEPS;
    }
  };

  /** The playhead only: drawing follows the audio clock, it never triggers sound. */
  private readonly draw = (): void => {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    let step = this.shownStep;
    while (this.queue.length && this.queue[0].time <= now) step = this.queue.shift()!.step;
    if (step !== this.shownStep) {
      this.shownStep = step;
      this.onStep(step);
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  /** Everything one step of the pattern plays, at `time` on the audio clock. */
  scheduleStep(step: number, time: number, state: BeatboxState): void {
    const { pattern } = state;
    if (pattern.kick[step]) this.kick(time);
    if (pattern.snare[step]) this.snare(time);
    if (pattern.clap[step]) this.clap(time);
    if (pattern.openhat[step]) this.hat(time, true);
    else if (pattern.hihat[step]) this.hat(time, false);
    this.bassStep(step, time, state);
  }

  /** Plays one drum now, to hear a step as it is switched on. */
  audition(drum: BeatboxDrum): void {
    const time = this.ctx.currentTime + 0.005;
    if (drum === "kick") this.kick(time);
    else if (drum === "snare") this.snare(time);
    else if (drum === "clap") this.clap(time);
    else this.hat(time, drum === "openhat");
  }

  /** Plays one bass note now. Only while stopped: the voice is monophonic. */
  auditionBass(note: number, accent: boolean, state: BeatboxState): void {
    if (this.playing) return;
    const time = this.ctx.currentTime + 0.005;
    this.bassTrigger(midiHz(note), time, accent, state);
    this.bassVca.gain.setTargetAtTime(0, time + 0.16, 0.012);
  }

  /** 808 kick: a sine swept from 160 Hz to 40 Hz in 80 ms, fading over 0.4 s. */
  private kick(time: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  /** 808 snare: a short 180 Hz body under band-passed noise that fades over 0.2 s. */
  private snare(time: number): void {
    const { ctx } = this;
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(260, time);
    body.frequency.exponentialRampToValueAtTime(180, time + 0.03);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.55, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    body.connect(bodyGain).connect(this.out);
    body.start(time);
    body.stop(time + 0.14);

    const noise = this.noiseSource(this.noise);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1500;
    band.Q.value = 2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.connect(band).connect(noiseGain).connect(this.out);
    noise.start(time, Math.random() * 0.5);
    noise.stop(time + 0.22);
  }

  /**
   * 808 hats: the metallic cluster through a 7.5 kHz high-pass. Closed rings
   * for 50 ms, open for 350 ms, and every hat cuts off the one before it, the
   * way a closed hat chokes an open one on the real machine.
   */
  private hat(time: number, open: boolean): void {
    const { ctx } = this;
    this.hatGain?.gain.setTargetAtTime(0, time, 0.004);
    const source = this.noiseSource(this.metal);
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 7500;
    const gain = ctx.createGain();
    const decay = open ? 0.35 : 0.05;
    // setTargetAtTime, not a ramp: a choke can then take over mid-decay.
    gain.gain.setValueAtTime(open ? 1.1 : 1.3, time);
    gain.gain.setTargetAtTime(0, time, decay / 6.9);
    source.connect(high).connect(gain).connect(this.out);
    source.start(time, Math.random() * 0.5);
    source.stop(time + decay + 0.08);
    this.hatGain = gain;
  }

  /** Clap: three bursts of filtered noise 15 ms apart, then a tail. */
  private clap(time: number): void {
    const { ctx } = this;
    const noise = this.noiseSource(this.noise);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1150;
    band.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    for (let burst = 0; burst < 3; burst += 1) {
      const at = time + burst * 0.015;
      gain.gain.setValueAtTime(1.8, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.012);
    }
    const tail = time + 0.045;
    gain.gain.setValueAtTime(1.5, tail);
    gain.gain.exponentialRampToValueAtTime(0.001, tail + 0.22);
    noise.connect(band).connect(gain).connect(this.out);
    noise.start(time, Math.random() * 0.5);
    noise.stop(tail + 0.24);
  }

  private noiseSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  /** One step of the bassline: a new note, a slide into one, or a rest. */
  private bassStep(step: number, time: number, state: BeatboxState): void {
    const { pattern } = state;
    const note = pattern.bassNotes[step];
    if (!note) {
      // A rest. The gate is only still open if the step that was going to
      // slide out of the last note was edited away in the meantime.
      if (this.bassHeld) this.bassVca.gain.setTargetAtTime(0, time, 0.012);
      this.bassHeld = false;
      return;
    }
    const stepSeconds = 60 / state.bpm / 4;
    const frequency = midiHz(note);
    const accent = pattern.bassAccents[step];
    if (pattern.bassSlides[step] && this.bassHeld && this.bassFreq > 0) {
      // Slide: glide up or down from the last note, no new attack.
      this.bassOsc.frequency.setValueAtTime(this.bassFreq, time);
      this.bassOsc.frequency.linearRampToValueAtTime(frequency, time + Math.min(0.06, stepSeconds * 0.6));
      this.bassVca.gain.setTargetAtTime(accent ? 0.62 : 0.42, time, 0.02);
      this.bassFreq = frequency;
    } else {
      this.bassTrigger(frequency, time, accent, state);
    }
    // Hold the gate open if the next step slides out of this note.
    const next = (step + 1) % BEATBOX_STEPS;
    this.bassHeld = pattern.bassNotes[next] > 0 && pattern.bassSlides[next];
    if (!this.bassHeld) this.bassVca.gain.setTargetAtTime(0, time + stepSeconds * 0.55, 0.012);
  }

  /** A fresh bass note: pitch, the filter's envelope and the amp's attack. */
  private bassTrigger(frequency: number, time: number, accent: boolean, state: BeatboxState): void {
    this.bassOsc.type = state.wave;
    this.bassOsc.frequency.setValueAtTime(frequency, time);
    this.bassFreq = frequency;
    // For a low-pass, Web Audio's Q is the height of the resonance peak in dB
    // and two stages add up, so each takes 0.7 of the knob: up to 25 dB of
    // peak, with the level into the filter pulled down as it rises.
    const resonance = state.filterResonance + (accent ? 1.5 : 0);
    this.bassPre.gain.setValueAtTime((state.wave === "square" ? 0.75 : 1) / (1 + resonance / 14), time);
    // The envelope opens the filter above the cutoff and lets it fall back;
    // an accent opens it further and snaps it shut faster.
    const octaves = state.envMod * 3.6 + (accent ? 0.9 : 0);
    const peak = Math.min(14_000, state.filterCutoff * 2 ** octaves);
    for (const filter of this.bassFilters) {
      filter.Q.setValueAtTime(resonance * 0.7, time);
      filter.frequency.setTargetAtTime(peak, time, 0.003);
      filter.frequency.setTargetAtTime(state.filterCutoff, time + 0.012, accent ? 0.07 : 0.16);
    }
    this.bassVca.gain.setTargetAtTime(accent ? 0.62 : 0.42, time, 0.004);
  }
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */

type BoolLane = BeatboxDrum | "bassSlides" | "bassAccents";
type Knob = "bpm" | "filterCutoff" | "filterResonance" | "envMod";
type Change = (state: BeatboxState) => BeatboxState;

const DRUM_ROWS: Array<{ lane: BeatboxDrum; name: string; color: string }> = [
  { lane: "kick", name: "Kick", color: "var(--coral)" },
  { lane: "snare", name: "Snare", color: "#f1cf65" },
  { lane: "hihat", name: "Hat", color: "var(--mint)" },
  { lane: "openhat", name: "Open hat", color: "#5fd0d6" },
  { lane: "clap", name: "Clap", color: "#74a7f7" },
];
const STEPS = Array.from({ length: BEATBOX_STEPS }, (_, step) => step);

/** How long to wait after the last edit before sending the pattern. */
const SYNC_DELAY_MS = 180;
/**
 * How long your own edits keep winning over what arrives from the room. It
 * covers the round trip, so a save that was already on its way when you
 * clicked can't undo the click.
 */
const EDIT_HOLD_MS = 1500;

const CUTOFF_SPAN = Math.log(BEATBOX_CUTOFF_MAX / BEATBOX_CUTOFF_MIN);
/** The cutoff slider is logarithmic, the way pitch is heard. */
function cutoffToSlider(hz: number): number {
  return Math.round((Math.log(hz / BEATBOX_CUTOFF_MIN) / CUTOFF_SPAN) * 1000);
}
function sliderToCutoff(position: number): number {
  return Math.round(BEATBOX_CUTOFF_MIN * Math.exp((position / 1000) * CUTOFF_SPAN));
}

function withStep<T>(list: T[], step: number, value: T): T[] {
  const next = list.slice();
  next[step] = value;
  return next;
}

function clampNote(note: number): number {
  return Math.max(BEATBOX_NOTE_MIN, Math.min(BEATBOX_NOTE_MAX, note));
}

export function BeatboxActivity({
  activity,
  update,
}: {
  activity: RoomActivity;
  /** Shows the state here at once and saves it to the room. */
  update: (state: Record<string, unknown>) => void;
}) {
  const remote = useMemo(() => beatboxState(activity.state), [activity.state]);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const updateRef = useRef(update);
  updateRef.current = update;

  // Your recent edits, newest last, replayed over whatever the room sends.
  const edits = useRef(new Map<string, { at: number; change: Change }>());
  const [, setRevision] = useState(0);
  const replay = (base: BeatboxState) => {
    let next = base;
    for (const edit of edits.current.values()) next = edit.change(next);
    return next;
  };
  const state = replay(remote);
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const flush = useCallback(() => {
    if (syncTimer.current === null) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = null;
    let next = remoteRef.current;
    for (const edit of edits.current.values()) next = edit.change(next);
    updateRef.current({ ...next });
    // Once the room has had time to echo the save back, stop overriding it.
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const cutoff = Date.now() - EDIT_HOLD_MS;
      for (const [key, edit] of edits.current) if (edit.at <= cutoff) edits.current.delete(key);
      setRevision((count) => count + 1);
    }, EDIT_HOLD_MS);
  }, []);

  const edit = useCallback(
    (key: string, change: Change) => {
      edits.current.delete(key);
      edits.current.set(key, { at: Date.now(), change });
      setRevision((count) => count + 1);
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(flush, SYNC_DELAY_MS);
    },
    [flush],
  );

  // Sound: nothing exists until the first click, which is what lets a browser play it.
  const audioRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<BeatboxEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState(-1);
  const [volume, setVolume] = useState(0.8);
  const [blocked, setBlocked] = useState(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const engine = useCallback((): BeatboxEngine | null => {
    if (engineRef.current) {
      if (audioRef.current?.state === "suspended") void audioRef.current.resume().catch(() => {});
      return engineRef.current;
    }
    try {
      const audio = new AudioContext({ latencyHint: "interactive" });
      audioRef.current = audio;
      engineRef.current = new BeatboxEngine(audio, () => stateRef.current, setPlayStep);
      engineRef.current.setVolume(volumeRef.current);
      void audio.resume().catch(() => {});
      return engineRef.current;
    } catch {
      setBlocked(true);
      return null;
    }
  }, []);

  useEffect(
    () => () => {
      // Leaving: send an edit still waiting, then let go of the audio.
      flush();
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      void audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    },
    [flush],
  );

  async function togglePlay() {
    const current = engine();
    const audio = audioRef.current;
    if (!current || !audio) return;
    if (current.isPlaying) {
      current.stop();
      setPlaying(false);
      return;
    }
    try {
      await audio.resume();
      setBlocked(false);
    } catch {
      setBlocked(true);
      return;
    }
    // Unmounted while the browser was waking the audio up.
    if (engineRef.current !== current) return;
    current.start();
    setPlaying(true);
  }

  function changeVolume(next: number) {
    setVolume(next);
    engineRef.current?.setVolume(next);
  }

  function setLane(lane: BoolLane, step: number, on: boolean) {
    edit(`${lane}:${step}`, (current) => ({
      ...current,
      pattern: { ...current.pattern, [lane]: withStep(current.pattern[lane], step, on) },
    }));
  }

  function toggleDrum(lane: BeatboxDrum, step: number) {
    const on = !state.pattern[lane][step];
    setLane(lane, step, on);
    // While it plays, the scheduler picks the step up on its next pass.
    if (on && !playing) engine()?.audition(lane);
  }

  const lastNote = useRef(BEATBOX_NOTE_MIN);
  function setNote(step: number, note: number) {
    if (note) lastNote.current = note;
    edit(`bassNotes:${step}`, (current) => ({
      ...current,
      pattern: { ...current.pattern, bassNotes: withStep(current.pattern.bassNotes, step, note) },
    }));
    if (note && !playing) engine()?.auditionBass(note, state.pattern.bassAccents[step], state);
  }

  function setKnob(knob: Knob, value: number) {
    edit(knob, (current) => ({ ...current, [knob]: value }));
  }

  function setPattern(pattern: BeatboxPattern) {
    edit("pattern", (current) => ({ ...current, pattern }));
  }

  // A bass step: click switches it on or off, dragging up or down tunes it.
  const drag = useRef<{ step: number; y: number; from: number; moved: boolean } | null>(null);
  function noteDown(event: PointerEvent<HTMLButtonElement>, step: number) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      step,
      y: event.clientY,
      from: state.pattern.bassNotes[step] || lastNote.current,
      moved: false,
    };
  }
  function noteMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const semitones = Math.round((current.y - event.clientY) / 7);
    if (!semitones && !current.moved) return;
    current.moved = true;
    const note = clampNote(current.from + semitones);
    if (note !== state.pattern.bassNotes[current.step]) setNote(current.step, note);
  }
  function noteClick(step: number) {
    // The click that ends a drag is not a toggle.
    const dragged = drag.current?.step === step && drag.current.moved;
    drag.current = null;
    if (dragged) return;
    setNote(step, state.pattern.bassNotes[step] ? 0 : lastNote.current);
  }
  function noteKey(event: KeyboardEvent<HTMLButtonElement>, step: number) {
    const note = state.pattern.bassNotes[step];
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const by = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 12 : 1);
      setNote(step, clampNote((note || lastNote.current) + by));
    } else if ((event.key === "Delete" || event.key === "Backspace") && note) {
      event.preventDefault();
      setNote(step, 0);
    }
  }

  const { pattern } = state;
  const cellClass = (step: number, on: boolean) =>
    `beatbox-cell${on ? " on" : ""}${step === playStep ? " now" : ""}${Math.floor(step / 4) % 2 ? " alt" : ""}`;
  const lane = (color: string): CSSProperties => ({ "--lane": color }) as CSSProperties;

  return (
    <div className="beatbox">
      <div className="beatbox-bar">
        <button
          type="button"
          className={`beatbox-play${playing ? " playing" : ""}`}
          aria-pressed={playing}
          onClick={() => void togglePlay()}
        >
          {playing ? <Square size={14} /> : <Play size={14} />}
          {playing ? "Stop" : "Play"}
        </button>
        <label className="beatbox-knob">
          Tempo
          <input
            type="range"
            min={BEATBOX_BPM_MIN}
            max={BEATBOX_BPM_MAX}
            step={1}
            value={state.bpm}
            onChange={(event) => setKnob("bpm", Number(event.target.value))}
          />
          <output>{state.bpm} BPM</output>
        </label>
        <button type="button" onClick={() => setPattern(randomBeatboxPattern())}>
          <Dices size={14} /> Randomize
        </button>
        <button type="button" onClick={() => setPattern(emptyBeatboxPattern())}>
          <Trash2 size={14} /> Clear
        </button>
        <span className="beatbox-spacer" />
        <label className="beatbox-knob beatbox-volume" title="Your volume: only you hear this change">
          <Volume2 size={14} aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Your volume"
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
        </label>
      </div>

      {blocked && (
        <p className="beatbox-note" role="status">
          Your browser didn’t let the sound start. Press Play again.
        </p>
      )}

      <div className="beatbox-scroll">
        <div className="beatbox-grid">
          <div className="beatbox-row beatbox-ruler" aria-hidden="true">
            <span />
            {STEPS.map((step) => (
              <span key={step} className={step === playStep ? "now" : ""}>
                {step % 4 === 0 ? step / 4 + 1 : "·"}
              </span>
            ))}
          </div>

          {DRUM_ROWS.map((row) => (
            <div className="beatbox-row" key={row.lane} style={lane(row.color)} role="group" aria-label={row.name}>
              <span className="beatbox-label">{row.name}</span>
              {STEPS.map((step) => (
                <button
                  type="button"
                  key={step}
                  className={cellClass(step, pattern[row.lane][step])}
                  aria-pressed={pattern[row.lane][step]}
                  aria-label={`${row.name}, step ${step + 1}`}
                  onClick={() => toggleDrum(row.lane, step)}
                />
              ))}
            </div>
          ))}

          <div className="beatbox-row beatbox-bass" style={lane("var(--lavender)")} role="group" aria-label="Bass notes">
            <span className="beatbox-label">Bass</span>
            {STEPS.map((step) => {
              const note = pattern.bassNotes[step];
              return (
                <button
                  type="button"
                  key={step}
                  className={`${cellClass(step, note > 0)} beatbox-note-cell`}
                  aria-pressed={note > 0}
                  aria-label={`Bass, step ${step + 1}: ${note ? beatboxNoteName(note) : "rest"}. Arrow keys change the note.`}
                  onPointerDown={(event) => noteDown(event, step)}
                  onPointerMove={noteMove}
                  onClick={() => noteClick(step)}
                  onKeyDown={(event) => noteKey(event, step)}
                >
                  {note ? beatboxNoteName(note) : ""}
                </button>
              );
            })}
          </div>
          {(
            [
              { lane: "bassSlides", name: "Slide" },
              { lane: "bassAccents", name: "Accent" },
            ] as const
          ).map((row) => (
            <div
              className="beatbox-row beatbox-flags"
              key={row.lane}
              style={lane("var(--lavender)")}
              role="group"
              aria-label={`Bass ${row.name.toLowerCase()}`}
            >
              <span className="beatbox-label">{row.name}</span>
              {STEPS.map((step) => (
                <button
                  type="button"
                  key={step}
                  className={cellClass(step, pattern[row.lane][step])}
                  aria-pressed={pattern[row.lane][step]}
                  aria-label={`${row.name}, step ${step + 1}`}
                  disabled={!pattern.bassNotes[step]}
                  onClick={() => setLane(row.lane, step, !pattern[row.lane][step])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="beatbox-bar beatbox-bass-bar">
        <div className="beatbox-wave" role="group" aria-label="Bass waveform">
          {(["sawtooth", "square"] as const).map((wave: BeatboxWave) => (
            <button
              type="button"
              key={wave}
              className={state.wave === wave ? "active" : ""}
              aria-pressed={state.wave === wave}
              onClick={() => edit("wave", (current) => ({ ...current, wave }))}
            >
              {wave === "sawtooth" ? "Saw" : "Square"}
            </button>
          ))}
        </div>
        <label className="beatbox-knob">
          Cutoff
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={cutoffToSlider(state.filterCutoff)}
            onChange={(event) => setKnob("filterCutoff", sliderToCutoff(Number(event.target.value)))}
          />
          <output>{state.filterCutoff} Hz</output>
        </label>
        <label className="beatbox-knob">
          Resonance
          <input
            type="range"
            min={BEATBOX_RESONANCE_MIN}
            max={BEATBOX_RESONANCE_MAX}
            step={0.5}
            value={state.filterResonance}
            onChange={(event) => setKnob("filterResonance", Number(event.target.value))}
          />
          <output>{state.filterResonance}</output>
        </label>
        <label className="beatbox-knob">
          Env mod
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.envMod}
            onChange={(event) => setKnob("envMod", Number(event.target.value))}
          />
          <output>{Math.round(state.envMod * 100)}%</output>
        </label>
      </div>

      <p className="beatbox-hint">
        Everyone in the room edits this pattern. Play and volume are yours alone. Drag a bass note up or down to
        change its pitch.
      </p>
    </div>
  );
}
