"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowLeftRight,
  Camera,
  CameraOff,
  CircleHelp,
  Disc,
  Music,
  Pause,
  Play,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { RoomActivity } from "@/lib/activities";
import {
  BEATS_PER_BAR,
  DEGREE_SIGNS,
  RHYTHM_NAMES,
  SHAPE_DEGREE,
  SILENCE,
  SOUND_NAMES,
  SYNTH_KEEPALIVE_MS,
  SYNTH_KEYS,
  SYNTH_RHYTHMS,
  SYNTH_SENDS_PER_SECOND,
  SYNTH_SOUNDS,
  beatMs,
  chordFor,
  chordLetter,
  chordTones,
  cleanBpm,
  degreeForLetter,
  degreeOfTones,
  fingersUp,
  handShape,
  isSilent,
  isSynthRhythm,
  isSynthSound,
  keyName,
  leadNote,
  leadStep,
  mergeNotes,
  noteName,
  parseProgression,
  samePlay,
  synthSettings,
  voiceDualTones,
  voiceTones,
  type ChordTones,
  type HandPoint,
  type HandShape,
  type ProgressionStep,
  type SynthMode,
  type SynthPlay,
  type SynthRhythm,
  type SynthSound,
} from "@/lib/gesture-synth";
import { SYNTH_SONGS } from "@/lib/synth-songs";
import { HandTracker, type HandTrackingStatus } from "../lib/hand-tracking";
import { jamEngine, jamSeats, sendJamPlay, subscribeJamSeats, type JamSeat } from "../lib/synth-jam";

/** MediaPipe's hand skeleton. */
const BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const FINGERTIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 } as const;
/** A colour per chord, shared by the pads and the sparks off your fingers. */
const DEGREE_HUES = [262, 205, 170, 135, 42, 328, 12];
const LEAD_HUE = 318;
const SIGN_NAMES = ["point", "peace", "three fingers", "four fingers, thumb in", "open hand", "horns", "love-you"];
const SOUND_STORE = "huddle-synth-sound";
const RHYTHM_STORE = "huddle-synth-rhythm";
const HAND_STORE = "huddle-synth-chord-hand";
/** Chord changes from the sequencer and the looper are made this early, so rhythm notes already queued for the new step are struck with the new chord. */
const CHANGE_EARLY_MS = 40;
const NO_SEATS: JamSeat[] = [];

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts until reload.
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
  size: number;
}

/**
 * Where to start something "on the beat": the bar line just passed if it was
 * less than half a beat ago, otherwise the next one.
 */
function barLine(now: number, bpm: number): number {
  const beat = beatMs(bpm);
  const bar = beat * BEATS_PER_BAR;
  const previous = Math.floor(now / bar) * bar;
  return now - previous < beat / 2 ? previous : previous + bar;
}

/** The step of a looping progression at `beatsIn` beats from its start, and the beat that step ends on. */
function stepAt(steps: ProgressionStep[], beatsIn: number): { index: number; endBeat: number } {
  let start = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const end = start + steps[index].beats;
    if (beatsIn < end - 1e-6) return { index, endBeat: end };
    start = end;
  }
  return { index: steps.length - 1, endBeat: start };
}

interface LoopTake {
  /** On the shared clock, a bar line. */
  start: number;
  /** Whole bars, in ms. */
  length: number;
  events: Array<{ offset: number; play: SynthPlay }>;
}

interface Settling {
  shape: HandShape | null;
  frames: number;
  since: number;
  /** The last shape that held long enough to count. */
  settled: HandShape | null;
}

/**
 * A sign only counts once it has held for a moment, so passing through ✌ on
 * the way to 🖐 doesn't play ii. Measured in time as well as frames: a laptop
 * tracking hands on its CPU may only see a few frames a second.
 */
function settle(state: Settling, shape: HandShape | null, now: number, holdMs: number) {
  if (state.shape === shape) state.frames += 1;
  else {
    state.shape = shape;
    state.frames = 1;
    state.since = now;
  }
  if (state.frames >= 2 && now - state.since >= holdMs) state.settled = shape;
}

/** Everything the camera, the keys and the drawing share, kept out of React. */
interface Live {
  hands: HandPoint[][];
  chordHand: HandPoint[] | null;
  leadHand: HandPoint[] | null;
  aspect: number;
  camDegree: number | null;
  camSecondDegree: number | null;
  heldDegree: number | null;
  heldSecondDegree: number | null;
  /** The sequencer's chord, or a chord tapped in the progression strip. */
  seqTones: ChordTones | null;
  tapTones: ChordTones | null;
  /** What the loop is playing now; merged into what you send, so everyone hears it. */
  loopPlay: SynthPlay | null;
  leadStep: number | null;
  bright: number;
  voicing: number[] | null;
  chordShape: Settling;
  leadShape: Settling;
  lostAt: number;
  current: SynthPlay;
  sentAt: number;
  sendTimer: number;
  particles: Particle[];
}

export function GestureSynth({
  activity,
  update,
  joined,
}: {
  activity: RoomActivity;
  update: (state: Record<string, unknown>) => void;
  /** False while looking at a voice room you aren't in: you can practise, but nobody hears it. */
  joined: boolean;
}) {
  const { key, mode, bpm } = synthSettings(activity.state);
  const [sound, setSound] = useState<SynthSound>(() => {
    const saved = stored(SOUND_STORE);
    return isSynthSound(saved) ? saved : "warm";
  });
  const [rhythm, setRhythm] = useState<SynthRhythm>(() => {
    const saved = stored(RHYTHM_STORE);
    return isSynthRhythm(saved) ? saved : "hold";
  });
  const [metronome, setMetronome] = useState(false);
  const [chordsLeft, setChordsLeft] = useState(() => stored(HAND_STORE) === "left");
  const [camera, setCamera] = useState<"off" | HandTrackingStatus>("off");
  const [help, setHelp] = useState(false);
  const [shown, setShown] = useState<{
    degree: number | null;
    secondDegree: number | null;
    lead: number | null;
    /** The chord sounding, by name, whether or not it is one of the seven pads. */
    chord: ChordTones | null;
  }>({ degree: null, secondDegree: null, lead: null, chord: null });
  const seats = useSyncExternalStore(subscribeJamSeats, jamSeats, () => NO_SEATS);
  const synthVolume = useSyncExternalStore(
    (onStoreChange) => jamEngine.subscribeVolume(onStoreChange),
    () => jamEngine.getVolume(),
    () => 0.8,
  );
  const synthMuted = useSyncExternalStore(
    (onStoreChange) => jamEngine.subscribeVolume(onStoreChange),
    () => jamEngine.isMuted(),
    () => false,
  );

  // Songbook and sequencer: a song's chart, or a progression you type.
  const [songId, setSongId] = useState<string>(SYNTH_SONGS[0].id);
  const [customText, setCustomText] = useState("1 5 6 4");
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [seqStep, setSeqStep] = useState(0);
  const [guideMode, setGuideMode] = useState(false);
  const song = SYNTH_SONGS.find((entry) => entry.id === songId) ?? null;
  const parts = useMemo(
    () =>
      song
        ? song.parts.map((part) => ({ name: part.name, steps: parseProgression(part.chords, key, mode) }))
        : [{ name: "Your progression", steps: parseProgression(customText, key, mode) }],
    [song, customText, key, mode],
  );
  const steps = useMemo(() => parts.flatMap((part) => part.steps), [parts]);

  // Looper: takes are whole bars on the beat grid, and play for everyone.
  const [loopState, setLoopState] = useState<"idle" | "recording" | "playing">("idle");
  const [hasLoop, setHasLoop] = useState(false);
  const takeRef = useRef<LoopTake | null>(null);
  const recordingRef = useRef<{ start: number; events: LoopTake["events"] } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const [live] = useState<Live>(() => ({
    hands: [],
    chordHand: null,
    leadHand: null,
    aspect: 4 / 3,
    camDegree: null,
    camSecondDegree: null,
    heldDegree: null,
    heldSecondDegree: null,
    seqTones: null,
    tapTones: null,
    loopPlay: null,
    leadStep: null,
    bright: 0.55,
    voicing: null,
    chordShape: { shape: null, frames: 0, since: 0, settled: null },
    leadShape: { shape: null, frames: 0, since: 0, settled: null },
    lostAt: 0,
    current: SILENCE,
    sentAt: 0,
    sendTimer: 0,
    particles: [],
  }));
  const config = useRef({ key, mode, bpm, sound, rhythm, chordsLeft, joined });
  config.current = { key, mode, bpm, sound, rhythm, chordsLeft, joined };
  const chords = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((degree) => chordFor(degree, key, mode)), [key, mode]);

  const flush = useCallback(() => {
    window.clearTimeout(live.sendTimer);
    live.sendTimer = 0;
    live.sentAt = performance.now();
    if (config.current.joined) sendJamPlay(live.current);
  }, [live]);

  /**
   * Works out what your hands, keys, pads, the sequencer and your loop are
   * playing now; sounds it and tells the room if it changed.
   */
  const refresh = useCallback(() => {
    const { key, mode, bpm, sound, rhythm, joined } = config.current;
    const hidden = typeof document !== "undefined" && document.hidden;
    const degreeTones = (degree: number | null) => (degree === null ? null : chordTones(chordFor(degree, key, mode)));
    // Keys and pads win over the sequencer, which wins over the camera.
    const primary = hidden
      ? null
      : (degreeTones(live.heldDegree) ?? live.tapTones ?? live.seqTones ?? degreeTones(live.camDegree));
    const secondary = hidden ? null : degreeTones(live.heldSecondDegree ?? live.camSecondDegree);
    let notes: number[] = [];
    let label = "";
    if (primary && secondary && primary.name !== secondary.name) {
      live.voicing = voiceDualTones(primary, secondary, live.voicing);
      notes = live.voicing;
      label = `${primary.name} + ${secondary.name}`;
    } else if (primary ?? secondary) {
      const tones = (primary ?? secondary)!;
      live.voicing = voiceTones(tones, live.voicing);
      notes = live.voicing;
      const degree = degreeOfTones(tones, key, mode);
      // "Bm7 (ii)": the chord as written, with its place in the key when it has one.
      label = degree === null ? tones.name : `${tones.name} (${chordFor(degree, key, mode).numeral})`;
    }
    const lead = hidden || live.leadStep === null ? null : leadNote(live.leadStep, key, mode);
    const chord = primary ?? secondary;
    const degree = chord ? degreeOfTones(chord, key, mode) : null;
    const second = primary && secondary ? degreeOfTones(secondary, key, mode) : null;
    setShown((before) =>
      before.degree === degree && before.secondDegree === second && before.lead === lead && before.chord?.name === chord?.name
        ? before
        : { degree, secondDegree: second, lead, chord },
    );
    const own: SynthPlay = { notes, rhythm, bpm, lead, sound, bright: Math.round(live.bright * 100) / 100, label };

    // What you play now goes into a loop being recorded; the loop itself does not.
    const recording = recordingRef.current;
    if (recording) {
      const last = recording.events[recording.events.length - 1];
      if ((last || !isSilent(own)) && !(last && samePlay(last.play, own))) {
        recording.events.push({ offset: Math.max(0, jamEngine.now() - recording.start), play: own });
      }
    }

    const loop = hidden ? null : live.loopPlay;
    const play: SynthPlay =
      loop && !isSilent(loop)
        ? {
            ...own,
            notes: mergeNotes(own.notes, loop.notes),
            lead: own.lead ?? loop.lead,
            label: own.label && loop.label ? `${own.label} + loop` : own.label || loop.label,
          }
        : own;
    if (samePlay(play, live.current)) return;
    live.current = play;
    jamEngine.set("self", play, 1);

    if (!joined || live.sendTimer) return;
    // At most a dozen sends a second; the last change always goes out.
    const wait = live.sentAt + 1000 / SYNTH_SENDS_PER_SECOND - performance.now();
    if (wait <= 0) flush();
    else live.sendTimer = window.setTimeout(flush, wait);
  }, [flush, live]);

  const onHands = useCallback(
    (hands: HandPoint[][]) => {
      const video = videoRef.current;
      const aspect = video?.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
      live.aspect = aspect;
      live.hands = hands;
      let chordHand: HandPoint[] | null = null;
      let leadHand: HandPoint[] | null = null;
      if (hands.length === 1) {
        // One hand always plays chords, whichever it is.
        chordHand = hands[0];
      } else if (hands.length >= 2) {
        // Camera frames aren't mirrored: the player's right hand is the one further left in the picture.
        const [a, b] = hands;
        const right = a[0].x <= b[0].x ? a : b;
        const left = right === a ? b : a;
        chordHand = config.current.chordsLeft ? left : right;
        leadHand = chordHand === left ? right : left;
      }
      live.chordHand = chordHand;
      live.leadHand = leadHand;

      const now = performance.now();
      settle(live.chordShape, chordHand ? handShape(chordHand, aspect) : null, now, 60);
      const sign = live.chordShape.settled;
      if (sign === "fist") live.camDegree = null;
      else if (sign && SHAPE_DEGREE[sign] !== undefined) live.camDegree = SHAPE_DEGREE[sign]!;
      if (chordHand) live.lostAt = 0;
      else {
        live.lostAt ||= now;
        if (now - live.lostAt > 350) live.camDegree = null;
      }

      settle(live.leadShape, leadHand ? handShape(leadHand, aspect) : null, now, 30);
      const leadSign = leadHand ? live.leadShape.settled : null;
      if (leadSign === "fist") {
        live.camSecondDegree = null;
        live.leadStep = null;
      } else if (leadSign === "one") {
        live.camSecondDegree = null;
        live.leadStep = leadHand ? leadStep(leadHand[8].y, live.leadStep) : null;
      } else if (leadSign && leadSign !== "five" && leadSign !== "four" && SHAPE_DEGREE[leadSign] !== undefined) {
        // An open hand (four or five fingers) brightens the sound below; any
        // other chord sign on this hand adds a second chord.
        live.camSecondDegree = SHAPE_DEGREE[leadSign]!;
        live.leadStep = null;
      } else {
        live.camSecondDegree = null;
        live.leadStep = null;
      }

      if (leadHand && (leadSign === "five" || leadSign === "four")) {
        const target = Math.max(0, Math.min(1, (0.85 - leadHand[9].y) / 0.6));
        live.bright += (target - live.bright) * 0.25;
      }
      refresh();
    },
    [live, refresh],
  );

  // A new key, scale, tempo, sound or rhythm changes whatever is sounding.
  useEffect(() => {
    refresh();
  }, [key, mode, bpm, sound, rhythm, refresh]);

  // The click follows the room's tempo, on the same grid as everyone's rhythm.
  useEffect(() => {
    jamEngine.setMetronome(metronome ? bpm : null);
    return () => jamEngine.setMetronome(null);
  }, [metronome, bpm]);

  useEffect(() => {
    if (joined && !isSilent(live.current)) flush();
  }, [joined, flush, live]);

  // Keep a held chord alive for listeners, and go quiet when the tab is hidden.
  useEffect(() => {
    const keepalive = window.setInterval(() => {
      if (!isSilent(live.current) && performance.now() - live.sentAt > SYNTH_KEEPALIVE_MS * 0.9) flush();
    }, SYNTH_KEEPALIVE_MS / 2);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(keepalive);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [flush, live, refresh]);

  // Number keys 1–7 and chord letters A–G hold chords, for anyone without a camera.
  // Holding two keys simultaneously plays dual compound chord voicings!
  useEffect(() => {
    const heldKeys = new Map<string, number>();

    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

    const degreeOf = (event: KeyboardEvent): number | null => {
      if (event.ctrlKey || event.metaKey || event.altKey) return null;
      if (/^[1-7]$/.test(event.key)) {
        return Number(event.key) - 1;
      }
      const letter = event.key.toUpperCase();
      if (/^[A-G]$/.test(letter)) {
        return degreeForLetter(letter, config.current.key, config.current.mode);
      }
      return null;
    };

    const updateHeld = () => {
      const degrees = Array.from(new Set(heldKeys.values()));
      live.heldDegree = degrees[0] ?? null;
      live.heldSecondDegree = degrees[1] ?? null;
      refresh();
    };

    const down = (event: KeyboardEvent) => {
      if (typing(event.target) || !rootRef.current?.offsetParent) return;
      const degree = degreeOf(event);
      if (degree === null) return;
      event.preventDefault();
      if (event.repeat) return;
      jamEngine.warm();
      heldKeys.set(event.key.toUpperCase(), degree);
      updateHeld();
    };

    const up = (event: KeyboardEvent) => {
      const k = event.key.toUpperCase();
      if (!heldKeys.has(k)) return;
      heldKeys.delete(k);
      updateHeld();
    };

    const clear = () => {
      if (heldKeys.size > 0) {
        heldKeys.clear();
        updateHeld();
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [live, refresh]);

  // Leaving the activity stops the camera and your notes, for everyone.
  useEffect(
    () => () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      window.clearTimeout(live.sendTimer);
      const quiet = { ...SILENCE, sound: config.current.sound };
      live.current = quiet;
      jamEngine.drop("self");
      if (config.current.joined) sendJamPlay(quiet);
    },
    [live],
  );

  // The picture: your hands, sparks off the fingers that are up, the chord, and everyone's waveform.
  useEffect(() => {
    let frame = 0;
    let samples = new Float32Array(0);
    let last = performance.now();
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas || !canvas.offsetParent) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, width, height);
      const { key, mode } = config.current;
      const play = live.current;
      const degree = live.heldDegree ?? live.camDegree;
      const hue = degree === null ? 262 : DEGREE_HUES[degree];

      // Landmarks are in the camera's frame; the video is shown mirrored and cropped to fill.
      const video = videoRef.current;
      const vw = video?.videoWidth || 4;
      const vh = video?.videoHeight || 3;
      const scale = Math.max(width / vw, height / vh);
      const ox = (width - vw * scale) / 2;
      const oy = (height - vh * scale) / 2;
      const at = (point: HandPoint) => ({ x: width - (point.x * vw * scale + ox), y: point.y * vh * scale + oy });

      const tracking = Boolean(trackerRef.current) && live.hands.length > 0;
      if (tracking) {
        for (const hand of live.hands) {
          const isPrimaryChord = hand === live.chordHand && (live.heldDegree !== null || live.camDegree !== null);
          const isSecondChord = hand === live.leadHand && live.camSecondDegree !== null;
          const isLead = hand === live.leadHand && live.leadStep !== null;
          const handHue = isPrimaryChord
            ? (live.camDegree !== null ? DEGREE_HUES[live.camDegree] : hue)
            : isSecondChord
            ? DEGREE_HUES[live.camSecondDegree ?? 0]
            : isLead
            ? LEAD_HUE
            : hue;
          const points = hand.map(at);
          g.save();
          g.lineCap = "round";
          g.shadowColor = `hsla(${handHue}, 95%, 65%, 0.9)`;
          g.shadowBlur = 14 * dpr;
          g.strokeStyle = `hsla(${handHue}, 90%, 75%, 0.8)`;
          g.lineWidth = 2.5 * dpr;
          g.beginPath();
          for (const [from, to] of BONES) {
            g.moveTo(points[from].x, points[from].y);
            g.lineTo(points[to].x, points[to].y);
          }
          g.stroke();
          g.fillStyle = "rgba(255, 255, 255, 0.9)";
          for (const point of points) {
            g.beginPath();
            g.arc(point.x, point.y, 2.6 * dpr, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          // Sparks stream off every finger that is up.
          const up = fingersUp(hand, live.aspect);
          if (up) {
            for (const [finger, tip] of Object.entries(FINGERTIPS)) {
              if (!up[finger as keyof typeof FINGERTIPS]) continue;
              if (!isPrimaryChord && !isSecondChord && !(finger === "index" && isLead)) continue;
              for (let index = 0; index < 2; index += 1) {
                live.particles.push({
                  x: points[tip].x,
                  y: points[tip].y,
                  vx: (Math.random() - 0.5) * 60 * dpr,
                  vy: (Math.random() - 0.5) * 60 * dpr - 25 * dpr,
                  life: 1,
                  hue: handHue + (Math.random() - 0.5) * 30,
                  size: (1.2 + Math.random() * 2.4) * dpr,
                });
              }
            }
          }
        }
      }
      if (live.particles.length > 500) live.particles.splice(0, live.particles.length - 500);
      g.save();
      g.globalCompositeOperation = "lighter";
      live.particles = live.particles.filter((particle) => {
        particle.life -= dt * 1.4;
        if (particle.life <= 0) return false;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 30 * dpr * dt;
        g.fillStyle = `hsla(${particle.hue}, 95%, 70%, ${particle.life * 0.85})`;
        g.beginPath();
        g.arc(particle.x, particle.y, particle.size * (0.4 + particle.life * 0.6), 0, Math.PI * 2);
        g.fill();
        return true;
      });
      g.restore();

      // Everyone's sound, along the bottom.
      const analyser = jamEngine.analyser();
      const base = height * 0.84;
      g.save();
      g.lineWidth = 2 * dpr;
      g.shadowBlur = 10 * dpr;
      g.shadowColor = `hsla(${hue}, 90%, 65%, 0.9)`;
      const gradient = g.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `hsla(${LEAD_HUE}, 90%, 72%, 0.95)`);
      gradient.addColorStop(1, `hsla(${hue}, 90%, 72%, 0.95)`);
      g.strokeStyle = gradient;
      g.beginPath();
      if (analyser) {
        if (samples.length !== analyser.fftSize) samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        const count = Math.min(samples.length, 1024);
        for (let index = 0; index < count; index += 1) {
          const x = (index / (count - 1)) * width;
          const y = base + Math.max(-1, Math.min(1, samples[index] * 2.2)) * height * 0.12;
          if (index === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, base);
        g.lineTo(width, base);
      }
      g.stroke();
      g.restore();

      // The chord at your hand (or above the waveform), the melody note at your fingertip.
      g.save();
      g.textAlign = "center";
      g.shadowColor = `hsla(${hue}, 95%, 60%, 0.95)`;
      g.shadowBlur = 16 * dpr;
      g.fillStyle = "#fff";
      if (play.label) {
        let x = width / 2;
        let y = base - height * 0.1;
        if (tracking && live.chordHand && live.camDegree !== null && live.heldDegree === null) {
          const points = live.chordHand.map(at);
          x = points[0].x;
          y = Math.min(...points.map((point) => point.y)) - 18 * dpr;
        }
        g.font = `700 ${Math.round(Math.min(34, Math.max(20, width / dpr / 22)) * dpr)}px system-ui, sans-serif`;
        g.fillText(play.label, Math.max(60 * dpr, Math.min(width - 60 * dpr, x)), Math.max(40 * dpr, y));
      }
      if (play.lead !== null && live.leadHand) {
        const tip = at(live.leadHand[8]);
        g.shadowColor = `hsla(${LEAD_HUE}, 95%, 60%, 0.95)`;
        g.font = `600 ${Math.round(18 * dpr)}px system-ui, sans-serif`;
        g.fillText(noteName(play.lead, key, mode), tip.x, tip.y - 16 * dpr);
      }
      g.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [live]);

  async function toggleCamera() {
    jamEngine.warm();
    const running = trackerRef.current;
    if (running) {
      running.stop();
      trackerRef.current = null;
      Object.assign(live, {
        hands: [],
        chordHand: null,
        leadHand: null,
        camDegree: null,
        camSecondDegree: null,
        leadStep: null,
      });
      setCamera("off");
      refresh();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const tracker = new HandTracker(video, onHands);
    trackerRef.current = tracker;
    setCamera("loading");
    const status = await tracker.start();
    if (trackerRef.current !== tracker) return;
    if (status !== "live") {
      tracker.stop();
      trackerRef.current = null;
    }
    setCamera(status);
  }

  const heldPadsRef = useRef<Set<number>>(new Set());

  function hold(degree: number) {
    jamEngine.warm();
    heldPadsRef.current.add(degree);
    const degrees = Array.from(heldPadsRef.current);
    live.heldDegree = degrees[0] ?? null;
    live.heldSecondDegree = degrees[1] ?? null;
    refresh();
  }

  function letGo(degree: number) {
    heldPadsRef.current.delete(degree);
    const degrees = Array.from(heldPadsRef.current);
    live.heldDegree = degrees[0] ?? null;
    live.heldSecondDegree = degrees[1] ?? null;
    refresh();
  }

  function chooseSound(next: SynthSound) {
    setSound(next);
    store(SOUND_STORE, next);
  }

  function swapHands() {
    setChordsLeft((left) => {
      store(HAND_STORE, left ? "right" : "left");
      return !left;
    });
  }

  function chooseRhythm(next: SynthRhythm) {
    setRhythm(next);
    store(RHYTHM_STORE, next);
  }

  function setBpm(value: number) {
    update({ ...activity.state, key, mode, bpm: cleanBpm(value) });
  }

  // The sequencer: chord changes land on the beat grid, starting on a bar line,
  // so a chart plays in time with the metronome and with anyone else's rhythm.
  useEffect(() => {
    if (!seqPlaying || steps.length === 0) return;
    const beat = beatMs(bpm);
    const total = steps.reduce((sum, step) => sum + step.beats, 0);
    const start = barLine(jamEngine.now(), bpm);
    let timer = 0;
    const advance = () => {
      const now = jamEngine.now() + CHANGE_EARLY_MS;
      if (now < start) {
        timer = window.setTimeout(advance, start - now);
        return;
      }
      const elapsed = (now - start) / beat;
      const lap = Math.floor(elapsed / total);
      const { index, endBeat } = stepAt(steps, elapsed - lap * total);
      live.seqTones = steps[index].tones;
      setSeqStep(index);
      refresh();
      timer = window.setTimeout(advance, Math.max(5, start + (lap * total + endBeat) * beat - now));
    };
    advance();
    return () => {
      window.clearTimeout(timer);
      live.seqTones = null;
      refresh();
    };
  }, [seqPlaying, steps, bpm, live, refresh]);

  // Guide: the next chord of the chart lights up and moves on once you play it.
  const target = steps.length ? steps[seqStep % steps.length]?.tones ?? null : null;
  useEffect(() => {
    if (!guideMode || seqPlaying || !target || !shown.chord) return;
    const third = (tones: ChordTones) => tones.intervals.find((i) => i === 3 || i === 4) ?? null;
    if (shown.chord.root !== target.root || third(shown.chord) !== third(target)) return;
    const timer = window.setTimeout(() => setSeqStep((step) => (step + 1) % steps.length), 450);
    return () => window.clearTimeout(timer);
  }, [guideMode, seqPlaying, target, shown.chord, steps.length]);

  // Loop playback: the take's events at their place in the bar, lap after lap.
  useEffect(() => {
    const take = takeRef.current;
    if (loopState !== "playing" || !take || take.events.length === 0) return;
    let timer = 0;
    const advance = () => {
      const now = jamEngine.now() + CHANGE_EARLY_MS;
      const position = (((now - take.start) % take.length) + take.length) % take.length;
      // The last event at or before here; before the first, the end of the lap is still sounding.
      let current = take.events[take.events.length - 1];
      let next = take.events[0].offset + take.length;
      for (const event of take.events) {
        if (event.offset <= position) current = event;
        else {
          next = event.offset;
          break;
        }
      }
      if (live.loopPlay !== current.play) {
        live.loopPlay = current.play;
        refresh();
      }
      timer = window.setTimeout(advance, Math.max(5, next - position));
    };
    advance();
    return () => {
      window.clearTimeout(timer);
      live.loopPlay = null;
      refresh();
    };
  }, [loopState, live, refresh]);

  function chooseSong(id: string) {
    setSongId(id);
    setSeqStep(0);
    const next = SYNTH_SONGS.find((entry) => entry.id === id);
    if (!next) return;
    update({ ...activity.state, key: next.key, mode: next.mode, bpm: next.bpm });
    chooseSound(next.sound);
    chooseRhythm(next.rhythm);
  }

  function startRecordLoop() {
    jamEngine.warm();
    recordingRef.current = { start: barLine(jamEngine.now(), bpm), events: [] };
    setLoopState("recording");
    setHasLoop(false);
    refresh();
  }

  function finishRecordLoop() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    const bar = beatMs(bpm) * BEATS_PER_BAR;
    const bars = recording ? Math.max(1, Math.round((jamEngine.now() - recording.start) / bar)) : 0;
    const events = (recording?.events ?? []).filter((event) => event.offset < bars * bar);
    if (!recording || !events.some((event) => !isSilent(event.play))) {
      setLoopState("idle");
      return;
    }
    takeRef.current = { start: recording.start, length: bars * bar, events };
    setHasLoop(true);
    setLoopState("playing");
  }

  function stopLoop() {
    setLoopState("idle");
  }

  function clearLoop() {
    stopLoop();
    takeRef.current = null;
    setHasLoop(false);
  }

  /** Sounds one chord of the strip for a moment (when the sequencer isn't playing). */
  function tapChord(index: number) {
    setSeqStep(index);
    if (seqPlaying) return;
    const tones = steps[index]?.tones;
    if (!tones) return;
    jamEngine.warm();
    live.tapTones = tones;
    refresh();
    window.setTimeout(() => {
      if (live.tapTones === tones) {
        live.tapTones = null;
        refresh();
      }
    }, Math.min(1500, beatMs(bpm) * steps[index].beats));
  }

  const others = seats.filter((seat) => !isSilent(seat.play) || Date.now() - seat.at < 15_000);
  const chordHandName = chordsLeft ? "left" : "right";
  const melodyHandName = chordsLeft ? "right" : "left";

  return (
    <div className="gesture-synth" ref={rootRef}>
      <div className="gesture-synth-bar">
        <label>
          <span>Key</span>
          <select value={key} onChange={(event) => update({ ...activity.state, key: event.target.value, mode })}>
            {SYNTH_KEYS.map((option) => (
              <option key={option} value={option}>
                {keyName(option)}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="Scale"
          value={mode}
          onChange={(event) => update({ ...activity.state, key, mode: event.target.value as SynthMode })}
        >
          <option value="major">Major</option>
          <option value="minor">Minor</option>
        </select>
        <label className="gesture-synth-bpm-pill" title="The room's tempo: everyone's rhythm, the sequencer and loops follow it">
          <span>BPM</span>
          <input
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={(event) => setBpm(Number(event.target.value) || bpm)}
          />
        </label>
        <label>
          <span>Your sound</span>
          <select value={sound} onChange={(event) => chooseSound(event.target.value as SynthSound)}>
            {SYNTH_SOUNDS.map((option) => (
              <option key={option} value={option}>
                {SOUND_NAMES[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Rhythm</span>
          <select value={rhythm} onChange={(event) => chooseRhythm(event.target.value as SynthRhythm)}>
            {SYNTH_RHYTHMS.map((option) => (
              <option key={option} value={option}>
                {RHYTHM_NAMES[option]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={metronome ? "active" : ""}
          onClick={() => {
            jamEngine.warm();
            setMetronome((on) => !on);
          }}
          aria-pressed={metronome}
          title="Metronome: a click on every beat, only for you"
        >
          <Timer size={14} /> Click
        </button>
        <button type="button" onClick={swapHands} title="Swap which hand plays chords">
          <ArrowLeftRight size={14} /> Chords: {chordHandName} hand
        </button>
        <div
          className="gesture-synth-volume"
          title={`Synth volume: ${synthMuted ? 0 : Math.round(synthVolume * 100)}%`}
        >
          <button
            type="button"
            className="gesture-synth-vol-btn"
            onClick={() => {
              jamEngine.warm();
              jamEngine.setMuted(!synthMuted);
            }}
            aria-label={synthMuted ? "Unmute synth" : "Mute synth"}
            title={synthMuted ? "Unmute synth" : "Mute synth"}
          >
            {synthMuted || synthVolume === 0 ? (
              <VolumeX size={15} />
            ) : synthVolume < 0.5 ? (
              <Volume1 size={15} />
            ) : (
              <Volume2 size={15} />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={synthMuted ? 0 : Math.round(synthVolume * 100)}
            onChange={(event) => {
              jamEngine.warm();
              const next = Number(event.target.value) / 100;
              jamEngine.setVolume(next);
              if (synthMuted && next > 0) jamEngine.setMuted(false);
            }}
            aria-label="Synth volume"
          />
          <span className="gesture-synth-vol-num" aria-hidden="true">
            {synthMuted ? "0%" : `${Math.round(synthVolume * 100)}%`}
          </span>
        </div>
        <span className="gesture-synth-spacer" />
        <button
          type="button"
          className="gesture-synth-camera"
          onClick={() => void toggleCamera()}
          disabled={camera === "loading"}
          aria-pressed={camera === "live"}
        >
          {camera === "live" ? <CameraOff size={15} /> : <Camera size={15} />}
          {camera === "live" ? "Stop camera" : camera === "loading" ? "Starting…" : "Play with hands"}
        </button>
        <button
          type="button"
          className="gesture-synth-help-toggle"
          onClick={() => setHelp((open) => !open)}
          aria-expanded={help}
          aria-label="How to play"
          title="How to play"
        >
          <CircleHelp size={16} />
        </button>
      </div>

      <div className="gesture-synth-subbar">
        <div className="gesture-synth-subbar-group">
          <label className="gesture-synth-subbar-label">
            <Music size={13} />
            <span>Song</span>
            <select value={songId} onChange={(event) => chooseSong(event.target.value)} aria-label="Song">
              {SYNTH_SONGS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.artist}
                </option>
              ))}
              <option value="custom">Your own progression…</option>
            </select>
          </label>
          {!song && (
            <input
              type="text"
              className="gesture-synth-seq-input"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="1 5 6 4, or Am:2 F:2 C G"
              aria-label="Your progression: chord numbers or names, :beats for a length"
              title="Chord numbers 1–7 in the room's key, or chord names (Bbm, F#m7, Ab/C). Add :2 for two beats; a chord lasts a bar otherwise."
            />
          )}
          <button
            type="button"
            className={`gesture-synth-subbar-btn ${seqPlaying ? "playing" : ""}`}
            onClick={() => {
              jamEngine.warm();
              setSeqPlaying((playing) => !playing);
            }}
            disabled={steps.length === 0}
            aria-pressed={seqPlaying}
            title={seqPlaying ? "Stop the progression" : "Play the progression at the room's tempo, from the next bar"}
          >
            {seqPlaying ? <Square size={13} /> : <Play size={13} />}
            <span>{seqPlaying ? "Stop" : "Play"}</span>
          </button>
          <button
            type="button"
            className={`gesture-synth-subbar-btn guide ${guideMode ? "active" : ""}`}
            onClick={() => setGuideMode((on) => !on)}
            aria-pressed={guideMode}
            title="Guide: lights up the next chord and moves on when you play it"
          >
            <Sparkles size={13} />
            <span>Guide</span>
          </button>
        </div>

        <div className="gesture-synth-looper-group">
          {loopState === "idle" && (
            <button
              type="button"
              className="gesture-synth-subbar-btn rec"
              onClick={startRecordLoop}
              title="Record a loop from the next bar line; it plays for everyone, in whole bars"
            >
              <Disc size={13} />
              <span>Record Loop</span>
            </button>
          )}
          {loopState === "recording" && (
            <button
              type="button"
              className="gesture-synth-subbar-btn recording"
              onClick={finishRecordLoop}
              title="Stop recording and start looping"
            >
              <Square size={13} />
              <span>Loop It!</span>
            </button>
          )}
          {loopState === "playing" && (
            <button
              type="button"
              className="gesture-synth-subbar-btn playing"
              onClick={stopLoop}
              title="Stop loop playback"
            >
              <Pause size={13} />
              <span>Stop Loop</span>
            </button>
          )}
          {hasLoop && loopState === "idle" && (
            <button
              type="button"
              className="gesture-synth-subbar-btn play"
              onClick={() => {
                jamEngine.warm();
                setLoopState("playing");
              }}
              title="Resume loop playback"
            >
              <Play size={13} />
              <span>Play Loop</span>
            </button>
          )}
          {hasLoop && (
            <button
              type="button"
              className="gesture-synth-loop-clear"
              onClick={clearLoop}
              title="Clear recorded loop"
              aria-label="Clear loop"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="gesture-synth-sequence-strip" role="region" aria-label="Progression">
          {parts.map((part, partIndex) => {
            const offset = parts.slice(0, partIndex).reduce((sum, previous) => sum + previous.steps.length, 0);
            return (
              <div className="gesture-synth-strip-part" key={`${part.name}-${partIndex}`}>
                <span className="gesture-synth-strip-title">{part.name}</span>
                <div className="gesture-synth-strip-steps">
                  {part.steps.map((step, stepIndex) => {
                    const index = offset + stepIndex;
                    const degree = degreeOfTones(step.tones, key, mode);
                    const isCurrent = (seqPlaying || guideMode) && index === seqStep % steps.length;
                    return (
                      <button
                        type="button"
                        key={index}
                        className={`gesture-synth-step-chip ${isCurrent ? "active" : ""} ${degree === null ? "outside" : ""}`}
                        style={{ "--step-hue": degree === null ? 0 : DEGREE_HUES[degree], flexGrow: step.beats } as CSSProperties}
                        onClick={() => tapChord(index)}
                        title={`${step.tones.name}, ${step.beats} beat${step.beats === 1 ? "" : "s"}${
                          degree === null ? " (not one of the seven pads: the sequencer plays it)" : `: pad ${degree + 1}`
                        }`}
                      >
                        {step.beats > 2 && <span className="sign-icon">{degree === null ? "♪" : DEGREE_SIGNS[degree]}</span>}
                        <strong>{step.tones.name}</strong>
                        {step.beats !== BEATS_PER_BAR && <small>{step.beats}</small>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={`gesture-synth-stage${camera === "live" ? " has-camera" : ""}`}>
        <video ref={videoRef} muted playsInline aria-hidden="true" />
        <canvas ref={canvasRef} aria-hidden="true" />
        {camera !== "live" && !help && (camera !== "off" || shown.degree === null) && (
          <div className="gesture-synth-intro">
            {camera === "loading" ? (
              <p>Starting your camera and hand tracking…</p>
            ) : camera === "denied" ? (
              <p>Camera access is blocked. Allow it in your browser’s site settings, or play with the pads and keys 1–7 or A–G.</p>
            ) : camera === "unsupported" ? (
              <p>Hand tracking couldn’t start here. The pads and keys 1–7 or A–G still play.</p>
            ) : (
              <>
                <strong>Play chords with your hands or keyboard</strong>
                <p>
                  Turn on your camera and make a sign: {DEGREE_SIGNS.slice(0, 2).join(" ")} 3 4 {DEGREE_SIGNS.slice(4).join(" ")} play
                  the seven chords of {keyName(key)} {mode}, ✊ stops. Both hands or keys (1–7 and A–G) can play chords together for rich compound harmonies!
                </p>
              </>
            )}
          </div>
        )}
        {others.length > 0 && (
          <ul className="gesture-synth-seats" aria-label="Also playing">
            {others.map((seat) => {
              const isSeatMuted = jamEngine.isSeatMuted(seat.connectionId);
              return (
                <li key={seat.connectionId} className={isSilent(seat.play) ? "" : "on"}>
                  <strong>{seat.name}</strong>
                  <div className="gesture-synth-seat-meta">
                    <span>{seat.play.label || (seat.play.lead !== null ? "melody" : "…")}</span>
                    <button
                      type="button"
                      className="gesture-synth-seat-mute"
                      onClick={() => {
                        jamEngine.warm();
                        jamEngine.setSeatMuted(seat.connectionId, !isSeatMuted);
                      }}
                      aria-pressed={isSeatMuted}
                      aria-label={isSeatMuted ? `Unmute ${seat.name}'s synth` : `Mute ${seat.name}'s synth`}
                      title={isSeatMuted ? `Unmute ${seat.name}'s synth` : `Mute ${seat.name}'s synth`}
                    >
                      {isSeatMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                  </div>
                  <small>{SOUND_NAMES[seat.play.sound]}</small>
                </li>
              );
            })}
          </ul>
        )}
        {!joined && (
          <p className="gesture-synth-note">Join this voice room so the others hear you. You can still practise here.</p>
        )}
        {help && (
          <div className="gesture-synth-help" role="dialog" aria-label="How to play">
            <button type="button" onClick={() => setHelp(false)} aria-label="Close">
              <X size={14} />
            </button>
            <strong>Your {chordHandName} hand plays chords</strong>
            <ol>
              {chords.map((chord, degree) => (
                <li key={degree}>
                  <span aria-hidden="true">{DEGREE_SIGNS[degree]}</span>
                  <em>{SIGN_NAMES[degree]}</em>
                  <b>{chord.name}</b>
                  <small>{chord.numeral}</small>
                </li>
              ))}
              <li>
                <span aria-hidden="true">✊</span>
                <em>fist</em>
                <b>stop</b>
              </li>
            </ol>
            <strong>Keyboard & Shortcuts</strong>
            <p>
              Press number keys <strong>1–7</strong> or note letters <strong>A–G</strong> (e.g. press <strong>A</strong> for chord A, <strong>B</strong> for B, <strong>C</strong> for C).
              You can hold two keys at the same time to blend chords into compound harmonies!
            </p>
            <strong>Two Hands at the Same Time</strong>
            <p>
              Both of your hands can play chords simultaneously! Sign one chord with your left hand and another with your right
              hand to blend them into rich extended compound chords.
            </p>
            <strong>Your {melodyHandName} hand</strong>
            <p>☝️ Point and move it up and down to play a melody over your chords.</p>
            <p>🖐️ Open it and raise it to brighten the sound, lower it to soften.</p>
            <strong>Tempo and rhythm</strong>
            <p>
              The room shares one tempo. Pick a rhythm (pulse, arpeggio) and your chords are played in time with everyone
              else&apos;s, on the same beats. <strong>Click</strong> turns on a metronome only you hear.
            </p>
            <strong>Songs</strong>
            <p>
              A song sets the key, tempo, sound and rhythm, and <strong>Play</strong> runs its chords from the next bar.{" "}
              <strong>Guide</strong> lights up the next chord and waits for you to play it. Or pick{" "}
              <em>Your own progression</em> and type chord numbers or names: <code>1 5 6 4</code>, <code>Am:2 F:2 C G</code>.
            </p>
            <strong>Loops</strong>
            <p>
              <strong>Record Loop</strong> starts on the bar line; <strong>Loop It!</strong> rounds the take to whole bars
              and keeps it playing under whatever you play next. Everyone hears it.
            </p>
            <p className="gesture-synth-privacy">
              Everyone in the voice room hears what you play, each in their own sound. Your camera picture never leaves this
              computer.
            </p>
          </div>
        )}
      </div>

      <div className="gesture-synth-pads" role="group" aria-label={`Chords in ${keyName(key)} ${mode}`}>
        {chords.map((chord, degree) => {
          const isPrimary = shown.degree === degree;
          const isSecondary = shown.secondDegree === degree;
          const isTargetGuide = guideMode && target !== null && degreeOfTones(target, key, mode) === degree;
          const letter = chordLetter(chord, key);
          return (
            <button
              type="button"
              key={degree}
              className={`${isPrimary ? "on" : ""} ${isSecondary && !isPrimary ? "on-secondary" : ""} ${isTargetGuide ? "target-guide" : ""}`}
              style={{ "--pad-hue": DEGREE_HUES[degree] } as CSSProperties}
              aria-pressed={isPrimary || isSecondary}
              aria-label={`${chord.name}, chord ${chord.numeral}, key ${degree + 1} or ${letter}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                hold(degree);
              }}
              onPointerUp={() => letGo(degree)}
              onPointerCancel={() => letGo(degree)}
              onLostPointerCapture={() => letGo(degree)}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                  event.preventDefault();
                  hold(degree);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") letGo(degree);
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="sign" aria-hidden="true">
                {DEGREE_SIGNS[degree]}
              </span>
              <strong>{chord.numeral}</strong>
              <small>{chord.name}</small>
              {isSecondary && !isPrimary && (
                <span className="gesture-pad-dual-tag" aria-hidden="true">2nd</span>
              )}
              {isTargetGuide && (
                <span className="gesture-pad-guide-tag" aria-hidden="true">Play</span>
              )}
              <kbd aria-hidden="true" title={`Press ${degree + 1} or ${letter}`}>
                <span>{degree + 1}</span>
                <span className="gesture-kbd-sep">•</span>
                <span>{letter}</span>
              </kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}
