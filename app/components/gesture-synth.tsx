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
import { ArrowLeftRight, Camera, CameraOff, CircleHelp, X } from "lucide-react";
import type { RoomActivity } from "@/lib/activities";
import {
  DEGREE_SIGNS,
  SHAPE_DEGREE,
  SILENCE,
  SOUND_NAMES,
  SYNTH_KEEPALIVE_MS,
  SYNTH_KEYS,
  SYNTH_SENDS_PER_SECOND,
  SYNTH_SOUNDS,
  chordFor,
  fingersUp,
  handShape,
  isSilent,
  isSynthSound,
  keyName,
  leadNote,
  leadStep,
  noteName,
  samePlay,
  synthSettings,
  voiceChord,
  type HandPoint,
  type HandShape,
  type SynthMode,
  type SynthPlay,
  type SynthSound,
} from "@/lib/gesture-synth";
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
const HAND_STORE = "huddle-synth-chord-hand";
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
  heldDegree: number | null;
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
  const { key, mode } = synthSettings(activity.state);
  const [sound, setSound] = useState<SynthSound>(() => {
    const saved = stored(SOUND_STORE);
    return isSynthSound(saved) ? saved : "warm";
  });
  const [chordsLeft, setChordsLeft] = useState(() => stored(HAND_STORE) === "left");
  const [camera, setCamera] = useState<"off" | HandTrackingStatus>("off");
  const [help, setHelp] = useState(false);
  const [shown, setShown] = useState<{ degree: number | null; lead: number | null }>({ degree: null, lead: null });
  const seats = useSyncExternalStore(subscribeJamSeats, jamSeats, () => NO_SEATS);
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
    heldDegree: null,
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
  const config = useRef({ key, mode, sound, chordsLeft, joined });
  config.current = { key, mode, sound, chordsLeft, joined };
  const chords = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((degree) => chordFor(degree, key, mode)), [key, mode]);

  const flush = useCallback(() => {
    window.clearTimeout(live.sendTimer);
    live.sendTimer = 0;
    live.sentAt = performance.now();
    if (config.current.joined) sendJamPlay(live.current);
  }, [live]);

  /** Works out what your hands, keys and pads are playing now; sounds it and tells the room if it changed. */
  const refresh = useCallback(() => {
    const { key, mode, sound, joined } = config.current;
    const hidden = typeof document !== "undefined" && document.hidden;
    const degree = hidden ? null : (live.heldDegree ?? live.camDegree);
    let notes: number[] = [];
    let label = "";
    if (degree !== null) {
      const chord = chordFor(degree, key, mode);
      live.voicing = voiceChord(chord, live.voicing);
      notes = live.voicing;
      label = chord.label;
    }
    const lead = hidden || live.leadStep === null ? null : leadNote(live.leadStep, key, mode);
    setShown((before) => (before.degree === degree && before.lead === lead ? before : { degree, lead }));
    const play: SynthPlay = { notes, lead, sound, bright: Math.round(live.bright * 100) / 100, label };
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
      live.leadStep = leadHand && leadSign === "one" ? leadStep(leadHand[8].y, live.leadStep) : null;
      if (leadHand && (leadSign === "five" || leadSign === "four")) {
        const target = Math.max(0, Math.min(1, (0.85 - leadHand[9].y) / 0.6));
        live.bright += (target - live.bright) * 0.25;
      }
      refresh();
    },
    [live, refresh],
  );

  // A new key, scale or sound re-voices whatever is held.
  useEffect(() => {
    refresh();
  }, [key, mode, sound, refresh]);

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

  // Number keys 1–7 hold chords, for anyone without a camera.
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const degreeOf = (event: KeyboardEvent) =>
      event.ctrlKey || event.metaKey || event.altKey || !/^[1-7]$/.test(event.key) ? null : Number(event.key) - 1;
    const down = (event: KeyboardEvent) => {
      const degree = degreeOf(event);
      if (degree === null || typing(event.target) || !rootRef.current?.offsetParent) return;
      event.preventDefault();
      if (event.repeat) return;
      jamEngine.warm();
      live.heldDegree = degree;
      refresh();
    };
    const up = (event: KeyboardEvent) => {
      const degree = degreeOf(event);
      if (degree === null || live.heldDegree !== degree) return;
      live.heldDegree = null;
      refresh();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
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
          const isChord = hand === live.chordHand;
          const handHue = isChord ? hue : LEAD_HUE;
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
              if (!isChord && !(finger === "index" && live.leadStep !== null)) continue;
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
      Object.assign(live, { hands: [], chordHand: null, leadHand: null, camDegree: null, leadStep: null });
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

  function hold(degree: number) {
    jamEngine.warm();
    live.heldDegree = degree;
    refresh();
  }

  function letGo(degree: number) {
    if (live.heldDegree !== degree) return;
    live.heldDegree = null;
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
        <button type="button" onClick={swapHands} title="Swap which hand plays chords">
          <ArrowLeftRight size={14} /> Chords: {chordHandName} hand
        </button>
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

      <div className={`gesture-synth-stage${camera === "live" ? " has-camera" : ""}`}>
        <video ref={videoRef} muted playsInline aria-hidden="true" />
        <canvas ref={canvasRef} aria-hidden="true" />
        {camera !== "live" && !help && (camera !== "off" || shown.degree === null) && (
          <div className="gesture-synth-intro">
            {camera === "loading" ? (
              <p>Starting your camera and hand tracking…</p>
            ) : camera === "denied" ? (
              <p>Camera access is blocked. Allow it in your browser’s site settings, or play with the pads and keys 1–7.</p>
            ) : camera === "unsupported" ? (
              <p>Hand tracking couldn’t start here. The pads and keys 1–7 still play.</p>
            ) : (
              <>
                <strong>Play chords with your hands</strong>
                <p>
                  Turn on your camera and make a sign: {DEGREE_SIGNS.slice(0, 2).join(" ")} 3 4 {DEGREE_SIGNS.slice(4).join(" ")} play
                  the seven chords of {keyName(key)} {mode}, ✊ stops. Or hold a pad below, or keys 1–7.
                </p>
              </>
            )}
          </div>
        )}
        {others.length > 0 && (
          <ul className="gesture-synth-seats" aria-label="Also playing">
            {others.map((seat) => (
              <li key={seat.connectionId} className={isSilent(seat.play) ? "" : "on"}>
                <strong>{seat.name}</strong>
                <span>{seat.play.label || (seat.play.lead !== null ? "melody" : "…")}</span>
                <small>{SOUND_NAMES[seat.play.sound]}</small>
              </li>
            ))}
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
            <strong>Your {melodyHandName} hand</strong>
            <p>☝️ Point and move it up and down to play a melody in the key.</p>
            <p>🖐️ Open it and raise it to brighten the sound, lower it to soften.</p>
            <p className="gesture-synth-privacy">
              Everyone in the voice room hears what you play, each in their own sound. Your camera picture never leaves this
              computer.
            </p>
          </div>
        )}
      </div>

      <div className="gesture-synth-pads" role="group" aria-label={`Chords in ${keyName(key)} ${mode}`}>
        {chords.map((chord, degree) => (
          <button
            type="button"
            key={degree}
            className={shown.degree === degree ? "on" : ""}
            style={{ "--pad-hue": DEGREE_HUES[degree] } as CSSProperties}
            aria-pressed={shown.degree === degree}
            aria-label={`${chord.name}, chord ${chord.numeral}`}
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
            <kbd aria-hidden="true">{degree + 1}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
