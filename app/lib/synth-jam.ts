/**
 * Gesture Synth, the sound: every player in the voice room as a little synth
 * on this machine.
 *
 * Players send notes, not audio (see lib/gesture-synth.ts), so each browser
 * renders the whole jam itself: your own hands with no delay, everyone else's
 * as soon as the hub passes their chord along. One AudioContext, one Player per
 * seat, all through a shared reverb and limiter. The analyser on the way out
 * draws the waveform in the activity panel.
 *
 * A play with a rhythm (pulse, arpeggio) is struck note by note on the audio
 * clock, a little ahead of time, at the steps of a beat grid laid on the hub's
 * clock (setClock), so every listener hears everyone on the same beats.
 */
import { savedDevice } from "./devices";
import {
  BEATS_PER_BAR,
  SILENCE,
  SYNTH_STALE_MS,
  beatMs,
  isSilent,
  rhythmHits,
  type SynthPlay,
  type SynthSound,
} from "@/lib/gesture-synth";

interface Layer {
  type: OscillatorType;
  /** Cents. */
  detune?: number;
  octave?: number;
  gain?: number;
}

interface Preset {
  layers: Layer[];
  attack: number;
  /** Seconds to settle from the peak to the sustain level. */
  decay: number;
  sustain: number;
  release: number;
  /** Filter cutoff in Hz, shut and wide open; brightness slides between them. */
  cutoff: [number, number];
  q: number;
  level: number;
  /** Restart every note when the chord changes (struck sounds) instead of holding shared ones. */
  retrigger: boolean;
  /** Seconds between strummed notes, low to high. */
  strum?: number;
  /** Vibrato depth in cents. */
  vibrato?: number;
  /** Melody portamento time constant. */
  glide: number;
  reverb: number;
}

const PRESETS: Record<SynthSound, Preset> = {
  warm: {
    layers: [
      { type: "sawtooth", detune: -8 },
      { type: "sawtooth", detune: 8 },
      { type: "sine", octave: -1, gain: 0.6 },
    ],
    attack: 0.06,
    decay: 0.4,
    sustain: 0.8,
    release: 0.7,
    cutoff: [420, 5200],
    q: 2.2,
    level: 1,
    retrigger: false,
    glide: 0.05,
    reverb: 0.3,
  },
  glass: {
    layers: [
      { type: "sine" },
      { type: "triangle", octave: 1, gain: 0.32 },
      { type: "sine", octave: 2, detune: 4, gain: 0.12 },
    ],
    attack: 0.006,
    decay: 1.3,
    sustain: 0.28,
    release: 1.4,
    cutoff: [1800, 9000],
    q: 0.7,
    level: 1.5,
    retrigger: true,
    strum: 0.012,
    glide: 0.03,
    reverb: 0.45,
  },
  choir: {
    layers: [
      { type: "sawtooth", detune: -14 },
      { type: "sawtooth", detune: 14 },
      { type: "triangle", octave: 1, gain: 0.3 },
    ],
    attack: 0.45,
    decay: 0.6,
    sustain: 0.9,
    release: 1.6,
    cutoff: [600, 2600],
    q: 3,
    level: 1.1,
    retrigger: false,
    vibrato: 9,
    glide: 0.09,
    reverb: 0.55,
  },
  pluck: {
    layers: [
      { type: "triangle" },
      { type: "square", octave: 1, gain: 0.18 },
    ],
    attack: 0.003,
    decay: 0.5,
    sustain: 0,
    release: 0.3,
    cutoff: [1100, 7000],
    q: 1.4,
    level: 1.6,
    retrigger: true,
    strum: 0.028,
    glide: 0.02,
    reverb: 0.35,
  },
  chip: {
    layers: [{ type: "square" }, { type: "square", octave: -1, gain: 0.25 }],
    attack: 0.004,
    decay: 0.12,
    sustain: 0.65,
    release: 0.08,
    cutoff: [2600, 12000],
    q: 0.5,
    level: 0.55,
    retrigger: false,
    glide: 0.012,
    reverb: 0.15,
  },
};

const CHORD_LEVEL = 0.11;
const LEAD_LEVEL = 0.17;
/** A single arpeggio note stands alone, so it sits between a chord note and the melody. */
const ARP_LEVEL = 0.15;
/** How far ahead rhythm notes are put on the audio clock; a hidden tab's timers only fire every second. */
const LOOKAHEAD_MS = 140;
const HIDDEN_LOOKAHEAD_MS = 1300;

/** A preset's envelope made short enough to strike notes `gate` seconds long. */
function struck(preset: Preset, gate: number): Preset {
  return {
    ...preset,
    attack: Math.min(preset.attack, 0.012),
    decay: Math.min(preset.decay, Math.max(0.05, gate)),
    release: Math.min(preset.release, 0.3),
  };
}

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** One sounding note: the preset's oscillators through one envelope. */
class Voice {
  private readonly oscillators: Array<{ osc: OscillatorNode; octave: number }> = [];
  private readonly envelope: GainNode;
  private released = false;

  constructor(
    context: AudioContext,
    out: AudioNode,
    public note: number,
    private readonly preset: Preset,
    level: number,
    at: number,
    vibrato: AudioNode | null,
  ) {
    this.envelope = context.createGain();
    const gain = this.envelope.gain;
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(level, at + preset.attack);
    gain.setTargetAtTime(level * preset.sustain, at + preset.attack, Math.max(0.01, preset.decay / 3));
    this.envelope.connect(out);
    for (const layer of preset.layers) {
      const osc = context.createOscillator();
      const octave = layer.octave ?? 0;
      osc.type = layer.type;
      osc.frequency.setValueAtTime(frequency(note + 12 * octave), at);
      osc.detune.setValueAtTime(layer.detune ?? 0, at);
      vibrato?.connect(osc.detune);
      if ((layer.gain ?? 1) !== 1) {
        const trim = context.createGain();
        trim.gain.value = layer.gain!;
        osc.connect(trim).connect(this.envelope);
      } else {
        osc.connect(this.envelope);
      }
      osc.start(at);
      this.oscillators.push({ osc, octave });
    }
  }

  glide(note: number, at: number) {
    this.note = note;
    for (const { osc, octave } of this.oscillators) {
      osc.frequency.setTargetAtTime(frequency(note + 12 * octave), at, this.preset.glide);
    }
  }

  /** Stops a note that has not started yet (its chord changed before it sounded). */
  cancel() {
    this.released = true;
    for (const { osc } of this.oscillators) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
    }
    this.envelope.disconnect();
  }

  release(at: number) {
    if (this.released) return;
    this.released = true;
    const gain = this.envelope.gain as AudioParam & { cancelAndHoldAtTime?: (time: number) => void };
    if (typeof gain.cancelAndHoldAtTime === "function") {
      gain.cancelAndHoldAtTime(at);
    } else {
      gain.cancelScheduledValues(at);
      gain.setValueAtTime(gain.value, at);
    }
    gain.setTargetAtTime(0, at, Math.max(0.01, this.preset.release / 4));
    const end = at + this.preset.release + 0.2;
    for (const { osc } of this.oscillators) osc.stop(end);
    this.oscillators[0].osc.onended = () => this.envelope.disconnect();
  }
}

/** One seat's synth: its chord voices, its melody voice, its filter and level. */
class Player {
  private readonly filter: BiquadFilterNode;
  private readonly out: GainNode;
  private readonly send: GainNode;
  private preset: Preset;
  private sound: SynthSound;
  private vibrato: { lfo: OscillatorNode; depth: GainNode } | null = null;
  private readonly chord = new Map<number, Voice>();
  private lead: Voice | null = null;
  /** Rhythm notes already put on the audio clock, with when they start. */
  private queued: Array<{ voice: Voice; start: number }> = [];
  /** Up to where (shared clock, ms) this player's rhythm has been scheduled. */
  scheduledTo = 0;
  play: SynthPlay = SILENCE;

  constructor(private readonly context: AudioContext, bus: AudioNode, reverb: AudioNode, sound: SynthSound) {
    this.sound = sound;
    this.preset = PRESETS[sound];
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.out = context.createGain();
    this.out.gain.value = 0;
    this.send = context.createGain();
    this.filter.connect(this.out);
    this.out.connect(bus);
    this.out.connect(this.send).connect(reverb);
    this.adopt(sound);
  }

  private adopt(sound: SynthSound) {
    const now = this.context.currentTime;
    this.sound = sound;
    this.preset = PRESETS[sound];
    this.filter.Q.setValueAtTime(this.preset.q, now);
    this.send.gain.setTargetAtTime(this.preset.reverb, now, 0.05);
    if (this.vibrato) {
      this.vibrato.lfo.stop();
      this.vibrato.depth.disconnect();
      this.vibrato = null;
    }
    if (this.preset.vibrato) {
      const lfo = this.context.createOscillator();
      const depth = this.context.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.value = this.preset.vibrato;
      lfo.connect(depth);
      lfo.start();
      this.vibrato = { lfo, depth };
    }
  }

  private voice(note: number, level: number, at: number) {
    return new Voice(this.context, this.filter, note, this.preset, level, at, this.vibrato?.depth ?? null);
  }

  private releaseChord(at: number) {
    for (const voice of this.chord.values()) voice.release(at);
    this.chord.clear();
  }

  set(next: SynthPlay, volume: number) {
    const now = this.context.currentTime;
    this.play = next;
    this.out.gain.setTargetAtTime(Math.max(0, volume), now, 0.04);
    if (next.sound !== this.sound) {
      this.releaseChord(now);
      this.lead?.release(now);
      this.lead = null;
      this.adopt(next.sound);
    }
    const [shut, open] = this.preset.cutoff;
    this.filter.frequency.setTargetAtTime(shut * (open / shut) ** next.bright, now, 0.05);

    if (next.rhythm !== "hold") {
      // The rhythm strikes the notes (see schedule); nothing is held.
      this.releaseChord(now);
      const before = this.rhythmic;
      if (!before || before.rhythm !== next.rhythm || before.bpm !== next.bpm || before.notes.join() !== next.notes.join()) {
        this.cancelQueued();
      }
      this.rhythmic = next;
    } else {
      if (this.rhythmic) this.cancelQueued();
      this.rhythmic = null;
    }
    const held = next.rhythm === "hold" ? next.notes : [];
    const changed = held.length !== this.chord.size || held.some((note) => !this.chord.has(note));
    if (next.rhythm !== "hold") {
      // Handled above.
    } else if (changed && this.preset.retrigger) {
      this.releaseChord(now);
      next.notes.forEach((note, index) => {
        const at = now + index * (this.preset.strum ?? 0);
        this.chord.set(note, this.voice(note, CHORD_LEVEL * this.preset.level * (index === 0 ? 0.8 : 1), at));
      });
    } else if (changed) {
      for (const [note, voice] of this.chord) {
        if (!next.notes.includes(note)) {
          voice.release(now);
          this.chord.delete(note);
        }
      }
      next.notes.forEach((note, index) => {
        if (!this.chord.has(note)) {
          this.chord.set(note, this.voice(note, CHORD_LEVEL * this.preset.level * (index === 0 ? 0.8 : 1), now));
        }
      });
    }

    if (next.lead === null) {
      this.lead?.release(now);
      this.lead = null;
    } else if (!this.lead) {
      this.lead = this.voice(next.lead, LEAD_LEVEL * this.preset.level, now);
    } else if (this.lead.note !== next.lead) {
      if (this.preset.retrigger) {
        this.lead.release(now);
        this.lead = this.voice(next.lead, LEAD_LEVEL * this.preset.level, now);
      } else {
        this.lead.glide(next.lead, now);
      }
    }
  }

  private rhythmic: SynthPlay | null = null;

  /** Queued rhythm notes that have not started are dropped and the grid is scheduled again from now. */
  private cancelQueued() {
    const now = this.context.currentTime;
    this.queued = this.queued.filter(({ voice, start }) => {
      if (start > now + 0.005) {
        voice.cancel();
        return false;
      }
      return true;
    });
    this.scheduledTo = 0;
  }

  /**
   * Puts this player's rhythm notes between `from` and `to` (shared clock, ms)
   * on the audio clock. `clockNow` is the shared clock at `audioNow`.
   */
  schedule(from: number, to: number, clockNow: number, audioNow: number) {
    const play = this.rhythmic;
    if (!play || play.notes.length === 0) return;
    const start = Math.max(from, this.scheduledTo);
    for (const hit of rhythmHits(play, start, to)) {
      const at = audioNow + (hit.at - clockNow) / 1000;
      if (at < audioNow - 0.005) continue;
      const gate = hit.gate / 1000;
      const preset = struck(this.preset, gate);
      const single = hit.notes.length === 1;
      hit.notes.forEach((note, index) => {
        const level =
          (single ? ARP_LEVEL : CHORD_LEVEL * (index === 0 ? 0.8 : 1)) * this.preset.level * (hit.accent ? 1 : 0.78);
        const voice = new Voice(this.context, this.filter, note, preset, level, at, this.vibrato?.depth ?? null);
        voice.release(at + gate);
        this.queued.push({ voice, start: at });
      });
    }
    this.scheduledTo = Math.max(this.scheduledTo, to);
    this.queued = this.queued.filter(({ start }) => start > audioNow - 2);
  }

  dispose() {
    const now = this.context.currentTime;
    this.cancelQueued();
    this.rhythmic = null;
    this.releaseChord(now);
    this.lead?.release(now);
    this.lead = null;
    const out = this.out;
    const vibrato = this.vibrato;
    window.setTimeout(() => {
      out.disconnect();
      vibrato?.lfo.stop();
    }, 2500);
  }
}

/** A couple of seconds of decaying stereo noise: a soft room for everyone to play in. */
function roomImpulse(context: AudioContext): AudioBuffer {
  const seconds = 2.4;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      data[index] = (Math.random() * 2 - 1) * (1 - t) ** 3.2 * (t < 0.01 ? t / 0.01 : 1);
    }
  }
  return buffer;
}

const VOLUME_STORE = "huddle-synth-volume";
const MUTE_STORE = "huddle-synth-muted";

function readStoredVolume(): number {
  if (typeof window === "undefined") return 0.8;
  try {
    const raw = localStorage.getItem(VOLUME_STORE);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (Number.isFinite(val)) return Math.max(0, Math.min(1, val));
    }
  } catch {}
  return 0.8;
}

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_STORE) === "true";
  } catch {}
  return false;
}

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

class JamEngine {
  private context: SinkContext | null = null;
  private bus: DynamicsCompressorNode | null = null;
  private reverb: ConvolverNode | null = null;
  private master: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private readonly players = new Map<string, Player>();
  private deafened = false;
  private volume = readStoredVolume();
  private muted = readStoredMuted();
  private readonly seatMutes = new Set<string>();
  private readonly seatVolumes = new Map<string, number>();
  private readonly volumeListeners = new Set<() => void>();
  /** The hub's clock while in a voice room, so the beat grid is the same for everyone. */
  private clock: () => number = () => Date.now();
  private ticker = 0;
  private metronomeBpm: number | null = null;
  private clickTo = 0;

  setClock(clock: (() => number) | null) {
    this.clock = clock ?? (() => Date.now());
  }

  /** The shared clock, in ms: what the beat grid is laid on. */
  now(): number {
    return this.clock();
  }

  /** A click on every beat at `bpm` (louder on the bar), or null for none. Only you hear it. */
  setMetronome(bpm: number | null) {
    this.metronomeBpm = bpm;
    this.clickTo = 0;
    if (bpm) this.ensure();
    this.syncTicker();
  }

  private syncTicker() {
    const needed =
      this.metronomeBpm !== null || [...this.players.values()].some((player) => player.play.rhythm !== "hold" && !isSilent(player.play));
    if (needed && !this.ticker && typeof window !== "undefined") {
      this.ticker = window.setInterval(() => this.tick(), 25);
      this.tick();
    } else if (!needed && this.ticker) {
      window.clearInterval(this.ticker);
      this.ticker = 0;
    }
  }

  private tick() {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const clockNow = this.clock();
    const audioNow = context.currentTime;
    const ahead = typeof document !== "undefined" && document.hidden ? HIDDEN_LOOKAHEAD_MS : LOOKAHEAD_MS;
    for (const player of this.players.values()) player.schedule(clockNow, clockNow + ahead, clockNow, audioNow);
    if (this.metronomeBpm && this.bus) {
      const beat = beatMs(this.metronomeBpm);
      const to = clockNow + ahead;
      for (let k = Math.ceil(Math.max(clockNow, this.clickTo) / beat); k * beat < to; k += 1) {
        this.click(audioNow + (k * beat - clockNow) / 1000, k % BEATS_PER_BAR === 0);
      }
      this.clickTo = to;
    }
  }

  private click(at: number, bar: boolean) {
    const context = this.context;
    if (!context || !this.bus || at < context.currentTime) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = bar ? 1760 : 1320;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(bar ? 0.16 : 0.09, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(this.bus);
    osc.start(at);
    osc.stop(at + 0.06);
    osc.onended = () => gain.disconnect();
  }

  private ensure(): SinkContext | null {
    if (this.context) return this.context;
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
    const context: SinkContext = new AudioContext({ latencyHint: "interactive" });
    const bus = context.createDynamicsCompressor();
    bus.threshold.value = -16;
    bus.knee.value = 10;
    bus.ratio.value = 5;
    bus.attack.value = 0.004;
    bus.release.value = 0.2;
    const reverb = context.createConvolver();
    reverb.buffer = roomImpulse(context);
    reverb.connect(bus);
    const master = context.createGain();
    const effective = this.deafened || this.muted ? 0 : this.volume * 0.9;
    master.gain.value = effective;
    const meter = context.createAnalyser();
    meter.fftSize = 2048;
    bus.connect(master).connect(meter).connect(context.destination);
    this.context = context;
    this.bus = bus;
    this.reverb = reverb;
    this.master = master;
    this.meter = meter;
    const resume = () => {
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    };
    resume();
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("keydown", resume);
    window.addEventListener("huddle-speaker-change", () => void this.applySink());
    void this.applySink();
    return context;
  }

  /** Same speaker as the voices (see spatial-audio.ts); never silently another one. */
  private async applySink() {
    const context = this.context;
    if (!context?.setSinkId) return;
    try {
      await context.setSinkId(savedDevice("speaker") || "");
    } catch {
      // The default device keeps playing.
    }
  }

  /** Starts the audio from inside a click, so browsers let it play later. */
  warm() {
    const context = this.ensure();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  }

  /** Sounds one seat's play ("self" for your own hands). `volume` 0–2. */
  set(id: string, play: SynthPlay, volume = 1) {
    let player = this.players.get(id);
    if (!player && isSilent(play)) return;
    const context = this.ensure();
    if (!context || !this.bus || !this.reverb) return;
    if (!player) {
      player = new Player(context, this.bus, this.reverb, play.sound);
      this.players.set(id, player);
    }
    const seatMuted = this.seatMutes.has(id);
    const seatVol = this.seatVolumes.get(id) ?? 1;
    const effectiveVol = seatMuted ? 0 : volume * seatVol;
    player.set(play, effectiveVol);
    this.syncTicker();
    // A new rhythm starts on the next step, not a tick later.
    if (play.rhythm !== "hold" && this.ticker) this.tick();
  }

  /** Lets one seat's notes go and forgets it. */
  drop(id: string) {
    this.seatMutes.delete(id);
    this.seatVolumes.delete(id);
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    player.dispose();
    this.syncTicker();
  }

  dropAll(keep?: string) {
    for (const id of [...this.players.keys()]) if (id !== keep) this.drop(id);
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(VOLUME_STORE, String(this.volume));
      } catch {}
    }
    this.applyMasterGain();
    this.notifyVolume();
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MUTE_STORE, muted ? "true" : "false");
      } catch {}
    }
    this.applyMasterGain();
    this.notifyVolume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applyMasterGain();
  }

  private applyMasterGain() {
    if (this.master && this.context) {
      const target = this.deafened || this.muted ? 0 : this.volume * 0.9;
      this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.03);
    }
  }

  subscribeVolume(listener: () => void): () => void {
    this.volumeListeners.add(listener);
    return () => this.volumeListeners.delete(listener);
  }

  private notifyVolume() {
    for (const listener of this.volumeListeners) listener();
  }

  setSeatMuted(seatId: string, muted: boolean) {
    if (muted) this.seatMutes.add(seatId);
    else this.seatMutes.delete(seatId);
    this.refreshSeatAudio(seatId);
    this.notifyVolume();
  }

  isSeatMuted(seatId: string): boolean {
    return this.seatMutes.has(seatId);
  }

  setSeatVolume(seatId: string, volume: number) {
    this.seatVolumes.set(seatId, Math.max(0, Math.min(2, volume)));
    this.refreshSeatAudio(seatId);
    this.notifyVolume();
  }

  getSeatVolume(seatId: string): number {
    return this.seatVolumes.get(seatId) ?? 1;
  }

  private refreshSeatAudio(seatId: string) {
    const seat = seats.get(seatId);
    if (!seat) return;
    this.set(seatId, seat.play, seat.volume);
  }

  /** The mix on its way to the speakers, for drawing; null until anything has played. */
  analyser(): AnalyserNode | null {
    return this.meter;
  }
}

export const jamEngine = new JamEngine();

// ---------------------------------------------------------------------------
// Who is playing, for the panel

export interface JamSeat {
  connectionId: string;
  userId: string;
  name: string;
  play: SynthPlay;
  /** Last requested seat volume (from user preference). */
  volume: number;
  /** Last time this seat was heard from. */
  at: number;
}

const seats = new Map<string, JamSeat>();
let seatList: JamSeat[] = [];
const listeners = new Set<() => void>();

function seatsChanged() {
  seatList = [...seats.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const listener of listeners) listener();
}

export function subscribeJamSeats(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function jamSeats(): JamSeat[] {
  return seatList;
}

/** Plays and records what another seat sent. */
export function hearSeat(seat: Omit<JamSeat, "at" | "volume">, volume: number) {
  jamEngine.set(seat.connectionId, seat.play, volume);
  seats.set(seat.connectionId, { ...seat, volume, at: Date.now() });
  seatsChanged();
}

/**
 * Silences seats that stopped talking (a lost stop, a closed laptop) and
 * forgets ones that have been quiet for a while.
 */
export function sweepSeats(now = Date.now()) {
  let changed = false;
  for (const [id, seat] of seats) {
    if (!isSilent(seat.play) && now - seat.at > SYNTH_STALE_MS) {
      seats.set(id, { ...seat, play: { ...seat.play, notes: [], lead: null, label: "" } });
      jamEngine.set(id, { ...seat.play, notes: [], lead: null }, seat.volume);
      changed = true;
    } else if (isSilent(seat.play) && now - seat.at > 30_000) {
      seats.delete(id);
      jamEngine.drop(id);
      changed = true;
    }
  }
  if (changed) seatsChanged();
}

export function clearSeats() {
  for (const id of seats.keys()) jamEngine.drop(id);
  seats.clear();
  seatsChanged();
}

// ---------------------------------------------------------------------------
// Sending your own play

let sender: ((play: SynthPlay) => boolean) | null = null;

/** SynthJamAudio hands the hub over while you are in a voice room. */
export function attachJamSender(send: ((play: SynthPlay) => boolean) | null) {
  sender = send;
}

/** False when nobody else can hear you (not in a voice room, or offline). */
export function sendJamPlay(play: SynthPlay): boolean {
  return sender ? sender(play) : false;
}

export function canSendJam(): boolean {
  return sender !== null;
}
