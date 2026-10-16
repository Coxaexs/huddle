"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { CANVAS_SCENES, CanvasScene, useParticlesSetting } from "./particle-scenes";
import { EXTRA_DECORATIONS, EXTRA_EFFECTS, EXTRA_FRAME_ART, EXTRA_NAMEPLATE_ART, EXTRA_SCENES, NAMEPLATE_FIT_WHOLE } from "./cosmetics-extra";

/*
 * Drawn profile cosmetics: avatar decorations, profile effects, profile
 * frame ornaments and nameplate art. Everything is inline SVG + CSS so it
 * needs no assets and scales to any size. Styles live in app/cosmetics.css.
 */

/** Deterministic 0..1 noise, so particles sit in the same place every render. */
function noise(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A four-point sparkle centred on (cx, cy). */
function sparklePath(cx: number, cy: number, r: number) {
  const k = r * 0.18;
  return `M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

/** Five rounded petals around a centre, used by flower crowns and blossoms. */
function Flower({ x, y, r, petal, heart, rotate = 0 }: { x: number; y: number; r: number; petal: string; heart: string; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.62} rx={r * 0.42} ry={r * 0.62} fill={petal} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.32} fill={heart} />
    </g>
  );
}

function Snowflake({ x, y, r, stroke, width = 1.4 }: { x: number; y: number; r: number; stroke: string; width?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none">
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d={`M0 ${-r} V${r}`} />
          <path d={`M${-r * 0.3} ${-r * 0.72} L0 ${-r * 0.45} L${r * 0.3} ${-r * 0.72}`} />
          <path d={`M${-r * 0.3} ${r * 0.72} L0 ${r * 0.45} L${r * 0.3} ${r * 0.72}`} />
        </g>
      ))}
    </g>
  );
}

/** A bat silhouette in a 60x28 box. */
const BAT_PATH = "M30 10 C26 4 22 4 20 8 C14 2 6 4 0 12 C6 12 10 16 12 20 C16 16 22 16 26 20 L30 16 L34 20 C38 16 44 16 48 20 C50 16 54 12 60 12 C54 4 46 2 40 8 C38 4 34 4 30 10Z";

function Bat({ x, y, w, fill = "#0d0408", rotate = 0, className, outline }: { x: number; y: number; w: number; fill?: string; rotate?: number; className?: string; outline?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${w / 60}) translate(-30 -12)`}>
      <path d={BAT_PATH} fill={fill} className={className} stroke={outline} strokeWidth={outline ? 2.4 : undefined} strokeLinejoin="round" />
    </g>
  );
}

/** A candle standing on (x, y), with a flickering flame. */
function Candle({ x, y, h, w = 10, wax = "#efe6d6" }: { x: number; y: number; h: number; w?: number; wax?: string }) {
  const top = y - h;
  return (
    <g>
      <circle cx={x} cy={top - 9} r={w * 1.3} fill="#ffb347" opacity="0.18" className="pf-flame-glow" />
      <rect x={x - w / 2} y={top} width={w} height={h} rx="2" fill={wax} stroke="rgba(60,30,20,.45)" strokeWidth="1" />
      <path d={`M${x - w / 2} ${top + 2} Q${x - w / 4} ${top + 8} ${x - w / 6} ${top + 2} Q${x + w / 6} ${top + 12} ${x + w / 3} ${top + 2}`} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.4" />
      <path d={`M${x} ${top} V${top - 3}`} stroke="#2a1a10" strokeWidth="1.2" />
      <path d={`M${x} ${top - 2} C${x - 4} ${top - 7} ${x - 2} ${top - 13} ${x} ${top - 19} C${x + 2} ${top - 13} ${x + 4} ${top - 7} ${x} ${top - 2}Z`} fill="#ff9a2a" className="pf-flame" />
      <path d={`M${x} ${top - 3} C${x - 2} ${top - 6} ${x - 1} ${top - 9} ${x} ${top - 12} C${x + 1} ${top - 9} ${x + 2} ${top - 6} ${x} ${top - 3}Z`} fill="#fff3b0" className="pf-flame" />
    </g>
  );
}

function Cloud({ x, y, s: k, fill = "#fff" }: { x: number; y: number; s: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} fill={fill}>
      <circle cx="0" cy="0" r="12" />
      <circle cx="14" cy="-6" r="14" />
      <circle cx="30" cy="0" r="11" />
      <rect x="-6" y="0" width="42" height="10" rx="5" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar decorations                                                  */
/* Drawn in a 120x120 box where the avatar is the circle at (60,60) r50. */
/* ------------------------------------------------------------------ */

const mirror = "matrix(-1 0 0 1 120 0)";

const DECORATIONS: Record<string, (u: string) => ReactNode> = {
  "cat-ears": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}fur`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffbf7a" />
          <stop offset="1" stopColor="#e9802f" />
        </linearGradient>
      </defs>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t}>
          <path d="M11 47 C8 30 12 13 21 3 C31 7 43 15 51 22 C37 26 22 35 11 47Z" fill={`url(#${u}fur)`} stroke="#6b3410" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M18 37 C17 27 20 18 24 12 C31 15 37 19 41 23 C32 26 25 31 18 37Z" fill="#ffc4d3" />
          <path d="M27 6 L30 13 M34 10 L35 16" stroke="#9a4a14" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <path d="M40 106 Q60 116 80 106" fill="none" stroke="#e0245e" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="113" r="6.5" fill="#ffd34d" stroke="#9a6a00" strokeWidth="1.8" />
      <path d="M55.5 113 H64.5" stroke="#9a6a00" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="60" cy="116" r="1.4" fill="#9a6a00" />
    </>
  ),
  "bunny-ears": () => (
    <>
      <g transform="rotate(-12 44 22)">
        <path d="M36 26 C26 8 26 -16 37 -17 C48 -18 52 4 50 24Z" fill="#fffafc" stroke="#d6a9bd" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M39 20 C33 6 33 -9 38 -10 C43 -11 46 6 46 19Z" fill="#ffc7da" />
      </g>
      <g transform="rotate(30 74 22)">
        <path d="M68 26 C60 8 62 -14 73 -15 C84 -16 86 6 82 26Z" fill="#fffafc" stroke="#d6a9bd" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M71 20 C67 7 68 -7 73 -8 C78 -9 80 6 78 20Z" fill="#ffc7da" />
      </g>
      <g transform="translate(60 20)">
        <path d="M0 0 C-8 -10 -18 -6 -16 2 C-14 9 -6 6 0 0Z" fill="#ff8fc2" stroke="#c2457f" strokeWidth="1.6" />
        <path d="M0 0 C8 -10 18 -6 16 2 C14 9 6 6 0 0Z" fill="#ff8fc2" stroke="#c2457f" strokeWidth="1.6" />
        <circle r="3.6" fill="#ff6fae" stroke="#c2457f" strokeWidth="1.4" />
      </g>
    </>
  ),
  "fox-ears": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}fox`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#e2561c" />
        </linearGradient>
      </defs>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t}>
          <path d="M13 44 C10 24 12 6 18 -6 C30 2 42 12 50 22 C36 25 23 33 13 44Z" fill={`url(#${u}fox)`} stroke="#7a2a06" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M19 35 C18 22 19 11 22 3 C29 9 36 15 41 22 C32 25 25 29 19 35Z" fill="#fff3e3" />
          <path d="M18 -6 C20 -2 22 2 23 6 C21 4 19 3 16.5 3 Z" fill="#3a1606" />
        </g>
      ))}
      <path d="M90 98 C108 100 122 84 114 64 C124 74 124 98 106 110 C98 115 88 112 84 106Z" fill={`url(#${u}fox)`} stroke="#7a2a06" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M114 64 C121 70 122 80 119 88 C114 82 112 74 114 64Z" fill="#fff3e3" />
    </>
  ),
  halo: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}halo`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset="0.5" stopColor="#fff8d6" />
          <stop offset="1" stopColor="#f5c542" />
        </linearGradient>
        <filter id={`${u}glow`} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      <g className="deco-bob">
        <ellipse cx="60" cy="0" rx="31" ry="7.5" fill="none" stroke="#ffe48a" strokeWidth="7" filter={`url(#${u}glow)`} opacity="0.85" />
        <ellipse cx="60" cy="0" rx="31" ry="7.5" fill="none" stroke={`url(#${u}halo)`} strokeWidth="4" />
        <path d={sparklePath(95, -8, 5)} fill="#fff8d6" className="deco-twinkle" />
        <path d={sparklePath(26, 8, 3.5)} fill="#fff8d6" className="deco-twinkle deco-delay" />
      </g>
    </>
  ),
  horns: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}horn`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8a0b1b" />
          <stop offset="1" stopColor="#ff4d5e" />
        </linearGradient>
      </defs>
      {[undefined, mirror].map((t, i) => (
        <path key={i} transform={t} d="M33 22 C26 16 18 6 21 -10 C28 2 40 8 51 12 C46 16 40 19 33 22Z" fill={`url(#${u}horn)`} stroke="#4a0410" strokeWidth="2.2" strokeLinejoin="round" />
      ))}
      <path d="M92 100 C108 106 116 94 108 84" fill="none" stroke="#c2142b" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M104 78 L114 82 L106 90 Z" fill="#c2142b" stroke="#4a0410" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  "flower-crown": () => {
    const spots = [-168, -146, -124, -102, -80, -58, -36, -14];
    const palette = [
      ["#ff9ec7", "#ffd34d"],
      ["#fff5f9", "#ffb347"],
      ["#c9a7ff", "#fff1a8"],
      ["#ffd0a1", "#ff7a59"],
    ];
    return (
      <>
        {spots.slice(0, -1).map((a, i) => {
          const mid = ((a + spots[i + 1]) / 2) * (Math.PI / 180);
          const x = 60 + 52 * Math.cos(mid);
          const y = 60 + 52 * Math.sin(mid);
          return <ellipse key={`l${a}`} cx={x} cy={y} rx="7" ry="3.2" fill="#5fae5a" stroke="#2f6b2c" strokeWidth="1" transform={`rotate(${(mid * 180) / Math.PI + 90} ${x} ${y})`} />;
        })}
        {spots.map((a, i) => {
          const rad = a * (Math.PI / 180);
          const [petal, heart] = palette[i % palette.length];
          return <Flower key={a} x={60 + 52 * Math.cos(rad)} y={60 + 52 * Math.sin(rad)} r={i % 2 ? 7.5 : 9.5} petal={petal} heart={heart} rotate={a} />;
        })}
      </>
    );
  },
  crown: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#f5c542" />
          <stop offset="1" stopColor="#c48a12" />
        </linearGradient>
      </defs>
      <g transform="rotate(18 80 14)">
        <path d="M56 26 L52 2 L65 13 L74 -5 L83 13 L96 2 L92 26Z" fill={`url(#${u}gold)`} stroke="#7a5200" strokeWidth="2" strokeLinejoin="round" />
        <rect x="55" y="21" width="38" height="7" rx="2.5" fill="#e9b52a" stroke="#7a5200" strokeWidth="1.8" />
        <circle cx="52" cy="2" r="2.8" fill="#fff1a8" stroke="#7a5200" strokeWidth="1.4" />
        <circle cx="74" cy="-5" r="3.2" fill="#fff1a8" stroke="#7a5200" strokeWidth="1.4" />
        <circle cx="96" cy="2" r="2.8" fill="#fff1a8" stroke="#7a5200" strokeWidth="1.4" />
        <path d="M74 12 L78 17 L74 22 L70 17Z" fill="#e0245e" stroke="#7a0b2c" strokeWidth="1.2" />
        <circle cx="62" cy="24.5" r="2" fill="#3b82f6" />
        <circle cx="86" cy="24.5" r="2" fill="#22c55e" />
        <path d={sparklePath(64, 8, 3)} fill="#fff" className="deco-twinkle" />
      </g>
    </>
  ),
  headphones: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}cup`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8db3" />
          <stop offset="1" stopColor="#e2457b" />
        </linearGradient>
      </defs>
      <path d="M24 22 L30 6 L40 14Z M96 22 L90 6 L80 14Z" fill="#ff8db3" stroke="#2a2b3d" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 62 C6 -12 114 -12 108 62" fill="none" stroke="#1d1e2c" strokeWidth="9" strokeLinecap="round" />
      <path d="M12 62 C6 -12 114 -12 108 62" fill="none" stroke="#ff8db3" strokeWidth="5" strokeLinecap="round" />
      <path d="M20 30 C34 8 86 8 100 30" fill="none" stroke="#ffd1e1" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      {[3, 99].map((x) => (
        <g key={x}>
          <rect x={x} y="48" width="18" height="34" rx="8" fill={`url(#${u}cup)`} stroke="#2a2b3d" strokeWidth="2.6" />
          <rect x={x + 4.5} y="55" width="4" height="20" rx="2" fill="#ffd1e1" opacity="0.7" />
        </g>
      ))}
    </>
  ),
  "witch-hat": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}hat`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b3fb0" />
          <stop offset="1" stopColor="#2e1657" />
        </linearGradient>
      </defs>
      <g transform="rotate(-16 48 18)">
        <path d="M30 20 C38 6 44 -10 50 -22 C54 -28 62 -28 66 -22 C60 -22 56 -18 58 -12 C62 -2 68 10 74 20Z" fill={`url(#${u}hat)`} stroke="#1a0b33" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M33 14 C46 16 60 16 72 14 L74 20 C60 23 44 23 30 20Z" fill="#f4c542" stroke="#1a0b33" strokeWidth="1.6" />
        <ellipse cx="52" cy="22" rx="38" ry="8" fill={`url(#${u}hat)`} stroke="#1a0b33" strokeWidth="2.2" />
        <path d="M60 -2 A6 6 0 1 0 64 8 A4.5 4.5 0 1 1 60 -2Z" fill="#fff1a8" />
        <path d={sparklePath(44, 2, 3)} fill="#fff1a8" className="deco-twinkle" />
      </g>
    </>
  ),
  sprout: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b7f07a" />
          <stop offset="1" stopColor="#3f9b3a" />
        </linearGradient>
      </defs>
      <g className="deco-sway">
        <path d="M60 12 C60 4 60 0 61 -6" fill="none" stroke="#3f8f37" strokeWidth="3" strokeLinecap="round" />
        <path d="M61 -4 C68 -16 84 -16 88 -6 C80 0 68 1 61 -4Z" fill={`url(#${u}leaf)`} stroke="#2f6b2c" strokeWidth="1.6" />
        <path d="M60 2 C52 -9 38 -8 34 0 C42 5 53 6 60 2Z" fill={`url(#${u}leaf)`} stroke="#2f6b2c" strokeWidth="1.6" />
        <path d="M64 -6 C70 -10 78 -10 83 -7" fill="none" stroke="#2f6b2c" strokeWidth="1" opacity="0.6" />
      </g>
    </>
  ),
  stardust: () => {
    const stars: [number, number, number, string][] = [
      [14, 22, 7, "#fff6c2"], [104, 16, 6, "#ffd1f0"], [112, 74, 4.5, "#c8f1ff"],
      [6, 86, 4, "#ffd1f0"], [88, 112, 5, "#fff6c2"], [28, 110, 3.5, "#c8f1ff"], [60, 2, 4, "#fff"],
    ];
    return (
      <>
        <circle cx="60" cy="60" r="56" fill="none" stroke="#c9b8ff" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="2 6" strokeLinecap="round" className="deco-spin" />
        {stars.map(([x, y, r, c], i) => (
          <path key={i} d={sparklePath(x, y, r)} fill={c} className={`deco-twinkle${i % 2 ? " deco-delay" : ""}`} />
        ))}
      </>
    );
  },
  vampire: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}cape`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c0102a" />
          <stop offset="1" stopColor="#5a0010" />
        </linearGradient>
      </defs>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t}>
          <path d="M36 118 C16 100 4 72 8 40 C18 58 30 72 46 82 C42 94 40 106 36 118Z" fill="#0d0408" stroke="#2a0a12" strokeWidth="2" strokeLinejoin="round" />
          <path d="M34 108 C20 94 12 74 13 54 C22 68 31 77 42 84 C39 92 37 100 34 108Z" fill={`url(#${u}cape)`} />
        </g>
      ))}
      <path d="M52 110 L56 118 L60 112 L64 118 L68 110" fill="#fff" stroke="#2a0a12" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="60" cy="108" r="4" fill="#c0102a" stroke="#f2c94c" strokeWidth="1.6" />
      <g className="deco-bob">
        <Bat x={98} y={8} w={30} rotate={12} />
        <circle cx="96" cy="7" r="1" fill="#ff3b4f" />
        <circle cx="100" cy="7" r="1" fill="#ff3b4f" />
      </g>
    </>
  ),
  "bat-wings": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}bw`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0a14" />
          <stop offset="1" stopColor="#0d0408" />
        </linearGradient>
      </defs>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t}><g className="deco-flap">
          <path d="M14 46 C2 30 -14 24 -26 28 C-20 36 -20 44 -24 52 C-14 48 -8 52 -6 60 C0 54 6 56 8 64 C10 58 12 56 14 58Z" fill={`url(#${u}bw)`} stroke="#6b0a1c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 46 C0 38 -12 34 -22 32 M12 50 C2 48 -8 50 -18 52 M12 54 C6 56 0 58 -4 60" fill="none" stroke="#8a0012" strokeWidth="1.2" opacity="0.8" />
        </g></g>
      ))}
    </>
  ),
  "blood-crown": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}bc`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a44" />
          <stop offset="1" stopColor="#0d0d12" />
        </linearGradient>
      </defs>
      <path d="M30 22 L28 4 L38 14 L44 -6 L52 10 L60 -12 L68 10 L76 -6 L82 14 L92 4 L90 22 C72 16 48 16 30 22Z" fill={`url(#${u}bc)`} stroke="#000" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M60 4 L65 11 L60 18 L55 11Z" fill="#e0102a" stroke="#4a0008" strokeWidth="1.2" className="deco-twinkle-soft" />
      <circle cx="44" cy="14" r="2.6" fill="#c0102a" />
      <circle cx="76" cy="14" r="2.6" fill="#c0102a" />
      <path d="M42 18 l0 6 M60 19 l0 8 M78 18 l0 6" stroke="#c0102a" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  "frog-hat": () => (
    <g className="deco-bob">
      <ellipse cx="60" cy="10" rx="30" ry="15" fill="#6cc24a" stroke="#2f6b1c" strokeWidth="2.4" />
      <circle cx="44" cy="-2" r="9" fill="#6cc24a" stroke="#2f6b1c" strokeWidth="2.4" />
      <circle cx="76" cy="-2" r="9" fill="#6cc24a" stroke="#2f6b1c" strokeWidth="2.4" />
      <circle cx="44" cy="-2" r="5" fill="#fff" />
      <circle cx="76" cy="-2" r="5" fill="#fff" />
      <circle cx="45" cy="-1" r="2.6" fill="#1a1a1a" />
      <circle cx="77" cy="-1" r="2.6" fill="#1a1a1a" />
      <path d="M50 14 Q60 20 70 14" fill="none" stroke="#2f6b1c" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="40" cy="12" rx="4" ry="2.4" fill="#ff9ab8" opacity="0.8" />
      <ellipse cx="80" cy="12" rx="4" ry="2.4" fill="#ff9ab8" opacity="0.8" />
    </g>
  ),
  "angel-wings": () => (
    <>
      {[undefined, mirror].map((t, i) => (
        <g key={i} transform={t}><g className="deco-flap">
          <path d="M14 56 C4 40 -12 30 -28 32 C-22 38 -26 44 -30 50 C-22 50 -24 56 -28 62 C-18 62 -18 68 -22 74 C-10 72 2 70 12 66Z" fill="#fffdf8" stroke="#d9cfb8" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 58 C0 50 -12 44 -22 42 M10 62 C0 58 -10 58 -20 60" fill="none" stroke="#d9cfb8" strokeWidth="1.3" />
        </g></g>
      ))}
    </>
  ),
  bow: () => (
    <g transform="translate(90 16) rotate(22)">
      <path d="M-2 3 L-11 21 L-5 19 L-1 24Z M2 3 L11 21 L5 19 L1 24Z" fill="#ff7fb6" stroke="#b8376f" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M0 0 C-10 -15 -27 -11 -25 2 C-23 13 -10 10 0 0Z" fill="#ff9ccb" stroke="#b8376f" strokeWidth="1.8" />
      <path d="M0 0 C10 -15 27 -11 25 2 C23 13 10 10 0 0Z" fill="#ff9ccb" stroke="#b8376f" strokeWidth="1.8" />
      <path d="M-18 -3 C-14 -6 -9 -5 -6 -2 M18 -3 C14 -6 9 -5 6 -2" fill="none" stroke="#b8376f" strokeWidth="1.2" opacity="0.6" />
      <circle r="4.8" fill="#ff6fae" stroke="#b8376f" strokeWidth="1.6" />
    </g>
  ),
};

// The second wave (cosmetics-extra.tsx) joins the same registries.
Object.assign(DECORATIONS, EXTRA_DECORATIONS);

/** Ring-style decorations drawn by CSS box-shadow on the avatar itself. */
export const RING_DECORATIONS = new Set(["neon", "rainbow", "cyber", "gold", "sakura", "diamond"]);

/**
 * The art for an avatar decoration, laid over the avatar. Parent must be
 * position: relative. `inChat` also draws the ring-style ones itself, for
 * avatars (messages, member list) that have no frame class on a wrapper.
 */
export function AvatarDecoration({ id, inChat = false }: { id?: string | null; inChat?: boolean }) {
  const u = useId().replace(/:/g, "");
  if (!id || id === "none") return null;
  if (RING_DECORATIONS.has(id)) {
    return inChat ? (
      <span className={`avatar-deco-ring avatar-frame-${id}`} aria-hidden="true">
        <span className="avatar-base" />
      </span>
    ) : null;
  }
  const draw = DECORATIONS[id];
  if (!draw) return null;
  return (
    <svg className={`avatar-deco avatar-deco-${id}${inChat ? " avatar-deco-chat" : ""}`} viewBox="0 0 120 120" aria-hidden="true">
      {draw(u)}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Profile effects                                                     */
/* ------------------------------------------------------------------ */

type Motion = "fall" | "rise" | "twinkle" | "wander" | "streak";

interface EffectSpec {
  motion: Motion;
  count: number;
  size: [number, number];
  time: [number, number];
  spin?: boolean;
  shape: (i: number) => ReactNode;
}

const CONFETTI = ["#ff4d6d", "#ffd23f", "#3bd5ff", "#7cff6b", "#c77dff", "#ff9f1c"];
const HEARTS = ["#ff5c8a", "#ff8fb1", "#ff3d71", "#ffb3c8"];
const LEAVES = ["#e2621b", "#f2a33a", "#c23b1e", "#e8c547"];
const heartPath = "M10 17.5 C4 13 1 9.5 1 6 C1 3 3.4 1 6 1 C7.8 1 9.2 2 10 3.4 C10.8 2 12.2 1 14 1 C16.6 1 19 3 19 6 C19 9.5 16 13 10 17.5Z";

const EFFECTS: Record<string, EffectSpec> = {
  sparkles: {
    motion: "twinkle",
    count: 22,
    size: [6, 16],
    time: [1.8, 3.6],
    shape: (i) => (
      <svg viewBox="0 0 20 20"><path d={sparklePath(10, 10, 10)} fill={["#fff", "#fff3b0", "#d6e9ff", "#ffd6f5"][i % 4]} /></svg>
    ),
  },
  snow: {
    motion: "fall",
    count: 28,
    size: [4, 13],
    time: [6, 12],
    shape: (i) =>
      i % 3 === 0 ? (
        <svg viewBox="-10 -10 20 20"><Snowflake x={0} y={0} r={8.5} stroke="#fff" width={1.6} /></svg>
      ) : (
        <span className="pfx-dot" style={{ background: "radial-gradient(circle, #fff 35%, rgba(255,255,255,0) 72%)" }} />
      ),
  },
  embers: {
    motion: "rise",
    count: 26,
    size: [3, 8],
    time: [3.5, 7],
    shape: (i) => <span className="pfx-dot pfx-glow" style={{ background: ["#ffd27a", "#ff8a3d", "#ff5a2a", "#ffb347"][i % 4], color: "#ff7a2a" }} />,
  },
  confetti: {
    motion: "fall",
    count: 30,
    size: [6, 11],
    time: [3.5, 6.5],
    spin: true,
    shape: (i) => (
      <span className="pfx-confetti" style={{ background: CONFETTI[i % CONFETTI.length], borderRadius: i % 3 === 0 ? "50%" : "2px", aspectRatio: i % 3 === 0 ? "1" : "0.45" }} />
    ),
  },
  hearts: {
    motion: "rise",
    count: 16,
    size: [9, 20],
    time: [5, 9],
    shape: (i) => <svg viewBox="0 0 20 19"><path d={heartPath} fill={HEARTS[i % HEARTS.length]} stroke="rgba(255,255,255,.55)" strokeWidth="1" /></svg>,
  },
  sakura: {
    motion: "fall",
    count: 18,
    size: [9, 16],
    time: [7, 12],
    spin: true,
    shape: (i) => (
      <svg viewBox="0 0 20 20">
        <path d="M10 19 C3 14 2 7 6 3 C8 1.5 9 3 10 5 C11 3 12 1.5 14 3 C18 7 17 14 10 19Z" fill={i % 2 ? "#ffc3d8" : "#ff9ec2"} />
        <path d="M10 18 V8" stroke="#f57aa7" strokeWidth="0.8" opacity="0.6" />
      </svg>
    ),
  },
  fireflies: {
    motion: "wander",
    count: 18,
    size: [4, 7],
    time: [5, 9],
    shape: () => <span className="pfx-dot pfx-glow pfx-pulse" style={{ background: "#f4ff9a", color: "#d8ff5a" }} />,
  },
  bubbles: {
    motion: "rise",
    count: 16,
    size: [8, 22],
    time: [6, 11],
    shape: () => (
      <svg viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="rgba(160,220,255,.12)" stroke="rgba(210,240,255,.75)" strokeWidth="1.1" />
        <path d="M5 8 A5.5 5.5 0 0 1 9 4.5" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  butterflies: {
    motion: "rise",
    count: 9,
    size: [14, 22],
    time: [9, 15],
    shape: (i) => {
      const [a, b] = [["#7fd8ff", "#3b82f6"], ["#ffb3e6", "#d946ef"], ["#ffe08a", "#f59e0b"]][i % 3];
      return (
        <svg viewBox="0 0 24 20" className="pfx-flap">
          <path d="M12 10 C8 1 1 0 1.5 5 C2 9 7 10 12 10Z M12 10 C16 1 23 0 22.5 5 C22 9 17 10 12 10Z" fill={a} stroke={b} strokeWidth="0.9" />
          <path d="M12 10 C8 12 4 17 7 18.5 C9.5 19.5 11 14 12 10Z M12 10 C16 12 20 17 17 18.5 C14.5 19.5 13 14 12 10Z" fill={b} opacity="0.85" />
          <path d="M12 5 V15" stroke="#2a1b3d" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    },
  },
  leaves: {
    motion: "fall",
    count: 16,
    size: [10, 17],
    time: [6, 11],
    spin: true,
    shape: (i) => (
      <svg viewBox="0 0 20 20">
        <path d="M10 1 C15 5 18 10 10 19 C2 10 5 5 10 1Z" fill={LEAVES[i % LEAVES.length]} />
        <path d="M10 3 V18 M10 9 L13.5 6.5 M10 12 L6.5 9.5" stroke="rgba(80,30,0,.45)" strokeWidth="0.9" fill="none" />
      </svg>
    ),
  },
  "rose-petals": {
    motion: "fall",
    count: 18,
    size: [10, 17],
    time: [6, 11],
    spin: true,
    shape: (i) => (
      <svg viewBox="0 0 20 20">
        <path d="M10 19 C3 14 2 7 6 3 C8 1.5 9 3 10 5 C11 3 12 1.5 14 3 C18 7 17 14 10 19Z" fill={["#8a0012", "#c0102a", "#5a0010"][i % 3]} />
      </svg>
    ),
  },
  rain: {
    motion: "fall",
    count: 40,
    size: [14, 26],
    time: [0.7, 1.3],
    shape: () => (
      <svg viewBox="0 0 10 30">
        <path d="M6 0 L4 30" stroke="rgba(190,220,255,.75)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  shooting: {
    motion: "streak",
    count: 7,
    size: [60, 110],
    time: [3.5, 7],
    shape: () => <span className="pfx-streak" />,
  },
};

/* Full-card animated scenes. Sprites and components are sized and moved in container units
   (cqw / cqh of the card), so they look breathtakingly crisp on any card size. */

function Sprite({ cls, style, children }: { cls: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <i className={`pfx-sprite ${cls}`} style={style}>
      {children}
    </i>
  );
}

const ghost = (tint: string) => (
  <svg viewBox="0 0 60 74">
    <g className="pfx-bob">
      <path d="M2 32 C2 12 15 2 30 2 C45 2 58 12 58 32 V70 L48 62 L39 70 L30 62 L21 70 L12 62 L2 70Z" fill={tint} stroke="rgba(120,110,160,.5)" strokeWidth="1.5" />
      <ellipse cx="21" cy="32" rx="4" ry="5.5" fill="#2a2440" />
      <ellipse cx="39" cy="32" rx="4" ry="5.5" fill="#2a2440" />
      <ellipse cx="15" cy="42" rx="4" ry="2.4" fill="#ffadc8" opacity="0.8" />
      <ellipse cx="45" cy="42" rx="4" ry="2.4" fill="#ffadc8" opacity="0.8" />
      <path d="M26 44 Q30 48 34 44" fill="none" stroke="#2a2440" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
);

const jelly = (bell: string, glow: string) => (
  <svg viewBox="0 0 60 110">
    <g className="pfx-pulse-bell">
      <path d="M4 38 C4 14 18 2 30 2 C42 2 56 14 56 38 C46 34 40 40 30 36 C20 40 14 34 4 38Z" fill={bell} opacity="0.85" style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
      <path d="M14 16 C18 10 24 8 28 8" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.4" strokeLinecap="round" />
    </g>
    <g className="pfx-tentacles" fill="none" stroke={glow} strokeWidth="2" strokeLinecap="round" opacity="0.8">
      <path d="M14 38 C10 54 18 66 12 82 C8 92 14 100 12 106" />
      <path d="M24 38 C22 56 28 70 24 90" />
      <path d="M36 38 C38 56 32 70 36 92" />
      <path d="M46 38 C50 54 42 66 48 82 C52 92 46 100 48 106" />
    </g>
  </svg>
);

const bat = (
  <svg viewBox="0 0 60 28" className="pfx-batwing">
    <path d="M30 10 C26 4 22 4 20 8 C14 2 6 4 0 12 C6 12 10 16 12 20 C16 16 22 16 26 20 L30 16 L34 20 C38 16 44 16 48 20 C50 16 54 12 60 12 C54 4 46 2 40 8 C38 4 34 4 30 10Z" fill="#160f22" />
    <circle cx="27.5" cy="11" r="1.1" fill="#ff5d5d" />
    <circle cx="32.5" cy="11" r="1.1" fill="#ff5d5d" />
  </svg>
);

const koi = (body: string, spot: string) => (
  <svg viewBox="0 0 90 40">
    <g className="pfx-wag">
      <path d="M62 20 L86 6 C84 14 84 26 86 34Z" fill={body} opacity="0.9" />
    </g>
    <path d="M4 20 C14 6 44 4 64 20 C44 36 14 34 4 20Z" fill={body} />
    <path d="M30 10 C36 14 38 20 34 26 C28 24 24 18 30 10Z" fill={spot} />
    <path d="M30 6 C34 2 40 2 44 8 M30 34 C34 38 40 38 44 32" fill="none" stroke={body} strokeWidth="4" strokeLinecap="round" />
    <circle cx="13" cy="17" r="2" fill="#1a1a1a" />
  </svg>
);

const paw = (
  <svg viewBox="0 0 80 120">
    <path d="M10 120 C6 80 8 40 40 36 C72 40 74 80 70 120Z" fill="#f2efe9" stroke="#b9b2a8" strokeWidth="2" />
    <path d="M22 70 C22 58 58 58 58 70 C58 80 48 82 40 78 C32 82 22 80 22 70Z" fill="#ff8fb1" />
    {[[18, 52], [31, 44], [49, 44], [62, 52]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="6.5" ry="7.5" fill="#ff8fb1" />)}
  </svg>
);

const GOO: Record<string, [string, string]> = {
  goo: ["#120a1f", "#3b2a5c"],
  "goo-pink": ["#ff4fa3", "#ffb3da"],
  "goo-toxic": ["#2fd14a", "#b6ff8a"],
  "goo-blood": ["#8a0012", "#ff4d5e"],
};

function GooScene({ id }: { id: string }) {
  const [fill, shine] = GOO[id];
  const drips = [8, 21, 33, 47, 58, 71, 84, 94];
  return (
    <>
      <svg className="pfx-goo-top" viewBox="0 0 300 110" preserveAspectRatio="none">
        <path d={`M0 0 H300 V22 ${Array.from({ length: 12 }, (_, i) => `Q${287.5 - i * 25} ${34 + noise(i, 4) * 22} ${275 - i * 25} 22`).join(" ")} Z`} fill={fill} />
        {drips.map((x, i) => (
          <rect key={i} className="pfx-drip" x={x * 3 - 4} y="10" width={10 + noise(i, 2) * 8} height={40 + noise(i, 3) * 60} rx="6" fill={fill} style={{ animationDelay: `${-noise(i, 5) * 4}s`, animationDuration: `${3 + noise(i, 6) * 3}s` }} />
        ))}
        <path d="M10 6 H120" stroke={shine} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      </svg>
      {drips.map((x, i) => (
        <Sprite key={i} cls="pfx-drop" style={{ left: `${x}%`, background: fill, boxShadow: `inset -2px -2px 0 ${shine}`, animationDelay: `${-noise(i, 7) * 5}s`, animationDuration: `${3.5 + noise(i, 8) * 3}s` }}>
          {null}
        </Sprite>
      ))}
    </>
  );
}

/* ---------- Discord-inspired marquee effect components ---------- */

/** 1. Always Watching: Glowing anime demon eyes blinking from dark shadows and a sinister Cheshire fanged grin */
function AlwaysWatchingScene() {
  return (
    <>
      <div className="pfx-watching-vignette" />
      <div className="pfx-watching-shadows">
        <svg viewBox="0 0 300 400" preserveAspectRatio="none" className="pfx-watching-tendrils-svg">
          <path d="M0 0 H300 V35 Q270 70 245 32 Q215 90 195 40 Q165 22 145 60 Q125 95 105 38 Q75 75 55 26 Q25 55 0 22 Z" fill="#060609" />
          <path d="M0 400 H300 V365 Q260 335 225 372 Q185 315 155 362 Q115 325 85 368 Q45 340 0 376 Z" fill="#060609" />
        </svg>
      </div>

      {/* Main piercing demon eyes in upper area */}
      <div className="pfx-watching-eyes-main">
        <svg viewBox="0 0 160 50">
          <defs>
            <radialGradient id="pfx-eye-red" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff1744" />
              <stop offset="60%" stopColor="#c00024" />
              <stop offset="100%" stopColor="#300008" />
            </radialGradient>
            <filter id="pfx-eye-bloom">
              <feGaussianBlur stdDeviation="2" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Left Eye */}
          <g className="pfx-eye-anim-left">
            <path d="M12 25 Q42 6 72 25 Q42 44 12 25 Z" fill="#0a0508" stroke="#ff1744" strokeWidth="1.2" filter="url(#pfx-eye-bloom)" />
            <ellipse cx="42" cy="25" rx="12" ry="12" fill="url(#pfx-eye-red)" className="pfx-eye-pupil" />
            <ellipse cx="42" cy="25" rx="3.5" ry="9" fill="#040001" className="pfx-eye-slit" />
            <circle cx="38" cy="21" r="2.5" fill="#fff" opacity="0.95" />
            <circle cx="45" cy="28" r="1.3" fill="#ffb4bc" opacity="0.8" />
            <path d="M8 25 C25 6 55 6 76 22" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          </g>
          {/* Right Eye */}
          <g className="pfx-eye-anim-right">
            <path d="M88 25 Q118 6 148 25 Q118 44 88 25 Z" fill="#0a0508" stroke="#ff1744" strokeWidth="1.2" filter="url(#pfx-eye-bloom)" />
            <ellipse cx="118" cy="25" rx="12" ry="12" fill="url(#pfx-eye-red)" className="pfx-eye-pupil" />
            <ellipse cx="118" cy="25" rx="3.5" ry="9" fill="#040001" className="pfx-eye-slit" />
            <circle cx="114" cy="21" r="2.5" fill="#fff" opacity="0.95" />
            <circle cx="121" cy="28" r="1.3" fill="#ffb4bc" opacity="0.8" />
            <path d="M84 22 C105 6 135 6 152 25" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      {/* Creepy Cheshire / demon sharp fanged grin on bottom right */}
      <div className="pfx-watching-grin">
        <svg viewBox="0 0 140 70">
          <path d="M10 20 Q70 65 130 20 Q70 42 10 20 Z" fill="#140004" stroke="#7a0014" strokeWidth="1.5" />
          {/* Upper teeth */}
          <path d="M22 25 L28 32 L34 26 L42 34 L50 27 L60 36 L70 28 L80 36 L90 27 L98 34 L106 26 L112 32 L118 25" fill="#f8fafc" stroke="#330a10" strokeWidth="1" />
          {/* Lower teeth */}
          <path d="M26 31 L32 25 L38 33 L48 24 L56 34 L66 25 L76 35 L86 25 L94 34 L104 25 L110 31" fill="#f8fafc" stroke="#330a10" strokeWidth="1" />
          {/* Drool */}
          <path d="M68 34 C68 44 72 48 70 52 C68 56 64 56 64 52" fill="none" stroke="#ff1744" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
        </svg>
      </div>

      {/* Secondary creepy glowing eyes in shadow */}
      <div className="pfx-watching-side-eye">
        <svg viewBox="0 0 60 25">
          <path d="M5 12 Q30 2 55 12 Q30 22 5 12 Z" fill="#090508" stroke="#ff0055" strokeWidth="1.2" />
          <ellipse cx="30" cy="12" rx="7" ry="7" fill="#ff0055" />
          <ellipse cx="30" cy="12" rx="2" ry="5.5" fill="#000" />
          <circle cx="28" cy="10" r="1.5" fill="#fff" />
        </svg>
      </div>
    </>
  );
}

/** 2. Starfall Rings: Concentric rotating golden astrolabe rings and celestial stardust */
function StarfallRingsScene() {
  return (
    <>
      <div className="pfx-astrolabe-wrap">
        <svg viewBox="-150 -150 300 300" className="pfx-astrolabe-svg">
          <defs>
            <filter id="pfx-gold-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="pfx-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff6c4" />
              <stop offset="40%" stopColor="#ffd700" />
              <stop offset="70%" stopColor="#e5a910" />
              <stop offset="100%" stopColor="#ffea79" />
            </linearGradient>
          </defs>

          {/* Outer Astrolabe Ring with Zodiac Coordinates (CW spin) */}
          <g className="pfx-astro-outer" filter="url(#pfx-gold-glow)">
            <circle r="126" fill="none" stroke="url(#pfx-gold-grad)" strokeWidth="1.6" opacity="0.8" />
            <circle r="133" fill="none" stroke="url(#pfx-gold-grad)" strokeWidth="0.8" strokeDasharray="3 7" opacity="0.65" />
            {Array.from({ length: 12 }, (_, i) => (
              <g key={i} transform={`rotate(${i * 30})`}>
                <line x1="0" y1="-126" x2="0" y2="-133" stroke="#ffd700" strokeWidth="1.8" />
                <circle cx="0" cy="-120" r="2.2" fill="#fff" />
              </g>
            ))}
            <circle cx="126" cy="0" r="4.5" fill="#fff" stroke="#ffd700" strokeWidth="1.5" />
          </g>

          {/* Middle Armillary Ring with Astrological Diamonds (CCW spin) */}
          <g className="pfx-astro-mid" filter="url(#pfx-gold-glow)">
            <circle r="96" fill="none" stroke="url(#pfx-gold-grad)" strokeWidth="1.8" strokeDasharray="18 6 4 6" opacity="0.85" />
            <circle r="88" fill="none" stroke="#e5a910" strokeWidth="0.9" opacity="0.5" />
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} transform={`rotate(${i * 45})`}>
                <polygon points="0,-99 3,-96 0,-93 -3,-96" fill="#ffd700" />
              </g>
            ))}
            <circle cx="-68" cy="68" r="3.5" fill="#fff3b0" />
          </g>

          {/* 3D Tilted Gyroscope Ellipse Ring */}
          <g className="pfx-astro-tilt">
            <ellipse rx="82" ry="34" fill="none" stroke="url(#pfx-gold-grad)" strokeWidth="1.4" opacity="0.75" strokeDasharray="12 4" />
            <circle cx="82" cy="0" r="3.2" fill="#ffffff" />
          </g>

          {/* 8-Point Sacred Compass Rose Star in Center */}
          <g className="pfx-astro-center-star" filter="url(#pfx-gold-glow)">
            <path d="M0 -38 L5 -12 L30 0 L5 12 L0 38 L-5 12 L-30 0 L-5 -12 Z" fill="url(#pfx-gold-grad)" />
            <path d="M0 -24 L4 -8 L20 0 L4 8 L0 24 L-4 8 L-20 0 L-4 -8 Z" fill="#ffffff" opacity="0.9" />
            <circle r="4" fill="#fff" />
          </g>
        </svg>
      </div>
      <div className="pfx-astrolabe-rays" />
    </>
  );
}

/** 3. Arcane Vortex: Swirling luminous magic portal with rotating rune circles */
function ArcaneVortexScene() {
  return (
    <>
      <div className="pfx-vortex-wrap">
        <svg viewBox="-140 -140 280 280" className="pfx-vortex-svg">
          <defs>
            <filter id="pfx-vortex-bloom" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="pfx-vortex-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="25%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#818cf8" />
              <stop offset="90%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Swirling Arcane Spiral Arms */}
          <g className="pfx-vortex-spin" filter="url(#pfx-vortex-bloom)">
            {[0, 90, 180, 270].map((deg) => (
              <path
                key={deg}
                transform={`rotate(${deg})`}
                d="M0 0 C15 -25 45 -40 80 -45 C115 -50 125 -15 130 10 C105 -5 70 -15 40 -8 C20 -4 5 0 0 0 Z"
                fill="url(#pfx-vortex-core)"
                opacity="0.8"
              />
            ))}
          </g>

          {/* Counter-rotating mystic rune circle */}
          <g className="pfx-vortex-runes">
            <circle r="92" fill="none" stroke="#38bdf8" strokeWidth="1.6" strokeDasharray="14 8 2 8" opacity="0.85" />
            <circle r="105" fill="none" stroke="#c084fc" strokeWidth="1.1" strokeDasharray="6 12" opacity="0.7" />
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} transform={`rotate(${i * 45}) translate(0, -98)`}>
                <polygon points="0,-4 3,0 0,4 -3,0" fill="#38bdf8" />
                <circle cy="-6" r="1.5" fill="#fff" />
              </g>
            ))}
          </g>

          {/* Central Pulsing Singularity Core */}
          <circle r="22" fill="#fff" className="pfx-vortex-core-pulse" filter="url(#pfx-vortex-bloom)" />
          <circle r="12" fill="#38bdf8" opacity="0.9" />
          <circle r="5" fill="#fff" />
        </svg>
      </div>
      <div className="pfx-vortex-ambient" />
    </>
  );
}

/** 4. Cloud Nine: Forest canopy overhead with volumetric god rays and falling leaves */
function CloudNineScene() {
  return (
    <>
      <div className="pfx-godrays-container">
        <div className="pfx-godray pfx-godray-1" />
        <div className="pfx-godray pfx-godray-2" />
        <div className="pfx-godray pfx-godray-3" />
        <div className="pfx-godray pfx-godray-4" />
      </div>

      <div className="pfx-canopy-top">
        <svg viewBox="0 0 360 140" preserveAspectRatio="none" className="pfx-canopy-svg">
          <defs>
            <linearGradient id="pfx-pine-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0d1b11" />
              <stop offset="50%" stopColor="#1b3622" />
              <stop offset="100%" stopColor="#2e5436" />
            </linearGradient>
            <filter id="pfx-sun-bloom">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Left Branch & Needles */}
          <path
            d="M-10 -10 Q60 25 140 18 Q100 45 60 48 Q110 58 160 52 Q120 75 70 76 Q130 92 180 82 Q120 110 50 105 Q-10 115 -10 -10 Z"
            fill="url(#pfx-pine-grad)"
          />
          {/* Right Branch & Needles */}
          <path
            d="M370 -10 Q300 28 220 20 Q260 45 300 48 Q250 62 195 56 Q240 80 290 80 Q230 102 170 94 Q250 120 370 108 Z"
            fill="url(#pfx-pine-grad)"
          />
          {/* Sunburst flare in upper opening */}
          <circle cx="180" cy="8" r="30" fill="#fff5cc" opacity="0.65" filter="url(#pfx-sun-bloom)" className="pfx-sun-pulse" />
        </svg>
      </div>
      <div className="pfx-sun-ambient-glow" />
    </>
  );
}

/** 5. Nevermore: Midnight ravens swooping across a misty sky with tumbling black feathers */
function NevermoreScene() {
  return (
    <>
      <div className="pfx-nevermore-moon">
        <svg viewBox="0 0 80 80">
          <defs>
            <radialGradient id="pfx-pale-moon" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#f0f9ff" />
              <stop offset="55%" stopColor="#bae6fd" />
              <stop offset="90%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <filter id="pfx-moon-glow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="40" cy="40" r="30" fill="url(#pfx-pale-moon)" filter="url(#pfx-moon-glow)" />
          <circle cx="32" cy="34" r="5" fill="#7dd3fc" opacity="0.35" />
          <circle cx="48" cy="48" r="7" fill="#7dd3fc" opacity="0.3" />
        </svg>
      </div>

      <div className="pfx-nevermore-branch">
        <svg viewBox="0 0 160 90">
          <path d="M-10 10 Q50 25 90 20 Q120 18 150 10 Q115 28 80 28 Q105 45 130 52 Q95 48 70 38 Q50 55 30 75 Q42 52 25 40 Q5 50 -10 60 Z" fill="#090a10" />
        </svg>
      </div>

      {/* Swooping Ravens */}
      <div className="pfx-raven pfx-raven-1">
        <svg viewBox="0 0 54 28" className="pfx-raven-wings">
          <path d="M27 12 C22 4 15 2 4 4 C10 10 16 14 20 18 C14 20 6 22 2 26 C12 24 20 20 27 16 C34 20 42 24 52 26 C48 22 40 20 34 18 C38 14 44 10 50 4 C39 2 32 4 27 12 Z" fill="#0a0b12" stroke="#1e293b" strokeWidth="0.8" />
        </svg>
      </div>
      <div className="pfx-raven pfx-raven-2">
        <svg viewBox="0 0 54 28" className="pfx-raven-wings pfx-raven-delay">
          <path d="M27 12 C22 4 15 2 4 4 C10 10 16 14 20 18 C14 20 6 22 2 26 C12 24 20 20 27 16 C34 20 42 24 52 26 C48 22 40 20 34 18 C38 14 44 10 50 4 C39 2 32 4 27 12 Z" fill="#0a0b12" stroke="#1e293b" strokeWidth="0.8" />
        </svg>
      </div>
      <div className="pfx-raven pfx-raven-3">
        <svg viewBox="0 0 54 28" className="pfx-raven-wings pfx-raven-delay2">
          <path d="M27 12 C22 4 15 2 4 4 C10 10 16 14 20 18 C14 20 6 22 2 26 C12 24 20 20 27 16 C34 20 42 24 52 26 C48 22 40 20 34 18 C38 14 44 10 50 4 C39 2 32 4 27 12 Z" fill="#0a0b12" stroke="#1e293b" strokeWidth="0.8" />
        </svg>
      </div>

      {/* Tumbling black feathers */}
      <div className="pfx-feathers-container">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`pfx-feather pfx-feather-${i}`}>
            <svg viewBox="0 0 20 40">
              <path d="M10 2 C16 10 17 25 10 38 C3 25 4 10 10 2 Z" fill="#0c0d16" stroke="#334155" strokeWidth="0.7" />
              <path d="M10 2 V38" stroke="#64748b" strokeWidth="0.8" />
            </svg>
          </div>
        ))}
      </div>

      <div className="pfx-nevermore-mist" />
    </>
  );
}

/** 6. Symbiote: Massive comic-book Venom beast lunging in with razor fangs, white eye, and lashing tongue */
function SymbioteScene() {
  return (
    <>
      <div className="pfx-symbiote-bg" />
      {/* Massive Comic Venom Monster Illustration */}
      <div className="pfx-symbiote-beast">
        <svg viewBox="0 0 260 300" className="pfx-venom-svg">
          <defs>
            <linearGradient id="pfx-venom-skin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e0b2b" />
              <stop offset="45%" stopColor="#08020d" />
              <stop offset="85%" stopColor="#030105" />
            </linearGradient>
            <linearGradient id="pfx-venom-rim" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            <linearGradient id="pfx-venom-gum" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#991b1b" />
              <stop offset="100%" stopColor="#450a0a" />
            </linearGradient>
            <filter id="pfx-venom-bloom">
              <feDropShadow dx="-4" dy="4" stdDeviation="6" floodColor="#7c3aed" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Venom Head Dome & Jaw Base */}
          <path
            d="M90 10 C140 10 200 30 240 70 C270 110 260 170 230 210 C190 260 110 280 50 260 C70 230 90 200 80 160 C70 120 40 80 90 10 Z"
            fill="url(#pfx-venom-skin)"
            stroke="url(#pfx-venom-rim)"
            strokeWidth="3.5"
            filter="url(#pfx-venom-bloom)"
          />

          {/* Iconic Jagged White Venom Eye */}
          <path
            d="M120 45 C155 35 190 55 210 80 C185 85 160 80 140 72 C125 65 115 52 120 45 Z"
            fill="#ffffff"
            stroke="#1e0b2b"
            strokeWidth="2.5"
            className="pfx-venom-eye-glow"
          />
          <path d="M135 52 C160 48 185 62 198 75 C180 77 160 72 145 66 Z" fill="#f1f5f9" />

          {/* Red Gums & Deep Throat */}
          <path
            d="M75 105 C130 95 185 115 210 145 C190 190 140 220 85 205 C110 175 120 145 75 105 Z"
            fill="url(#pfx-venom-gum)"
            stroke="#260408"
            strokeWidth="2"
          />
          <path d="M95 125 C135 120 170 135 185 155 C165 185 130 195 105 180 Z" fill="#180205" />

          {/* Upper Jaw Needle Teeth */}
          <path
            d="M78 108 L90 128 L98 110 L112 135 L120 112 L138 140 L148 115 L168 142 L178 120 L195 145 L204 130"
            fill="#ffffff"
            stroke="#450a0a"
            strokeWidth="1.8"
          />
          {/* Lower Jaw Needle Teeth */}
          <path
            d="M86 195 L98 172 L108 198 L122 168 L132 195 L150 165 L162 192 L180 162 L192 188 L202 170"
            fill="#ffffff"
            stroke="#450a0a"
            strokeWidth="1.8"
          />

          {/* Long Serpentine Whip Tongue */}
          <path
            d="M125 150 C70 145 10 180 25 225 C40 265 105 240 140 210 C165 188 180 170 125 150 Z"
            fill="#f43f5e"
            stroke="#9f1239"
            strokeWidth="3"
            className="pfx-venom-tongue-whip"
          />
          <path
            d="M115 155 C75 155 30 185 40 215 C50 240 95 230 125 205"
            fill="none"
            stroke="#fda4af"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Saliva Strands */}
          <line x1="112" y1="130" x2="108" y2="185" stroke="#ffffff" strokeWidth="1.6" opacity="0.8" strokeDasharray="6 3" />
          <line x1="168" y1="138" x2="162" y2="175" stroke="#ffffff" strokeWidth="1.6" opacity="0.8" strokeDasharray="6 3" />
        </svg>
      </div>

      <div className="pfx-symbiote-tendrils-layer">
        <svg viewBox="0 0 300 400" preserveAspectRatio="none" className="pfx-tendril-svg">
          <path d="M0 0 Q40 50 15 100 Q-10 150 20 180 Q-5 230 15 280 Q-10 340 25 400 H0 Z" fill="#08020d" />
          <path d="M180 0 Q220 30 260 15 Q300 0 300 0 V90 Q260 65 240 40 Z" fill="#08020d" />
        </svg>
      </div>
    </>
  );
}

/** Manga Hand: Giant illustrated ink manga hand clutching the card with cursed spirit aura */
function MangaHandScene() {
  return (
    <>
      <div className="pfx-manga-speedlines" />
      <div className="pfx-manga-hand-wrap">
        <svg viewBox="0 0 280 340" className="pfx-manga-hand-svg">
          <defs>
            <filter id="pfx-cursed-bloom">
              <feGaussianBlur stdDeviation="8" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="pfx-cursed-energy" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b0764" />
              <stop offset="50%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
          </defs>

          {/* Cursed Spirit Flame Aura behind hand */}
          <g filter="url(#pfx-cursed-bloom)" className="pfx-cursed-aura-flicker">
            <path
              d="M120 40 C70 10 30 60 50 110 C20 130 10 180 40 220 C20 260 40 310 90 320 C140 330 210 340 260 300 C290 240 280 150 260 90 C220 50 170 80 120 40 Z"
              fill="url(#pfx-cursed-energy)"
              opacity="0.75"
            />
          </g>

          {/* Massive Detailed Manga Hand */}
          <g className="pfx-hand-ink">
            {/* Wrist / Forearm */}
            <path d="M190 340 L280 340 L270 240 L170 270 Z" fill="#f8fafc" stroke="#000000" strokeWidth="4" />
            <line x1="200" y1="310" x2="250" y2="295" stroke="#000" strokeWidth="2.5" />
            <line x1="205" y1="325" x2="255" y2="310" stroke="#000" strokeWidth="2.5" />

            {/* Palm & Thumb */}
            <path
              d="M110 240 C90 200 80 160 110 130 C125 115 145 125 140 150 C135 170 150 200 175 220 L195 280 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path d="M112 135 C118 128 128 130 132 140" fill="none" stroke="#000" strokeWidth="2.8" />
            <ellipse cx="122" cy="134" rx="5" ry="4" fill="#000" />

            {/* Index Finger */}
            <path
              d="M140 150 C120 110 90 70 60 75 C45 78 48 95 62 105 C85 120 115 155 130 185 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <line x1="72" y1="88" x2="88" y2="108" stroke="#000" strokeWidth="2.4" />
            <line x1="95" y1="120" x2="115" y2="140" stroke="#000" strokeWidth="2.4" />

            {/* Middle Finger */}
            <path
              d="M165 140 C145 90 110 30 75 35 C60 38 62 55 78 68 C105 90 140 145 155 175 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <line x1="90" y1="52" x2="108" y2="72" stroke="#000" strokeWidth="2.4" />
            <line x1="118" y1="88" x2="138" y2="112" stroke="#000" strokeWidth="2.4" />

            {/* Ring Finger */}
            <path
              d="M190 155 C180 110 150 65 120 70 C105 73 110 90 124 100 C150 120 175 160 180 190 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <line x1="135" y1="85" x2="152" y2="105" stroke="#000" strokeWidth="2.4" />

            {/* Pinky Finger */}
            <path
              d="M215 180 C210 145 190 110 165 115 C152 118 156 132 170 142 C190 158 205 190 205 215 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="4"
              strokeLinejoin="round"
            />

            {/* Palm Shadow / Manga Crosshatch shading */}
            <path d="M145 220 Q160 250 180 260" fill="none" stroke="#000" strokeWidth="3" />
            <path d="M130 195 Q150 220 165 240" fill="none" stroke="#000" strokeWidth="2.5" />
            <path d="M120 175 Q135 190 150 210" fill="none" stroke="#000" strokeWidth="2.5" />
          </g>
        </svg>
      </div>
    </>
  );
}

/** Oni Spirit: Fierce Japanese demon mask with flaming horns and spirit smoke */
function OniMaskScene() {
  return (
    <>
      <div className="pfx-oni-ambient" />
      <div className="pfx-oni-mask-wrap">
        <svg viewBox="0 0 240 260" className="pfx-oni-svg">
          <defs>
            <linearGradient id="pfx-oni-red" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="60%" stopColor="#b91c1c" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </linearGradient>
            <linearGradient id="pfx-oni-gold" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fffbeb" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <filter id="pfx-oni-bloom">
              <feGaussianBlur stdDeviation="4" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Golden Curving Horns */}
          <g filter="url(#pfx-oni-bloom)">
            <path d="M60 90 C45 40 10 10 0 0 C25 20 55 50 80 85 Z" fill="url(#pfx-oni-gold)" stroke="#78350f" strokeWidth="2" />
            <path d="M180 90 C195 40 230 10 240 0 C215 20 185 50 160 85 Z" fill="url(#pfx-oni-gold)" stroke="#78350f" strokeWidth="2" />
          </g>

          {/* Main Oni Face */}
          <path
            d="M40 90 C30 140 45 190 70 230 C90 255 150 255 170 230 C195 190 210 140 200 90 C170 75 70 75 40 90 Z"
            fill="url(#pfx-oni-red)"
            stroke="#450a0a"
            strokeWidth="3.5"
          />

          {/* Forehead Wrath Wrinkles */}
          <path d="M80 100 Q120 115 160 100" fill="none" stroke="#450a0a" strokeWidth="3" strokeLinecap="round" />
          <path d="M90 115 Q120 125 150 115" fill="none" stroke="#450a0a" strokeWidth="2.5" strokeLinecap="round" />
          <polygon points="120,80 128,95 112,95" fill="url(#pfx-oni-gold)" />

          {/* Glowing Fierce Eyes */}
          <g filter="url(#pfx-oni-bloom)">
            <ellipse cx="80" cy="135" rx="14" ry="9" fill="#fef08a" stroke="#000" strokeWidth="2" />
            <circle cx="80" cy="135" r="5" fill="#dc2626" />
            <circle cx="78" cy="133" r="2" fill="#fff" />

            <ellipse cx="160" cy="135" rx="14" ry="9" fill="#fef08a" stroke="#000" strokeWidth="2" />
            <circle cx="160" cy="135" r="5" fill="#dc2626" />
            <circle cx="158" cy="133" r="2" fill="#fff" />
          </g>

          {/* Gaping Mouth & Tusks */}
          <path d="M65 195 Q120 230 175 195 Q120 205 65 195 Z" fill="#180205" stroke="#450a0a" strokeWidth="2" />
          <polygon points="75,200 85,170 95,202" fill="#fff" stroke="#450a0a" strokeWidth="1.5" />
          <polygon points="165,200 155,170 145,202" fill="#fff" stroke="#450a0a" strokeWidth="1.5" />
          <path d="M95 198 L105 190 L115 199 L125 190 L135 199 L145 198" fill="#fff" stroke="#450a0a" strokeWidth="1.2" />
        </svg>
      </div>
    </>
  );
}

/** 7. Cyber Overdrive: Sci-fi targeting reticle, radar sweep line and glitch grid */
function CyberHudScene() {
  return (
    <>
      <div className="pfx-hud-reticle">
        <svg viewBox="-80 -80 160 160">
          <defs>
            <filter id="pfx-hud-cyan-glow">
              <feGaussianBlur stdDeviation="2.5" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g className="pfx-hud-bracket-spin" filter="url(#pfx-hud-cyan-glow)">
            <path d="M -60 -20 A 65 65 0 0 1 -20 -60" fill="none" stroke="#00f0ff" strokeWidth="2.5" />
            <path d="M 20 -60 A 65 65 0 0 1 60 -20" fill="none" stroke="#00f0ff" strokeWidth="2.5" />
            <path d="M 60 20 A 65 65 0 0 1 20 60" fill="none" stroke="#00f0ff" strokeWidth="2.5" />
            <path d="M -20 60 A 65 65 0 0 1 -60 20" fill="none" stroke="#00f0ff" strokeWidth="2.5" />
          </g>
          <circle r="46" fill="none" stroke="#ff007f" strokeWidth="1" strokeDasharray="4 8" opacity="0.8" />
          <line x1="-54" y1="0" x2="-38" y2="0" stroke="#00f0ff" strokeWidth="1.5" />
          <line x1="38" y1="0" x2="54" y2="0" stroke="#00f0ff" strokeWidth="1.5" />
          <line x1="0" y1="-54" x2="0" y2="-38" stroke="#00f0ff" strokeWidth="1.5" />
          <line x1="0" y1="38" x2="0" y2="54" stroke="#00f0ff" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="pfx-hud-brackets">
        <svg viewBox="0 0 300 400" preserveAspectRatio="none" className="pfx-hud-corner-svg">
          <path d="M260 12 H288 V40" fill="none" stroke="#00f0ff" strokeWidth="2" />
          <path d="M12 360 V388 H40" fill="none" stroke="#00f0ff" strokeWidth="2" />
          <text x="210" y="24" fill="#00f0ff" fontSize="8" fontFamily="monospace" letterSpacing="1">SYS:ONLINE</text>
          <text x="235" y="34" fill="#ff007f" fontSize="7" fontFamily="monospace">99.8%</text>
        </svg>
      </div>

      <div className="pfx-hud-scanner-beam" />
    </>
  );
}

/** 8. Soul Flame: Roaring violet & cyan demonic flames licking the card */
function SoulFlameScene() {
  return (
    <>
      <div className="pfx-flame-container">
        <svg viewBox="0 0 300 200" preserveAspectRatio="none" className="pfx-flames-svg">
          <defs>
            <linearGradient id="pfx-soul-deep" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#1e0533" />
              <stop offset="50%" stopColor="#4c1d95" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id="pfx-soul-mid" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#6d28d9" />
              <stop offset="60%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#e879f9" />
            </linearGradient>
            <linearGradient id="pfx-soul-cyan" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <filter id="pfx-soul-bloom">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            className="pfx-flame-layer-1"
            d="M0 200 L0 80 Q25 120 50 60 Q75 140 100 40 Q130 110 160 50 Q190 130 220 30 Q255 110 280 70 L300 90 L300 200 Z"
            fill="url(#pfx-soul-deep)"
            opacity="0.8"
          />
          <path
            className="pfx-flame-layer-2"
            d="M0 200 L0 110 Q35 150 70 85 Q110 160 145 75 Q185 145 215 90 Q260 150 300 100 L300 200 Z"
            fill="url(#pfx-soul-mid)"
            filter="url(#pfx-soul-bloom)"
            opacity="0.9"
          />
          <path
            className="pfx-flame-layer-3"
            d="M20 200 Q50 140 75 120 Q100 170 135 110 Q170 160 200 115 Q240 160 270 130 L290 200 Z"
            fill="url(#pfx-soul-cyan)"
            filter="url(#pfx-soul-bloom)"
          />
        </svg>
      </div>
      <div className="pfx-flame-glow-pulse" />
    </>
  );
}

/** 9. Pixel Arcade: 8-bit hero with rainbow star streak, pixel hearts and CRT scanlines */
function PixelArcadeScene() {
  return (
    <>
      <div className="pfx-arcade-crt" />
      {/* Rainbow trail stretching across the top */}
      <div className="pfx-arcade-rainbow">
        <svg viewBox="0 0 320 60" preserveAspectRatio="none" className="pfx-rainbow-svg">
          <path d="M-20 25 Q80 15 180 35 Q260 50 340 30" stroke="#ff0000" strokeWidth="4" fill="none" opacity="0.85" />
          <path d="M-20 29 Q80 19 180 39 Q260 54 340 34" stroke="#ff9900" strokeWidth="4" fill="none" opacity="0.85" />
          <path d="M-20 33 Q80 23 180 43 Q260 58 340 38" stroke="#ffff00" strokeWidth="4" fill="none" opacity="0.85" />
          <path d="M-20 37 Q80 27 180 47 Q260 62 340 42" stroke="#33ff00" strokeWidth="4" fill="none" opacity="0.85" />
          <path d="M-20 41 Q80 31 180 51 Q260 66 340 46" stroke="#0099ff" strokeWidth="4" fill="none" opacity="0.85" />
          <path d="M-20 45 Q80 35 180 55 Q260 70 340 50" stroke="#9900ff" strokeWidth="4" fill="none" opacity="0.85" />
        </svg>
      </div>

      {/* Flying 8-Bit Cat / Hero */}
      <div className="pfx-arcade-hero">
        <svg viewBox="0 0 34 22" className="pfx-pixel-hero-svg">
          <rect x="8" y="2" width="18" height="14" fill="#ffd27d" stroke="#000" strokeWidth="1" />
          <rect x="10" y="4" width="14" height="10" fill="#ff99bb" />
          <rect x="12" y="6" width="2" height="2" fill="#ff0055" />
          <rect x="18" y="5" width="2" height="2" fill="#00ffff" />
          <rect x="15" y="10" width="2" height="2" fill="#ffff00" />
          <rect x="20" y="9" width="2" height="2" fill="#ff0055" />
          <rect x="22" y="5" width="10" height="9" fill="#999999" stroke="#000" strokeWidth="1" />
          <polygon points="23,5 25,1 27,5" fill="#999" stroke="#000" strokeWidth="1" />
          <polygon points="28,5 30,1 32,5" fill="#999" stroke="#000" strokeWidth="1" />
          <rect x="25" y="8" width="2" height="2" fill="#000" />
          <rect x="29" y="8" width="2" height="2" fill="#000" />
          <rect x="23" y="10" width="2" height="2" fill="#ff3366" />
          <rect x="31" y="10" width="2" height="2" fill="#ff3366" />
        </svg>
      </div>

      {/* Floating 8-bit Pixel Sprites */}
      <div className="pfx-arcade-sprites">
        <div className="pfx-pixel-item pfx-pixel-coin">
          <svg viewBox="0 0 16 16" className="pfx-pixel-art">
            <rect x="4" y="1" width="8" height="2" fill="#ffd700" />
            <rect x="2" y="3" width="12" height="10" fill="#ffd700" />
            <rect x="4" y="13" width="8" height="2" fill="#ffd700" />
            <rect x="5" y="4" width="6" height="8" fill="#fff3a8" />
            <rect x="7" y="5" width="2" height="6" fill="#cca000" />
          </svg>
        </div>
        <div className="pfx-pixel-item pfx-pixel-heart">
          <svg viewBox="0 0 16 16" className="pfx-pixel-art">
            <rect x="2" y="2" width="4" height="2" fill="#ff2a6d" />
            <rect x="10" y="2" width="4" height="2" fill="#ff2a6d" />
            <rect x="1" y="4" width="14" height="4" fill="#ff2a6d" />
            <rect x="3" y="8" width="10" height="2" fill="#ff2a6d" />
            <rect x="5" y="10" width="6" height="2" fill="#ff2a6d" />
            <rect x="7" y="12" width="2" height="2" fill="#ff2a6d" />
            <rect x="3" y="3" width="2" height="2" fill="#fff" />
          </svg>
        </div>
        <div className="pfx-pixel-item pfx-pixel-star">
          <svg viewBox="0 0 16 16" className="pfx-pixel-art">
            <rect x="7" y="1" width="2" height="14" fill="#05d9e8" />
            <rect x="1" y="7" width="14" height="2" fill="#05d9e8" />
            <rect x="4" y="4" width="8" height="8" fill="#fff" />
          </svg>
        </div>
        <div className="pfx-pixel-item pfx-pixel-badge">
          <span>1UP</span>
        </div>
      </div>
    </>
  );
}

/** 10. Singularity: Gravitational lensing black hole accretion disk */
function BlackHoleScene() {
  return (
    <>
      <div className="pfx-singularity-wrap">
        <svg viewBox="-120 -120 240 240" className="pfx-singularity-svg">
          <defs>
            <filter id="pfx-bh-bloom">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="pfx-accretion-grad" cx="50%" cy="50%" r="50%">
              <stop offset="35%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="70%" stopColor="#8b5cf6" />
              <stop offset="85%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          <ellipse rx="100" ry="85" fill="none" stroke="rgba(168, 85, 247, 0.4)" strokeWidth="16" filter="url(#pfx-bh-bloom)" />

          <g className="pfx-accretion-spin" filter="url(#pfx-bh-bloom)">
            <ellipse rx="105" ry="32" fill="none" stroke="url(#pfx-accretion-grad)" strokeWidth="18" strokeDasharray="30 8 18 12" />
            <ellipse rx="85" ry="24" fill="none" stroke="#fff" strokeWidth="3" opacity="0.85" />
          </g>

          <circle r="36" fill="#020205" stroke="#fff" strokeWidth="1.2" />
          <circle r="37.5" fill="none" stroke="#67e8f9" strokeWidth="1.5" opacity="0.9" />
        </svg>
      </div>
    </>
  );
}

/** 11. Sakura Whirlwind: Flowering branch with a vortex of fluttering cherry petals */
function SakuraStormScene() {
  return (
    <>
      <div className="pfx-sakura-branch">
        <svg viewBox="0 0 200 120">
          <path d="M-10 10 Q60 30 110 20 Q140 15 170 5 Q135 25 100 28 Q60 55 20 80 Q35 50 10 35 Z" fill="#38211b" />
          <Flower x={60} y={24} r={11} petal="#ffb3cb" heart="#ff4081" rotate={12} />
          <Flower x={105} y={22} r={13} petal="#ffd1dc" heart="#e91e63" rotate={-25} />
          <Flower x={155} y={10} r={9} petal="#ffb3cb" heart="#ff4081" rotate={40} />
          <Flower x={35} y={48} r={10} petal="#ffe0e9" heart="#e91e63" rotate={-10} />
          <ellipse cx={82} cy={16} rx="4" ry="2.5" fill="#f48fb1" transform="rotate(-20 82 16)" />
          <ellipse cx={135} cy={12} rx="4" ry="2.5" fill="#f48fb1" transform="rotate(30 135 12)" />
        </svg>
      </div>

      <div className="pfx-sakura-wind">
        <svg viewBox="0 0 300 400" preserveAspectRatio="none" className="pfx-wind-svg">
          <path d="M-20 80 Q150 40 220 180 Q290 320 120 380" fill="none" stroke="rgba(255, 192, 203, 0.45)" strokeWidth="3" strokeDasharray="60 120" className="pfx-wind-dash" />
          <path d="M320 120 Q160 160 120 260 Q80 360 200 420" fill="none" stroke="rgba(255, 230, 240, 0.35)" strokeWidth="2" strokeDasharray="40 90" className="pfx-wind-dash-b" />
        </svg>
      </div>

      <div className="pfx-sakura-petals-vortex">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className={`pfx-vortex-petal pfx-petal-${i}`}>
            <svg viewBox="0 0 24 24">
              <path d="M12 2 C18 6 22 13 12 22 C2 13 6 6 12 2 Z" fill={i % 2 === 0 ? "#ff85a1" : "#ffb3c6"} opacity="0.9" />
              <path d="M12 4 V20" stroke="#f43f5e" strokeWidth="0.8" opacity="0.45" />
            </svg>
          </div>
        ))}
      </div>
    </>
  );
}

/** 12. Thunderstorm: Rolling dark storm clouds, branching lightning strikes & rain */
function ThunderstormScene() {
  return (
    <>
      <div className="pfx-storm-flash" />
      <div className="pfx-storm-clouds">
        <svg viewBox="0 0 360 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pfx-cloud-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0b0f19" />
              <stop offset="60%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          <path d="M0 0 H360 V40 Q330 65 290 50 Q250 75 200 55 Q160 70 120 48 Q80 75 40 50 Q15 60 0 45 Z" fill="url(#pfx-cloud-grad)" />
        </svg>
      </div>

      <div className="pfx-lightning-bolt-wrap">
        <svg viewBox="0 0 200 320" className="pfx-lightning-svg">
          <defs>
            <filter id="pfx-lightning-glow">
              <feGaussianBlur stdDeviation="3.5" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#pfx-lightning-glow)">
            <path d="M110 0 L102 45 L125 52 L95 110 L115 118 L80 185 L98 192 L65 270 L80 278 L45 320" fill="none" stroke="#e0f2fe" strokeWidth="2.8" strokeLinejoin="miter" />
            <path d="M102 45 L75 80 L88 86 L60 130" fill="none" stroke="#7dd3fc" strokeWidth="1.6" />
            <path d="M95 110 L135 150 L125 158 L150 195" fill="none" stroke="#7dd3fc" strokeWidth="1.4" />
          </g>
        </svg>
      </div>

      <div className="pfx-storm-rain" />
    </>
  );
}

/** 13. Enhanced Blood Moon with lunar texture, corona halo, and bat flock */
function BloodMoonScene() {
  return (
    <>
      <Sprite cls="pfx-moon pfx-moon-blood">
        <svg viewBox="0 0 100 100">
          <defs>
            <radialGradient id="pfx-blood-grad" cx="42%" cy="42%" r="58%">
              <stop offset="0%" stopColor="#ff4d6d" />
              <stop offset="50%" stopColor="#c0102a" />
              <stop offset="85%" stopColor="#7a0014" />
              <stop offset="100%" stopColor="#300008" />
            </radialGradient>
            <filter id="pfx-blood-corona">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="#ff1744" strokeWidth="3" opacity="0.6" filter="url(#pfx-blood-corona)" />
          <circle cx="50" cy="50" r="42" fill="url(#pfx-blood-grad)" />
          <ellipse cx="38" cy="38" rx="9" ry="7" fill="#50000e" opacity="0.6" />
          <ellipse cx="62" cy="58" rx="12" ry="9" fill="#50000e" opacity="0.55" />
          <circle cx="60" cy="28" r="6" fill="#50000e" opacity="0.5" />
          <circle cx="30" cy="62" r="5" fill="#50000e" opacity="0.45" />
        </svg>
      </Sprite>
      {[[8, 18, 6, 0], [20, 12, 8, -2.4], [4, 10, 7, -4.6], [30, 15, 9, -1.2], [14, 9, 5.5, -3.6], [26, 11, 7.5, -5.2]].map(([top, size, time, delay], i) => (
        <Sprite key={i} cls="pfx-bat" style={{ top: `${top}%`, width: `${size}cqw`, animationDuration: `${time}s`, animationDelay: `${delay}s` }}>
          {bat}
        </Sprite>
      ))}
      <Sprite cls="pfx-fog pfx-fog-a">{null}</Sprite>
      <Sprite cls="pfx-fog pfx-fog-b">{null}</Sprite>
    </>
  );
}

/** 14. Enhanced Candles with gothic dripping wax and warm flickering halos */
function CandlesScene() {
  return (
    <>
      <Sprite cls="pfx-candle-glow">{null}</Sprite>
      <Sprite cls="pfx-candles">
        <svg viewBox="0 0 300 90">
          <Candle x={24} y={90} h={52} w={15} wax="#f4ede2" />
          <Candle x={48} y={90} h={36} w={12} wax="#d9caa8" />
          <Candle x={72} y={90} h={64} w={16} wax="#ece0cc" />
          <Candle x={228} y={90} h={62} w={15} wax="#ece0cc" />
          <Candle x={252} y={90} h={38} w={12} wax="#d9caa8" />
          <Candle x={276} y={90} h={50} w={14} wax="#f4ede2" />
        </svg>
      </Sprite>
    </>
  );
}

/** 15. Enhanced Cosmic Nebula with rotating spiral galaxy and ringed planet */
function NebulaScene() {
  return (
    <>
      <Sprite cls="pfx-nebula pfx-nebula-a">{null}</Sprite>
      <Sprite cls="pfx-nebula pfx-nebula-b">{null}</Sprite>
      <div className="pfx-nebula-planet">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="22" fill="#38bdf8" opacity="0.85" />
          <ellipse cx="50" cy="50" rx="44" ry="12" fill="none" stroke="#e0f2fe" strokeWidth="2.5" opacity="0.75" transform="rotate(-25 50 50)" />
        </svg>
      </div>
    </>
  );
}

/** 16. Enhanced Digital Matrix with cascading code streams */
function MatrixScene() {
  return (
    <div className="pfx-matrix-canvas">
      <div className="profile-fx profile-fx-matrix" />
      <div className="pfx-matrix-overlay" />
    </div>
  );
}

/** 17. Enhanced Aurora Borealis */
function AuroraScene() {
  return (
    <div className="pfx-aurora-canvas">
      <div className="profile-fx profile-fx-aurora" />
      <div className="pfx-aurora-stars" />
    </div>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  // Discord-inspired marquee scenes
  "always-watching": () => <AlwaysWatchingScene />,
  "manga-hand": () => <MangaHandScene />,
  symbiote: () => <SymbioteScene />,
  "oni-mask": () => <OniMaskScene />,
  "starfall-rings": () => <StarfallRingsScene />,
  "arcane-vortex": () => <ArcaneVortexScene />,
  "cloud-nine": () => <CloudNineScene />,
  nevermore: () => <NevermoreScene />,
  "cyber-hud": () => <CyberHudScene />,
  "soul-flame": () => <SoulFlameScene />,
  "pixel-arcade": () => <PixelArcadeScene />,
  "black-hole": () => <BlackHoleScene />,
  "sakura-storm": () => <SakuraStormScene />,
  thunderstorm: () => <ThunderstormScene />,

  // Upgraded classics
  "blood-moon": () => <BloodMoonScene />,
  candles: () => <CandlesScene />,
  nebula: () => <NebulaScene />,
  matrix: () => <MatrixScene />,
  aurora: () => <AuroraScene />,

  goo: () => <GooScene id="goo" />,
  "goo-pink": () => <GooScene id="goo-pink" />,
  "goo-toxic": () => <GooScene id="goo-toxic" />,
  "goo-blood": () => <GooScene id="goo-blood" />,
  "bat-swarm": () => (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <Sprite key={i} cls="pfx-bat" style={{ top: `${(noise(i, 31) * 85).toFixed(0)}%`, width: `${(7 + noise(i, 32) * 10).toFixed(1)}cqw`, animationDuration: `${(4 + noise(i, 33) * 5).toFixed(1)}s`, animationDelay: `${(-noise(i, 34) * 8).toFixed(1)}s` }}>
          {bat}
        </Sprite>
      ))}
      <Sprite cls="pfx-fog pfx-fog-a">{null}</Sprite>
    </>
  ),
  fireworks: () => (
    <>
      {[[22, 18, "#ff5c8a", 0], [70, 12, "#ffd34d", -0.8], [48, 34, "#5ce1ff", -1.6], [80, 44, "#b98cff", -2.3], [18, 52, "#7cff6b", -3.1]].map(([left, top, color, delay], i) => (
        <Sprite key={i} cls="pfx-firework" style={{ left: `${left}%`, top: `${top}%`, color: color as string, animationDelay: `${delay}s` }}>
          <svg viewBox="-50 -50 100 100">
            {Array.from({ length: 14 }, (_, k) => (
              <g key={k} transform={`rotate(${k * (360 / 14)})`}>
                <path d="M0 -14 L0 -40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <circle cx="0" cy="-45" r="2.6" fill="currentColor" />
              </g>
            ))}
            <circle r="6" fill="#fff" />
          </svg>
        </Sprite>
      ))}
    </>
  ),
  ghosts: () => (
    <>
      {[[8, 26, 14, 0, "#ffffff"], [30, 20, 18, -6, "#efeaff"], [58, 16, 12, -3, "#ffffff"]].map(([top, size, time, delay, tint], i) => (
        <Sprite key={i} cls="pfx-ghost" style={{ top: `${top}%`, width: `${size}cqw`, animationDuration: `${time}s`, animationDelay: `${delay}s` }}>
          {ghost(tint as string)}
        </Sprite>
      ))}
    </>
  ),
  jellyfish: () => (
    <>
      {[[12, 22, 13, 0, "#ff9ad5", "#ff5cc0"], [48, 30, 16, -7, "#9ad8ff", "#38bdf8"], [74, 18, 11, -4, "#c9a7ff", "#a78bfa"]].map(([left, size, time, delay, bell, glow], i) => (
        <Sprite key={i} cls="pfx-jelly" style={{ left: `${left}%`, width: `${size}cqw`, animationDuration: `${time}s`, animationDelay: `${delay}s` }}>
          {jelly(bell as string, glow as string)}
        </Sprite>
      ))}
    </>
  ),
  bats: () => (
    <>
      <Sprite cls="pfx-moon">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="#fff4cf" />
          <circle cx="36" cy="40" r="8" fill="#efe0b0" />
          <circle cx="62" cy="62" r="11" fill="#efe0b0" />
          <circle cx="64" cy="30" r="5" fill="#efe0b0" />
        </svg>
      </Sprite>
      {[[10, 16, 7, 0], [22, 11, 9, -3], [6, 9, 8, -5.5], [34, 13, 10, -1.5], [16, 8, 6.5, -4.2]].map(([top, size, time, delay], i) => (
        <Sprite key={i} cls="pfx-bat" style={{ top: `${top}%`, width: `${size}cqw`, animationDuration: `${time}s`, animationDelay: `${delay}s` }}>
          {bat}
        </Sprite>
      ))}
    </>
  ),
  koi: () => (
    <>
      {[[18, 34, 12, 0, "#ff7a3d", "#fff3e8"], [52, 28, 15, -6, "#fff3e8", "#ff4d2e"], [76, 22, 10, -3, "#ffd34d", "#ff7a3d"]].map(([top, size, time, delay, body, spot], i) => (
        <Sprite key={i} cls={`pfx-koi${i % 2 ? " pfx-koi-back" : ""}`} style={{ top: `${top}%`, width: `${size}cqw`, animationDuration: `${time}s`, animationDelay: `${delay}s` }}>
          {koi(body as string, spot as string)}
        </Sprite>
      ))}
      {[[30, 40, 0], [70, 64, -2], [44, 82, -3.4]].map(([left, top, delay], i) => (
        <Sprite key={`r${i}`} cls="pfx-ripple" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}>
          {null}
        </Sprite>
      ))}
    </>
  ),
  paws: () => (
    <>
      <Sprite cls="pfx-paw" style={{ left: "6%" }}>{paw}</Sprite>
      <Sprite cls="pfx-paw pfx-paw-b" style={{ right: "6%" }}>{paw}</Sprite>
    </>
  ),
  sunbeams: () => (
    <Sprite cls="pfx-rays">
      <svg viewBox="-100 -100 200 200">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M0 0 L-9 -100 L9 -100Z" fill="#fff2c4" opacity={0.18 + (i % 3) * 0.06} transform={`rotate(${i * 30})`} />
        ))}
      </svg>
    </Sprite>
  ),
};

/** Particle effects that a scene adds on top. */
const SCENE_EXTRA: Record<string, string> = {
  "blood-moon": "rose-petals",
  candles: "embers",
  fireworks: "sparkles",
  nebula: "sparkles",
  sunbeams: "fireflies",
  ghosts: "sparkles",
  "always-watching": "embers",
  "manga-hand": "embers",
  symbiote: "embers",
  "oni-mask": "embers",
  "starfall-rings": "sparkles",
  "arcane-vortex": "sparkles",
  "cloud-nine": "leaves",
  nevermore: "rose-petals",
  "soul-flame": "embers",
  "sakura-storm": "sakura",
  thunderstorm: "rain",
  "pixel-arcade": "sparkles",
  "black-hole": "sparkles",
};

Object.assign(EFFECTS, EXTRA_EFFECTS);
Object.assign(SCENES, EXTRA_SCENES);

/** CSS-only effects that predate the particle system. */
const LEGACY_EFFECTS = new Set(["matrix", "aurora", "lightning"]);

/** The upload URL behind a custom "gif:<key>" effect, or null. */
export function customEffectUrl(id?: string | null) {
  const match = id ? /^gifx?:(.+)$/.exec(id) : null;
  return match ? `/hangout/api/uploads/${encodeURIComponent(match[1])}` : null;
}

/** Animated effect over a whole profile card. Parent must be position: relative. */
export function ProfileEffect({ id, density = 1 }: { id?: string | null; density?: number }) {
  const particlesOn = useParticlesSetting();
  if (!id || id === "none" || !particlesOn) return null;
  if (typeof document !== "undefined" && document.documentElement.dataset.cosmetics === "off") return null;
  const gif = customEffectUrl(id);
  if (gif) {
    return (
      <div className={`pfx pfx-gif${id.startsWith("gifx:") ? " pfx-gif-screen" : ""}`} aria-hidden="true">
        <img src={gif} alt="" />
      </div>
    );
  }
  if (CANVAS_SCENES[id]) return <CanvasScene id={id} density={density} />;
  if (SCENES[id]) {
    return (
      <>
        <div className={`pfx pfx-scene pfx-scene-${id}`} aria-hidden="true">
          {SCENES[id]()}
        </div>
        {SCENE_EXTRA[id] && <ProfileEffect id={SCENE_EXTRA[id]} density={density * 0.6} />}
      </>
    );
  }
  if (LEGACY_EFFECTS.has(id)) return <div className={`profile-fx profile-fx-${id}`} aria-hidden="true" />;
  const spec = EFFECTS[id];
  if (!spec) return null;
  const count = Math.max(4, Math.round(spec.count * density * 1.5));
  const grow = density < 1 ? 1 : 1.3;
  return (
    <div className={`pfx pfx-${spec.motion}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const time = spec.time[0] + noise(i, 2) * (spec.time[1] - spec.time[0]);
        const style = {
          "--x": `${(noise(i, 1) * 100).toFixed(1)}%`,
          "--y": `${(noise(i, 5) * 100).toFixed(1)}%`,
          "--t": `${time.toFixed(2)}s`,
          "--d": `${(-noise(i, 3) * time).toFixed(2)}s`,
          "--sz": `${((spec.size[0] + noise(i, 4) * (spec.size[1] - spec.size[0])) * grow).toFixed(1)}px`,
          "--dx": `${(6 + noise(i, 6) * 18).toFixed(0)}px`,
          "--dy": `${(-12 + noise(i, 7) * 24).toFixed(0)}px`,
          "--spin": `${noise(i, 8) > 0.5 ? 1 : -1}`,
        } as CSSProperties;
        return (
          <i key={i} className="pfx-p" style={style}>
            <b className={spec.spin ? "pfx-spin" : undefined}>{spec.shape(i)}</b>
          </i>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile frames                                                      */
/* Art that sits on and around a card and spills past its edges. Each  */
/* piece scales with the card's width, so it looks the same at any size.*/
/* ------------------------------------------------------------------ */

interface PieceProps {
  /** Which edge it sits on. */
  at: "top" | "bottom";
  /** Width as a percentage of the card. */
  width: number;
  /** Left offset as a percentage of the card (negative spills out). */
  left?: number;
  right?: number;
  /** How much of the piece overlaps onto the card, 0..1 of its own height. */
  overlap: number;
  viewBox: string;
  className?: string;
  children: ReactNode;
}

function Piece({ at, width, left, right, overlap, viewBox, className, children }: PieceProps) {
  const style: CSSProperties = {
    width: `${width}%`,
    ...(right !== undefined ? { right: `${right}%` } : { left: `${left ?? (100 - width) / 2}%` }),
    ...(at === "top" ? { bottom: "100%", translate: `0 ${overlap * 100}%` } : { top: "100%", translate: `0 ${-overlap * 100}%` }),
  };
  return (
    <svg className={`pf-piece${className ? ` ${className}` : ""}`} viewBox={viewBox} style={style} aria-hidden="true">
      {children}
    </svg>
  );
}

function Rose({ x, y, r, petal, dark }: { x: number; y: number; r: number; petal: string; dark: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={dark} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.5} rx={r * 0.62} ry={r * 0.5} fill={petal} stroke={dark} strokeWidth={r * 0.07} transform={`rotate(${a + 18})`} />
      ))}
      <circle r={r * 0.56} fill={petal} stroke={dark} strokeWidth={r * 0.08} />
      <path d={`M${-r * 0.32} ${r * 0.05} A${r * 0.32} ${r * 0.32} 0 1 1 ${r * 0.18} ${r * 0.27}`} fill="none" stroke={dark} strokeWidth={r * 0.09} strokeLinecap="round" />
      <path d={`M${-r * 0.12} ${-r * 0.02} A${r * 0.14} ${r * 0.14} 0 1 1 ${r * 0.1} ${r * 0.12}`} fill="none" stroke={dark} strokeWidth={r * 0.08} strokeLinecap="round" />
      <ellipse cx={-r * 0.35} cy={-r * 0.45} rx={r * 0.22} ry={r * 0.1} fill="#fff" opacity="0.28" transform="rotate(-30)" />
    </g>
  );
}

function Leaf({ x, y, size, rotate, fill, vein }: { x: number; y: number; size: number; rotate: number; fill: string; vein: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size / 20})`}>
      <path d="M0 0 C6 -9 18 -9 24 0 C18 9 6 9 0 0Z" fill={fill} />
      <path d="M2 0 H21" stroke={vein} strokeWidth="1.2" />
    </g>
  );
}

/** Sparkles scattered around a frame (inside a 300-wide piece). */
function Glints({ points, color = "#fff6c2" }: { points: [number, number, number][]; color?: string }) {
  return (
    <>
      {points.map(([x, y, r], i) => (
        <path key={i} d={sparklePath(x, y, r)} fill={color} className={`deco-twinkle${i % 2 ? " deco-delay" : ""}`} />
      ))}
    </>
  );
}

function RoseFrame({ petal, dark, leaf }: { petal: string; dark: string; leaf: string }) {
  const top: [number, number, number][] = [[26, 60, 22], [62, 40, 26], [104, 52, 21], [142, 36, 18], [176, 50, 15], [12, 98, 15], [40, 92, 14]];
  const bottom: [number, number, number][] = [[176, 54, 24], [138, 64, 20], [104, 72, 16], [72, 78, 12], [196, 22, 13]];
  return (
    <>
      <Piece at="top" width={70} left={-7} overlap={0.52} viewBox="0 0 210 120">
        {[[8, 50, -150], [90, 18, -60], [160, 20, -30], [195, 44, 10], [4, 116, 160], [60, 70, -100]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} size={22} rotate={r} fill={leaf} vein={dark} />
        ))}
        {top.map(([x, y, r], i) => <Rose key={i} x={x} y={y} r={r} petal={petal} dark={dark} />)}
        <Glints points={[[120, 14, 4], [190, 30, 3], [6, 30, 3.5]]} color="#e9dcff" />
      </Piece>
      <Piece at="bottom" width={70} right={-7} overlap={0.55} viewBox="0 0 210 110">
        {[[205, 40, 20], [120, 90, 140], [40, 84, 170], [210, 70, 60], [150, 30, -40]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} size={22} rotate={r} fill={leaf} vein={dark} />
        ))}
        {bottom.map(([x, y, r], i) => <Rose key={i} x={x} y={y} r={r} petal={petal} dark={dark} />)}
        <Glints points={[[60, 60, 3.5], [200, 96, 4]]} color="#e9dcff" />
      </Piece>
    </>
  );
}

function CatFrame({ fur, line, inner, eye }: { fur: string; line: string; inner: string; eye: string }) {
  return (
    <>
      <Piece at="top" width={116} overlap={0.32} viewBox="0 0 348 104">
        <path d="M14 100 C8 70 22 52 40 48 L52 8 C58 4 62 4 66 8 L92 40 C140 30 208 30 256 40 L282 8 C286 4 290 4 296 8 L308 48 C326 52 340 70 334 100Z" fill={fur} stroke={line} strokeWidth="3" strokeLinejoin="round" />
        <path d="M58 18 L60 38 L78 36Z M290 18 L288 38 L270 36Z" fill={inner} />
        <circle cx="146" cy="66" r="7" fill={eye} />
        <circle cx="202" cy="66" r="7" fill={eye} />
        <path d="M162 70 Q168 78 174 70 Q180 78 186 70" fill="none" stroke={eye} strokeWidth="3" strokeLinecap="round" />
        <path d="M104 62 l6 10 M114 60 l6 10 M124 60 l6 10 M220 70 l6 -10 M230 70 l6 -10 M240 72 l6 -10" stroke={inner} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="76" cy="96" rx="30" ry="14" fill={fur} stroke={line} strokeWidth="3" />
        <ellipse cx="272" cy="96" rx="30" ry="14" fill={fur} stroke={line} strokeWidth="3" />
        <path d="M64 92 v8 M76 90 v10 M88 92 v8 M260 92 v8 M272 90 v10 M284 92 v8" stroke={line} strokeWidth="2.4" strokeLinecap="round" />
        <Glints points={[[312, 14, 8], [330, 32, 5], [24, 30, 6]]} />
      </Piece>
      <Piece at="bottom" width={112} overlap={0.6} viewBox="0 0 336 80">
        <path d="M330 8 C344 46 316 64 250 62 C180 60 110 52 54 58 C24 62 10 52 16 38" fill="none" stroke={line} strokeWidth="21" strokeLinecap="round" />
        <path d="M330 8 C344 46 316 64 250 62 C180 60 110 52 54 58 C24 62 10 52 16 38" fill="none" stroke={fur} strokeWidth="15" strokeLinecap="round" />
        <Glints points={[[40, 74, 7], [64, 60, 4], [326, 72, 5]]} />
      </Piece>
    </>
  );
}

function BlazeFrame({ hot, mid, core, u }: { hot: string; mid: string; core: string; u: string }) {
  const tongues = (count: number, height: number, salt: number) =>
    Array.from({ length: count }, (_, i) => {
      const x = 8 + (i * 334) / (count - 1);
      const w = 14 + noise(i, salt) * 12;
      const h = height * (0.55 + noise(i, salt + 1) * 0.45);
      const lean = (noise(i, salt + 2) - 0.5) * 30;
      return `M${x - w} 150 C${x - w} ${150 - h * 0.5} ${x + lean * 0.3 - w * 0.4} ${150 - h * 0.7} ${x + lean} ${150 - h} C${x + w * 0.5} ${150 - h * 0.6} ${x + w} ${150 - h * 0.45} ${x + w} 150Z`;
    }).join(" ");
  return (
    <Piece at="top" width={114} overlap={0.5} viewBox="0 0 350 150" className="pf-blaze">
      <defs>
        <linearGradient id={`${u}fl`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={hot} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <filter id={`${u}gl`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path d={tongues(14, 140, 21)} fill={hot} opacity="0.55" filter={`url(#${u}gl)`} className="pf-flick pf-flick-a" />
      <path d={tongues(14, 130, 21)} fill={`url(#${u}fl)`} className="pf-flick pf-flick-a" />
      <path d={tongues(11, 92, 33)} fill={mid} className="pf-flick pf-flick-b" />
      <path d={tongues(9, 54, 47)} fill={core} opacity="0.9" className="pf-flick pf-flick-c" />
    </Piece>
  );
}

function CrystalFrame({ light, mid, dark }: { light: string; mid: string; dark: string }) {
  const shards: [number, number, number, number][] = [[30, 70, 16, -18], [62, 92, 20, -8], [96, 60, 14, 6], [130, 96, 22, -4], [170, 74, 16, 10], [206, 100, 24, 2], [244, 64, 15, 14], [276, 90, 19, 8], [312, 66, 14, 20]];
  return (
    <Piece at="top" width={110} overlap={0.4} viewBox="0 0 340 110">
      {shards.map(([x, h, w, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} 108)`}>
          <path d={`M${x - w / 2} 108 L${x - w / 2} ${108 - h * 0.7} L${x} ${108 - h} L${x + w / 2} ${108 - h * 0.7} L${x + w / 2} 108Z`} fill={i % 2 ? mid : light} stroke={dark} strokeWidth="1.6" strokeLinejoin="round" />
          <path d={`M${x} ${108 - h} L${x} 108 M${x - w / 2} ${108 - h * 0.7} L${x} ${108 - h * 0.55} L${x + w / 2} ${108 - h * 0.7}`} stroke="#fff" strokeOpacity="0.45" strokeWidth="1.2" fill="none" />
        </g>
      ))}
      <Glints points={[[60, 14, 6], [210, 6, 5], [300, 20, 4]]} color="#f3e8ff" />
    </Piece>
  );
}

function VampireFrame({ u }: { u: string }) {
  const wing = "M170 62 C140 20 80 8 8 26 C28 38 32 52 28 68 C44 58 62 62 70 76 C82 64 100 66 108 80 C120 70 140 72 150 84Z";
  return (
    <>
      <Piece at="top" width={116} overlap={0.34} viewBox="0 0 340 110">
        <defs>
          <radialGradient id={`${u}moon`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#ff4d5e" />
            <stop offset="1" stopColor="#8a0012" />
          </radialGradient>
        </defs>
        {[undefined, "matrix(-1 0 0 1 340 0)"].map((t, i) => (
          <g key={i} transform={t}>
            <path d={wing} fill="#12050a" stroke="#6b0a1c" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M170 62 C130 40 70 30 20 30 M170 62 C140 50 100 56 70 74 M170 62 C150 60 128 70 108 80" fill="none" stroke="#8a0012" strokeWidth="1.6" opacity="0.8" />
          </g>
        ))}
        <circle cx="170" cy="50" r="30" fill="#ff1a3a" opacity="0.25" className="pf-moonglow" />
        <circle cx="170" cy="50" r="24" fill={`url(#${u}moon)`} stroke="#3a0008" strokeWidth="2" />
        <Bat x={170} y={50} w={34} />
        <Bat x={60} y={8} w={22} rotate={-14} className="pfx-batwing" />
        <Bat x={290} y={10} w={18} rotate={12} className="pfx-batwing" />
        <path d="M150 84 L156 98 L162 86 M178 86 L184 98 L190 84" fill="#fff" stroke="#3a0008" strokeWidth="1.4" strokeLinejoin="round" />
      </Piece>
      <Piece at="bottom" width={104} overlap={0.22} viewBox="0 0 330 70">
        <path d={`M0 0 H330 V8 ${Array.from({ length: 14 }, (_, i) => `Q${318 - i * 23.5} ${16 + noise(i, 13) * 8} ${306 - i * 23.5} 8`).join(" ")} Z`} fill="#8a0012" />
        {[18, 64, 110, 152, 200, 246, 292].map((x, i) => (
          <rect key={x} className="pfx-drip" x={x} y="4" width={6 + noise(i, 14) * 5} height={20 + noise(i, 15) * 40} rx="4" fill="#8a0012" style={{ animationDelay: `${-noise(i, 16) * 4}s`, animationDuration: `${3 + noise(i, 17) * 3}s` }} />
        ))}
        <path d="M14 3 H120" stroke="#ff4d5e" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </Piece>
    </>
  );
}

const FRAME_ART: Record<string, (u: string) => ReactNode> = {
  vampire: (u) => <VampireFrame u={u} />,
  candlelit: () => (
    <>
      <Piece at="top" width={70} overlap={0.4} viewBox="0 0 210 80">
        <path d="M10 78 C10 40 60 20 105 4 C150 20 200 40 200 78" fill="none" stroke="#2a0a14" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 78 C10 40 60 20 105 4 C150 20 200 40 200 78" fill="none" stroke="#8a0012" strokeWidth="3" strokeLinecap="round" />
        <path d="M105 -2 V30 M93 10 H117" stroke="#c9a64a" strokeWidth="5" strokeLinecap="round" />
        <circle cx="105" cy="10" r="3" fill="#c0102a" />
      </Piece>
      <Piece at="bottom" width={34} left={-10} overlap={0.75} viewBox="0 0 100 110">
        <Candle x={22} y={108} h={56} w={16} />
        <Candle x={48} y={108} h={78} w={18} />
        <Candle x={74} y={108} h={40} w={14} wax="#e8dcc8" />
        <path d="M2 108 H98" stroke="#3a2a20" strokeWidth="6" strokeLinecap="round" />
      </Piece>
      <Piece at="bottom" width={34} right={-10} overlap={0.75} viewBox="0 0 100 110">
        <Candle x={26} y={108} h={44} w={14} wax="#e8dcc8" />
        <Candle x={52} y={108} h={70} w={18} />
        <Candle x={78} y={108} h={52} w={16} />
        <path d="M2 108 H98" stroke="#3a2a20" strokeWidth="6" strokeLinecap="round" />
      </Piece>
    </>
  ),
  "bat-swarm": () => (
    <>
      <Piece at="top" width={120} overlap={0.4} viewBox="0 0 360 100">
        {Array.from({ length: 13 }, (_, i) => (
          <Bat key={i} x={14 + i * 27 + noise(i, 41) * 10} y={20 + noise(i, 42) * 60} w={18 + noise(i, 43) * 22} rotate={(noise(i, 44) - 0.5) * 40} fill={i % 3 ? "#0d0408" : "#3a0a16"} outline="#c0102a" className="pfx-batwing" />
        ))}
      </Piece>
      <Piece at="bottom" width={60} right={-8} overlap={0.4} viewBox="0 0 180 70">
        {Array.from({ length: 6 }, (_, i) => (
          <Bat key={i} x={20 + i * 28} y={20 + noise(i, 45) * 34} w={16 + noise(i, 46) * 16} rotate={(noise(i, 47) - 0.5) * 50} outline="#c0102a" className="pfx-batwing" />
        ))}
      </Piece>
    </>
  ),
  "string-lights": () => (
    <Piece at="top" width={108} overlap={0.6} viewBox="0 0 324 60">
      <path d="M4 10 Q84 50 162 14 Q240 50 320 10" fill="none" stroke="#2a3a2a" strokeWidth="2" />
      {Array.from({ length: 14 }, (_, i) => {
        const t = (i + 0.5) / 14;
        const half = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        const x = 4 + t * 316;
        const y = 10 + Math.sin(half * Math.PI) * 22 + 4;
        const color = ["#ff5c5c", "#ffd34d", "#5ce1ff", "#7cff6b", "#ff8fd8"][i % 5];
        return (
          <g key={i}>
            <rect x={x - 2} y={y - 2} width="4" height="4" fill="#2a3a2a" />
            <ellipse cx={x} cy={y + 7} rx="4.5" ry="6.5" fill={color} className={`pf-bulb${i % 2 ? " deco-delay" : ""}`} style={{ color }} />
          </g>
        );
      })}
    </Piece>
  ),
  clouds: () => (
    <>
      <Piece at="top" width={64} left={-8} overlap={0.5} viewBox="0 0 192 70">
        <Cloud x={20} y={40} s={1.6} />
        <Cloud x={84} y={30} s={1.2} fill="#f2f0ff" />
        <Cloud x={130} y={44} s={1} />
        <Glints points={[[170, 14, 6], [60, 8, 4]]} />
      </Piece>
      <Piece at="bottom" width={60} right={-8} overlap={0.5} viewBox="0 0 180 60">
        <Cloud x={40} y={22} s={1.2} fill="#f2f0ff" />
        <Cloud x={100} y={20} s={1.6} />
        <Glints points={[[20, 46, 5]]} />
      </Piece>
    </>
  ),
  "vampire-roses": () => <RoseFrame petal="#7a0016" dark="#1a0006" leaf="#2a1a1e" />,
  roses: () => <RoseFrame petal="#c04bd8" dark="#3a0d4a" leaf="#4b5a6e" />,
  "roses-red": () => <RoseFrame petal="#e0304e" dark="#4a0712" leaf="#2f5a34" />,
  kitty: () => <CatFrame fur="#24232b" line="#0b0b10" inner="#ff8a7a" eye="#ffd34d" />,
  "kitty-snow": () => <CatFrame fur="#f4f1ee" line="#8f8a93" inner="#ffb3c7" eye="#4a4458" />,
  "kitty-ginger": () => <CatFrame fur="#f39a4a" line="#7a3c10" inner="#ffd0b5" eye="#3a1a06" />,
  flame: (u) => <BlazeFrame u={u} hot="#ff3d00" mid="#ff9a00" core="#ffe066" />,
  "blaze-blue": (u) => <BlazeFrame u={u} hot="#0077ff" mid="#22d3ee" core="#d8fbff" />,
  "blaze-pink": (u) => <BlazeFrame u={u} hot="#d6186a" mid="#ff5cc0" core="#ffd6f0" />,
  crystal: () => <CrystalFrame light="#c9a7ff" mid="#8b5cf6" dark="#3b1b7a" />,
  "crystal-ice": () => <CrystalFrame light="#bdf3ff" mid="#38bdf8" dark="#0c4a6e" />,
  frost: () => (
    <>
      <Piece at="top" width={108} overlap={0.62} viewBox="0 0 324 70">
        <path d="M4 40 C20 22 40 30 54 20 C72 6 96 22 112 14 C134 2 160 20 180 12 C204 2 226 18 246 12 C270 4 292 20 320 30 L320 46 L4 46Z" fill="#f4fbff" stroke="#b9dcf2" strokeWidth="2" />
        {Array.from({ length: 22 }, (_, i) => {
          const x = 14 + i * 14 + noise(i, 3) * 6;
          const h = 8 + noise(i, 9) * 20;
          return <path key={i} d={`M${x - 4} 45 L${x} ${45 + h} L${x + 4} 45Z`} fill="#dff4ff" stroke="#a8d4ee" strokeWidth="1" />;
        })}
        <Snowflake x={300} y={12} r={10} stroke="#ffffff" width={2} />
        <Snowflake x={24} y={10} r={7} stroke="#e0f4ff" width={1.6} />
      </Piece>
      <Piece at="bottom" width={60} right={-4} overlap={0.6} viewBox="0 0 180 40">
        <path d="M6 30 C30 10 60 18 84 12 C110 4 140 14 176 22 L176 40 L6 40Z" fill="#f4fbff" stroke="#b9dcf2" strokeWidth="2" />
      </Piece>
    </>
  ),
  sakura: () => (
    <>
      <Piece at="top" width={78} right={-8} overlap={0.5} viewBox="0 0 234 120">
        <path d="M234 20 C190 24 150 44 110 50 C80 54 50 70 30 96 M150 42 C146 24 136 12 122 8 M96 52 C96 70 88 84 76 92" fill="none" stroke="#5a3324" strokeWidth="6" strokeLinecap="round" />
        {[[200, 24, 14], [168, 36, 11], [122, 10, 10], [118, 50, 13], [84, 62, 11], [76, 92, 10], [36, 92, 12], [224, 46, 9], [146, 62, 8]].map(([x, y, r], i) => (
          <Flower key={i} x={x} y={y} r={r} petal={i % 3 ? "#ffc3d8" : "#ffe2ec"} heart="#f2598f" rotate={i * 23} />
        ))}
      </Piece>
      <Piece at="bottom" width={44} left={-6} overlap={0.55} viewBox="0 0 132 70">
        <path d="M0 50 C30 44 60 30 90 26" fill="none" stroke="#5a3324" strokeWidth="5" strokeLinecap="round" />
        {[[30, 44, 12], [62, 32, 10], [94, 24, 11], [14, 60, 8]].map(([x, y, r], i) => (
          <Flower key={i} x={x} y={y} r={r} petal="#ffc3d8" heart="#f2598f" rotate={i * 31} />
        ))}
      </Piece>
    </>
  ),
  vine: () => (
    <>
      <Piece at="top" width={74} left={-6} overlap={0.55} viewBox="0 0 222 100">
        <path d="M6 96 C10 60 30 40 60 34 C100 26 140 40 180 30 C196 26 208 18 216 8" fill="none" stroke="#2f6b2c" strokeWidth="5" strokeLinecap="round" />
        {[[20, 70, -70], [44, 40, -20], [76, 30, 20], [110, 36, -30], [146, 38, 10], [184, 26, -40], [206, 12, -60]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} size={26} rotate={r + (i % 2 ? 180 : 0)} fill={i % 2 ? "#7cc46a" : "#4f9a45"} vein="#2a5e27" />
        ))}
        <Flower x={60} y={34} r={10} petal="#fff" heart="#ffd34d" />
        <Flower x={150} y={34} r={8} petal="#ffd6e8" heart="#ffd34d" rotate={20} />
      </Piece>
      <Piece at="bottom" width={60} right={-6} overlap={0.6} viewBox="0 0 180 70">
        <path d="M176 4 C170 30 140 46 100 50 C70 54 40 52 10 62" fill="none" stroke="#2f6b2c" strokeWidth="5" strokeLinecap="round" />
        {[[160, 28, 120], [126, 44, 170], [86, 52, -170], [46, 54, 160]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} size={24} rotate={r} fill={i % 2 ? "#7cc46a" : "#4f9a45"} vein="#2a5e27" />
        ))}
        <Flower x={110} y={48} r={9} petal="#fff" heart="#ffd34d" />
      </Piece>
    </>
  ),
  bunny: () => (
    <Piece at="top" width={60} overlap={0.28} viewBox="0 0 180 120">
      <g transform="rotate(-10 60 110)">
        <path d="M44 116 C30 70 34 10 56 6 C78 2 82 64 72 116Z" fill="#fffafc" stroke="#d6a9bd" strokeWidth="3" />
        <path d="M50 108 C42 72 46 24 57 20 C68 18 70 70 66 108Z" fill="#ffc7da" />
      </g>
      <g transform="rotate(14 120 110)">
        <path d="M108 116 C98 70 104 14 126 12 C148 10 150 70 136 116Z" fill="#fffafc" stroke="#d6a9bd" strokeWidth="3" />
        <path d="M114 108 C108 74 112 28 126 26 C138 26 140 74 130 108Z" fill="#ffc7da" />
      </g>
      <g transform="translate(90 108)">
        <path d="M0 0 C-12 -14 -28 -8 -24 4 C-20 14 -8 8 0 0Z M0 0 C12 -14 28 -8 24 4 C20 14 8 8 0 0Z" fill="#ff8fc2" stroke="#c2457f" strokeWidth="2" />
        <circle r="5" fill="#ff6fae" stroke="#c2457f" strokeWidth="2" />
      </g>
    </Piece>
  ),
  gold: (u) => (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b0" />
            <stop offset="0.5" stopColor="#e9b84a" />
            <stop offset="1" stopColor="#8a6214" />
          </linearGradient>
        </defs>
      </svg>
      <Piece at="top" width={110} overlap={0.6} viewBox="0 0 330 70">
        <path d="M8 66 C8 40 24 26 48 30 C34 16 52 0 70 12 C80 20 74 34 62 32 M322 66 C322 40 306 26 282 30 C296 16 278 0 260 12 C250 20 256 34 268 32" fill="none" stroke={`url(#${u}g)`} strokeWidth="4" strokeLinecap="round" />
        <path d="M130 50 L124 20 L144 34 L165 8 L186 34 L206 20 L200 50Z" fill={`url(#${u}g)`} stroke="#6b4a00" strokeWidth="2" strokeLinejoin="round" />
        <path d="M100 52 C120 40 140 52 165 46 C190 52 210 40 230 52" fill="none" stroke={`url(#${u}g)`} strokeWidth="3" strokeLinecap="round" />
        <circle cx="165" cy="36" r="4" fill="#e0245e" />
        <Glints points={[[96, 22, 5], [236, 22, 5]]} />
      </Piece>
      <Piece at="bottom" width={110} overlap={0.55} viewBox="0 0 330 50">
        <path d="M8 4 C8 26 24 38 48 34 C34 46 52 54 66 46 M322 4 C322 26 306 38 282 34 C296 46 278 54 264 46 M120 20 C140 34 150 20 165 30 C180 20 190 34 210 20" fill="none" stroke={`url(#${u}g)`} strokeWidth="4" strokeLinecap="round" />
        <path d="M165 22 L172 30 L165 38 L158 30Z" fill={`url(#${u}g)`} stroke="#6b4a00" strokeWidth="1.4" />
      </Piece>
    </>
  ),
  royal: () => (
    <Piece at="top" width={36} overlap={0.45} viewBox="0 0 108 70">
      <path d="M12 66 L6 18 L32 40 L54 6 L76 40 L102 18 L96 66Z" fill="#f2c94c" stroke="#6b4a00" strokeWidth="3" strokeLinejoin="round" />
      <rect x="10" y="56" width="88" height="12" rx="4" fill="#e0a92a" stroke="#6b4a00" strokeWidth="2.4" />
      {[[6, 18], [54, 6], [102, 18]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill="#fff1b0" stroke="#6b4a00" strokeWidth="2" />)}
      <path d="M54 34 L61 44 L54 54 L47 44Z" fill="#a855f7" stroke="#3b1b7a" strokeWidth="2" />
      <circle cx="28" cy="61" r="3.4" fill="#3b82f6" />
      <circle cx="80" cy="61" r="3.4" fill="#22c55e" />
    </Piece>
  ),
  starlit: () => (
    <>
      <Piece at="top" width={40} right={-10} overlap={0.4} viewBox="0 0 120 100">
        <path d="M70 6 A42 42 0 1 0 112 74 A33 33 0 1 1 70 6Z" fill="#fff6c2" className="pf-moonglow" />
        <Glints points={[[18, 30, 8], [40, 76, 5], [8, 64, 4]]} />
      </Piece>
      <Piece at="bottom" width={30} left={-6} overlap={0.5} viewBox="0 0 90 60">
        <Glints points={[[20, 20, 10], [52, 38, 6], [76, 14, 4]]} color="#d8d2ff" />
      </Piece>
    </>
  ),
  cyber: () => (
    <>
      <Piece at="top" width={106} overlap={0.7} viewBox="0 0 318 30">
        <path d="M4 28 V4 H70 M314 28 V4 H248" fill="none" stroke="#ff2bd6" strokeWidth="4" />
        <path d="M84 4 H120 M198 4 H234" stroke="#00e5ff" strokeWidth="3" strokeDasharray="6 4" />
      </Piece>
      <Piece at="bottom" width={106} overlap={0.3} viewBox="0 0 318 30">
        <path d="M4 2 V26 H70 M314 2 V26 H248" fill="none" stroke="#00e5ff" strokeWidth="4" />
      </Piece>
    </>
  ),
};

Object.assign(FRAME_ART, EXTRA_FRAME_ART);

/** A frame's art around a card. Render it as a sibling of the card inside a .pframe-host. */
export function ProfileFrameArt({ id }: { id?: string | null }) {
  const u = useId().replace(/:/g, "");
  const draw = id ? FRAME_ART[id] : undefined;
  if (!draw) return null;
  return (
    <div className={`pframe-art pframe-art-${id}`} aria-hidden="true">
      {draw(u)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nameplate art                                                       */
/* Drawn in a 160x48 strip, kept to the right so the name stays clear. */
/* ------------------------------------------------------------------ */

const NAMEPLATE_ART: Record<string, (u: string) => ReactNode> = {
  coffin: () => (
    <>
      <g transform="rotate(-8 132 26)">
        <path d="M126 2 H138 L146 12 L140 46 H124 L118 12Z" fill="#2a1424" stroke="#c9a64a" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M132 12 V34 M126 19 H138" stroke="#c9a64a" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <Candle x={100} y={48} h={18} w={6} />
      <Candle x={110} y={48} h={26} w={7} />
      <Candle x={156} y={48} h={20} w={6} />
    </>
  ),
  "bat-swarm": () => (
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <Bat key={i} x={92 + noise(i, 51) * 64} y={8 + noise(i, 52) * 32} w={8 + noise(i, 53) * 12} rotate={(noise(i, 54) - 0.5) * 40} fill={i % 3 ? "#0d0408" : "#3a0a16"} />
      ))}
    </>
  ),
  aurora: () => (
    <>
      <path d="M60 30 C90 6 110 34 130 14 C144 2 152 16 160 10 V26 C150 30 140 22 128 32 C110 46 92 22 60 40Z" fill="#5effc0" opacity="0.45" />
      <path d="M80 36 C100 18 120 40 140 22 C150 14 156 22 160 20 V32 C150 34 142 30 132 38 C116 48 100 32 80 44Z" fill="#b98cff" opacity="0.45" />
      {[[100, 8, 1.8], [124, 6, 2.2], [150, 6, 1.6], [114, 40, 1.4]].map(([x, y, r]) => <path key={x} d={sparklePath(x, y, r)} fill="#fff" />)}
    </>
  ),
  candy: () => (
    <>
      <path d="M140 26 L140 52" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="140" cy="20" r="14" fill="#ff7ab8" stroke="#fff" strokeWidth="2" />
      <path d="M140 20 m-10 0 a10 10 0 0 1 10 -10 a7 7 0 0 1 7 7 a4.5 4.5 0 0 1 -4.5 4.5 a2.5 2.5 0 0 1 -2.5 -2.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="108" cy="34" r="6" fill="#7ad7ff" />
      <circle cx="118" cy="12" r="4" fill="#ffd34d" />
      <circle cx="158" cy="42" r="4" fill="#9cff8a" />
    </>
  ),
  vampire: () => (
    <>
      <circle cx="132" cy="18" r="16" fill="#ff1a3a" opacity="0.3" />
      <circle cx="132" cy="18" r="12" fill="#c0102a" />
      <circle cx="128" cy="15" r="2.5" fill="#9a0a20" />
      <circle cx="136" cy="22" r="3.2" fill="#9a0a20" />
      <path d="M78 48 V36 L82 30 L86 36 V40 H92 V28 L97 18 L102 28 V40 H108 V34 L112 29 L116 34 V40 H122 V30 L126 25 L130 30 V40 H140 V24 L146 12 L152 24 V48Z" fill="#0a0205" />
      <rect x="95" y="30" width="3" height="5" fill="#ff4d5e" opacity="0.8" />
      <rect x="144" y="28" width="3" height="5" fill="#ff4d5e" opacity="0.8" />
      <Bat x={110} y={12} w={16} rotate={-10} />
      <Bat x={154} y={36} w={11} rotate={14} />
    </>
  ),
  sunset: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe36b" />
          <stop offset="1" stopColor="#ff4d8d" />
        </linearGradient>
      </defs>
      <circle cx="128" cy="38" r="22" fill={`url(#${u}s)`} />
      {[30, 36, 42, 48].map((y, i) => (
        <rect key={y} x="100" y={y} width="60" height={1.5 + i} fill="#5a1640" />
      ))}
      <path d="M80 48 L100 34 L112 42 L126 30 L146 44 L160 36 V48Z" fill="#3b0f33" />
    </>
  ),
  ocean: () => (
    <>
      <path d="M70 30 C90 22 100 36 120 28 C138 21 148 30 160 26 V48 H70Z" fill="#1aa3b8" opacity="0.5" />
      <path d="M80 36 C96 28 108 42 126 34 C140 28 150 36 160 33 V48 H80Z" fill="#127b9c" />
      <path d="M92 42 C106 36 116 46 132 40 C144 36 152 42 160 40 V48 H92Z" fill="#0a5476" />
      {[[108, 31], [132, 27], [146, 35]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.6" fill="#d8fbff" />)}
    </>
  ),
  forest: () => (
    <>
      <circle cx="142" cy="12" r="6" fill="#e9f7c8" opacity="0.8" />
      {[[96, 30, 0.7], [110, 22, 0.85], [124, 28, 0.75], [138, 18, 1], [152, 26, 0.8]].map(([x, top, o], i) => (
        <path key={i} d={`M${x} ${top} L${x + 9} ${top + 12} L${x + 5} ${top + 12} L${x + 11} ${top + 22} L${x - 11} ${top + 22} L${x - 5} ${top + 12} L${x - 9} ${top + 12}Z M${x - 1.5} ${top + 22} h3 V48 h-3Z`} fill="#0d3a1f" opacity={o} />
      ))}
    </>
  ),
  lava: (u) => (
    <>
      <defs>
        <radialGradient id={`${u}l`} cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="0.5" stopColor="#ff6a1a" />
          <stop offset="1" stopColor="#ff6a1a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="14" rx="20" ry="12" fill={`url(#${u}l)`} opacity="0.8" />
      <path d="M92 48 L118 16 H138 L160 48Z" fill="#2a0904" />
      <path d="M118 16 H138 L132 24 L128 34 L124 26Z" fill="#ff7a1a" />
      <circle cx="122" cy="6" r="4" fill="#5a2a1e" opacity="0.6" />
      <circle cx="132" cy="2" r="5" fill="#5a2a1e" opacity="0.5" />
    </>
  ),
  galaxy: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb3f0" />
          <stop offset="1" stopColor="#7b3fe4" />
        </linearGradient>
      </defs>
      <circle cx="132" cy="24" r="13" fill={`url(#${u}p)`} />
      <ellipse cx="132" cy="24" rx="24" ry="6" fill="none" stroke="#ffe3fb" strokeWidth="2" transform="rotate(-16 132 24)" opacity="0.85" />
      <path d="M119 24 A13 13 0 0 0 145 24" fill={`url(#${u}p)`} transform="rotate(-16 132 24)" />
      {[[96, 10, 2.5], [108, 38, 2], [154, 8, 3], [156, 40, 2]].map(([x, y, r]) => <path key={x} d={sparklePath(x, y, r)} fill="#fff" />)}
    </>
  ),
  grid: () => (
    <>
      <circle cx="130" cy="22" r="13" fill="#ff3cac" opacity="0.85" />
      <rect x="110" y="20" width="40" height="1.6" fill="#1a0a33" />
      <rect x="110" y="25" width="40" height="2.2" fill="#1a0a33" />
      <rect x="80" y="30" width="80" height="18" fill="#1a0a33" />
      <path d="M80 30 H160 M80 34 H160 M80 39 H160 M80 45 H160" stroke="#3ce0ff" strokeWidth="0.8" opacity="0.7" />
      {[-40, -20, 0, 20, 40, 60].map((d) => <path key={d} d={`M${130 + d * 0.2} 30 L${130 + d} 48`} stroke="#3ce0ff" strokeWidth="0.8" opacity="0.7" />)}
    </>
  ),
  blossom: () => (
    <>
      <path d="M160 8 C140 12 128 22 112 26 M134 18 C132 10 126 6 120 6" fill="none" stroke="#6b3b2a" strokeWidth="2" strokeLinecap="round" />
      <Flower x={116} y={26} r={8} petal="#ffd8e6" heart="#f57aa7" />
      <Flower x={140} y={16} r={9} petal="#fff0f5" heart="#f57aa7" rotate={20} />
      <Flower x={121} y={7} r={5.5} petal="#ffc3d8" heart="#fff1a8" />
      <Flower x={152} y={34} r={6} petal="#ffc3d8" heart="#f57aa7" rotate={40} />
    </>
  ),
  gold: () => (
    <>
      {[[108, 14, 5], [126, 34, 7], [146, 12, 9], [156, 38, 4]].map(([x, y, r]) => <path key={x} d={sparklePath(x, y, r)} fill="#fffbe0" opacity="0.9" />)}
    </>
  ),
  frost: () => (
    <>
      <Snowflake x={118} y={30} r={9} stroke="#f2fbff" width={1.6} />
      <Snowflake x={144} y={14} r={11} stroke="#ffffff" width={1.8} />
      <Snowflake x={150} y={40} r={5} stroke="#e0f4ff" width={1.2} />
    </>
  ),
  void: () => (
    <>
      <path d="M138 6 A16 16 0 1 0 152 34 A12.5 12.5 0 1 1 138 6Z" fill="#c9a7ff" opacity="0.9" />
      {[[106, 12, 2.2], [118, 36, 1.8], [158, 10, 2.4]].map(([x, y, r]) => <path key={x} d={sparklePath(x, y, r)} fill="#e9dcff" />)}
    </>
  ),
  "cat-beans": () => (
    <g transform="rotate(-18 136 30)">
      <path d="M116 60 C112 38 118 18 136 16 C154 18 160 38 156 60Z" fill="#f4a979" stroke="#a5552a" strokeWidth="1.6" />
      <path d="M124 40 C124 32 148 32 148 40 C148 47 140 48 136 46 C132 48 124 47 124 40Z" fill="#ff7aa8" />
      {[[121, 28], [130, 22], [142, 22], [151, 28]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="4" ry="4.8" fill="#ff7aa8" />)}
    </g>
  ),
  koi: () => (
    <>
      {[[112, 30, -20, "#ff7a3d"], [142, 18, 160, "#fff3e8"]].map(([x, y, r, c], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <path d="M-14 0 C-8 -7 8 -7 12 0 C8 7 -8 7 -14 0Z" fill={c as string} />
          <path d="M12 0 L20 -6 L18 0 L20 6Z" fill={c as string} />
          <circle cx="-2" cy="-1" r="2.2" fill={i ? "#ff7a3d" : "#fff3e8"} />
          <circle cx="-9" cy="-1.5" r="1" fill="#1a1a1a" />
        </g>
      ))}
      <circle cx="130" cy="40" r="5" fill="none" stroke="#bff3ff" strokeWidth="0.8" opacity="0.7" />
      <circle cx="130" cy="40" r="9" fill="none" stroke="#bff3ff" strokeWidth="0.6" opacity="0.4" />
    </>
  ),
};

Object.assign(NAMEPLATE_ART, EXTRA_NAMEPLATE_ART);

/** Illustration on the right of a nameplate. Parent must be .has-nameplate. */
export function NameplateArt({ id }: { id?: string | null }) {
  const u = useId().replace(/:/g, "");
  const draw = id ? NAMEPLATE_ART[id] : undefined;
  if (!draw) return null;
  return (
    <svg className="np-art" viewBox="60 0 100 48" preserveAspectRatio={`xMaxYMid ${id && NAMEPLATE_FIT_WHOLE.has(id) ? "meet" : "slice"}`} aria-hidden="true">
      {draw(u)}
    </svg>
  );
}

/** Class names for a row that wears a nameplate. */
export function nameplateClass(id?: string | null) {
  return id && id !== "none" ? ` has-nameplate nameplate-${id}` : "";
}
