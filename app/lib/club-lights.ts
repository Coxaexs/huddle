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
 * Strobes are capped at three flashes a second, under the photosensitivity
 * guideline, and are off entirely when the listener has turned them off.
 */
import { CLUB_FRAME_MS, decodeFrames, type ClubBatch, type ClubInfo, type ClubMoment } from "@/lib/club-feed";

/** How far behind the hub clock the sound plays here, by default (jitter buffer and output). */
export const SOUND_DELAY_MS = 130;
/** Frames kept behind the moment heard, and how stale the newest may be before the show goes idle. */
const KEEP_MS = 2000;
const STALE_MS = 600;
/** The quickest strobe allowed: three flashes a second. */
export const MIN_FLASH_GAP_MS = 334;

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
}

interface Frame { t: number; v: number[] }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const GOLDEN = 0.618033988749895;

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
  private hue = Math.random();
  private hueTarget = this.hue;
  private phrase: number | null = null;
  private seenMoments = new Set<string>();
  /** Sampler moments already sounded here. */
  private sounded = new Set<string>();
  private hits: Record<string, number> = {};

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
    frames.forEach((v, i) => this.insert({ t: batch.at + i * CLUB_FRAME_MS, v }));
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
    // Lights snap on and ease off: fast attack, a release per part.
    const release = [0.09, 0.07, 0.25, 0.35, 0.4, 0.3];
    for (let i = 0; i < 6; i++) {
      const current = this.smooth[i];
      const next = target[i];
      this.smooth[i] = next >= current ? current + (next - current) * Math.min(1, dt * 45) : current + (next - current) * Math.min(1, dt / release[i]);
    }
    const [kick, snare] = target;
    // Hits: a part jumping clear above its own recent run.
    this.slowKick += (kick - this.slowKick) * Math.min(1, dt / 0.4);
    this.slowSnare += (snare - this.slowSnare) * Math.min(1, dt / 0.4);
    this.kickHit *= Math.exp(-dt / 0.16);
    this.snareHit *= Math.exp(-dt / 0.12);
    let kicked = false;
    if (live && kick > 0.32 && kick > this.slowKick + 0.18 && t - this.lastKickAt > 140) {
      const gap = t - this.lastKickAt;
      if (gap > 250 && gap < 1500) this.kickGap += (gap - this.kickGap) * 0.3;
      this.lastKickAt = t;
      this.kickHit = 1;
      kicked = true;
    }
    if (live && snare > 0.4 && snare > this.slowSnare + 0.2 && t - this.lastSnareAt > 110) {
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

    // The colour moves on with each 8-bar phrase, and the drop throws it across the wheel.
    if (beat !== null) {
      const phrase = Math.floor(beat / 32);
      if (this.phrase !== null && phrase !== this.phrase) this.hueTarget = (this.hueTarget + GOLDEN) % 1;
      this.phrase = phrase;
    }
    const hueStep = (((this.hueTarget - this.hue) % 1) + 1.5) % 1 - 0.5;
    this.hue = (this.hue + hueStep * Math.min(1, dt * 1.5) + 1) % 1;

    // The strobe: on the drop, then with the snare while the drop lasts; the build's last beats flicker.
    this.flash *= Math.exp(-dt / 0.06);
    if (this.strobes() && live) {
      const want = (section === "drop" && sinceDrop < 0.05) ? 1
        : section === "drop" && this.snareHit === 1 ? 0.75
          : build > 0.75 && beat !== null && beatPhase < dt * (bpm ?? 120) / 60 * 2 ? 0.5 * build
            : 0;
      if (want > 0 && t - this.lastFlashAt >= MIN_FLASH_GAP_MS) {
        this.flash = want;
        this.lastFlashAt = t;
      }
    } else this.flash = 0;

    return {
      live,
      kick: this.smooth[0], snare: this.smooth[1], bass: this.smooth[2], vocals: this.smooth[3], melody: this.smooth[4], level,
      kickHit: this.kickHit, snareHit: this.snareHit,
      beat, beatPhase, bpm, energy: this.energy, section, build, sinceDrop, hue: this.hue, flash: this.flash,
      stems: this.stems, info: this.info, hits: { ...this.hits },
    };
  }

  private drop(t: number) {
    if (t - this.dropAt < 2000) return;
    this.dropAt = t;
    this.hueTarget = (this.hueTarget + 0.5) % 1;
  }
}

/**
 * Listens for the room's light batches (use-hub re-dispatches them as the
 * "huddle-club" window event) and tells the hub this seat wants them, again
 * every few seconds in case the room socket came back without it.
 */
export function watchClub(roomId: string, lights: ClubLights, send: (on: boolean) => void): () => void {
  const onBatch = (event: Event) => {
    const detail = (event as CustomEvent).detail as (ClubBatch & { channelId?: string }) | undefined;
    if (detail && detail.channelId === roomId) lights.push(detail);
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
