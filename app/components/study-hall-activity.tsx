"use client";

/**
 * Hoffle Study Hall: an endless lofi backdrop a voice room listens to together.
 *
 * Nothing is streamed. The room shares a seed, a start time, a mood, a tempo
 * and a chord offset (lib/study-hall.ts); every bar is a pure function of
 * those, and each browser works out where the room is from the hub's clock
 * and synthesises the rain, the vinyl and the Rhodes itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudRain, Coffee, Dices, Focus, Headphones, SkipForward, Square, Volume2 } from "lucide-react";
import type { RoomActivity } from "@/lib/activities";
import {
  AMBIENT_BEATS,
  AMBIENT_BPM_MAX,
  AMBIENT_BPM_MIN,
  ambientBar,
  ambientBarMs,
  ambientBarStart,
  ambientChord,
  ambientPosition,
  ambientState,
  retimeAmbient,
  type AmbientEvent,
  type AmbientIntensity,
  type AmbientState,
} from "@/lib/study-hall";
import { TIMER_WORKER_SOURCE } from "../lib/worker-timers";

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

const LOOKAHEAD_MS = 50;
/** How far ahead of the audio clock notes are booked, in seconds. */
const SCHEDULE_AHEAD = 0.35;
/** The shared clock and the audio clock are re-lined up if they drift this far apart. */
const MAX_DRIFT = 0.06;

/** Per mood: rain, the vinyl's hiss, and the keys. */
const MIX: Record<AmbientIntensity, { rain: number; hiss: number; keys: number }> = {
  calm: { rain: 0.18, hiss: 0.05, keys: 0.95 },
  rainy: { rain: 0.6, hiss: 0.06, keys: 0.75 },
  focus: { rain: 0.22, hiss: 0.07, keys: 0.8 },
};

function midiHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Calls back every 50 ms from a worker, which keeps time in a background tab. */
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
 * Rain, vinyl and a Rhodes, all from oscillators and noise.
 *
 * The scheduler books every event of the shared score that falls in the next
 * 350 ms, converting the room's clock (epoch ms on the hub) to the audio clock.
 * Because it books by time, not by "the next bar", a mood or tempo change from
 * someone else is picked up mid-bar with nothing dropped or doubled.
 */
export class StudyHallEngine {
  private readonly out: GainNode;
  private readonly keysBus: GainNode;
  private readonly drumBus: GainNode;
  private readonly rainGain: GainNode;
  private readonly hissGain: GainNode;
  private readonly wow: GainNode;
  private readonly white: AudioBuffer;
  private readonly sources: AudioScheduledSourceNode[] = [];

  private playing = false;
  private stopTicker: (() => void) | null = null;
  /** The audio time that matches an epoch time on the shared clock. */
  private anchor = { audio: 0, epoch: 0 };
  /** Everything before this epoch ms has been booked. */
  private bookedUntil = 0;
  private mood: AmbientIntensity | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly read: () => AmbientState,
    private readonly clock: () => number,
  ) {
    // Master: a gentle top-end roll-off for the dusty sound, then a glue compressor.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 7000;
    tone.Q.value = 0.5;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(tone).connect(glue).connect(ctx.destination);

    const rate = ctx.sampleRate;
    this.white = ctx.createBuffer(1, rate * 2, rate);
    const white = this.white.getChannelData(0);
    for (let index = 0; index < white.length; index += 1) white[index] = Math.random() * 2 - 1;

    // Keys: a soft low-pass, a slow tremolo, and a small room.
    this.keysBus = ctx.createGain();
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 2600;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.85;
    const tremoloLfo = this.loop(ctx.createOscillator());
    tremoloLfo.frequency.value = 4.2;
    const tremoloDepth = ctx.createGain();
    tremoloDepth.gain.value = 0.12;
    tremoloLfo.connect(tremoloDepth).connect(tremolo.gain);
    this.keysBus.connect(warm).connect(tremolo);
    tremolo.connect(this.out);
    const room = ctx.createConvolver();
    room.buffer = this.impulse(2.4);
    const send = ctx.createGain();
    send.gain.value = 0.32;
    tremolo.connect(send).connect(room).connect(this.out);

    // Tape wow: a slow pitch wobble every key and bass note is wired to.
    const wowLfo = this.loop(ctx.createOscillator());
    wowLfo.frequency.value = 0.35;
    this.wow = ctx.createGain();
    this.wow.gain.value = 7;
    wowLfo.connect(this.wow);

    this.drumBus = ctx.createGain();
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 3800;
    this.drumBus.connect(muffle).connect(this.out);

    // Rain: brown noise for the wash, high-passed white noise for the patter,
    // each swelling on its own slow wave so it never sounds like a loop.
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.out);
    const brown = ctx.createBuffer(1, rate * 4, rate);
    const brownData = brown.getChannelData(0);
    let last = 0;
    for (let index = 0; index < brownData.length; index += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      brownData[index] = last * 3.5;
    }
    const wash = this.loop(this.noise(brown));
    const washFilter = ctx.createBiquadFilter();
    washFilter.type = "lowpass";
    washFilter.frequency.value = 900;
    const washGain = ctx.createGain();
    washGain.gain.value = 0.9;
    wash.connect(washFilter).connect(washGain).connect(this.rainGain);
    const patter = this.loop(this.noise(this.white));
    const patterFilter = ctx.createBiquadFilter();
    patterFilter.type = "bandpass";
    patterFilter.frequency.value = 3200;
    patterFilter.Q.value = 0.6;
    const patterGain = ctx.createGain();
    patterGain.gain.value = 0.16;
    patter.connect(patterFilter).connect(patterGain).connect(this.rainGain);
    for (const [gain, speed, depth] of [
      [washGain, 0.07, 0.25],
      [patterGain, 0.13, 0.06],
    ] as const) {
      const swell = this.loop(ctx.createOscillator());
      swell.frequency.value = speed;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      swell.connect(amount).connect(gain.gain);
    }

    // Vinyl hiss under the crackle.
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    const hiss = this.loop(this.noise(this.white));
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 5000;
    hiss.connect(hissFilter).connect(this.hissGain).connect(this.out);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setVolume(volume: number): void {
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.05);
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.lineUp();
    // Join where the room is: anything that started before now is skipped.
    this.bookedUntil = this.clock();
    this.mood = null;
    this.stopTicker = startTicker(this.tick);
    this.tick();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.stopTicker?.();
    this.stopTicker = null;
    const now = this.ctx.currentTime;
    for (const gain of [this.rainGain, this.hissGain, this.keysBus, this.drumBus]) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.15);
    }
    this.mood = null;
  }

  dispose(): void {
    this.stop();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped with its context.
      }
    }
    this.out.disconnect();
  }

  /** Epoch ms on the shared clock as a time on the audio clock. */
  private toAudio(epoch: number): number {
    return this.anchor.audio + (epoch - this.anchor.epoch) / 1000;
  }

  private lineUp(): void {
    this.anchor = { audio: this.ctx.currentTime, epoch: this.clock() };
  }

  private readonly tick = (): void => {
    if (!this.playing) return;
    const state = this.read();
    const audioNow = this.ctx.currentTime;
    const epochNow = this.clock();
    // The two clocks drift, and the hub's offset can jump when it reconnects.
    if (Math.abs(this.toAudio(epochNow) - audioNow) > MAX_DRIFT) this.lineUp();
    // After a stall (a sleeping laptop) pick up from now, don't fire the backlog.
    if (this.bookedUntil < epochNow - 200) this.bookedUntil = epochNow;
    if (state.intensity !== this.mood) this.setMood(state.intensity);

    const until = epochNow + SCHEDULE_AHEAD * 1000;
    const from = this.bookedUntil;
    if (until <= from) return;
    const beatMs = ambientBarMs(state) / AMBIENT_BEATS;
    const first = ambientPosition(state, from).bar;
    const last = ambientPosition(state, until).bar;
    for (let bar = first; bar <= last; bar += 1) {
      const start = ambientBarStart(state, bar);
      for (const event of ambientBar(state, bar).events) {
        const at = start + event.beat * beatMs;
        if (at < from || at >= until) continue;
        this.play(event, Math.max(audioNow, this.toAudio(at)), (event.beats * beatMs) / 1000);
      }
    }
    this.bookedUntil = until;
  };

  private setMood(mood: AmbientIntensity): void {
    this.mood = mood;
    const now = this.ctx.currentTime;
    const mix = MIX[mood];
    // Long fades, so a mood change washes in instead of switching.
    this.rainGain.gain.setTargetAtTime(mix.rain, now, 1.5);
    this.hissGain.gain.setTargetAtTime(mix.hiss, now, 1);
    this.keysBus.gain.setTargetAtTime(mix.keys, now, 0.6);
    this.drumBus.gain.setTargetAtTime(mood === "focus" ? 0.55 : 0, now, 0.4);
  }

  private play(event: AmbientEvent, time: number, seconds: number): void {
    if (event.voice === "keys") this.rhodes(event.midi, event.velocity, time, seconds);
    else if (event.voice === "bass") this.bass(event.midi, event.velocity, time, seconds);
    else if (event.voice === "kick") this.kick(event.velocity, time);
    else if (event.voice === "snare") this.rim(event.velocity, time);
    else if (event.voice === "hat") this.hat(event.velocity, time);
    else this.crackle(event.velocity, time);
  }

  /**
   * An electric piano by FM: a sine tine modulated at its own pitch, bright
   * on the attack and mellowing as the modulation decays, plus a short
   * high bell partial for the "tine" click.
   */
  private rhodes(midi: number, velocity: number, time: number, seconds: number): void {
    const { ctx } = this;
    const frequency = midiHz(midi);
    const end = time + seconds + 1.2;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = frequency;
    this.wow.connect(carrier.detune);
    const modulator = ctx.createOscillator();
    modulator.frequency.value = frequency;
    const index = ctx.createGain();
    index.gain.setValueAtTime(frequency * (0.8 + velocity * 1.4), time);
    index.gain.setTargetAtTime(frequency * 0.15, time, 0.35);
    modulator.connect(index).connect(carrier.frequency);
    const bell = ctx.createOscillator();
    bell.frequency.value = frequency * 14;
    const bellIndex = ctx.createGain();
    bellIndex.gain.setValueAtTime(frequency * velocity * 0.9, time);
    bellIndex.gain.setTargetAtTime(0, time, 0.04);
    bell.connect(bellIndex).connect(carrier.frequency);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(velocity * 0.22, time + 0.006);
    amp.gain.setTargetAtTime(velocity * 0.08, time + 0.006, 1.1);
    amp.gain.setTargetAtTime(0, time + seconds, 0.35);
    carrier.connect(amp).connect(this.keysBus);
    for (const osc of [carrier, modulator, bell]) {
      osc.start(time);
      osc.stop(end);
    }
    carrier.onended = () => this.wow.disconnect(carrier.detune);
  }

  private bass(midi: number, velocity: number, time: number, seconds: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiHz(midi);
    this.wow.connect(osc.detune);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 380;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(velocity * 0.5, time + 0.02);
    amp.gain.setTargetAtTime(velocity * 0.3, time + 0.02, 0.5);
    amp.gain.setTargetAtTime(0, time + seconds, 0.12);
    osc.connect(low).connect(amp).connect(this.keysBus);
    osc.start(time);
    osc.stop(time + seconds + 0.8);
    osc.onended = () => this.wow.disconnect(osc.detune);
  }

  /** A soft, rounded kick: a sine dropping from 110 to 45 Hz. */
  private kick(velocity: number, time: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(velocity, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
    osc.connect(amp).connect(this.drumBus);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  /** A rimshot-ish snare: a short knock and a breath of band-passed noise. */
  private rim(velocity: number, time: number): void {
    const { ctx } = this;
    const knock = ctx.createOscillator();
    knock.type = "triangle";
    knock.frequency.setValueAtTime(420, time);
    knock.frequency.exponentialRampToValueAtTime(240, time + 0.04);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(velocity * 0.35, time);
    knockGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    knock.connect(knockGain).connect(this.drumBus);
    knock.start(time);
    knock.stop(time + 0.1);
    this.noiseHit(velocity * 0.4, time, 0.16, "bandpass", 1900, 1.2, this.drumBus);
  }

  private hat(velocity: number, time: number): void {
    this.noiseHit(velocity * 0.22, time, 0.05, "highpass", 7000, 0.7, this.drumBus);
  }

  /** A vinyl pop: a click a couple of milliseconds long. */
  private crackle(velocity: number, time: number): void {
    this.noiseHit(velocity * 0.35, time, 0.006, "highpass", 1800, 0.7, this.out);
  }

  private noiseHit(
    level: number,
    time: number,
    decay: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    to: AudioNode,
  ): void {
    const { ctx } = this;
    const source = this.noise(this.white);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(level, time);
    amp.gain.exponentialRampToValueAtTime(0.0005, time + decay);
    source.connect(filter).connect(amp).connect(to);
    source.start(time, Math.random() * 1.5);
    source.stop(time + decay + 0.02);
  }

  private noise(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  /** Starts a source that runs for the engine's whole life. */
  private loop<T extends AudioScheduledSourceNode>(source: T): T {
    source.start();
    this.sources.push(source);
    return source;
  }

  /** A stereo burst of decaying noise: the reverb's room. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(2, Math.floor(rate * seconds), rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 3;
      }
    }
    return buffer;
  }
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */

const MOODS: Array<{ mood: AmbientIntensity; name: string; icon: React.ReactNode; hint: string }> = [
  { mood: "calm", name: "Calm", icon: <Coffee size={14} />, hint: "Soft keys, a little rain" },
  { mood: "rainy", name: "Rainy", icon: <CloudRain size={14} />, hint: "Rain on the window" },
  { mood: "focus", name: "Focus", icon: <Focus size={14} />, hint: "Adds a slow beat" },
];

/** How long the tempo slider waits after you let go before telling the room. */
const TEMPO_DELAY_MS = 300;

export function StudyHallActivity({
  activity,
  update,
  serverNow = Date.now,
}: {
  activity: RoomActivity;
  /** Shows the state here at once and saves it to the room. */
  update: (state: Record<string, unknown>) => void;
  /** The hub's clock, which everyone in the room shares. */
  serverNow?: () => number;
}) {
  const state = useMemo(() => ambientState(activity.state), [activity.state]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const clockRef = useRef(serverNow);
  clockRef.current = serverNow;

  const audioRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<StudyHallEngine | null>(null);
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // A clock for the display only; the sound runs off the audio clock.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clockRef.current()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      void audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (engineRef.current?.isPlaying) {
      engineRef.current.stop();
      setListening(false);
      return;
    }
    try {
      if (!audioRef.current) {
        const audio = new AudioContext({ latencyHint: "playback" });
        audioRef.current = audio;
        engineRef.current = new StudyHallEngine(audio, () => stateRef.current, () => clockRef.current());
        engineRef.current.setVolume(volumeRef.current);
      }
      const audio = audioRef.current;
      const engine = engineRef.current;
      await audio.resume();
      // Unmounted while the browser was waking the audio up.
      if (!engine || engineRef.current !== engine) return;
      setBlocked(false);
      engine.start();
      setListening(true);
    } catch {
      setBlocked(true);
    }
  }, []);

  function changeVolume(next: number) {
    setVolume(next);
    engineRef.current?.setVolume(next);
  }

  function share(next: AmbientState) {
    update({ ...next });
  }

  // Tempo: the slider moves here at once and tells the room once you settle.
  const [bpmDraft, setBpmDraft] = useState<number | null>(null);
  const tempoTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (tempoTimer.current !== null) window.clearTimeout(tempoTimer.current);
  }, []);
  function changeTempo(bpm: number) {
    setBpmDraft(bpm);
    if (tempoTimer.current !== null) window.clearTimeout(tempoTimer.current);
    tempoTimer.current = window.setTimeout(() => {
      tempoTimer.current = null;
      setBpmDraft(null);
      if (bpm !== stateRef.current.bpm) share(retimeAmbient(stateRef.current, bpm, clockRef.current()));
    }, TEMPO_DELAY_MS);
  }

  function skipChord() {
    share({ ...state, chordIndex: state.chordIndex + 1 });
  }

  function reshuffle() {
    // A new song from the next bar on: the room keeps its place in time.
    const { bar } = ambientPosition(state, clockRef.current());
    share({
      ...state,
      seed: Math.floor(Math.random() * 4294967296),
      startedAt: Math.round(ambientBarStart(state, bar + 1)),
      chordIndex: 0,
    });
  }

  const position = ambientPosition(state, now);
  const playingBar = Math.max(0, position.bar);
  const chord = ambientChord(state, playingBar);
  const nextChord = ambientChord(state, playingBar + 1);
  const shownBpm = bpmDraft ?? state.bpm;

  return (
    <div className={`study-hall mood-${state.intensity}${listening ? " listening" : ""}`}>
      <div className="study-hall-window" aria-hidden="true">
        <span className="study-hall-rain" />
      </div>

      <div className="study-hall-now">
        <button
          type="button"
          className={`study-hall-listen${listening ? " on" : ""}`}
          aria-pressed={listening}
          onClick={() => void toggle()}
        >
          {listening ? <Square size={14} /> : <Headphones size={14} />}
          {listening ? "Stop listening" : "Listen in"}
        </button>
        <div className="study-hall-chord" aria-live="off">
          <strong>{chord.name}</strong>
          <small>next {nextChord.name}</small>
        </div>
        <div
          className="study-hall-bar"
          role="progressbar"
          aria-label="This bar"
          aria-valuemin={0}
          aria-valuemax={AMBIENT_BEATS}
          aria-valuenow={Math.floor(position.beat)}
        >
          {Array.from({ length: AMBIENT_BEATS }, (_, beat) => (
            <span key={beat} className={beat <= position.beat && position.bar >= 0 ? "lit" : ""} />
          ))}
        </div>
      </div>

      {blocked && (
        <p className="study-hall-note" role="status">
          Your browser didn’t let the sound start. Press Listen in again.
        </p>
      )}

      <div className="study-hall-moods" role="group" aria-label="Mood">
        {MOODS.map((choice) => (
          <button
            type="button"
            key={choice.mood}
            className={state.intensity === choice.mood ? "active" : ""}
            aria-pressed={state.intensity === choice.mood}
            title={choice.hint}
            onClick={() => state.intensity !== choice.mood && share({ ...state, intensity: choice.mood })}
          >
            {choice.icon}
            {choice.name}
          </button>
        ))}
      </div>

      <div className="study-hall-controls">
        <label className="study-hall-knob">
          Tempo
          <input
            type="range"
            min={AMBIENT_BPM_MIN}
            max={AMBIENT_BPM_MAX}
            step={1}
            value={shownBpm}
            onChange={(event) => changeTempo(Number(event.target.value))}
          />
          <output>{shownBpm} BPM</output>
        </label>
        <button type="button" onClick={skipChord} title="Everyone moves on to the next chord">
          <SkipForward size={14} /> Skip chord
        </button>
        <button type="button" onClick={reshuffle} title="A new progression for the room, from the next bar">
          <Dices size={14} /> New song
        </button>
        <span className="study-hall-spacer" />
        <label className="study-hall-knob study-hall-volume" title="Your volume: only you hear this change">
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

      <p className="study-hall-hint">
        Made on your device, in step with everyone listening. Mood, tempo and chords change for the whole room; Listen
        in and volume are yours alone.
      </p>
    </div>
  );
}
