"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ProfileStyle } from "@/lib/profile-style";
import { stripTextStyle } from "@/lib/text-style";
import { StyledText } from "./message-body";
import { loadNameFont, nameLook, splitGraphemes } from "../lib/profile-look";

/*
 * The pieces that put a profile style on screen: names, the overlays around
 * a profile card, and the speaking aura / join flourish on voice avatars.
 * Visuals live in app/profile-style.css.
 */

/** Deterministic 0..1 noise, so particles land in the same spots every render. */
function noise(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const vars = (values: Record<string, string | number>) => values as CSSProperties;

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

/**
 * A display name in someone's chosen font and effect. Without a style it is
 * exactly the old StyledText, so unstyled names cost nothing. Put it inside
 * the element that already carries the name's layout and role colour.
 */
export function StyledName({ name, style, live = false, className }: { name: string; style?: ProfileStyle; live?: boolean; className?: string }) {
  const look = nameLook(style, live);
  const font = style?.font;
  useEffect(() => loadNameFont(font), [font]);
  if (!look) return <StyledText text={name} className={className} />;
  const plain = stripTextStyle(name);
  let body: ReactNode;
  if (look.letters && !name.includes("[")) {
    const letters = splitGraphemes(plain);
    const last = Math.max(1, letters.length - 1);
    body = (
      <>
        <span className="pn-sr">{plain}</span>
        <span className="pn-letters" aria-hidden="true">
          {letters.map((letter, i) =>
            /\s/.test(letter) ? (
              letter
            ) : (
              <span key={i} className="pn-l" style={vars({ "--i": i, "--p": `${Math.round((i / last) * 100)}%` })}>
                {letter}
              </span>
            ),
          )}
        </span>
      </>
    );
  } else {
    body = <StyledText text={name} />;
  }
  return (
    <span className={`${look.className}${className ? ` ${className}` : ""}`} style={look.style} data-text={plain}>
      {body}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

/** Overlays drawn over a card from its host: the edge, the pointer glare and holo foil. */
export function CardChrome({ themed }: { themed: boolean }) {
  return (
    <>
      {themed && <span className="pst-edge" aria-hidden="true" />}
      <span className="pst-glare" aria-hidden="true" />
      {themed && <span className="pst-foil" aria-hidden="true" />}
    </>
  );
}

/** Layers inside a themed card, under its content: the pattern and the aurora's lights. */
export function CardBackdrop({ themed }: { themed: boolean }) {
  if (!themed) return null;
  return (
    <span className="pst-backdrop" aria-hidden="true">
      <span className="pst-lights" />
      <span className="pst-pattern" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

const RING_PARTS: Record<string, number> = {
  classic: 1,
  ripple: 3,
  rainbow: 1,
  orbit: 3,
  electric: 2,
  glitch: 3,
  aura: 2,
  flame: 12,
  soundwave: 18,
  sparkle: 7,
  hearts: 6,
  bubbles: 7,
  notes: 5,
  petals: 7,
};

/** Eighth note and beamed pair, drawn so they don't depend on a font having ♪. */
const NOTES = [
  "M13 2 V15.5 A3.6 3 -20 1 1 10.6 12.6 V5 L18 7.5 V10.5 L13 8.8Z",
  "M8 4 L19 1.5 V14 A3.4 2.8 -20 1 1 16.6 11.4 V6 L10.4 7.6 V16.5 A3.4 2.8 -20 1 1 8 13.9Z",
];

/** A jagged circle for the electric ring, different for each seed. */
function boltCircle(seed: number) {
  const points: string[] = [];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 46 + (noise(i, seed) - 0.5) * 7;
    points.push(`${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${points.join(" L")}Z`;
}

function ringPart(ring: string, i: number): ReactNode {
  const style = vars({
    "--i": i,
    "--x": `${Math.round(noise(i, 3) * 100)}%`,
    "--d": `${(-noise(i, 7) * 2.4).toFixed(2)}s`,
    "--s": (0.7 + noise(i, 11) * 0.6).toFixed(2),
    "--a": `${Math.round((360 / (RING_PARTS[ring] || 1)) * i)}deg`,
  });
  if (ring === "electric") {
    return (
      <svg key={i} className="va-p" viewBox="0 0 100 100" style={style}>
        <path d={boltCircle(i + 3)} />
      </svg>
    );
  }
  if (ring === "notes") {
    return (
      <svg key={i} className="va-p" viewBox="0 0 22 22" style={style}>
        <path d={NOTES[i % NOTES.length]} />
      </svg>
    );
  }
  if (ring === "hearts") {
    return (
      <svg key={i} className="va-p" viewBox="0 0 20 19" style={style}>
        <path d="M10 18 C4 13.5 1 10 1 6.2 C1 3.2 3.4 1 6 1 C7.8 1 9.2 2 10 3.4 C10.8 2 12.2 1 14 1 C16.6 1 19 3.2 19 6.2 C19 10 16 13.5 10 18Z" />
      </svg>
    );
  }
  if (ring === "sparkle") {
    return (
      <svg key={i} className="va-p" viewBox="-10 -10 20 20" style={style}>
        <path d="M0 -10 C1.2 -1.2 1.2 -1.2 10 0 C1.2 1.2 1.2 1.2 0 10 C-1.2 1.2 -1.2 1.2 -10 0 C-1.2 -1.2 -1.2 -1.2 0 -10Z" />
      </svg>
    );
  }
  return <span key={i} className="va-p" style={style} />;
}

const JOIN_PARTS: Record<string, number> = {
  pop: 1,
  sparkle: 12,
  shockwave: 3,
  portal: 2,
  confetti: 26,
  lightning: 2,
  glitch: 0,
  drop: 6,
  smoke: 8,
  hearts: 10,
  petals: 12,
  bats: 8,
  pixels: 36,
  creeper: 18,
  grave: 12,
};

const CONFETTI = ["#ff4d6d", "#ffd23f", "#3bd5ff", "#7cff6b", "#c77dff", "#ff9f1c"];

function joinPart(kind: string, i: number): ReactNode {
  const count = JOIN_PARTS[kind] || 1;
  const angle = (360 / count) * i + noise(i, 5) * 20;
  const style = vars({
    "--i": i,
    "--a": `${angle.toFixed(1)}deg`,
    "--r": (0.75 + noise(i, 9) * 0.6).toFixed(2),
    "--d": `${(noise(i, 13) * 0.18).toFixed(2)}s`,
    "--c": CONFETTI[i % CONFETTI.length],
    "--spin": `${Math.round((noise(i, 17) - 0.5) * 900)}deg`,
    "--px": `${(i % 6) * 16.667}%`,
    "--py": `${Math.floor(i / 6) * 16.667}%`,
  });
  if (kind === "hearts") {
    return (
      <svg key={i} className="jf-p" viewBox="0 0 20 19" style={style}>
        <path d="M10 18 C4 13.5 1 10 1 6.2 C1 3.2 3.4 1 6 1 C7.8 1 9.2 2 10 3.4 C10.8 2 12.2 1 14 1 C16.6 1 19 3.2 19 6.2 C19 10 16 13.5 10 18Z" />
      </svg>
    );
  }
  if (kind === "sparkle") {
    return (
      <svg key={i} className="jf-p" viewBox="-10 -10 20 20" style={style}>
        <path d="M0 -10 C1.2 -1.2 1.2 -1.2 10 0 C1.2 1.2 1.2 1.2 0 10 C-1.2 1.2 -1.2 1.2 -10 0 C-1.2 -1.2 -1.2 -1.2 0 -10Z" />
      </svg>
    );
  }
  if (kind === "bats") {
    return (
      <svg key={i} className="jf-p" viewBox="0 0 60 28" style={style}>
        <path d="M30 10 C26 4 22 4 20 8 C14 2 6 4 0 12 C6 12 10 16 12 20 C16 16 22 16 26 20 L30 16 L34 20 C38 16 44 16 48 20 C50 16 54 12 60 12 C54 4 46 2 40 8 C38 4 34 4 30 10Z" />
      </svg>
    );
  }
  if (kind === "lightning") {
    return i === 0 ? (
      <svg key={i} className="jf-p jf-bolt" viewBox="0 0 40 100" style={style}>
        <path d="M24 0 L6 52 H19 L12 100 L36 38 H22 L32 0Z" />
      </svg>
    ) : (
      <span key={i} className="jf-p jf-flash" style={style} />
    );
  }
  return <span key={i} className="jf-p" style={style} />;
}

/** Seats whose join flourish already played, so a re-layout doesn't replay it. */
const playedJoins = new Set<string>();

/**
 * Wraps a voice avatar with its owner's speaking aura and, when `join` is set,
 * plays their join flourish once (once per `joinKey` for the whole page, when
 * given). Without a ring or join it renders the avatar untouched.
 */
export function VoiceAura({
  ring,
  color,
  speaking,
  join,
  joinKey,
  children,
  className = "",
}: {
  ring?: string;
  color?: string;
  speaking: boolean;
  join?: string | null;
  joinKey?: string;
  children: ReactNode;
  className?: string;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  // Once wrapped, stay wrapped: unwrapping would remount the avatar mid-call.
  const wrapped = useRef(false);
  if (ring || join) wrapped.current = true;
  // Before paint, so the avatar never shows for a frame ahead of its entrance.
  useLayoutEffect(() => {
    if (!join) return;
    if (joinKey) {
      if (playedJoins.has(joinKey)) return;
      playedJoins.add(joinKey);
    }
    setPlaying(join);
  }, [join, joinKey]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setPlaying(null), 1900);
    return () => window.clearTimeout(timer);
  }, [playing]);
  if (!wrapped.current) return <>{children}</>;
  const parts = ring ? RING_PARTS[ring] || 0 : 0;
  return (
    <span
      className={`va${ring ? ` va-${ring}` : ""}${speaking ? " va-on" : ""}${playing ? ` jf jf-${playing}` : ""}${className ? ` ${className}` : ""}`}
      style={color ? vars({ "--va": color }) : undefined}
    >
      {ring && <span className="va-back" aria-hidden="true">{Array.from({ length: parts }, (_, i) => ringPart(ring, i))}</span>}
      <span className="va-face">{children}</span>
      {playing && (
        <span className="jf-layer" aria-hidden="true">
          {Array.from({ length: JOIN_PARTS[playing] || 0 }, (_, i) => joinPart(playing, i))}
        </span>
      )}
    </span>
  );
}
