"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TIER_LABELS, type AchievementDef } from "@/lib/achievement-defs";
import { AchievementMedal, achievementIcon } from "./achievement-medal";

/**
 * The unlock popup. Each theme gets its own delivery: a Minecraft advancement
 * toast, bats carrying a card for Vampire, an owl dropping a sealed letter for
 * Dark Academia, an MSN alert, and so on. Everything else gets a medal that
 * pops and unrolls into a pill.
 */

export type ToastVariant =
  | "mc"
  | "bats"
  | "owl"
  | "msn"
  | "zombie"
  | "cyber"
  | "matrix"
  | "campfire"
  | "retro"
  | "pop";

export function toastVariantFor(themeId: string): ToastVariant {
  if (themeId === "minecraft") return "mc";
  if (themeId === "vampire") return "bats";
  if (themeId === "dark-academia") return "owl";
  if (themeId.startsWith("msn")) return "msn";
  if (themeId === "zombie") return "zombie";
  if (themeId === "cyberpunk") return "cyber";
  if (themeId === "matrix") return "matrix";
  if (themeId === "amber") return "campfire";
  if (themeId === "winamp" || themeId === "teamspeak") return "retro";
  return "pop";
}

function currentThemeId(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.customThemeId || "";
}

/** How long each delivery stays up before leaving on its own. */
const DURATION: Record<ToastVariant, number> = {
  mc: 5200,
  bats: 7600,
  owl: 7800,
  msn: 6500,
  zombie: 7000,
  cyber: 6500,
  matrix: 7000,
  campfire: 7000,
  retro: 7000,
  pop: 6200,
};

// ---------- sound ----------

const SOUND_KEY = "huddle_achievement_sound";

export function achievementSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAchievementSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    // Not remembered.
  }
}

let audioCtx: AudioContext | null = null;

type Note = [freq: number, start: number, dur: number];

const JINGLES: Record<ToastVariant, { wave: OscillatorType; gain: number; notes: Note[] }> = {
  // The bright rising chime of a Minecraft advancement.
  mc: { wave: "square", gain: 0.05, notes: [[784, 0, 0.12], [988, 0.09, 0.12], [1175, 0.18, 0.14], [1568, 0.28, 0.32]] },
  // A minor organ swell.
  bats: { wave: "sawtooth", gain: 0.035, notes: [[220, 0, 1.1], [261.6, 0, 1.1], [329.6, 0, 1.1], [440, 0.35, 0.9]] },
  // Plucked, harpsichord-ish arpeggio.
  owl: { wave: "triangle", gain: 0.12, notes: [[523.3, 0, 0.3], [659.3, 0.12, 0.3], [784, 0.24, 0.3], [1046.5, 0.36, 0.6]] },
  msn: { wave: "sine", gain: 0.16, notes: [[880, 0, 0.18], [1318.5, 0.14, 0.4]] },
  zombie: { wave: "sawtooth", gain: 0.05, notes: [[110, 0, 0.5], [103.8, 0.25, 0.5], [146.8, 0.55, 0.7]] },
  cyber: { wave: "square", gain: 0.04, notes: [[1396.9, 0, 0.06], [1046.5, 0.07, 0.06], [1568, 0.14, 0.06], [2093, 0.21, 0.25]] },
  matrix: { wave: "square", gain: 0.03, notes: [[1200, 0, 0.04], [900, 0.06, 0.04], [1500, 0.12, 0.04], [600, 0.18, 0.04], [1800, 0.26, 0.2]] },
  campfire: { wave: "triangle", gain: 0.12, notes: [[392, 0, 0.5], [493.9, 0.18, 0.5], [587.3, 0.36, 0.8]] },
  retro: { wave: "square", gain: 0.04, notes: [[659.3, 0, 0.1], [880, 0.1, 0.25]] },
  pop: { wave: "sine", gain: 0.14, notes: [[659.3, 0, 0.16], [987.8, 0.1, 0.5]] },
};

function playJingle(variant: ToastVariant, tier: AchievementDef["tier"]): void {
  if (typeof window === "undefined" || !achievementSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const jingle = JINGLES[variant];
    // Platinum (and Minecraft challenges) get the tune an octave up as well.
    const notes: Note[] = tier === "platinum"
      ? [...jingle.notes, ...jingle.notes.map(([f, s, d]) => [f * 2, s + 0.04, d] as Note)]
      : jingle.notes;
    const now = ctx.currentTime + 0.02;
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = jingle.wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(jingle.gain, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    }
  } catch {
    // Silent is fine.
  }
}

// ---------- art ----------

function Bat({ className = "" }: { className?: string }) {
  const wing = "M32 15 C27 8 19 5 5 7 C9 10 9 13 7 16 C11 15 14 17 15 20 C18 17 22 17 25 19 C26 17 29 16 32 17Z";
  return (
    <svg className={`ach-bat ${className}`} viewBox="0 0 64 30" aria-hidden="true">
      <path className="ach-bat-wing" d={wing} />
      {/* The mirror sits on a group: the flap animation owns the path's transform. */}
      <g transform="translate(64 0) scale(-1 1)">
        <path className="ach-bat-wing" d={wing} />
      </g>
      <ellipse cx="32" cy="16" rx="3.6" ry="5.6" />
      <path d="M29.2 11.5 L29.8 7.2 L31.4 10.6 L32.6 10.6 L34.2 7.2 L34.8 11.5Z" />
      <circle className="ach-bat-eye" cx="30.7" cy="13.4" r="0.7" />
      <circle className="ach-bat-eye" cx="33.3" cy="13.4" r="0.7" />
    </svg>
  );
}

function Owl() {
  return (
    <svg className="ach-owl" viewBox="0 0 80 72" aria-hidden="true">
      <g className="ach-owl-wing ach-owl-wing-l">
        <path d="M24 34 C10 30 2 40 1 52 C8 47 13 48 17 51 C18 46 21 44 25 46Z" />
      </g>
      <g className="ach-owl-wing ach-owl-wing-r">
        <path d="M56 34 C70 30 78 40 79 52 C72 47 67 48 63 51 C62 46 59 44 55 46Z" />
      </g>
      <path className="ach-owl-body" d="M40 14 C26 14 21 24 21 36 C21 52 29 64 40 64 C51 64 59 52 59 36 C59 24 54 14 40 14Z" />
      <path className="ach-owl-belly" d="M40 36 C32 36 29 44 30 52 C32 59 36 62 40 62 C44 62 48 59 50 52 C51 44 48 36 40 36Z" />
      <path className="ach-owl-body" d="M24 22 L22 10 L31 18Z M56 22 L58 10 L49 18Z" />
      <circle className="ach-owl-disc" cx="32.5" cy="28" r="8" />
      <circle className="ach-owl-disc" cx="47.5" cy="28" r="8" />
      <circle className="ach-owl-iris" cx="32.5" cy="28" r="5" />
      <circle className="ach-owl-iris" cx="47.5" cy="28" r="5" />
      <circle className="ach-owl-pupil" cx="32.5" cy="28" r="2.4" />
      <circle className="ach-owl-pupil" cx="47.5" cy="28" r="2.4" />
      <path className="ach-owl-beak" d="M37.5 33 L42.5 33 L40 39Z" />
      <path className="ach-owl-feet" d="M34 63 l-2 4 M36 63 l0 4.5 M38 63 l2 4 M42 63 l-2 4 M44 63 l0 4.5 M46 63 l2 4" />
    </svg>
  );
}

function ZombieHand() {
  return (
    <svg className="ach-zombie-hand" viewBox="0 0 60 90" aria-hidden="true">
      <path d="M18 90 L20 52 C14 46 10 38 12 33 C14 30 18 33 20 38 L21 18 C21 14 26 14 26 18 L27 34 L28 10 C28 6 33 6 33 10 L34 34 L36 14 C36 10 41 10 41 14 L40 36 L44 22 C45 18 50 19 49 23 L45 48 C44 54 42 60 40 64 L42 90Z" />
      <path className="ach-zombie-sleeve" d="M14 72 L46 70 L48 90 L12 90Z" />
    </svg>
  );
}

/** Scrambles text into place, Matrix style. */
function useDecode(text: string, active: boolean): string {
  const [out, setOut] = useState(active ? "" : text);
  useEffect(() => {
    if (!active) {
      setOut(text);
      return;
    }
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789#$%&*+=<>";
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor(frame / 2);
      setOut(
        text
          .split("")
          .map((ch, i) => (i < settled || ch === " " ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]))
          .join(""),
      );
      if (settled >= text.length) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
  }, [text, active]);
  return out;
}

// ---------- the toast ----------

export function AchievementToast({
  def,
  more,
  onDone,
  onOpen,
}: {
  def: AchievementDef;
  /** How many more are queued behind this one. */
  more: number;
  onDone: () => void;
  /** Opens the board (clicking the toast). */
  onOpen: () => void;
}) {
  const [variant] = useState<ToastVariant>(() => toastVariantFor(currentThemeId()));
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const decoded = useDecode(def.label, variant === "matrix");

  useEffect(() => {
    playJingle(variant, def.tier);
    const leave = window.setTimeout(() => setLeaving(true), DURATION[variant]);
    return () => window.clearTimeout(leave);
  }, [variant, def.id, def.tier]);

  useEffect(() => {
    if (!leaving) return;
    const done = window.setTimeout(() => doneRef.current(), 520);
    return () => window.clearTimeout(done);
  }, [leaving]);

  const dismiss = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setLeaving(true);
  };
  const open = () => {
    onOpen();
    setLeaving(true);
  };

  const Icon = achievementIcon(def.icon);
  const tier = TIER_LABELS[def.tier];
  const moreChip = more > 0 ? <span className="ach-toast-more">+{more} more</span> : null;
  const shell = (body: React.ReactNode, extra?: React.ReactNode) => (
    <div
      className={`ach-toast ach-toast--${variant} ach-tier-${def.tier}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Achievement unlocked: ${def.label}. ${def.description}`}
    >
      {extra}
      <div className="ach-toast-card" onClick={open} title="Open achievements">
        {body}
      </div>
    </div>
  );
  const close = (
    <button type="button" className="ach-toast-close" onClick={dismiss} aria-label="Dismiss">
      <X size={14} />
    </button>
  );

  switch (variant) {
    case "mc": {
      const title = def.tier === "platinum" ? "Challenge Complete!" : def.tier === "gold" ? "Goal Reached!" : "Advancement Made!";
      return shell(
        <>
          <span className="ach-mc-slot"><Icon size={22} strokeWidth={2.4} /></span>
          <span className="ach-mc-text">
            <span className="ach-mc-title">{title}</span>
            <span className="ach-mc-name">{def.label}</span>
          </span>
          {moreChip}
        </>,
      );
    }

    case "bats":
      return shell(
        <>
          <span className="ach-bats-thread ach-bats-thread-l" />
          <span className="ach-bats-thread ach-bats-thread-r" />
          <div className="ach-bats-kicker">A dark gift is delivered</div>
          <div className="ach-bats-row">
            <AchievementMedal def={def} size={44} />
            <div>
              <div className="ach-bats-name">{def.label}</div>
              <div className="ach-bats-desc">{def.description}</div>
              <div className="ach-bats-tier">{tier}</div>
            </div>
          </div>
          {moreChip}
          {close}
        </>,
        <>
          <Bat className="ach-bat-carrier ach-bat-carrier-l" />
          <Bat className="ach-bat-carrier ach-bat-carrier-r" />
          <span className="ach-bat-swarm" aria-hidden="true">
            <Bat className="ach-bat-s1" />
            <Bat className="ach-bat-s2" />
            <Bat className="ach-bat-s3" />
            <Bat className="ach-bat-s4" />
            <Bat className="ach-bat-s5" />
          </span>
        </>,
      );

    case "owl":
      return shell(
        <>
          <div className="ach-owl-kicker">By owl post</div>
          <div className="ach-owl-letter">
            <span className="ach-owl-seal"><Icon size={18} strokeWidth={2.4} /></span>
            <div>
              <div className="ach-owl-name">{def.label}</div>
              <div className="ach-owl-desc">{def.description}</div>
              <div className="ach-owl-tier">— {tier} distinction —</div>
            </div>
          </div>
          {moreChip}
          {close}
        </>,
        <Owl />,
      );

    case "msn":
      return shell(
        <>
          <div className="ach-msn-titlebar">
            <span>Hoffle</span>
            {close}
          </div>
          <div className="ach-msn-body">
            <AchievementMedal def={def} size={40} />
            <div>
              <div className="ach-msn-head">You earned an achievement!</div>
              <div className="ach-msn-name">{def.label}</div>
              <div className="ach-msn-desc">{def.description}</div>
            </div>
          </div>
          <div className="ach-msn-foot">{more > 0 ? `+${more} more · ` : ""}Click here to see all achievements</div>
        </>,
      );

    case "zombie":
      return shell(
        <>
          <div className="ach-zombie-tape" />
          <div className="ach-zombie-row">
            <AchievementMedal def={def} size={44} />
            <div>
              <div className="ach-zombie-kicker">Survived</div>
              <div className="ach-zombie-name">{def.label}</div>
              <div className="ach-zombie-desc">{def.description}</div>
            </div>
          </div>
          <div className="ach-zombie-tape" />
          {moreChip}
          {close}
        </>,
        <ZombieHand />,
      );

    case "cyber":
      return shell(
        <>
          <div className="ach-cyber-kicker">// ACHIEVEMENT_UNLOCKED <span>[{tier.toUpperCase()}]</span></div>
          <div className="ach-cyber-row">
            <span className="ach-cyber-icon"><Icon size={22} strokeWidth={2.4} /></span>
            <div>
              <div className="ach-cyber-name" data-text={def.label}>{def.label}</div>
              <div className="ach-cyber-desc">{def.description}</div>
            </div>
          </div>
          {moreChip}
          {close}
        </>,
      );

    case "matrix":
      return shell(
        <>
          <div className="ach-matrix-line">&gt; achievement.unlock(&quot;{def.id}&quot;)</div>
          <div className="ach-matrix-row">
            <span className="ach-matrix-icon"><Icon size={20} /></span>
            <div>
              <div className="ach-matrix-name">{decoded}</div>
              <div className="ach-matrix-desc">{def.description}</div>
            </div>
          </div>
          <div className="ach-matrix-line ach-matrix-ok">[ OK ] {tier.toLowerCase()} · wake up, achiever…<span className="ach-matrix-caret" /></div>
          {moreChip}
          {close}
        </>,
      );

    case "campfire":
      return shell(
        <>
          <div className="ach-camp-row">
            <span className="ach-camp-flame"><AchievementMedal def={def} size={46} /></span>
            <div>
              <div className="ach-camp-kicker">Told around the fire</div>
              <div className="ach-camp-name">{def.label}</div>
              <div className="ach-camp-desc">{def.description}</div>
            </div>
          </div>
          {moreChip}
          {close}
        </>,
        <span className="ach-embers" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <span key={i} style={{ "--i": i } as React.CSSProperties} />)}
        </span>,
      );

    case "retro":
      return shell(
        <>
          <div className="ach-retro-titlebar">
            <span>Achievement Unlocked</span>
            {close}
          </div>
          <div className="ach-retro-body">
            <span className="ach-retro-icon"><Icon size={26} /></span>
            <div>
              <div className="ach-retro-name">{def.label}</div>
              <div className="ach-retro-desc">{def.description}</div>
            </div>
          </div>
          <div className="ach-retro-buttons">
            {more > 0 && <span className="ach-retro-more">+{more} more</span>}
            <button type="button" onClick={dismiss}>OK</button>
          </div>
        </>,
      );

    default:
      return shell(
        <>
          <span className="ach-pop-medal"><AchievementMedal def={def} size={52} /></span>
          <span className="ach-pop-text">
            <span className="ach-pop-kicker">Achievement unlocked · {tier}</span>
            <span className="ach-pop-name">{def.label}</span>
            <span className="ach-pop-desc">{def.description}</span>
          </span>
          {moreChip}
          {close}
        </>,
        def.tier === "platinum" || def.tier === "gold" ? (
          <span className="ach-sparkles" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ "--i": i } as React.CSSProperties} />)}
          </span>
        ) : null,
      );
  }
}
