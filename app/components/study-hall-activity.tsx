"use client";

/**
 * Hoffle Study Hall: a lofi radio a voice room listens to together, with rain
 * on the window if the room wants it and a focus timer everyone shares.
 *
 * Nothing is streamed between people. The room shares a seed, a start time
 * and a mood (lib/study-hall.ts); what is playing is a pure function of those,
 * and each browser works out where the room is from the hub's clock and plays
 * the same recorded track from the same second (public/study-hall).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudRain, Droplets, Headphones, Music, Shuffle, SkipForward, Square, Timer, Volume2, X } from "lucide-react";
import type { RoomActivity } from "@/lib/activities";
import {
  ambientPlaying,
  ambientState,
  ambientTimerStatus,
  ambientUpNext,
  reshuffleAmbient,
  skipAmbientTrack,
  startAmbientTimer,
  stopAmbientTimer,
  type AmbientIntensity,
  type AmbientState,
  type AmbientTimerKind,
} from "@/lib/study-hall";
import { STUDY_ARTIST, STUDY_RAIN_FILE } from "@/lib/study-hall-tracks";
import { basePath } from "../lib/client";
import { TIMER_WORKER_SOURCE } from "../lib/worker-timers";

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

const TICK_MS = 250;
/** The track is moved back to the room's place if it is this far off it, in seconds. */
const MAX_DRIFT = 0.4;
/** The next track's file is fetched this long before it is due. */
const WARM_AHEAD_MS = 25_000;
/** How long to wait before asking again for a file that would not download. */
const RETRY_MS = 5000;
/** How long one pass of the rain loop fades into the next, in seconds. */
const RAIN_FADE = 3;

/** Per mood: how loud the music and the rain are. The files are levelled, so these are the mix. */
const LEVELS: Record<AmbientIntensity, { music: number; rain: number }> = {
  calm: { music: 1, rain: 0 },
  rainy: { music: 0.9, rain: 1 },
  rain: { music: 0, rain: 2 },
};

/** Equal-power fades, so two passes of the rain crossing over stay as loud as one. */
const FADE_IN = Float32Array.from({ length: 64 }, (_, index) => Math.sin((Math.PI / 2) * (index / 63)));
const FADE_OUT = Float32Array.from({ length: 64 }, (_, index) => Math.cos((Math.PI / 2) * (index / 63)));

/** A twentieth of a second of silence, as a WAV file. */
function silentClip(): Blob {
  const samples = 400;
  const bytes = new Uint8Array(44 + samples).fill(128);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  return new Blob([bytes], { type: "audio/wav" });
}

/** Calls back every 250 ms from a worker, which keeps time in a background tab. */
function startTicker(callback: () => void): () => void {
  let worker: Worker | null = null;
  let url = "";
  let native: number | null = null;
  const fallback = () => {
    worker?.terminate();
    worker = null;
    if (native === null) native = window.setInterval(callback, TICK_MS);
  };
  try {
    url = URL.createObjectURL(new Blob([TIMER_WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = () => callback();
    worker.onerror = fallback;
    worker.postMessage({ op: "set", id: 1, delay: TICK_MS, repeat: true });
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
 * Plays what the room is playing: the track, from the room's place in it, and
 * the rain over it.
 *
 * A track is downloaded whole (about 3 MB) and handed to an ordinary audio
 * element from memory. Hoffle's server does not answer requests for part of a
 * file, and without those Safari will not play a file by its address at all,
 * while every browser can jump anywhere in one it already holds. Four times a
 * second the player compares the element with the shared clock: the next
 * track is fetched ahead of time and swapped in when the room moves on, and
 * the element is put back in place if it has drifted (a laptop that slept).
 * The rain is one short recording, looped by fading each pass into the next,
 * which hides both the loop point and the gap an MP3 has at its ends.
 */
export class StudyHallPlayer {
  private readonly out: GainNode;
  private readonly musicGain: GainNode;
  private readonly rainGain: GainNode;
  private readonly element: HTMLAudioElement;
  /** Downloaded tracks, as addresses the element can play: this one and the next. */
  private readonly files = new Map<string, Promise<string>>();
  private readonly failedAt = new Map<string, number>();
  private readonly silence = URL.createObjectURL(silentClip());
  /** Whether the track runs through Web Audio (it always should; if not, the element's own volume is used). */
  private readonly wired: boolean;

  private playing = false;
  private stopTicker: (() => void) | null = null;
  private volume = 0.7;
  private mood: AmbientIntensity | null = null;
  /** The track the room is on, and the one the element holds. */
  private wanted: string | null = null;
  private loaded: string | null = null;
  private unlocked = false;
  private disposed = false;
  /** Audio time after which a silenced track may be paused. */
  private musicQuietAt = Number.POSITIVE_INFINITY;

  private rainBuffer: AudioBuffer | null = null;
  private rainState: "idle" | "loading" | "failed" = "idle";
  /** Audio time at which the next pass of the rain starts. */
  private rainNextAt = 0;
  private readonly rainSources = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly read: () => AmbientState,
    private readonly clock: () => number,
    /** Where the files are, without a trailing slash. */
    private readonly base: string,
    /** The browser refused to start the sound. */
    private readonly onBlocked: () => void = () => {},
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.out);
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.out);

    this.element = new Audio();
    this.element.preload = "auto";
    let wired = false;
    try {
      ctx.createMediaElementSource(this.element).connect(this.musicGain);
      wired = true;
    } catch {
      // The element then plays on its own, and takes its level from `volume`.
    }
    this.wired = wired;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this.levelElement();
  }

  /** Must be called from inside a click: that is what lets the track start. */
  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.mood = null;
    this.wanted = null;
    this.loaded = null;
    if (!this.unlocked) {
      // Safari lets an element make sound only if it was first played from
      // inside a click. The track is still downloading at that point, so the
      // click plays a moment of silence, and the element stays allowed.
      this.unlocked = true;
      this.element.src = this.silence;
      this.play();
    }
    this.stopTicker = startTicker(this.tick);
    this.tick();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.stopTicker?.();
    this.stopTicker = null;
    this.element.pause();
    const now = this.ctx.currentTime;
    for (const gain of [this.musicGain, this.rainGain]) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.1);
    }
    for (const source of this.rainSources) {
      try {
        source.stop(now + 0.6);
      } catch {
        // Already ended.
      }
    }
    this.rainNextAt = 0;
    this.mood = null;
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.element.removeAttribute("src");
    this.element.load();
    this.wanted = null;
    this.loaded = null;
    for (const file of this.files.values()) void file.then((url) => URL.revokeObjectURL(url), () => undefined);
    this.files.clear();
    URL.revokeObjectURL(this.silence);
    this.out.disconnect();
  }

  /** A track's file, downloaded once and kept while it is this track or the next. */
  private fetchTrack(id: string): Promise<string> | null {
    const known = this.files.get(id);
    if (known) return known;
    if (Date.now() - (this.failedAt.get(id) ?? Number.NEGATIVE_INFINITY) < RETRY_MS) return null;
    const file = fetch(this.file(`${id}.mp3`))
      .then((response) => {
        if (!response.ok) throw new Error(`${id}: ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    this.files.set(id, file);
    file.catch(() => {
      // Asked for again in a few seconds, by whichever tick still wants it.
      this.files.delete(id);
      this.failedAt.set(id, Date.now());
    });
    return file;
  }

  /** Lets go of every downloaded track but these. */
  private keepOnly(ids: string[]): void {
    for (const [id, file] of this.files) {
      if (ids.includes(id)) continue;
      this.files.delete(id);
      void file.then((url) => URL.revokeObjectURL(url), () => undefined);
    }
  }

  private file(name: string): string {
    return `${this.base}/${name}`;
  }

  private readonly tick = (): void => {
    if (!this.playing) return;
    const state = this.read();
    if (state.intensity !== this.mood) this.setMood(state.intensity);
    this.music(state, this.clock());
    this.rain(state);
  };

  private setMood(mood: AmbientIntensity): void {
    this.mood = mood;
    const now = this.ctx.currentTime;
    const level = LEVELS[mood];
    // Fades, so joining and changing the mood wash in instead of switching.
    this.musicGain.gain.setTargetAtTime(level.music, now, 0.5);
    this.rainGain.gain.setTargetAtTime(level.rain, now, 1.2);
    this.musicQuietAt = level.music === 0 ? now + 2.5 : Number.POSITIVE_INFINITY;
    this.levelElement();
  }

  /** Without Web Audio in the path, the element's own volume does the work. */
  private levelElement(): void {
    if (this.wired) return;
    this.element.volume = this.volume * (this.mood ? LEVELS[this.mood].music : 1);
  }

  private music(state: AmbientState, now: number): void {
    const element = this.element;
    if (state.intensity === "rain") {
      // Rain alone: the track stops once it has faded, and nothing is downloaded.
      if (!element.paused && this.ctx.currentTime >= this.musicQuietAt) element.pause();
      return;
    }
    const playing = ambientPlaying(state, now);
    const id = playing.track.id;
    const next = ambientPlaying(state, playing.endsAt).track.id;
    if (this.wanted !== id) {
      // The room moved on: the last track has ended, or is cut off here.
      this.wanted = id;
      this.keepOnly([id, next]);
      if (!element.paused) element.pause();
    }
    if (this.loaded !== id) {
      void this.fetchTrack(id)?.then((url) => {
        if (this.disposed || this.wanted !== id || this.loaded === id) return;
        this.loaded = id;
        element.src = url;
      }, () => undefined);
      return;
    }
    if (playing.endsAt - now < WARM_AHEAD_MS) this.fetchTrack(next)?.catch(() => undefined);

    const at = playing.offsetMs / 1000;
    if (at >= playing.track.ms / 1000 - 0.05) {
      // The pause between two tracks.
      if (!element.paused) element.pause();
      return;
    }
    // Nothing is known about the file yet, or a jump is still under way.
    if (element.readyState < 1 || element.seeking) return;
    if (Math.abs(element.currentTime - at) > MAX_DRIFT) {
      // Joining part-way through, or drifted: go to the room's place first.
      element.currentTime = at;
      return;
    }
    // An element that reached its end stays there: playing it again would start it over.
    if (element.paused && !element.ended) this.play();
  }

  private play(): void {
    const started = this.element.play();
    // A change of track interrupts the last play(), which is not a refusal.
    started?.catch((error: unknown) => {
      if ((error as DOMException | null)?.name === "NotAllowedError" && this.playing) this.onBlocked();
    });
  }

  private rain(state: AmbientState): void {
    if (LEVELS[state.intensity].rain <= 0) return;
    const buffer = this.rainBuffer;
    if (!buffer) {
      this.loadRain();
      return;
    }
    const now = this.ctx.currentTime;
    // The first pass, or the first after the rain was off for longer than one.
    if (this.rainNextAt < now) this.rainNextAt = now + 0.05;
    while (this.rainNextAt - now < 1) {
      this.rainPass(buffer, this.rainNextAt);
      this.rainNextAt += Math.max(1, buffer.duration - RAIN_FADE);
    }
  }

  /** One pass of the recording, fading in over the end of the pass before it. */
  private rainPass(buffer: AudioBuffer, at: number): void {
    const { ctx } = this;
    const fade = Math.min(RAIN_FADE, buffer.duration / 3);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    envelope.gain.setValueCurveAtTime(FADE_IN, at, fade);
    envelope.gain.setValueCurveAtTime(FADE_OUT, at + buffer.duration - fade, fade);
    source.connect(envelope).connect(this.rainGain);
    source.start(at);
    this.rainSources.add(source);
    source.onended = () => {
      envelope.disconnect();
      this.rainSources.delete(source);
    };
  }

  private loadRain(): void {
    if (this.rainState !== "idle") return;
    this.rainState = "loading";
    fetch(this.file(STUDY_RAIN_FILE))
      .then((response) => {
        if (!response.ok) throw new Error(`rain: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then(
        (buffer) => {
          this.rainBuffer = buffer;
          this.rainState = "idle";
        },
        () => {
          // No rain, then. The music does not depend on it.
          this.rainState = "failed";
        },
      );
  }
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */

const MOODS: Array<{ mood: AmbientIntensity; name: string; icon: React.ReactNode; hint: string }> = [
  { mood: "calm", name: "Music", icon: <Music size={14} />, hint: "Just the music" },
  { mood: "rainy", name: "Rainy", icon: <CloudRain size={14} />, hint: "Music with rain on the window" },
  { mood: "rain", name: "Rain only", icon: <Droplets size={14} />, hint: "No music, just the rain" },
];

export function StudyHallActivity({
  activity,
  update,
  serverNow = Date.now,
  startedByMe = false,
}: {
  /** You opened this Study Hall, so the music may start for you without asking. */
  startedByMe?: boolean;
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
  const playerRef = useRef<StudyHallPlayer | null>(null);
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // A clock for the display only; the sound keeps its own time.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clockRef.current()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      playerRef.current?.dispose();
      playerRef.current = null;
      void audioRef.current?.close().catch(() => {});
      audioRef.current = null;
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (playerRef.current?.isPlaying) {
      playerRef.current.stop();
      setListening(false);
      return;
    }
    const refused = () => {
      playerRef.current?.stop();
      setListening(false);
      setBlocked(true);
    };
    try {
      if (!audioRef.current) {
        const audio = new AudioContext({ latencyHint: "playback" });
        audioRef.current = audio;
        playerRef.current = new StudyHallPlayer(
          audio,
          () => stateRef.current,
          () => clockRef.current(),
          `${basePath}/study-hall`,
          refused,
        );
        playerRef.current.setVolume(volumeRef.current);
      }
      const audio = audioRef.current;
      const player = playerRef.current;
      if (!player) return;
      // The track is started before the wait below, while this still counts as
      // the click: Safari only lets a page start sound from inside one.
      const awake = audio.resume();
      player.start();
      setBlocked(false);
      setListening(true);
      await awake;
    } catch {
      refused();
    }
  }, []);

  function changeVolume(next: number) {
    setVolume(next);
    playerRef.current?.setVolume(next);
  }

  function share(next: AmbientState) {
    // The display's clock is up to a quarter of a second old, and a skip seen
    // through it would show the old track finishing first.
    setNow(clockRef.current());
    update({ ...next });
  }

  // Whoever started Study Hall just clicked to do it: they asked for the music,
  // and their browser lets it start straight away. Everyone else chooses, with
  // the big "Listen in" button, since it plays on top of the room's voices.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (startedByMe && activation?.isActive) void toggle();
  }, [toggle, startedByMe]);

  function startTimer(kind: AmbientTimerKind, minutes: number) {
    share(startAmbientTimer(state, kind, minutes, clockRef.current()));
  }

  const musicOn = state.intensity !== "rain";
  const playing = ambientPlaying(state, now);
  const upNext = ambientUpNext(state, now);
  const progress = Math.max(0, Math.min(1, playing.offsetMs / playing.track.ms));
  const timer = ambientTimerStatus(state, now);

  // A soft two-note chime when the room's timer runs out, for those listening.
  const lastPhase = useRef(timer.phase);
  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = timer.phase;
    const audio = audioRef.current;
    if (before !== "running" || timer.phase !== "done" || !audio || audio.state !== "running") return;
    [0, 0.28].forEach((delay, index) => {
      const tone = audio.createOscillator();
      const level = audio.createGain();
      const at = audio.currentTime + delay;
      tone.type = "sine";
      tone.frequency.value = index === 0 ? 659.25 : 880;
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(0.18 * volumeRef.current, at + 0.02);
      level.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
      tone.connect(level).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 1.2);
    });
  }, [timer.phase]);

  return (
    <div className={`study-hall mood-${state.intensity}${listening ? " listening" : ""}`}>
      <div className="study-hall-scene">
        <div className="study-hall-window" aria-hidden="true">
          <span className="study-hall-rain" />
        </div>

        <div className="study-hall-playing">
          <span className="study-hall-vinyl" aria-hidden="true" />
          <div className="study-hall-track">
            <strong>{musicOn ? playing.track.title : "Rain on the window"}</strong>
            <small>{musicOn ? `${STUDY_ARTIST} · next: ${upNext.title}` : "The music is off for the room"}</small>
            {musicOn && (
              <div
                className="study-hall-progress"
                role="progressbar"
                aria-label="This track"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
              >
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>
        </div>

        {!listening && (
          <div className="study-hall-invite">
            <button type="button" className="study-hall-listen" onClick={() => void toggle()}>
              <Headphones size={18} /> Listen in
            </button>
            <small>
              {blocked
                ? "Your browser didn’t let the sound start. Press Listen in again."
                : musicOn
                  ? "The room’s music is playing. Press to hear it."
                  : "The room is listening to rain. Press to hear it."}
            </small>
          </div>
        )}

        <div className={`study-hall-timer is-${timer.phase}${timer.phase !== "none" ? ` kind-${state.timerKind}` : ""}`}>
          {timer.phase === "running" ? (
            <>
              <span className="study-hall-timer-label">
                <Timer size={14} aria-hidden="true" /> {state.timerKind === "break" ? "Break" : "Focus"}
              </span>
              <strong role="timer" aria-live="off">{clockLabel(timer.leftMs)}</strong>
              <button type="button" onClick={() => share(stopAmbientTimer(state))} title="Stop the timer for everyone">
                <X size={14} /> Stop
              </button>
            </>
          ) : timer.phase === "done" ? (
            <>
              <span className="study-hall-timer-label" role="status">
                <Timer size={14} aria-hidden="true" />{" "}
                {state.timerKind === "break" ? "Break’s over. Back to it?" : "Time’s up. Take a break?"}
              </span>
              <div className="study-hall-timer-picks">
                {state.timerKind === "break" ? (
                  <button type="button" className="primary" onClick={() => startTimer("focus", state.timerMinutes >= 10 ? state.timerMinutes : 25)}>
                    Focus again
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={() => startTimer("break", 5)}>
                    Break · 5 min
                  </button>
                )}
                <button type="button" onClick={() => share(stopAmbientTimer(state))}>Not now</button>
              </div>
            </>
          ) : (
            <>
              <span className="study-hall-timer-label">
                <Timer size={14} aria-hidden="true" /> Focus together
              </span>
              <div className="study-hall-timer-picks">
                <button type="button" onClick={() => startTimer("focus", 25)} title="A 25 minute timer everyone here sees">
                  25 min
                </button>
                <button type="button" onClick={() => startTimer("focus", 50)} title="A 50 minute timer everyone here sees">
                  50 min
                </button>
                <button type="button" onClick={() => startTimer("break", 5)} title="A 5 minute break for the room">
                  Break · 5
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="study-hall-controls">
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
        {musicOn && (
          <>
            <button
              type="button"
              onClick={() => share(skipAmbientTrack(state, clockRef.current()))}
              title="Everyone moves on to the next track"
            >
              <SkipForward size={14} /> Next track
            </button>
            <button
              type="button"
              onClick={() => share(reshuffleAmbient(state, clockRef.current()))}
              title="A new order of tracks for the room"
            >
              <Shuffle size={14} /> Shuffle
            </button>
          </>
        )}
        <span className="study-hall-spacer" />
        {listening && (
          <>
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
            <button type="button" className="study-hall-stop" onClick={() => void toggle()} title="Stop the music for you only">
              <Square size={13} /> Stop listening
            </button>
          </>
        )}
      </div>

      <p className="study-hall-hint">
        The mood, the track and the timer change for the whole room. Listening and volume are yours alone.
      </p>
    </div>
  );
}

/** "24:59", or "1:02:03" past the hour. */
function clockLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
