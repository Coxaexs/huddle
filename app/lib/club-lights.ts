/**
 * The club's lights as this listener sees them.
 *
 * The music bot sends light frames (lib/club-feed.ts) stamped with when their
 * sound plays. They arrive by the hub socket, a little before the sound gets
 * here by WebRTC, so they are held and read at the moment this listener hears
 * that music: the hub clock now, less the sound's own delay (and whatever the
 * listener nudged the lights by, for Bluetooth headphones).
 *
 * Out of them come the things a lighting designer works with: hits (the kick,
 * the snare), each part's level, the beat and the bar, the song's energy, the
 * section (a groove, a breakdown, a build, a drop) and a colour that moves on
 * with the phrases. With nothing coming (no music, or the bot not on air) the
 * show idles on its own slow clock.
 *
 * The notes that come with the frames colour the parts' lights: each part's
 * colour sits as far round from the show's colour as its note sits round the
 * circle of fifths from the middle of the music (the song's key, or the notes
 * heard lately). Notes that belong together get colours close together, a
 * part changing note changes colour, and a bass line walking walks its colour.
 *
 * On top of the music sits the light desk (lib/club-desk.ts): how bright,
 * how much the lights move and react, where the colours come from, and the
 * moments its buttons fire. All of it is worked out here, in this browser.
 *
 * Strobes are capped at three flashes a second, under the photosensitivity
 * guideline, and are off entirely when the listener has turned them off.
 */
import { CLUB_FRAME_MS, decodeFrames, decodeNotes, readNote, type ClubBatch, type ClubInfo, type ClubMoment, type ClubNote } from "@/lib/club-feed";
import { DEFAULT_DESK, HOLD_MAX_MS, cleanClubDesk, cleanClubFx, fifths, keyHue, keyMiddle, type ClubColour, type ClubDesk, type ClubFx } from "@/lib/club-desk";

/** How far behind the hub clock the sound plays here, by default (jitter buffer and output). */
export const SOUND_DELAY_MS = 130;
/** Frames kept behind the moment heard, and how stale the newest may be before the show goes idle. */
const KEEP_MS = 2000;
const STALE_MS = 600;
/** The quickest strobe allowed: three flashes a second. */
export const MIN_FLASH_GAP_MS = 334;
/**
 * How far a note's colour moves per step round the circle of fifths, as a share of the colour mix's spread: a
 * key's seven notes (three steps either side of its middle) span 0.7 of it.
 */
export const NOTE_STEP = 0.35 / 3;
/** A note clearer than this counts; a part without one for this long eases back to the show's colour. */
const NOTE_CLEAR = 0.2;
const NOTE_HOLD_MS = 1200;

export type ClubSection = "idle" | "intro" | "groove" | "breakdown" | "build" | "drop";

export interface ClubShow {
  /** The music bot's light is coming; false: the idle show. */
  live: boolean;
  kick: number;
  snare: number;
  bass: number;
  vocals: number;
  melody: number;
  level: number;
  /** 1 on a kick (or snare) hit, falling away over a fraction of a second. */
  kickHit: number;
  snareHit: number;
  /** Beats counted from the song's first, continuous; null when no grid is known. */
  beat: number | null;
  /** 0..1 through the current beat (from the grid, or the kicks without one). */
  beatPhase: number;
  bpm: number | null;
  /** 0..1, slow: how much the music is going right now. */
  energy: number;
  section: ClubSection;
  /** 0..1 through a build; 0 otherwise. */
  build: number;
  /** Seconds since the last drop (Infinity: none yet). */
  sinceDrop: number;
  /** The palette's base hue (0..1), moving on each phrase and with each drop. */
  hue: number;
  /** A strobe flash, 0..1 (already capped and gated). */
  flash: number;
  /** Lit by stems: the vocal means a voice. */
  stems: boolean;
  info: ClubInfo | null;
  /** Sampler hits sounding now, by pad name (horn, laser, boom...), 0..1 fading. */
  hits: Record<string, number>;
  /** The light desk as the room has it. */
  desk: ClubDesk;
  /** How `hue` reads: a place in the room theme's palette ("theme"), else a hue on the colour wheel. */
  colour: ClubColour;
  /** 0..1: the desk's blackout, held down. */
  blackout: number;
  /** Confetti, CO2 and flame shots fired from the desk so far: each new one fires once. */
  shots: { confetti: number; co2: number; pyro: number };
  /** A mix under way, 0..1 through it; null: none. */
  mix: number | null;
  /** The note each part is on now (bass, chord, vocal: CLUB_NOTE_PARTS), or null. */
  notes: [ClubNote | null, ClubNote | null, ClubNote | null];
  /** Each part's colour, as a shift from `hue` in shares of the colour mix's spread (0: the show's colour). */
  noteShift: [number, number, number];
  /** 0..1: how much the colours follow the notes (0: none heard lately, or the desk has it off). */
  noteFollow: number;
}

interface Frame { t: number; v: number[]; n?: number[] }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const GOLDEN = 0.618033988749895;
/** The shortest way round the wheel from a to b. */
const wheelStep = (a: number, b: number) => ((((b - a) % 1) + 1.5) % 1) - 0.5;
/** Beats between colour changes for the desk's colour speed (0: the colour stays). */
const phraseBeats = (speed: number) => (speed < 0.05 ? 0 : speed < 0.3 ? 64 : speed < 0.6 ? 32 : speed < 0.85 ? 16 : 4);

export class ClubLights {
  private frames: Frame[] = [];
  private anchors: Array<{ t: number; beat: number; bpm: number }> = [];
  private moments: ClubMoment[] = [];
  private stems = false;
  private info: ClubInfo | null = null;
  // Derived state, carried from one sample to the next.
  private last = 0;
  private smooth = [0, 0, 0, 0, 0, 0];
  private slowKick = 0;
  private slowSnare = 0;
  private kickHit = 0;
  private snareHit = 0;
  private lastKickAt = -1e9;
  private lastSnareAt = -1e9;
  private kickGap = 500;
  private energy = 0;
  private quietSince: number | null = null;
  private dropAt = -1e12;
  private lastDropMoment = -1e12;
  private flash = 0;
  private lastFlashAt = -1e12;
  /** Where the colour starts, and how many phrase changes and drops have moved it on since. */
  private hueBase = Math.random();
  private hueSteps = 0;
  private dropTurns = 0;
  private drift = 0;
  private hue = this.hueBase;
  private phrase: number | null = null;
  private phraseLength = 0;
  private lastKeyHue: number | null = null;
  private seenMoments = new Set<string>();
  /** Sampler moments already sounded here. */
  private sounded = new Set<string>();
  private hits: Record<string, number> = {};
  private desk: ClubDesk = DEFAULT_DESK;
  /** Held moments: until when (heard time) the blackout and the strobe stay on. */
  private blackoutUntil = 0;
  private strobeUntil = 0;
  private blackout = 0;
  private flashWanted = 0;
  private shots = { confetti: 0, co2: 0, pyro: 0 };
  /** The notes: each part's, its colour's shift (and where it is heading), when it last had one. */
  private notes: [ClubNote | null, ClubNote | null, ClubNote | null] = [null, null, null];
  private noteShift: [number, number, number] = [0, 0, 0];
  private noteAt = [-1e12, -1e12, -1e12];
  private noteFollow = 0;
  /** The notes heard lately, summed round the circle of fifths (fading): their middle, for a song without a key. */
  private heardX = 0;
  private heardY = 0;

  constructor(
    /** The hub clock, ms. */
    private readonly hubNow: () => number,
    /** Extra delay before a frame shows (ms): the listener's nudge for their headphones. */
    private readonly nudge: () => number = () => 0,
    /** Strobes allowed at all (off for anyone who turned them off, or asks for less motion). */
    private readonly strobes: () => boolean = () => true,
  ) {}

  /** A batch from the hub (the "huddle-club" event's detail). */
  push(batch: ClubBatch) {
    const frames = decodeFrames(batch.f);
    const notes = batch.n ? decodeNotes(batch.n) : [];
    frames.forEach((v, i) => this.insert({ t: batch.at + i * CLUB_FRAME_MS, v, ...(notes[i] ? { n: notes[i] } : {}) }));
    if (typeof batch.b === "number" && typeof batch.bpm === "number") {
      this.anchors.push({ t: batch.at, beat: batch.b, bpm: batch.bpm });
      if (this.anchors.length > 64) this.anchors.splice(0, this.anchors.length - 64);
    }
    if (typeof batch.stems === "boolean") this.stems = batch.stems;
    if (batch.info) this.info = batch.info;
    for (const moment of batch.ev ?? []) {
      const key = `${moment.k}|${moment.at}|${moment.name ?? ""}`;
      if (this.seenMoments.has(key)) continue;
      this.seenMoments.add(key);
      this.moments.push(moment);
    }
    if (this.moments.length > 32) this.moments.splice(0, this.moments.length - 32);
    if (this.seenMoments.size > 256) this.seenMoments = new Set([...this.seenMoments].slice(-64));
    const oldest = this.heardAt() - KEEP_MS;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].t < oldest) drop++;
    if (drop) this.frames.splice(0, drop);
  }

  private insert(frame: Frame) {
    const frames = this.frames;
    const lastFrame = frames.at(-1);
    if (!lastFrame || frame.t > lastFrame.t) {
      frames.push(frame);
      return;
    }
    // Late or repeated (a batch sent twice, or a resync): keep time order, newest wins.
    let i = frames.length - 1;
    while (i >= 0 && frames[i].t > frame.t) i--;
    if (i >= 0 && Math.abs(frames[i].t - frame.t) < 1) frames[i] = frame;
    else frames.splice(i + 1, 0, frame);
  }

  /** The room's light desk changed (or this browser's DJ moved a fader). */
  setDesk(desk: ClubDesk) {
    this.desk = desk;
  }

  getDesk(): ClubDesk {
    return this.desk;
  }

  /** A moment from the light desk: now, for whoever sees it. */
  fx(fx: ClubFx) {
    const t = this.heardAt();
    switch (fx.thing) {
      case "confetti":
      case "co2":
      case "pyro":
        this.shots = { ...this.shots, [fx.thing]: this.shots[fx.thing] + 1 };
        break;
      case "flash":
        this.flashWanted = 1;
        break;
      case "drop":
        // The lights' drop, whatever the music is doing: the colour thrown, confetti and CO2.
        this.dropAt = -1e12;
        this.drop(t);
        this.shots = { ...this.shots, confetti: this.shots.confetti + 1, co2: this.shots.co2 + 1 };
        break;
      case "blackout":
        this.blackoutUntil = fx.on ? t + HOLD_MAX_MS : 0;
        break;
      case "strobe":
        this.strobeUntil = fx.on ? t + HOLD_MAX_MS : 0;
        break;
    }
  }

  /** The time the listener is hearing now, on the bot's clock. */
  heardAt(): number {
    return this.hubNow() - SOUND_DELAY_MS - this.nudge();
  }

  /** The raw frame heard at time t (interpolated), or null when there is none near. */
  frameAt(t: number): number[] | null {
    const frames = this.frames;
    if (!frames.length || t > frames[frames.length - 1].t + STALE_MS || t < frames[0].t - CLUB_FRAME_MS) return null;
    let lo = 0;
    let hi = frames.length - 1;
    if (t >= frames[hi].t) return frames[hi].v;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = frames[lo];
    const b = frames[hi];
    if (b.t - a.t > CLUB_FRAME_MS * 3) return a.v;      // a gap: hold, don't smear
    const q = (t - a.t) / Math.max(1, b.t - a.t);
    return a.v.map((value, i) => value + (b.v[i] - value) * q);
  }

  /** The notes heard at time t: the frame's at or before it (notes don't blend), or null. */
  notesAt(t: number): number[] | null {
    const frames = this.frames;
    if (!frames.length || t > frames[frames.length - 1].t + STALE_MS || t < frames[0].t - CLUB_FRAME_MS) return null;
    let lo = 0;
    let hi = frames.length - 1;
    if (t >= frames[hi].t) return frames[hi].n ?? null;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t <= t) lo = mid; else hi = mid;
    }
    return frames[lo].n ?? null;
  }

  /** The beat at time t from the newest grid anchor before it. */
  beatAt(t: number): { beat: number; bpm: number } | null {
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      if (a.t <= t + 200) {
        if (t - a.t > 8000) return null;               // an old grid: the song moved on
        return { beat: a.beat + ((t - a.t) / 60_000) * a.bpm, bpm: a.bpm };
      }
    }
    return null;
  }

  /** The show now. Call once per animation frame. */
  sample(): ClubShow {
    const t = this.heardAt();
    const dt = this.last ? Math.min(0.1, Math.max(0, (t - this.last) / 1000)) : 1 / 60;
    this.last = t;
    const raw = this.frameAt(t);
    const live = raw !== null;
    const target = raw ?? [0, 0, 0, 0, 0, 0];
    const desk = this.desk;
    // Lights snap on and ease off: fast attack, a release per part (longer the less the desk wants them to react).
    const release = [0.09, 0.07, 0.25, 0.35, 0.4, 0.3];
    const slow = 1.9 - 1.4 * desk.react;
    for (let i = 0; i < 6; i++) {
      const current = this.smooth[i];
      const next = target[i];
      this.smooth[i] = next >= current ? current + (next - current) * Math.min(1, dt * 45) : current + (next - current) * Math.min(1, dt / (release[i] * slow));
    }
    const [kick, snare] = target;
    // Hits: a part jumping clear above its own recent run.
    this.slowKick += (kick - this.slowKick) * Math.min(1, dt / 0.4);
    this.slowSnare += (snare - this.slowSnare) * Math.min(1, dt / 0.4);
    this.kickHit *= Math.exp(-dt / (0.16 * slow));
    this.snareHit *= Math.exp(-dt / (0.12 * slow));
    let kicked = false;
    const reach = 0.42 - 0.18 * desk.react;
    const margin = 0.26 - 0.13 * desk.react;
    if (live && kick > reach && kick > this.slowKick + margin && t - this.lastKickAt > 140) {
      const gap = t - this.lastKickAt;
      if (gap > 250 && gap < 1500) this.kickGap += (gap - this.kickGap) * 0.3;
      this.lastKickAt = t;
      this.kickHit = 1;
      kicked = true;
    }
    if (live && snare > reach + 0.08 && snare > this.slowSnare + margin + 0.02 && t - this.lastSnareAt > 110) {
      this.lastSnareAt = t;
      this.snareHit = 1;
    }
    const grid = this.beatAt(t);
    const beat = grid ? grid.beat : null;
    const bpm = grid ? grid.bpm : live ? Math.round(60_000 / this.kickGap) : null;
    const beatPhase = beat !== null ? beat - Math.floor(beat) : clamp01((t - this.lastKickAt) / this.kickGap) % 1;
    // Energy: the level and the drums over the last several seconds.
    const level = this.smooth[5];
    this.energy += ((live ? 0.55 * level + 0.45 * this.slowKick * 1.6 : 0) - this.energy) * Math.min(1, dt / 5);
    this.energy = clamp01(this.energy);

    // Moments from the bot, as they come up.
    for (const name of Object.keys(this.hits)) {
      this.hits[name] *= Math.exp(-dt / (name === "horn" || name === "siren" ? 0.8 : 0.35));
      if (this.hits[name] < 0.02) delete this.hits[name];
    }
    let build = 0;
    let breakdown = false;
    for (const m of this.moments) {
      if (m.k === "build" && t >= m.at && t < (m.until ?? m.at + 4000)) build = clamp01((t - m.at) / Math.max(1, (m.until ?? m.at + 4000) - m.at));
      if ((m.k === "breakdown" || m.k === "beatbreak") && t >= m.at && t < (m.until ?? m.at)) breakdown = true;
      if (m.k === "drop" && t >= m.at && m.at > this.lastDropMoment) { this.lastDropMoment = m.at; this.drop(t); }
      const key = `${m.at}|${m.name}`;
      if (m.k === "sample" && m.name && t >= m.at && t < m.at + 500 && !this.sounded.has(key)) {
        this.sounded.add(key);
        if (this.sounded.size > 64) this.sounded = new Set([...this.sounded].slice(-32));
        this.hits[m.name] = 1;
        if (m.name === "boom") this.drop(t);
      }
      // A riser sounding is a build of its own (Real DJ's flourishes): four seconds to the drop.
      if (m.k === "sample" && m.name === "riser" && t >= m.at && t < m.at + 4000) build = Math.max(build, clamp01((t - m.at) / 4000));
    }

    // Without the bot's word: the kick going away under the music is a breakdown, and its return the drop.
    if (!live) this.quietSince = null;
    else if (kicked) {
      if (this.quietSince !== null && t - this.quietSince > 3500) this.drop(t);
      this.quietSince = null;
    } else if (t - this.lastKickAt > 2500 && level > 0.12) this.quietSince ??= Math.max(this.lastKickAt, t - 2500);
    if (this.quietSince !== null) breakdown = true;

    const sinceDrop = (t - this.dropAt) / 1000;
    const section: ClubSection = !live ? "idle"
      : build > 0 ? "build"
        : sinceDrop < 16 * 60 / Math.max(60, bpm ?? 120) ? "drop"
          : breakdown ? "breakdown"
            : this.energy < 0.3 ? "intro" : "groove";

    // The colour moves on with the phrases (how often: the desk's colour speed), and the drop throws it on.
    // The theme's palette and the rainbow leap round the wheel; a song's key or a picked colour only sways.
    const every = phraseBeats(desk.colourSpeed);
    if (every !== this.phraseLength) { this.phraseLength = every; this.phrase = null; }
    if (beat !== null && every) {
      const phrase = Math.floor(beat / every);
      if (this.phrase !== null && phrase !== this.phrase) this.hueSteps++;
      this.phrase = phrase;
    }
    let hueTarget: number;
    if (desk.colour === "theme" || desk.colour === "rainbow") {
      // The rainbow also drifts round on its own, a turn every couple of minutes at full colour speed.
      if (desk.colour === "rainbow") this.drift = (this.drift + dt * desk.colourSpeed * 0.008) % 1;
      hueTarget = this.hueBase + this.hueSteps * GOLDEN + this.dropTurns * 0.5 + (desk.colour === "rainbow" ? this.drift : 0);
    } else {
      const fromKey = desk.colour === "key" ? keyHue(this.info?.key) : null;
      if (fromKey !== null) this.lastKeyHue = fromKey;
      // Either side of the colour: each phrase and each drop crosses over, a picked colour less far than a key.
      const centre = desk.colour === "pick" ? desk.hue : this.lastKeyHue ?? desk.hue;
      const reach = (desk.colour === "pick" ? 0.012 : 0.025) * (1 + Math.min(1, desk.colourSpeed * 2));
      hueTarget = centre + ((this.hueSteps + this.dropTurns) % 2 ? reach : -reach);
    }
    this.hue = (this.hue + wheelStep(this.hue, hueTarget) * Math.min(1, dt * (0.6 + 2 * desk.colourSpeed)) + 1) % 1;
    this.followNotes(t, dt, live);

    // Held from the desk: the blackout snaps, the strobe hits every beat (a third of a second without one).
    if (t > this.blackoutUntil) this.blackoutUntil = 0;
    if (t > this.strobeUntil) this.strobeUntil = 0;
    this.blackout += ((this.blackoutUntil ? 1 : 0) - this.blackout) * Math.min(1, dt * 30);

    // The strobe: on the drop, then with the snare while the drop lasts; the build's last beats flicker. The
    // desk's strobe fader dims and thins that out below its default, and above it the drop's kicks flash too
    // (all still under the cap); the desk's own flash and held strobe go on top.
    this.flash *= Math.exp(-dt / 0.06);
    if (this.strobes()) {
      const amount = desk.strobe;
      const strength = Math.min(1, amount / DEFAULT_DESK.strobe);
      const onBeat = beat !== null ? beatPhase < dt * (bpm ?? 120) / 60 * 2 : t - this.lastFlashAt >= MIN_FLASH_GAP_MS;
      let want = !live || amount < 0.1 ? 0
        : (section === "drop" && sinceDrop < 0.05) ? strength
          : amount >= 0.34 && section === "drop" && this.snareHit === 1 ? 0.75 * strength
            : amount >= 0.85 && section === "drop" && kicked ? 0.6
              : amount >= 0.5 && build > 0.75 && beat !== null && onBeat ? 0.5 * build * strength
                : 0;
      if (this.strobeUntil && onBeat) want = Math.max(want, 0.9);
      if (this.flashWanted) want = Math.max(want, this.flashWanted);
      if (want > 0 && t - this.lastFlashAt >= MIN_FLASH_GAP_MS) {
        this.flash = want;
        this.lastFlashAt = t;
        this.flashWanted = 0;
      }
    } else {
      this.flash = 0;
      this.flashWanted = 0;
    }

    return {
      live,
      kick: this.smooth[0], snare: this.smooth[1], bass: this.smooth[2], vocals: this.smooth[3], melody: this.smooth[4], level,
      kickHit: this.kickHit, snareHit: this.snareHit,
      beat, beatPhase, bpm, energy: this.energy, section, build, sinceDrop, hue: this.hue, flash: this.flash,
      stems: this.stems, info: this.info, hits: { ...this.hits },
      desk, colour: desk.colour, blackout: this.blackout, shots: this.shots,
      mix: this.info?.mix ? this.info.mix.progress : null,
      notes: [...this.notes], noteShift: [...this.noteShift], noteFollow: this.noteFollow,
    };
  }

  /**
   * Each part's note now, and its colour's shift: a clear note moves it quickly (the colour changes with the
   * note), and a part with none for a while eases back to the show's colour. The middle the notes are measured
   * from is the song's key, or the notes heard over the last half minute or so.
   */
  private followNotes(t: number, dt: number, live: boolean) {
    const heard = live ? this.notesAt(t) : null;
    const fade = Math.exp(-dt / 20);
    this.heardX *= fade;
    this.heardY *= fade;
    for (let k = 0; k < 3; k++) {
      const note = readNote(heard?.[k]);
      this.notes[k] = note;
      if (!note || note.strength < NOTE_CLEAR) continue;
      const angle = (fifths(note.pc) / 12) * Math.PI * 2;
      const weight = note.strength * dt * (k === 2 ? 0.5 : 1);
      this.heardX += Math.cos(angle) * weight;
      this.heardY += Math.sin(angle) * weight;
    }
    const middle = keyMiddle(this.info?.key)
      ?? (Math.hypot(this.heardX, this.heardY) > 1e-3 ? ((Math.atan2(this.heardY, this.heardX) / (Math.PI * 2)) * 12 + 12) % 12 : 0);
    let any = false;
    for (let k = 0; k < 3; k++) {
      const note = this.notes[k];
      if (note && note.strength >= NOTE_CLEAR) {
        const steps = ((((fifths(note.pc) - middle) % 12) + 18) % 12) - 6;      // -6..6 steps round from the middle
        const target = Math.max(-0.5, Math.min(0.5, steps * NOTE_STEP));
        this.noteShift[k] += (target - this.noteShift[k]) * Math.min(1, dt * 16);
        this.noteAt[k] = t;
      } else if (t - this.noteAt[k] > NOTE_HOLD_MS) {
        this.noteShift[k] += -this.noteShift[k] * Math.min(1, dt / 1.5);
      }
      if (t - this.noteAt[k] < 4000) any = true;
    }
    const follow = this.desk.notes && any ? 1 : 0;
    this.noteFollow += (follow - this.noteFollow) * Math.min(1, dt / 1.5);
  }

  private drop(t: number) {
    if (t - this.dropAt < 2000) return;
    this.dropAt = t;
    this.dropTurns++;
  }
}

/**
 * Listens for the room's light batches, its light desk and the desk's moments
 * (use-hub re-dispatches them as the "huddle-club" window event) and tells the
 * hub this seat wants them, again every few seconds in case the room socket
 * came back without it.
 */
export function watchClub(
  roomId: string,
  lights: ClubLights,
  send: (on: boolean) => void,
  onDesk?: (desk: ClubDesk, by: string | null) => void,
): () => void {
  const onBatch = (event: Event) => {
    const detail = (event as CustomEvent).detail as ({ t?: string; channelId?: string } & Record<string, unknown>) | undefined;
    if (!detail || detail.channelId !== roomId) return;
    if (detail.t === "club-desk") {
      const desk = cleanClubDesk(detail.desk);
      if (!desk) return;
      lights.setDesk(desk);
      onDesk?.(desk, typeof detail.by === "string" ? detail.by : null);
    } else if (detail.t === "club-fx") {
      const fx = cleanClubFx(detail.fx);
      if (fx) lights.fx(fx);
    } else {
      lights.push(detail as unknown as ClubBatch);
    }
  };
  window.addEventListener("huddle-club", onBatch);
  send(true);
  const again = window.setInterval(() => send(true), 8000);
  return () => {
    window.removeEventListener("huddle-club", onBatch);
    window.clearInterval(again);
    send(false);
  };
}
