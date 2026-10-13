"use client";

import type { CSSProperties, ReactNode } from "react";

/*
 * The second wave of cosmetics: more nameplates, avatar decorations, profile
 * frames and profile effects. Same contracts as cosmetics.tsx (which merges
 * these maps into its own); styles live in app/cosmetics-extra.css under the
 * `cx-` prefix. Everything is inline SVG + CSS, no assets.
 */

/** Deterministic 0..1 noise, so particles sit in the same place every render. */
function noise(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function sparkle(cx: number, cy: number, r: number) {
  const k = r * 0.18;
  return `M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

const HEART = "M10 17.5 C4 13 1 9.5 1 6 C1 3 3.4 1 6 1 C7.8 1 9.2 2 10 3.4 C10.8 2 12.2 1 14 1 C16.6 1 19 3 19 6 C19 9.5 16 13 10 17.5Z";
const BAT = "M30 10 C26 4 22 4 20 8 C14 2 6 4 0 12 C6 12 10 16 12 20 C16 16 22 16 26 20 L30 16 L34 20 C38 16 44 16 48 20 C50 16 54 12 60 12 C54 4 46 2 40 8 C38 4 34 4 30 10Z";

/** CSS custom properties for an animated SVG part. */
const v = (values: Record<string, string | number>) => values as CSSProperties;

/** A five-petal blossom. */
function Blossom({ x, y, r, petal = "#ffd1e3", heart = "#f472b6", rotate = 0, className }: { x: number; y: number; r: number; petal?: string; heart?: string; rotate?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} className={className}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={`M0 0 C${-r * 0.55} ${-r * 0.45} ${-r * 0.45} ${-r * 1.05} 0 ${-r * 1.1} C${r * 0.12} ${-r * 0.92} ${r * 0.3} ${-r * 0.96} ${r * 0.42} ${-r * 1.04} C${r * 0.5} ${-r * 0.5} ${r * 0.4} ${-r * 0.3} 0 0Z`} fill={petal} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.26} fill={heart} />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={`s${a}`} cx={0} cy={-r * 0.42} r={r * 0.07} fill="#fff6c2" transform={`rotate(${a + 36})`} />
      ))}
    </g>
  );
}

/* ================================================================== */
/* Nameplates                                                          */
/* Art sits in a 160x48 strip (only x 60..160 shows, right-aligned).   */
/* The plate's own background is in cosmetics-extra.css.               */
/* ================================================================== */

function Pine({ x, y, h, fill }: { x: number; y: number; h: number; fill: string }) {
  const w = h * 0.42;
  return <path d={`M${x} ${y - h} L${x + w * 0.55} ${y - h * 0.55} L${x + w * 0.3} ${y - h * 0.55} L${x + w * 0.75} ${y - h * 0.15} L${x + w * 0.12} ${y - h * 0.15} L${x + w * 0.12} ${y} L${x - w * 0.12} ${y} L${x - w * 0.12} ${y - h * 0.15} L${x - w * 0.75} ${y - h * 0.15} L${x - w * 0.3} ${y - h * 0.55} L${x - w * 0.55} ${y - h * 0.55}Z`} fill={fill} />;
}

function Flag({ stripes, u }: { stripes: string[]; u: string }) {
  const h = 34 / stripes.length;
  return (
    <>
      <defs>
        <clipPath id={`${u}flag`}>
          <path className="cx-flag-wave" d="M96 8 C108 4 120 12 132 8 C144 4 152 10 160 7 V41 C152 44 144 38 132 42 C120 46 108 38 96 42Z" />
        </clipPath>
        <linearGradient id={`${u}shade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.15" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="93" y="2" width="2.6" height="46" rx="1.3" fill="#e8e3d8" />
      <circle cx="94.3" cy="2.4" r="2.2" fill="#ffd34d" />
      <g clipPath={`url(#${u}flag)`}>
        {stripes.map((color, i) => (
          <rect key={i} x="95" y={7 + i * h - 6} width="66" height={h + (i === 0 ? 6 : 0) + (i === stripes.length - 1 ? 8 : 0)} fill={color} />
        ))}
        <rect x="95" y="0" width="66" height="48" fill={`url(#${u}shade)`} className="cx-flag-shade" />
      </g>
    </>
  );
}

/** Plates drawn around one subject fit whole; the rest fill the strip and crop. */
export const NAMEPLATE_FIT_WHOLE = new Set(["campfire", "winter-cabin", "lofi", "sakura-night", "storm", "arcade", "boba", "strawberry", "pride", "trans-pride", "bi-pride"]);

export const EXTRA_NAMEPLATE_ART: Record<string, (u: string) => ReactNode> = {
  "rainy-night": (u) => (
    <>
      <defs>
        <filter id={`${u}bk`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <g filter={`url(#${u}bk)`}>
        {[[84, 18, 4.5, "#ff5ca8"], [100, 30, 6, "#5cc8ff"], [116, 16, 3.5, "#ffd36b"], [130, 28, 6.5, "#b07cff"], [146, 16, 4.5, "#5cffd0"], [94, 36, 3, "#ffd36b"], [154, 32, 4, "#ff5ca8"], [122, 36, 3, "#5cc8ff"]].map(([x, y, r, c], i) => (
          <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={c as string} opacity="0.32" className="cx-bokeh" style={v({ "--d": `${-i * 0.9}s` })} />
        ))}
      </g>
      <g className="cx-rain" stroke="#cfe6ff" strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
        {Array.from({ length: 22 }, (_, i) => {
          const x = 64 + noise(i, 3) * 100;
          const y = noise(i, 4) * 48;
          return <path key={i} d={`M${x} ${y} l-2.4 7`} style={v({ "--d": `${-noise(i, 5) * 0.8}s` })} />;
        })}
      </g>
      <path d="M60 46 H160" stroke="#9ec9ff" strokeOpacity="0.25" strokeWidth="2" />
    </>
  ),
  campfire: () => (
    <>
      {[[78, 6, 0.9], [96, 12, 0.7], [150, 5, 1], [116, 4, 0.6], [134, 14, 0.8]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff6d6" className="cx-twinkle" style={v({ "--d": `${-i * 0.7}s` })} />
      ))}
      <path d="M60 48 L84 26 L108 48Z" fill="#1d2a3a" />
      <path d="M84 26 L84 48 M84 26 L94 48" stroke="#0f1824" strokeWidth="1.2" />
      <path d="M78 48 L84 36 L90 48Z" fill="#0b1018" />
      <ellipse cx="132" cy="44" rx="26" ry="6" fill="#ff8a2a" opacity="0.25" className="cx-glow" />
      <g className="cx-fire">
        <path d="M120 44 C118 36 124 32 122 24 C128 28 130 20 130 14 C138 22 142 30 138 38 C142 36 144 32 144 30 C148 36 146 42 140 44Z" fill="#ff6a1a" />
        <path d="M125 44 C124 38 129 35 128 29 C133 33 136 38 134 44Z" fill="#ffb02e" />
        <path d="M130 44 C129 40 132 38 132 35 C135 38 136 41 134 44Z" fill="#fff1a8" />
      </g>
      <path d="M114 46 L150 40 M116 40 L148 47" stroke="#5a3218" strokeWidth="4" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={128 + i * 4} cy="30" r="0.9" fill="#ffd36b" className="cx-spark" style={v({ "--d": `${-i * 0.6}s`, "--dx": `${(i - 1.5) * 4}px` })} />
      ))}
    </>
  ),
  "winter-cabin": () => (
    <>
      <circle cx="146" cy="10" r="6" fill="#f4f7ff" opacity="0.9" />
      <path d="M60 48 C80 34 110 30 160 34 V48Z" fill="#eaf2ff" />
      <path d="M60 48 C84 40 116 40 160 44 V48Z" fill="#d6e4fa" />
      <Pine x={76} y={42} h={26} fill="#1f4a3c" />
      <Pine x={152} y={40} h={20} fill="#2a5a48" />
      <g>
        <rect x="104" y="26" width="30" height="16" fill="#6b3f2a" />
        <path d="M100 27 L119 14 L138 27Z" fill="#f4f7ff" stroke="#c9d6ec" strokeWidth="1" />
        <rect x="128" y="13" width="4" height="9" fill="#5a3322" />
        <rect x="110" y="30" width="7" height="7" fill="#ffcf6b" className="cx-window" />
        <rect x="122" y="31" width="6" height="11" fill="#3a2216" />
        <path d="M113.5 30 V37 M110 33.5 H117" stroke="#6b3f2a" strokeWidth="0.8" />
      </g>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="130" cy="10" r={2 + i} fill="#dfe7f2" opacity="0.55" className="cx-smoke" style={v({ "--d": `${-i * 1.2}s` })} />
      ))}
      <g fill="#fff">
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={64 + noise(i, 7) * 96} cy={noise(i, 8) * 30} r={0.6 + noise(i, 9) * 0.9} className="cx-snow" style={v({ "--d": `${-noise(i, 10) * 6}s`, "--t": `${4 + noise(i, 11) * 3}s` })} />
        ))}
      </g>
    </>
  ),
  lofi: () => (
    <>
      <rect x="112" y="4" width="34" height="26" rx="2" fill="#2a2160" stroke="#c7b8ff" strokeOpacity="0.35" strokeWidth="1.4" />
      <circle cx="137" cy="12" r="4.5" fill="#fff4cf" className="cx-moon-glow" />
      <path d="M129 4 V30 M112 17 H146" stroke="#c7b8ff" strokeOpacity="0.3" strokeWidth="1.2" />
      {[[117, 9], [122, 22], [142, 25]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.6" fill="#fff" className="cx-twinkle" style={v({ "--d": `${-i}s` })} />)}
      <path d="M60 40 H160 V48 H60Z" fill="#3a2a52" />
      <path d="M60 40 H160" stroke="#6a5490" strokeWidth="1" />
      <path d="M84 40 L88 22 L94 22 L98 40" fill="#2a1f3c" />
      <path d="M80 24 L91 16 L102 24Z" fill="#ffd36b" />
      <path d="M78 24 L104 24 L118 46 L64 46Z" fill="#ffd36b" opacity="0.12" />
      <g>
        <path d="M100 40 L102 30 H112 L114 40Z" fill="#e6d2b8" />
        <path d="M114 32 C118 32 118 37 113 37" fill="none" stroke="#e6d2b8" strokeWidth="1.6" />
        {[0, 1].map((i) => (
          <path key={i} d={`M${104 + i * 4} 28 C${102 + i * 4} 24 ${106 + i * 4} 22 ${104 + i * 4} 18`} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" className="cx-steam" style={v({ "--d": `${-i * 1.1}s` })} />
        ))}
      </g>
      <g transform="translate(152 40)">
        <path d="M-5 0 L-4 -7 H4 L5 0Z" fill="#c2643a" />
        <path d="M0 -7 C-6 -14 -9 -20 -4 -22 C-1 -18 0 -13 0 -7 C0 -13 2 -20 6 -22 C9 -18 5 -12 0 -7Z" fill="#4fbf7a" className="cx-sway" />
      </g>
    </>
  ),
  "lava-lamp": () => (
    <>
      {[[88, 0.0, 8], [110, 0.35, 11], [134, 0.7, 9], [150, 0.15, 7], [100, 0.55, 6], [124, 0.9, 7]].map(([x, d, r], i) => (
        <g key={i} className="cx-blob" style={v({ "--d": `${-d * 9}s`, "--t": `${8 + i}s` })}>
          <ellipse cx={x} cy="56" rx={r} ry={r * 1.15} fill={i % 2 ? "#ffb347" : "#ff5c8a"} />
        </g>
      ))}
      <path d="M60 46 H160" stroke="#ffd0e0" strokeOpacity="0.25" strokeWidth="1.2" />
    </>
  ),
  arcade: () => {
    const invader = "M2 0 H3 V1 H2Z M8 0 H9 V1 H8Z M3 1 H4 V2 H3Z M7 1 H8 V2 H7Z M2 2 H9 V3 H2Z M1 3 H3 V4 H1Z M4 3 H7 V4 H4Z M8 3 H10 V4 H8Z M0 4 H11 V5 H0Z M0 5 H1 V7 H0Z M2 5 H9 V6 H2Z M10 5 H11 V7 H10Z M2 6 H3 V7 H2Z M8 6 H9 V7 H8Z M3 7 H5 V8 H3Z M6 7 H8 V8 H6Z";
    return (
      <>
        <g className="cx-invaders">
          {[0, 1, 2, 3].map((col) =>
            [0, 1].map((row) => (
              <path key={`${col}-${row}`} d={invader} transform={`translate(${92 + col * 16} ${6 + row * 11}) scale(1.05)`} fill={row ? "#5cffb0" : "#ff5ca8"} />
            )),
          )}
        </g>
        <path d="M128 40 h3 v-2 h2 v-2 h2 v2 h2 v2 h3 v3 h-12Z" fill="#5cc8ff" />
        <rect x="133.6" y="27" width="1" height="5" fill="#fff36b" className="cx-shot" />
        <text x="152" y="47" fontFamily="monospace" fontSize="5" fill="#fff36b" textAnchor="end" opacity="0.8">1UP</text>
      </>
    );
  },
  "cyber-city": () => (
    <>
      <circle cx="140" cy="14" r="9" fill="#ff3cac" opacity="0.35" />
      {[[64, 22, 12], [78, 12, 10], [90, 26, 14], [106, 6, 12], [120, 18, 10], [132, 10, 14], [148, 22, 12]].map(([x, top, w], i) => (
        <g key={i}>
          <rect x={x} y={top} width={w} height={48 - top} fill={i % 2 ? "#120a2a" : "#1a1040"} />
          {Array.from({ length: 6 }, (_, k) => {
            const wx = x + 2 + (k % 2) * (w / 2 - 1);
            const wy = top + 4 + Math.floor(k / 2) * 7;
            return wy < 46 ? <rect key={k} x={wx} y={wy} width="2.4" height="2.2" fill={noise(i * 7 + k, 3) > 0.5 ? "#5cf3ff" : "#ff7ad9"} opacity={0.45 + noise(i * 7 + k, 4) * 0.5} className={noise(i * 7 + k, 5) > 0.7 ? "cx-flicker" : undefined} style={v({ "--d": `${-noise(i * 7 + k, 6) * 4}s` })} /> : null;
          })}
        </g>
      ))}
      <rect x="107" y="10" width="10" height="3" rx="1" fill="#ff3cac" className="cx-neon" />
      <g className="cx-car">
        <path d="M0 0 h8 l2 2 h-12Z" fill="#cfd8ff" />
        <circle cx="-2" cy="1.5" r="1" fill="#ff3c5c" />
      </g>
    </>
  ),
  "deep-sea": () => (
    <>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${96 + i * 22} -2 L${86 + i * 22} 50 L${104 + i * 22} 50Z`} fill="#bff3ff" opacity="0.08" className="cx-ray" style={v({ "--d": `${-i * 1.6}s` })} />
      ))}
      {[[72, 0], [148, 1], [158, 2]].map(([x, i]) => (
        <path key={x} d={`M${x} 48 C${x - 4} 40 ${x + 4} 34 ${x} 26 C${x - 3} 20 ${x + 2} 16 ${x} 12`} fill="none" stroke="#1f8a6a" strokeWidth="3" strokeLinecap="round" className="cx-kelp" style={v({ "--d": `${-i}s` })} />
      ))}
      <g className="cx-fish">
        <path d="M0 0 C4 -4 12 -4 14 0 C12 4 4 4 0 0Z M14 0 L19 -3 L18 0 L19 3Z" fill="#ffb347" />
        <circle cx="4" cy="-0.6" r="0.9" fill="#1a1a1a" />
      </g>
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} cx={100 + noise(i, 2) * 50} cy="48" r={0.8 + noise(i, 3) * 1.4} fill="none" stroke="#dff8ff" strokeWidth="0.6" className="cx-bubble" style={v({ "--d": `${-noise(i, 4) * 4}s`, "--t": `${3 + noise(i, 5) * 2}s` })} />
      ))}
    </>
  ),
  dunes: () => (
    <>
      <circle cx="134" cy="20" r="13" fill="#fff1c2" />
      <circle cx="134" cy="20" r="18" fill="#fff1c2" opacity="0.25" className="cx-glow" />
      <path d="M60 36 C84 28 104 34 124 30 C140 27 150 30 160 28 V48 H60Z" fill="#e98a52" />
      <path d="M60 44 C90 34 112 42 134 36 C146 33 154 36 160 35 V48 H60Z" fill="#c75f3a" />
      <path d="M96 40 V28 M96 34 h-4 v-5 M96 32 h4 v-6" fill="none" stroke="#2f5a34" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M152 36 V28 M152 32 h-3 v-3" fill="none" stroke="#2f5a34" strokeWidth="2" strokeLinecap="round" />
      <path d="M110 12 q3 -2 6 0 M118 8 q2 -1.5 4 0" fill="none" stroke="#7a3a2a" strokeWidth="0.9" strokeLinecap="round" className="cx-birds" />
    </>
  ),
  "sakura-night": () => (
    <>
      <circle cx="132" cy="18" r="12" fill="#fff6e0" />
      <circle cx="132" cy="18" r="17" fill="#fff6e0" opacity="0.18" />
      <path d="M160 6 C146 10 132 18 116 22 C104 25 96 32 90 40 M132 18 C128 12 122 9 116 9 M116 22 C112 28 104 30 98 30" fill="none" stroke="#3a2030" strokeWidth="2.2" strokeLinecap="round" />
      <Blossom x={118} y={9} r={4.5} />
      <Blossom x={104} y={25} r={5.5} rotate={20} />
      <Blossom x={92} y={38} r={4} rotate={40} petal="#ffc2d8" />
      <Blossom x={146} y={10} r={4.5} rotate={-10} petal="#fff0f6" />
      {Array.from({ length: 7 }, (_, i) => (
        <ellipse key={i} cx={70 + noise(i, 3) * 80} cy="-4" rx="1.6" ry="1" fill="#ffc2d8" className="cx-petal" style={v({ "--d": `${-noise(i, 4) * 6}s`, "--t": `${5 + noise(i, 5) * 3}s` })} />
      ))}
    </>
  ),
  meadow: () => (
    <>
      <path d={`M60 48 ${Array.from({ length: 26 }, (_, i) => `L${62 + i * 3.9} ${30 + noise(i, 2) * 12} L${64 + i * 3.9} 48`).join(" ")}Z`} fill="#0e2a1f" />
      <path d={`M60 48 ${Array.from({ length: 20 }, (_, i) => `L${63 + i * 5} ${38 + noise(i, 6) * 8} L${66 + i * 5} 48`).join(" ")}Z`} fill="#16402c" />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={70 + noise(i, 7) * 86} cy={8 + noise(i, 8) * 28} r="1.3" fill="#fff59a" className="cx-firefly" style={v({ "--d": `${-noise(i, 9) * 5}s`, "--dx": `${(noise(i, 10) - 0.5) * 10}px`, "--dy": `${(noise(i, 11) - 0.5) * 8}px` })} />
      ))}
    </>
  ),
  boba: () => (
    <>
      <g transform="translate(130 4)">
        <path d="M-12 8 H12 L9 44 H-9Z" fill="#fff" fillOpacity="0.55" stroke="#fff" strokeWidth="1.2" />
        <path d="M-11 18 H11 L9 44 H-9Z" fill="#e8b98a" />
        {[[-5, 38], [0, 40], [5, 37], [-2, 34], [4, 32], [-6, 32]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#3a2418" />)}
        <path d="M-13 8 H13" stroke="#ff8fc2" strokeWidth="3" strokeLinecap="round" />
        <path d="M3 8 L8 -6" stroke="#ff5ca8" strokeWidth="3" strokeLinecap="round" />
      </g>
      {[[92, 12, 4], [104, 34, 3], [154, 16, 3.5], [112, 8, 2.5]].map(([x, y, r], i) => (
        <path key={i} d={sparkle(x, y, r)} fill="#fff" className="cx-twinkle" style={v({ "--d": `${-i * 0.8}s` })} />
      ))}
      <path d={HEART} transform="translate(92 26) scale(0.5)" fill="#ff5ca8" className="cx-float" />
    </>
  ),
  strawberry: () => (
    <>
      {[[100, 26, 1, 0], [128, 16, 1.25, -12], [150, 34, 0.9, 16]].map(([x, y, s, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} className="cx-bob" style={v({ "--d": `${-i * 0.9}s` })}>
          <path d="M0 -8 C8 -8 11 -2 9 4 C7 10 2 13 0 14 C-2 13 -7 10 -9 4 C-11 -2 -8 -8 0 -8Z" fill="#ff3d5e" />
          <path d="M-5 -9 L0 -6 L5 -9 L3 -5 L-3 -5Z" fill="#3fbf6a" />
          {[[-4, -2], [2, -3], [5, 3], [-2, 4], [0, 9], [-6, 4]].map(([x2, y2], k) => <ellipse key={k} cx={x2} cy={y2} rx="0.7" ry="1" fill="#ffe08a" />)}
          <ellipse cx="-4" cy="-4" rx="2" ry="1" fill="#fff" opacity="0.4" transform="rotate(-30)" />
        </g>
      ))}
    </>
  ),
  holo: () => (
    <>
      {[[86, 12, 4], [118, 32, 5], [146, 10, 3.5], [104, 40, 2.5], [156, 38, 3]].map(([x, y, r], i) => (
        <path key={i} d={sparkle(x, y, r)} fill="#fff" className="cx-twinkle" style={v({ "--d": `${-i * 0.6}s` })} />
      ))}
    </>
  ),
  mainframe: () => (
    <g fontFamily="monospace" fontSize="6" fontWeight="700">
      {Array.from({ length: 9 }, (_, i) => (
        <text key={i} x={70 + i * 11} y="0" fill="#5cff8a" className="cx-code" style={v({ "--d": `${-noise(i, 3) * 4}s`, "--t": `${2.4 + noise(i, 4) * 2.4}s` })}>
          {Array.from({ length: 8 }, (_, k) => (
            <tspan key={k} x={70 + i * 11} dy="6.5" opacity={0.25 + (k / 8) * 0.75} fill={k === 7 ? "#d6ffe0" : undefined}>
              {"01アイウエオカキクケコ"[Math.floor(noise(i * 8 + k, 5) * 15)]}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  ),
  embers: () => (
    <>
      <ellipse cx="128" cy="52" rx="40" ry="14" fill="#ff5a1a" opacity="0.35" className="cx-glow" />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx={66 + noise(i, 2) * 94} cy="50" r={0.6 + noise(i, 3) * 1.2} fill={i % 3 ? "#ffb347" : "#fff1a8"} className="cx-ember" style={v({ "--d": `${-noise(i, 4) * 3}s`, "--t": `${2 + noise(i, 5) * 2}s`, "--dx": `${(noise(i, 6) - 0.5) * 16}px` })} />
      ))}
    </>
  ),
  storm: () => (
    <>
      <path d="M60 4 C70 -2 80 6 90 2 C100 -4 112 6 124 2 C136 -2 146 6 160 2 V16 C150 20 140 12 128 18 C116 22 104 14 92 18 C80 22 70 14 60 18Z" fill="#2a2f45" />
      <path d="M60 12 C72 8 82 16 94 12 C106 8 118 16 130 12 C142 8 150 14 160 12 V20 C148 24 138 18 126 22 C114 26 102 18 90 22 C78 26 68 18 60 22Z" fill="#3a405c" />
      <path d="M126 18 L118 32 H125 L119 46 L134 28 H127 L133 18Z" fill="#fff8b0" className="cx-bolt" />
      <g stroke="#9fb4ff" strokeWidth="0.8" strokeLinecap="round" opacity="0.55" className="cx-rain">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${64 + noise(i, 7) * 96} ${20 + noise(i, 8) * 24} l-2 6`} style={v({ "--d": `${-noise(i, 9) * 0.8}s` })} />
        ))}
      </g>
    </>
  ),
  pride: (u) => <Flag u={u} stripes={["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"]} />,
  "trans-pride": (u) => <Flag u={u} stripes={["#5bcefa", "#f5a9b8", "#ffffff", "#f5a9b8", "#5bcefa"]} />,
  "bi-pride": (u) => <Flag u={u} stripes={["#d60270", "#d60270", "#9b4f96", "#0038a8", "#0038a8"]} />,
};

/* ================================================================== */
/* Avatar decorations                                                  */
/* A 120x120 box; the avatar is the circle at (60,60) r50.             */
/* ================================================================== */

/** A jagged arc of lightning around the avatar, from `start` through `sweep` degrees. */
function boltArc(seed: number, start: number, sweep: number, r = 54) {
  const steps = 9;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((start + (sweep * i) / steps) * Math.PI) / 180;
    const rr = r + (i === 0 || i === steps ? 0 : (noise(i, seed) - 0.5) * 9);
    return `${i ? "L" : "M"}${(60 + Math.cos(a) * rr).toFixed(1)} ${(60 + Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
}

const PIXEL_HEART = "M1 0 H3 V1 H4 V0 H6 V1 H7 V4 H6 V5 H5 V6 H4 V7 H3 V6 H2 V5 H1 V4 H0 V1 H1Z";

export const EXTRA_DECORATIONS: Record<string, (u: string) => ReactNode> = {
  "flame-crown": (u) => {
    const tongues = Array.from({ length: 13 }, (_, i) => ({ a: -168 + i * 13, h: 13 + noise(i, 3) * 13, d: -noise(i, 4) * 0.7 }));
    return (
      <>
        <defs>
          <linearGradient id={`${u}fl`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff2d00" />
            <stop offset="0.55" stopColor="#ff9a1a" />
            <stop offset="1" stopColor="#ffe9a0" />
          </linearGradient>
          <filter id={`${u}bl`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        <circle cx="60" cy="60" r="51" fill="none" stroke="#ff6a1a" strokeWidth="5" opacity="0.6" filter={`url(#${u}bl)`} className="cx-d-pulse" />
        {tongues.map((t, i) => (
          <g key={i} transform={`rotate(${t.a + 90} 60 60)`}>
            <path d={`M53 13 C52 ${13 - t.h * 0.5} 57 ${13 - t.h * 0.75} 60 ${13 - t.h} C62 ${13 - t.h * 0.62} 68 ${13 - t.h * 0.42} 67 13Z`} fill={`url(#${u}fl)`} className="cx-d-flame" style={v({ "--d": `${t.d}s` })} />
            <path d={`M57 13 C57 ${13 - t.h * 0.35} 59 ${13 - t.h * 0.5} 60 ${13 - t.h * 0.62} C61 ${13 - t.h * 0.4} 63 ${13 - t.h * 0.3} 63 13Z`} fill="#fff3c2" opacity="0.9" className="cx-d-flame" style={v({ "--d": `${t.d - 0.2}s` })} />
          </g>
        ))}
      </>
    );
  },
  orbit: (u) => {
    const planets = [
      { r: 6.5, t: 8, fill: `url(#${u}p1)`, ring: true },
      { r: 4.2, t: 11, fill: `url(#${u}p2)`, ring: false },
      { r: 2.8, t: 6, fill: "#e6e1ff", ring: false },
    ];
    return (
      <>
        <defs>
          <radialGradient id={`${u}p1`} cx="0.35" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#ffe3a8" />
            <stop offset="1" stopColor="#e07a3a" />
          </radialGradient>
          <radialGradient id={`${u}p2`} cx="0.35" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#bfefff" />
            <stop offset="1" stopColor="#3a7ad8" />
          </radialGradient>
        </defs>
        <g transform="rotate(-16 60 60)">
          <path d="M2 60 A58 15 0 0 1 118 60" fill="none" stroke="#c9b8ff" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="2 4" />
          <path d="M2 60 A58 15 0 0 0 118 60" fill="none" stroke="#e6dcff" strokeOpacity="0.8" strokeWidth="1.6" />
          {planets.map((p, i) => (
            <g key={i} className="cx-d-orbit-x" style={v({ "--t": `${p.t}s`, "--d": `${-i * 2.3}s` })}>
              <g className="cx-d-orbit-y" style={v({ "--t": `${p.t}s`, "--d": `${-i * 2.3 - p.t / 4}s` })}>
                <circle cx="60" cy="60" r={p.r} fill={p.fill} />
                {p.ring && <ellipse cx="60" cy="60" rx={p.r * 1.8} ry={p.r * 0.5} fill="none" stroke="#ffe9c2" strokeWidth="1.2" transform="rotate(-20 60 60)" />}
              </g>
            </g>
          ))}
        </g>
        {[[12, 14, 3], [106, 104, 2.6], [110, 22, 2]].map(([x, y, r], i) => (
          <path key={i} d={sparkle(x, y, r)} fill="#fff" className="cx-twinkle" style={v({ "--d": `${-i * 0.8}s` })} />
        ))}
      </>
    );
  },
  lightning: (u) => (
    <>
      <defs>
        <filter id={`${u}zap`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="#5cc8ff" strokeWidth="2" opacity="0.35" filter={`url(#${u}zap)`} />
      {[[3, -150, 70, 0], [7, -40, 80, -0.3], [11, 70, 60, -0.6], [15, 160, 50, -0.9]].map(([seed, start, sweep, d]) => (
        <g key={seed} className="cx-d-zap" style={v({ "--d": `${d}s` })}>
          <path d={boltArc(seed, start, sweep)} fill="none" stroke="#5cc8ff" strokeWidth="4" strokeLinejoin="round" filter={`url(#${u}zap)`} />
          <path d={boltArc(seed, start, sweep)} fill="none" stroke="#f2fbff" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      ))}
      <path d="M96 2 L88 16 H94 L86 30 L102 12 H95 L102 2Z" fill="#fff8b0" stroke="#5cc8ff" strokeWidth="1" className="cx-d-bolt" />
    </>
  ),
  "sakura-wreath": () => (
    <>
      <path d="M8 74 C2 48 16 22 40 10 C54 3 70 2 82 6" fill="none" stroke="#5a3428" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 30 C18 24 18 16 22 12 M52 8 C52 2 56 -2 62 -2" fill="none" stroke="#5a3428" strokeWidth="2" strokeLinecap="round" />
      <Blossom x={10} y={62} r={7} />
      <Blossom x={20} y={36} r={8.5} rotate={20} petal="#fff0f6" />
      <Blossom x={40} y={14} r={9} rotate={-10} />
      <Blossom x={64} y={4} r={7} rotate={30} petal="#ffc2d8" />
      <Blossom x={82} y={8} r={5.5} rotate={10} petal="#fff0f6" />
      <circle cx="22" cy="12" r="2.6" fill="#ff8fb8" />
      <circle cx="62" cy="-2" r="2.4" fill="#ff8fb8" />
      {Array.from({ length: 5 }, (_, i) => (
        <ellipse key={i} cx={86 + noise(i, 3) * 26} cy="4" rx="3" ry="1.8" fill={i % 2 ? "#ffd1e3" : "#ffb3cd"} className="cx-d-petal" style={v({ "--d": `${-i * 1.3}s`, "--t": `${5 + noise(i, 4) * 2}s` })} />
      ))}
    </>
  ),
  gamer: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}rgb`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3cac" />
          <stop offset="0.5" stopColor="#5cf3ff" />
          <stop offset="1" stopColor="#7cff6b" />
        </linearGradient>
      </defs>
      <path d="M12 56 C10 18 34 2 60 2 C86 2 110 18 108 56" fill="none" stroke="#1b1d26" strokeWidth="9" strokeLinecap="round" />
      <path d="M16 50 C16 20 36 7 60 7 C84 7 104 20 104 50" fill="none" stroke={`url(#${u}rgb)`} strokeWidth="2.2" strokeLinecap="round" className="cx-d-rgb" />
      {[0, 1].map((i) => (
        <g key={i} transform={i ? "matrix(-1 0 0 1 120 0)" : undefined}>
          <rect x="-2" y="44" width="22" height="34" rx="10" fill="#1b1d26" stroke="#3a3d4e" strokeWidth="1.6" />
          <rect x="2" y="49" width="14" height="24" rx="7" fill="none" stroke={`url(#${u}rgb)`} strokeWidth="2.4" className="cx-d-rgb" />
          <path d="M6 54 L9 52 M6 60 L9 58" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M8 76 C8 96 22 104 38 104" fill="none" stroke="#1b1d26" strokeWidth="4" strokeLinecap="round" />
      <rect x="34" y="99" width="12" height="9" rx="4.5" fill="#2a2d3a" />
      <circle cx="44" cy="103.5" r="2" fill="#ff3c5c" className="cx-d-blink" />
    </>
  ),
  beanie: () => (
    <>
      <g transform="translate(60 -8) scale(0.82) translate(-60 0)">
      <path d="M8 46 C8 14 32 -6 60 -6 C88 -6 112 14 112 46Z" fill="#e2a33a" stroke="#8a5a14" strokeWidth="2.2" strokeLinejoin="round" />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 20 + i * 10;
        return <path key={i} d={`M${x} 4 L${x + 3} 10 L${x} 16 L${x + 3} 22 L${x} 28 L${x + 3} 34`} fill="none" stroke="#b97a1e" strokeWidth="1.4" strokeLinejoin="round" opacity="0.8" />;
      })}
      <rect x="4" y="34" width="112" height="18" rx="9" fill="#f4e7c8" stroke="#8a5a14" strokeWidth="2.2" />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M${12 + i * 7.4} 37 V49`} stroke="#d8c49a" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <g className="cx-d-bounce">
        <circle cx="60" cy="-12" r="12" fill="#f4e7c8" stroke="#8a5a14" strokeWidth="2" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return <path key={i} d={`M${60 + Math.cos(a) * 6} ${-12 + Math.sin(a) * 6} L${60 + Math.cos(a) * 11} ${-12 + Math.sin(a) * 11}`} stroke="#d8c49a" strokeWidth="1.8" strokeLinecap="round" />;
        })}
      </g>
      </g>
      {[[100, 70, 4.5], [14, 90, 3.5]].map(([x, y, r], i) => (
        <g key={i} className="cx-d-drift" style={v({ "--d": `${-i * 2}s` })} stroke="#e8f6ff" strokeWidth="1.3" strokeLinecap="round">
          {[0, 60, 120].map((a) => (
            <path key={a} d={`M${x} ${y - r} V${y + r}`} transform={`rotate(${a} ${x} ${y})`} />
          ))}
        </g>
      ))}
    </>
  ),
  mushroom: () => (
    <>
      <g transform="translate(64 -12) scale(0.82) translate(-60 0) rotate(-16 60 16)">
        <path d="M6 30 C6 2 34 -14 60 -14 C86 -14 114 2 114 30 C96 24 80 22 60 22 C40 22 24 24 6 30Z" fill="#e8322e" stroke="#7a1414" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M14 22 C20 6 40 -6 60 -8" fill="none" stroke="#ff8a80" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
        {[[28, 4, 6], [52, -4, 5], [78, 0, 7], [98, 12, 4.5], [40, 14, 3.5], [66, 12, 4]].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.8} fill="#fff8f0" />
        ))}
        <path d="M14 28 C30 24 44 23 60 23 C76 23 90 24 106 28" fill="none" stroke="#f4e3cc" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(14 108)">
        <path d="M-4 0 V-8 H4 V0Z" fill="#f4e3cc" stroke="#8a6a4a" strokeWidth="1.2" />
        <path d="M-10 -7 C-10 -16 10 -16 10 -7Z" fill="#c2632e" stroke="#6b2e10" strokeWidth="1.4" />
        <circle cx="-3" cy="-11" r="1.4" fill="#fff8f0" />
      </g>
      <g transform="translate(26 112) scale(0.7)">
        <path d="M-4 0 V-8 H4 V0Z" fill="#f4e3cc" stroke="#8a6a4a" strokeWidth="1.4" />
        <path d="M-10 -7 C-10 -16 10 -16 10 -7Z" fill="#e8322e" stroke="#7a1414" strokeWidth="1.6" />
        <circle cx="3" cy="-11" r="1.6" fill="#fff8f0" />
      </g>
      <path d="M4 112 C10 106 18 108 34 112" fill="none" stroke="#4f9a4a" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  pumpkin: (u) => (
    <>
      <defs>
        <radialGradient id={`${u}pk`} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="1" stopColor="#d9531a" />
        </radialGradient>
      </defs>
      <g transform="translate(96 98)">
        <ellipse cx="0" cy="0" rx="22" ry="17" fill={`url(#${u}pk)`} stroke="#7a2a06" strokeWidth="2" />
        <path d="M-8 -16 C-12 -4 -12 6 -8 16 M8 -16 C12 -4 12 6 8 16 M0 -17 V17" fill="none" stroke="#b8400e" strokeWidth="1.6" opacity="0.7" />
        <path d="M-2 -16 C-2 -22 0 -26 4 -28" fill="none" stroke="#4a6a1a" strokeWidth="4" strokeLinecap="round" />
        <path d="M2 -24 C10 -30 18 -24 12 -20 C8 -18 12 -14 16 -16" fill="none" stroke="#6b9a2a" strokeWidth="1.6" strokeLinecap="round" />
        <g className="cx-d-candle">
          <path d="M-13 -5 L-7 -10 L-4 -3Z M13 -5 L7 -10 L4 -3Z" fill="#ffe35c" />
          <path d="M-12 4 L-8 8 L-4 4 L0 9 L4 4 L8 8 L12 4 C8 13 -8 13 -12 4Z" fill="#ffe35c" />
        </g>
      </g>
      <g className="cx-d-batfly">
        <path d={BAT} transform="translate(4 8) scale(0.36)" fill="#1a0b22" />
      </g>
    </>
  ),
  "cat-loaf": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}fur`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8a3b8" />
          <stop offset="1" stopColor="#77718a" />
        </linearGradient>
      </defs>
      <path d="M22 14 C6 10 4 -2 14 -4" fill="none" stroke="#77718a" strokeWidth="6" strokeLinecap="round" className="cx-d-tail" />
      <path d="M18 18 C18 2 38 -6 62 -6 C78 -6 92 0 92 12 C92 18 88 20 80 20 H28 C20 20 18 20 18 18Z" fill={`url(#${u}fur)`} stroke="#3e3a4a" strokeWidth="2" />
      {[40, 52, 64].map((x) => <path key={x} d={`M${x} -5 C${x - 2} 0 ${x - 2} 4 ${x} 8`} fill="none" stroke="#5a556a" strokeWidth="2" strokeLinecap="round" />)}
      <g>
        <path d="M78 6 L80 -10 L88 -2Z M98 -2 L104 -10 L104 6Z" fill="#8f89a3" stroke="#3e3a4a" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M81 -6 L83 0 L86 -2Z M102 -6 L102 2 L100 -1Z" fill="#ffb3c7" />
        <ellipse cx="92" cy="8" rx="16" ry="13" fill="#9b95ae" stroke="#3e3a4a" strokeWidth="2" />
        <path d="M84 8 q3 2.4 6 0 M95 8 q3 2.4 6 0" fill="none" stroke="#2a2633" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M91 12 L93 12 L92 13.4Z" fill="#ff8fa8" />
        <ellipse cx="84" cy="13" rx="2.4" ry="1.4" fill="#ff9cb5" opacity="0.6" />
        <ellipse cx="100" cy="13" rx="2.4" ry="1.4" fill="#ff9cb5" opacity="0.6" />
      </g>
      {["z", "z", "Z"].map((ch, i) => (
        <text key={i} x="104" y="-8" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize={7 + i * 2} fill="#e6e1ff" className="cx-d-zzz" style={v({ "--d": `${-i * 1}s` })}>
          {ch}
        </text>
      ))}
    </>
  ),
  bubbles: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}ir`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9ad5" />
          <stop offset="0.35" stopColor="#9ad8ff" />
          <stop offset="0.7" stopColor="#c8ff9a" />
          <stop offset="1" stopColor="#ffd59a" />
        </linearGradient>
      </defs>
      {[[6, 7, 0], [114, 9, 0.5], [16, 5, 1.1], [104, 6, 1.7], [-2, 4, 2.3], [118, 5, 2.9], [10, 3.5, 3.4]].map(([x, r, d], i) => (
        <g key={i} className="cx-d-rise" style={v({ "--d": `${-d}s`, "--dx": `${i % 2 ? -6 : 6}px` })}>
          <circle cx={x} cy="112" r={r} fill="#fff" fillOpacity="0.08" stroke={`url(#${u}ir)`} strokeWidth="1.4" />
          <ellipse cx={x - r * 0.35} cy={112 - r * 0.4} rx={r * 0.28} ry={r * 0.16} fill="#fff" opacity="0.85" transform={`rotate(-35 ${x - r * 0.35} ${112 - r * 0.4})`} />
        </g>
      ))}
    </>
  ),
  butterflies: () => (
    <>
      {[{ x: 100, y: 14, c1: "#7ad7ff", c2: "#3a6ad8", d: 0 }, { x: 14, y: 26, c1: "#ffb3e0", c2: "#d84a9a", d: -2.2 }].map((b, i) => (
        <g key={i} className="cx-d-flutter" style={v({ "--d": `${b.d}s` })}>
          <g transform={`translate(${b.x} ${b.y}) rotate(${i ? -20 : 15})`}>
            <g className="cx-d-wing">
              <path d="M0 0 C-6 -12 -18 -12 -16 -2 C-15 4 -6 4 0 0Z" fill={b.c1} stroke={b.c2} strokeWidth="1" />
              <path d="M0 0 C-5 6 -12 10 -12 4 C-12 0 -6 0 0 0Z" fill={b.c2} />
              <circle cx="-9" cy="-5" r="1.6" fill="#fff" opacity="0.8" />
            </g>
            <g transform="scale(-1 1)">
              <g className="cx-d-wing">
                <path d="M0 0 C-6 -12 -18 -12 -16 -2 C-15 4 -6 4 0 0Z" fill={b.c1} stroke={b.c2} strokeWidth="1" />
                <path d="M0 0 C-5 6 -12 10 -12 4 C-12 0 -6 0 0 0Z" fill={b.c2} />
                <circle cx="-9" cy="-5" r="1.6" fill="#fff" opacity="0.8" />
              </g>
            </g>
            <ellipse cx="0" cy="1" rx="1.4" ry="5" fill="#2a1f3a" />
            <path d="M0 -4 C-1 -8 -3 -9 -4 -10 M0 -4 C1 -8 3 -9 4 -10" fill="none" stroke="#2a1f3a" strokeWidth="0.8" strokeLinecap="round" />
          </g>
        </g>
      ))}
    </>
  ),
  "ghost-buddy": (u) => (
    <>
      <defs>
        <filter id={`${u}gh`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g className="cx-d-ghost">
        <path d="M86 8 C86 -6 96 -12 104 -12 C112 -12 122 -6 122 8 V26 L118 22 L114 27 L110 22 L106 27 L102 22 L98 27 L94 22 L90 27 L86 22Z" fill="#dff4ff" opacity="0.5" filter={`url(#${u}gh)`} />
        <path d="M86 8 C86 -6 96 -12 104 -12 C112 -12 122 -6 122 8 V26 L118 22 L114 27 L110 22 L106 27 L102 22 L98 27 L94 22 L90 27 L86 22Z" fill="#fbfdff" stroke="#9fb8d8" strokeWidth="1.4" strokeLinejoin="round" />
        <ellipse cx="98" cy="4" rx="2.4" ry="3.2" fill="#2a2f45" />
        <ellipse cx="110" cy="4" rx="2.4" ry="3.2" fill="#2a2f45" />
        <circle cx="98.8" cy="2.8" r="0.9" fill="#fff" />
        <circle cx="110.8" cy="2.8" r="0.9" fill="#fff" />
        <ellipse cx="94" cy="10" rx="2.6" ry="1.5" fill="#ffb3c7" opacity="0.8" />
        <ellipse cx="114" cy="10" rx="2.6" ry="1.5" fill="#ffb3c7" opacity="0.8" />
        <path d="M102 10 q2 2 4 0" fill="none" stroke="#2a2f45" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M86 12 C82 12 80 16 82 18" fill="none" stroke="#9fb8d8" strokeWidth="1.6" strokeLinecap="round" className="cx-d-wave" />
      </g>
      <path d={sparkle(80, -4, 3.5)} fill="#dff4ff" className="cx-twinkle" />
    </>
  ),
  live: () => (
    <>
      <circle cx="60" cy="60" r="51.5" fill="none" stroke="#ff2e4d" strokeWidth="3.2" className="cx-d-live-ring" />
      <g transform="translate(60 108)">
        <rect x="-21" y="-8" width="42" height="16" rx="5" fill="#ff2e4d" stroke="#fff" strokeWidth="2" />
        <circle cx="-12" cy="0" r="2.6" fill="#fff" className="cx-d-blink" />
        <text x="4" y="4" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="10.5" letterSpacing="0.6" fill="#fff">LIVE</text>
      </g>
    </>
  ),
  "pixel-hearts": () => (
    <g className="cx-d-spin-slow">
      {[[-40, 1.3, "#ff3c6e"], [30, 1, "#ff8fb8"], [100, 1.5, "#ff3c6e"], [170, 0.9, "#ffb3cd"], [240, 1.2, "#ff5c8a"]].map(([a, s, c], i) => {
        const rad = ((a as number) * Math.PI) / 180;
        const x = 60 + Math.cos(rad) * 58;
        const y = 60 + Math.sin(rad) * 58;
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${(s as number) * 1.4}) translate(-3.5 -3.5)`}>
            <g className="cx-d-beat" style={v({ "--d": `${-i * 0.3}s` })}>
              <path d={PIXEL_HEART} fill={c as string} stroke="#5a0a24" strokeWidth="0.5" />
              <path d="M1 1 H2 V2 H1Z" fill="#fff" opacity="0.8" />
            </g>
          </g>
        );
      })}
    </g>
  ),
};

/* ================================================================== */
/* Profile frames                                                      */
/* ================================================================== */

interface PieceProps {
  at: "top" | "bottom";
  /** Width as a percentage of the card. */
  width: number;
  left?: number;
  right?: number;
  /** How much of the piece overlaps onto the card, 0..1 of its own height. */
  overlap: number;
  viewBox: string;
  className?: string;
  children: ReactNode;
}

/** One piece of frame art pinned to the top or bottom edge (same as cosmetics.tsx). */
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

function bezier(p: number[][], t: number) {
  const m = 1 - t;
  const pt = (k: number) => m * m * m * p[0][k] + 3 * m * m * t * p[1][k] + 3 * m * t * t * p[2][k] + t * t * t * p[3][k];
  const d = (k: number) => 3 * m * m * (p[1][k] - p[0][k]) + 6 * m * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]);
  return { x: pt(0), y: pt(1), a: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
}

const MAPLE = "M0 -12 L2 -6 L6 -9 L5 -3 L11 -4 L7 1 L10 3 L3 4 L4 8 L0 6 L-4 8 L-3 4 L-10 3 L-7 1 L-11 -4 L-5 -3 L-6 -9 L-2 -6Z";

function Coin({ x, y, r = 9, u }: { x: number; y: number; r?: number; u: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y + 1.6} rx={r} ry={r * 0.38} fill="#8a6a14" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.38} fill={`url(#${u}gold)`} stroke="#8a6a14" strokeWidth="0.8" />
      <ellipse cx={x} cy={y} rx={r * 0.6} ry={r * 0.22} fill="none" stroke="#fff1b0" strokeWidth="0.7" opacity="0.7" />
    </g>
  );
}

function Pumpkin({ x, y, s, lit, u }: { x: number; y: number; s: number; lit?: boolean; u: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="22" ry="17" fill={`url(#${u}pk)`} stroke="#7a2a06" strokeWidth="1.8" />
      <path d="M-8 -16 C-12 -4 -12 6 -8 16 M8 -16 C12 -4 12 6 8 16 M0 -17 V17" fill="none" stroke="#b8400e" strokeWidth="1.5" opacity="0.7" />
      <path d="M-1 -16 C-1 -21 1 -24 4 -26" fill="none" stroke="#4a6a1a" strokeWidth="3.6" strokeLinecap="round" />
      {lit && (
        <g className="cx-d-candle">
          <path d="M-13 -5 L-7 -10 L-4 -3Z M13 -5 L7 -10 L4 -3Z" fill="#ffe35c" />
          <path d="M-12 4 L-8 8 L-4 4 L0 9 L4 4 L8 8 L12 4 C8 13 -8 13 -12 4Z" fill="#ffe35c" />
        </g>
      )}
    </g>
  );
}

function Web({ spokes = 6, rings = [16, 30, 46, 64, 84] }: { spokes?: number; rings?: number[] }) {
  const angles = Array.from({ length: spokes }, (_, i) => (i / (spokes - 1)) * 90);
  const at = (r: number, a: number) => [Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r];
  return (
    <g fill="none" stroke="#ece9f6" strokeWidth="0.9" strokeOpacity="0.75" strokeLinecap="round">
      {angles.map((a) => {
        const [x, y] = at(104, a);
        return <path key={a} d={`M0 0 L${x.toFixed(1)} ${y.toFixed(1)}`} />;
      })}
      {rings.map((r, k) => (
        <path
          key={r}
          d={angles
            .map((a, i) => {
              const [x, y] = at(r + (noise(i, k) - 0.5) * 4, a);
              if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
              const [px, py] = at(r * 0.82, a - 9);
              return `Q${px.toFixed(1)} ${py.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(" ")}
        />
      ))}
    </g>
  );
}

function CardCorner({ u }: { u: string }) {
  return (
    <>
      <path d="M4 56 V14 C4 8 8 4 14 4 H56" fill="none" stroke={`url(#${u}gold)`} strokeWidth="5" strokeLinecap="round" />
      <path d="M12 48 V18 C12 14 14 12 18 12 H48" fill="none" stroke="#fff1b0" strokeWidth="1.2" opacity="0.7" />
      <path d="M20 4 C24 14 34 18 40 12 C44 8 40 2 36 6 M4 20 C14 24 18 34 12 40 C8 44 2 40 6 36" fill="none" stroke={`url(#${u}gold)`} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 8 L14 4 L20 8 L14 14Z" fill="#e0245e" stroke="#7a0a24" strokeWidth="1" />
      <path d="M11 7 L14 5.5 L16 7" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.8" />
    </>
  );
}

/** A mask that feathers a piece's bottom and side edges, so ground and water don't end in a box. */
function EdgeFade({ id, w, h, from = 0.62 }: { id: string; w: number; h: number; from?: number }) {
  return (
    <>
      <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset={from} stopColor="#fff" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" />
        <stop offset="0.07" stopColor="#000" stopOpacity="0" />
        <stop offset="0.93" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" />
      </linearGradient>
      <mask id={id} maskUnits="userSpaceOnUse" x="-20" y="-200" width={w + 40} height={h + 220}>
        <rect x="-20" y="-200" width={w + 40} height="200" fill="#fff" />
        <rect x="-20" y="0" width={w + 40} height={h} fill={`url(#${id}v)`} />
        <rect x="0" y="-200" width={w} height={h + 200} fill={`url(#${id}h)`} />
        <rect x="-20" y="-200" width="20" height={h + 200} fill="#000" />
        <rect x={w} y="-200" width="20" height={h + 200} fill="#000" />
      </mask>
    </>
  );
}

const GOLD_DEFS = (u: string) => (
  <linearGradient id={`${u}gold`} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#8a6a14" />
    <stop offset="0.3" stopColor="#ffe9a0" />
    <stop offset="0.55" stopColor="#d9a93a" />
    <stop offset="0.8" stopColor="#fff1b0" />
    <stop offset="1" stopColor="#8a6a14" />
  </linearGradient>
);

export const EXTRA_FRAME_ART: Record<string, (u: string) => ReactNode> = {
  dragon: (u) => {
    const body = [[14, 104], [70, 26], [128, 30], [176, 56]];
    const neck = [[176, 56], [226, 82], [262, 78], [292, 50]];
    const spikes = [...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => bezier(body, t)), ...[0.15, 0.35, 0.55, 0.75].map((t) => bezier(neck, t))];
    const spine = `M${body[0].join(" ")} C${body[1].join(" ")} ${body[2].join(" ")} ${body[3].join(" ")} C${neck[1].join(" ")} ${neck[2].join(" ")} ${neck[3].join(" ")}`;
    return (
      <>
        <Piece at="top" width={114} overlap={0.5} viewBox="0 0 340 130">
          <defs>
            <linearGradient id={`${u}scale`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3fa86a" />
              <stop offset="1" stopColor="#14502e" />
            </linearGradient>
          </defs>
          <path d="M150 50 C140 10 100 -6 66 4 C82 12 88 22 86 32 C100 26 112 30 118 40 C126 32 140 36 146 46Z" fill="#1f6b3e" stroke="#0b3a20" strokeWidth="2" strokeLinejoin="round" className="cx-f-wing" />
          <path d="M150 50 C130 24 100 12 72 8 M146 46 C130 36 112 30 92 30" fill="none" stroke="#0b3a20" strokeWidth="1.4" />
          {spikes.map((p, i) => (
            <path key={i} d="M-5 0 L0 -12 L5 0Z" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)}) translate(0 -7)`} fill="#e9c65a" stroke="#8a6a14" strokeWidth="1" strokeLinejoin="round" />
          ))}
          <path d={spine} fill="none" stroke="#0b3a20" strokeWidth="21" strokeLinecap="round" />
          <path d={spine} fill="none" stroke={`url(#${u}scale)`} strokeWidth="17" strokeLinecap="round" />
          <path d={spine} fill="none" stroke="#7fd08f" strokeWidth="5" strokeLinecap="round" strokeDasharray="5 6" opacity="0.55" />
          <path d="M14 104 L2 112 L10 98 L2 92 L16 96Z" fill="#e9c65a" stroke="#8a6a14" strokeWidth="1.2" strokeLinejoin="round" />
          <g transform="translate(292 50) rotate(-18)">
            <path d="M-8 -9 C4 -16 26 -14 38 -4 C40 0 36 4 30 4 C22 4 18 8 10 12 C2 14 -8 10 -10 2Z" fill={`url(#${u}scale)`} stroke="#0b3a20" strokeWidth="2" strokeLinejoin="round" />
            <path d="M4 -12 C0 -22 -6 -28 -14 -30 C-8 -22 -6 -16 -4 -10Z" fill="#e9c65a" stroke="#8a6a14" strokeWidth="1.2" />
            <path d="M12 -12 C12 -20 10 -26 6 -30 C14 -24 18 -18 18 -12Z" fill="#e9c65a" stroke="#8a6a14" strokeWidth="1.2" />
            <ellipse cx="14" cy="-5" rx="3.6" ry="2.4" fill="#ffd34d" className="cx-f-eye" />
            <ellipse cx="14.6" cy="-5" rx="1" ry="2" fill="#1a0a00" />
            <path d="M30 4 L22 8 L26 4 L18 6" fill="none" stroke="#0b3a20" strokeWidth="1.2" />
            <circle cx="34" cy="-4" r="1.2" fill="#0b3a20" />
            <g className="cx-f-puff">
              <circle cx="44" cy="-6" r="4" fill="#cfd6d2" opacity="0.7" />
              <circle cx="50" cy="-10" r="3" fill="#cfd6d2" opacity="0.5" />
            </g>
          </g>
        </Piece>
        <Piece at="bottom" width={106} overlap={0.4} viewBox="0 0 330 64">
          <defs>{GOLD_DEFS(u)}</defs>
          {[[16, 52], [30, 54], [24, 46], [40, 48], [12, 42], [32, 40], [22, 34], [52, 54], [300, 52], [316, 50], [306, 44], [290, 46], [322, 42], [312, 36], [298, 38], [278, 54]].map(([x, y], i) => (
            <Coin key={i} x={x} y={y} r={9} u={u} />
          ))}
          <path d="M46 40 L52 30 L58 40 L52 46Z" fill="#e0245e" stroke="#7a0a24" strokeWidth="1" />
          <path d="M270 44 L276 36 L284 40 L280 48Z" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="1" />
          {[[22, 30, 5], [308, 32, 6], [54, 28, 3.5]].map(([x, y, r], i) => (
            <path key={i} d={sparkle(x, y, r)} fill="#fff8d6" className="cx-twinkle" style={v({ "--d": `${-i * 0.7}s` })} />
          ))}
        </Piece>
      </>
    );
  },
  arcade: () => {
    const bulbs = [
      ...Array.from({ length: 16 }, (_, i) => [24 + i * 18.8, 10]),
      ...Array.from({ length: 16 }, (_, i) => [306 - i * 18.8, 56]),
    ];
    return (
      <>
        <Piece at="top" width={104} overlap={0.52} viewBox="0 0 330 66">
          <rect x="10" y="6" width="310" height="54" rx="12" fill="#12101f" stroke="#ff3cac" strokeWidth="3" />
          <rect x="18" y="14" width="294" height="38" rx="6" fill="#1a1530" />
          <text x="165" y="40" textAnchor="middle" fontFamily="'Press Start 2P', monospace" fontWeight="700" fontSize="15" letterSpacing="2" fill="#5cf3ff" className="cx-f-marquee">INSERT COIN</text>
          {bulbs.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.2" fill={i % 2 ? "#ffe35c" : "#ff5ca8"} className="cx-f-chase" style={v({ "--d": `${(i % 16) * 0.09}s` })} />
          ))}
        </Piece>
        <Piece at="bottom" width={96} overlap={0.42} viewBox="0 0 320 74">
          <path d="M8 14 H312 L300 70 H20Z" fill="#1a1830" stroke="#5cf3ff" strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 22 H302" stroke="#5cf3ff" strokeOpacity="0.3" strokeWidth="2" />
          <g transform="translate(70 46)">
            <ellipse cx="0" cy="10" rx="20" ry="6" fill="#0b0a16" />
            <g className="cx-f-stick">
              <rect x="-2.5" y="-18" width="5" height="28" rx="2.5" fill="#cfd2e0" />
              <circle cx="0" cy="-20" r="9" fill="#ff3c5c" />
              <circle cx="-3" cy="-23" r="3" fill="#fff" opacity="0.6" />
            </g>
          </g>
          {[["#ffe35c", 170], ["#5cf3ff", 206], ["#ff5ca8", 242], ["#7cff6b", 278]].map(([c, x], i) => (
            <g key={i} className="cx-f-press" style={v({ "--d": `${-i * 0.45}s` })}>
              <ellipse cx={x as number} cy="48" rx="13" ry="7" fill="#0b0a16" />
              <ellipse cx={x as number} cy="44" rx="12" ry="7" fill={c as string} />
              <ellipse cx={(x as number) - 4} cy="42" rx="4" ry="2" fill="#fff" opacity="0.55" />
            </g>
          ))}
        </Piece>
      </>
    );
  },
  tide: (u) => (
    <>
      <Piece at="bottom" width={112} overlap={0.6} viewBox="0 0 340 92">
        <defs>
          <EdgeFade id={`${u}tf`} w={340} h={92} />
        </defs>
        <g mask={`url(#${u}tf)`}>
        <path d="M0 40 C30 26 60 50 90 36 C120 22 150 48 180 34 C210 20 240 46 270 32 C300 18 320 40 340 30 V92 H0Z" fill="#0e7490" opacity="0.65" className="cx-f-wave" />
        <path d="M0 52 C34 38 64 62 98 48 C132 34 162 60 196 46 C230 32 262 58 296 44 C316 36 330 46 340 44 V92 H0Z" fill="#0891b2" className="cx-f-wave cx-f-wave-b" />
        <path d="M0 64 C30 54 62 74 96 62 C130 50 160 74 194 62 C228 50 260 72 294 60 C314 54 330 62 340 60 V92 H0Z" fill="#155e75" className="cx-f-wave cx-f-wave-c" />
        <path d="M0 52 C34 38 64 62 98 48 C132 34 162 60 196 46 C230 32 262 58 296 44 C316 36 330 46 340 44" fill="none" stroke="#e0fbff" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" className="cx-f-wave cx-f-wave-b" />
        </g>
        <g transform="translate(40 74)">
          <path d="M0 0 C-14 -2 -16 -18 -4 -24 C0 -26 4 -26 8 -24 C20 -18 18 -2 4 0Z" fill="#ffd6c2" stroke="#c97a5a" strokeWidth="1.4" />
          {[-12, -6, 0, 6, 12].map((a) => <path key={a} d={`M2 -1 L${2 + a * 0.9} -23`} stroke="#c97a5a" strokeWidth="1" />)}
        </g>
        <g transform="translate(300 76) rotate(18)">
          <path d="M0 -14 C2 -5 3 -5 13 -4 C5 1 5 2 8 12 C1 6 -1 6 -8 12 C-5 2 -5 1 -13 -4 C-3 -5 -2 -5 0 -14Z" fill="#ff8a4a" stroke="#b8400e" strokeWidth="1.4" strokeLinejoin="round" />
          {[[0, -6], [5, -1], [3, 5], [-3, 5], [-5, -1]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.9" fill="#ffe0c2" />)}
        </g>
        {[[150, 0], [220, 1], [90, 2]].map(([x, i]) => (
          <circle key={x} cx={x} cy="70" r="2.4" fill="none" stroke="#e0fbff" strokeWidth="1" className="cx-bubble" style={v({ "--d": `${-i * 1.3}s`, "--t": "3.6s" })} />
        ))}
      </Piece>
      <Piece at="top" width={30} right={4} overlap={0.25} viewBox="0 0 120 50">
        {[[20, 26, 1], [64, 14, 0.8]].map(([x, y, s], i) => (
          <g key={i} className="cx-f-gull" style={v({ "--d": `${-i * 1.4}s` })}>
            <path d={`M${x} ${y} q${8 * s} ${-8 * s} ${16 * s} 0 q${8 * s} ${-8 * s} ${16 * s} 0`} fill="none" stroke="#f4f8ff" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ))}
      </Piece>
    </>
  ),
  cobwebs: () => (
    <>
      <Piece at="top" width={36} left={-3} overlap={0.82} viewBox="0 0 110 110">
        <Web />
      </Piece>
      <Piece at="top" width={36} right={-3} overlap={0.82} viewBox="0 0 110 110">
        <g transform="matrix(-1 0 0 1 110 0)">
          <Web spokes={5} rings={[18, 36, 56, 78]} />
        </g>
        <g className="cx-f-spider">
          <path d="M70 -40 V64" stroke="#ece9f6" strokeWidth="0.9" strokeOpacity="0.8" />
          <g transform="translate(70 70)">
            {[-1, 1].map((side) =>
              [0, 1, 2, 3].map((k) => (
                <path key={`${side}${k}`} d={`M0 0 Q${side * 9} ${-6 + k * 4} ${side * 13} ${-2 + k * 5}`} fill="none" stroke="#1a1622" strokeWidth="1.6" strokeLinecap="round" />
              )),
            )}
            <ellipse cx="0" cy="2" rx="7" ry="8" fill="#1a1622" />
            <circle cx="0" cy="-6" r="4.6" fill="#1a1622" />
            <circle cx="-1.8" cy="-6.4" r="1.4" fill="#fff" />
            <circle cx="1.8" cy="-6.4" r="1.4" fill="#fff" />
            <circle cx="-1.6" cy="-6.2" r="0.6" fill="#1a1622" />
            <circle cx="2" cy="-6.2" r="0.6" fill="#1a1622" />
            <path d="M-2 4 L0 1 L2 4 L0 7Z" fill="#e0245e" />
          </g>
        </g>
      </Piece>
    </>
  ),
  autumn: () => {
    const leaf = (x: number, y: number, r: number, s: number, c: string, key: string) => (
      <g key={key} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
        <path d={MAPLE} fill={c} stroke="rgba(80,20,0,.55)" strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M0 6 V12 M0 4 L0 -8 M0 0 L-6 -3 M0 0 L6 -3" stroke="rgba(80,20,0,.45)" strokeWidth="0.7" />
      </g>
    );
    const colors = ["#e2621b", "#f2a33a", "#c23b1e", "#e8c547", "#d9531a"];
    return (
      <>
        <Piece at="top" width={52} left={-6} overlap={0.55} viewBox="0 0 156 100">
          <path d="M0 30 C40 24 70 34 110 20 C124 16 140 18 156 12" fill="none" stroke="#5a3218" strokeWidth="4" strokeLinecap="round" />
          {[[14, 34, -20, 2.2], [40, 22, 15, 2.6], [66, 36, -40, 2], [92, 20, 30, 2.4], [118, 26, 0, 1.8], [30, 52, 60, 1.6], [80, 50, -10, 1.7], [140, 16, 20, 1.5]].map(([x, y, r, s], i) => leaf(x, y, r, s, colors[i % colors.length], `a${i}`))}
          <g transform="translate(56 58)">
            <ellipse cx="0" cy="3" rx="5" ry="6" fill="#a8652a" />
            <path d="M-6 -1 C-6 -6 6 -6 6 -1Z" fill="#6b3f1a" />
            <path d="M0 -5 V-8" stroke="#6b3f1a" strokeWidth="1.4" strokeLinecap="round" />
          </g>
          {[0, 1, 2].map((i) => (
            <g key={i} className="cx-f-fall" style={v({ "--d": `${-i * 2.6}s` })}>{leaf(40 + i * 40, 40, i * 40, 1.4, colors[(i + 1) % 5], `f${i}`)}</g>
          ))}
        </Piece>
        <Piece at="bottom" width={44} right={-4} overlap={0.5} viewBox="0 0 132 52">
          {[[20, 40, 30, 2], [44, 34, -20, 2.4], [70, 40, 70, 2.2], [96, 32, 10, 2.6], [118, 40, -40, 2], [58, 46, 120, 1.8], [86, 46, -70, 1.9]].map(([x, y, r, s], i) => leaf(x, y, r, s, colors[(i + 2) % colors.length], `b${i}`))}
        </Piece>
      </>
    );
  },
  storm: (u) => (
    <Piece at="top" width={116} overlap={0.46} viewBox="0 0 340 112" className="cx-f-storm">
      <defs>
        <radialGradient id={`${u}flash`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="1" stopColor="#fff8d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="#a8b8ff" strokeWidth="1.3" strokeLinecap="round" opacity="0.6">
        {Array.from({ length: 22 }, (_, i) => (
          <path key={i} d={`M${12 + noise(i, 2) * 316} ${54 + noise(i, 3) * 20} l-5 14`} className="cx-f-rain" style={v({ "--d": `${-noise(i, 4) * 0.7}s` })} />
        ))}
      </g>
      {[[30, 46, 28], [70, 36, 34], [116, 44, 30], [160, 32, 38], [208, 42, 32], [252, 34, 34], [296, 44, 30], [330, 40, 22]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? "#3a4060" : "#2e3450"} />
      ))}
      {[[50, 58, 24], [100, 60, 26], [150, 56, 28], [200, 60, 24], [250, 58, 26], [300, 60, 24]].map(([x, y, r], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r={r} fill="#232842" />
      ))}
      <circle cx="160" cy="40" r="44" fill={`url(#${u}flash)`} className="cx-f-flash" />
      <circle cx="270" cy="44" r="36" fill={`url(#${u}flash)`} className="cx-f-flash cx-f-flash-b" />
      <path d="M150 62 L138 86 H148 L136 112 L162 80 H151 L160 62Z" fill="#fff8b0" className="cx-f-bolt" />
      <path d="M266 64 L258 80 H265 L256 98 L274 76 H267 L273 64Z" fill="#fff8b0" className="cx-f-bolt cx-f-bolt-b" />
    </Piece>
  ),
  mushrooms: (u) => (
    <>
      <Piece at="bottom" width={112} overlap={0.55} viewBox="0 0 340 100">
        <defs>
          <EdgeFade id={`${u}mf`} w={340} h={100} from={0.72} />
        </defs>
        <g mask={`url(#${u}mf)`}>
        <path d="M0 100 V70 C30 56 60 64 90 60 C130 54 170 66 210 62 C250 58 290 54 340 66 V100Z" fill="#2f5a34" />
        <path d="M0 74 C30 62 60 70 90 66 C130 60 170 72 210 68 C250 64 290 60 340 72" fill="none" stroke="#8ad06a" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 5" />
        </g>
        {[[24, 64, 1.2, "#e8322e"], [48, 66, 0.8, "#e8322e"], [84, 60, 1, "#c2632e"]].map(([x, y, s, c], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M-5 0 V-16 H5 V0Z" fill="#f4e3cc" stroke="#8a6a4a" strokeWidth="1.2" />
            <path d="M-16 -14 C-16 -32 16 -32 16 -14 C8 -17 -8 -17 -16 -14Z" fill={c as string} stroke="#6b1a10" strokeWidth="1.4" />
            <circle cx="-6" cy="-23" r="2.4" fill="#fff8f0" />
            <circle cx="5" cy="-25" r="1.8" fill="#fff8f0" />
            <circle cx="9" cy="-18" r="1.4" fill="#fff8f0" />
          </g>
        ))}
        {[[270, 62, 1.1], [296, 58, 0.8], [318, 64, 1.3], [250, 66, 0.7]].map(([x, y, s], i) => (
          <g key={`g${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M-3 0 V-14 H3 V0Z" fill="#cfefff" opacity="0.8" />
            <path d="M-11 -12 C-11 -26 11 -26 11 -12Z" fill="#5cc8ff" className="cx-f-glow" style={v({ "--d": `${-i * 0.6}s` })} />
            <path d="M-7 -16 C-5 -21 3 -22 6 -18" fill="none" stroke="#e8fbff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          </g>
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx={120 + noise(i, 3) * 200} cy={10 + noise(i, 4) * 40} r="2" fill="#fff59a" className="cx-firefly" style={v({ "--d": `${-noise(i, 5) * 4}s`, "--dx": `${(noise(i, 6) - 0.5) * 20}px`, "--dy": `${(noise(i, 7) - 0.5) * 14}px` })} />
        ))}
      </Piece>
    </>
  ),
  pumpkins: (u) => (
    <>
      <Piece at="bottom" width={112} overlap={0.5} viewBox="0 0 340 100">
        <defs>
          <radialGradient id={`${u}pk`} cx="0.4" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#ffb347" />
            <stop offset="1" stopColor="#d9531a" />
          </radialGradient>
        </defs>
        <path d="M0 80 C40 64 70 92 110 76 C150 60 180 90 230 74 C270 62 300 86 340 72" fill="none" stroke="#3f6b1a" strokeWidth="4" strokeLinecap="round" />
        {[[60, 66], [190, 70], [300, 64]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} c-8 -10 -20 -4 -14 6 c4 6 12 2 10 -4`} fill="none" stroke="#5a8a2a" strokeWidth="2" strokeLinecap="round" />
        ))}
        {[[34, 74, -30], [150, 68, 20], [252, 72, -10]].map(([x, y, r], i) => (
          <path key={i} d="M0 0 C-10 -10 -4 -22 8 -18 C18 -14 16 -2 0 0Z" transform={`translate(${x} ${y}) rotate(${r})`} fill="#4f8a2a" stroke="#2f5a14" strokeWidth="1.2" />
        ))}
        <Pumpkin x={92} y={74} s={1.3} lit u={u} />
        <Pumpkin x={46} y={82} s={0.85} u={u} />
        <Pumpkin x={280} y={78} s={1.05} u={u} />
        <Pumpkin x={316} y={84} s={0.7} lit u={u} />
      </Piece>
      <Piece at="top" width={28} right={2} overlap={0.3} viewBox="0 0 90 70">
        <path d="M58 6 A24 24 0 1 0 82 40 A18 18 0 1 1 58 6Z" fill="#fff1c2" className="cx-moon-glow" />
        <g className="cx-d-batfly">
          <path d={BAT} transform="translate(8 30) scale(0.5)" fill="#1a0b22" />
        </g>
      </Piece>
    </>
  ),
  "holo-card": (u) => (
    <>
      {(["top", "bottom"] as const).map((at) =>
        [0, 1].map((side) => (
          <Piece key={`${at}${side}`} at={at} width={22} {...(side ? { right: -3 } : { left: -3 })} overlap={0.72} viewBox="0 0 60 60">
            <defs>{GOLD_DEFS(`${u}${at}${side}`)}</defs>
            <g transform={`${side ? "matrix(-1 0 0 1 60 0)" : ""} ${at === "bottom" ? "matrix(1 0 0 -1 0 60)" : ""}`}>
              <CardCorner u={`${u}${at}${side}`} />
            </g>
          </Piece>
        )),
      )}
      <Piece at="top" width={18} overlap={0.5} viewBox="0 0 60 50">
        <defs>
          <linearGradient id={`${u}gem`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c8b8ff" />
            <stop offset="0.5" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#3b0f7a" />
          </linearGradient>
        </defs>
        <path d="M14 18 L30 6 L46 18 L40 40 L20 40Z" fill={`url(#${u}gem)`} stroke="#e9c65a" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M14 18 H46 M30 6 L24 18 L30 40 L36 18Z" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
        <path d="M20 14 L26 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="cx-f-gem-shine" />
      </Piece>
      <Piece at="bottom" width={34} overlap={0.5} viewBox="0 0 110 30">
        {[25, 55, 85].map((x, i) => (
          <path key={x} d="M0 -9 L2.6 -3 L9 -2.8 L4 1.4 L5.6 8 L0 4.4 L-5.6 8 L-4 1.4 L-9 -2.8 L-2.6 -3Z" transform={`translate(${x} 15)`} fill="#ffd34d" stroke="#8a6a14" strokeWidth="1.2" strokeLinejoin="round" className="cx-twinkle" style={v({ "--d": `${-i * 0.5}s` })} />
        ))}
      </Piece>
    </>
  ),
};

/* ================================================================== */
/* Profile effects                                                     */
/* ================================================================== */

export interface ExtraEffectSpec {
  motion: "fall" | "rise" | "twinkle" | "wander" | "streak";
  count: number;
  size: [number, number];
  time: [number, number];
  spin?: boolean;
  shape: (i: number) => ReactNode;
}

export const EXTRA_EFFECTS: Record<string, ExtraEffectSpec> = {
  lanterns: {
    motion: "rise",
    count: 11,
    size: [15, 27],
    time: [11, 17],
    shape: (i) => (
      <svg viewBox="0 0 20 26" className="cx-e-lantern" style={v({ "--d": `${-noise(i, 3) * 2}s` })}>
        <path d="M4 3 H16 L18 20 C18 22 16 23 14 23 H6 C4 23 2 22 2 20Z" fill={i % 3 ? "#ffb347" : "#ff8a5c"} />
        <path d="M4 3 H7 L6 23 C4 23 2 22 2 20Z" fill="#7a2a06" opacity="0.32" />
        <path d="M13 3 H16 L18 20 C18 22 16 23 14 23Z" fill="#7a2a06" opacity="0.38" />
        <path d="M8.5 3 H11.5 L12 23 H8Z" fill="#fff3c2" opacity="0.28" />
        <path d="M7 3 L6 23 M13 3 L14 23" stroke="#c2501a" strokeOpacity="0.45" strokeWidth="0.8" />
        <rect x="5" y="1" width="10" height="2.4" rx="1" fill="#7a3a14" />
        <ellipse cx="10" cy="18" rx="2.4" ry="3.2" fill="#fff6c2" className="cx-e-flame" />
      </svg>
    ),
  },
  dandelions: {
    motion: "rise",
    count: 16,
    size: [11, 20],
    time: [12, 20],
    shape: (i) => (
      <svg viewBox="-10 -10 20 30" style={{ rotate: `${(noise(i, 5) - 0.5) * 60}deg` }}>
        <path d="M0 0 V18" stroke="#f4f1e6" strokeWidth="0.7" strokeLinecap="round" />
        <ellipse cx="0" cy="19" rx="0.9" ry="1.6" fill="#c9b98a" />
        {Array.from({ length: 11 }, (_, k) => {
          const a = Math.PI + (k / 10) * Math.PI;
          return <path key={k} d={`M0 0 L${(Math.cos(a) * 8).toFixed(1)} ${(Math.sin(a) * 8).toFixed(1)}`} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="0.45" />;
        })}
        {Array.from({ length: 11 }, (_, k) => {
          const a = Math.PI + (k / 10) * Math.PI;
          return <circle key={`d${k}`} cx={(Math.cos(a) * 8).toFixed(1)} cy={(Math.sin(a) * 8).toFixed(1)} r="0.7" fill="#fff" />;
        })}
      </svg>
    ),
  },
  "neon-rain": {
    motion: "fall",
    count: 34,
    size: [16, 30],
    time: [0.7, 1.3],
    shape: (i) => <span className="cx-e-streak" style={v({ "--c": i % 3 === 0 ? "#5cf3ff" : i % 3 === 1 ? "#ff3cac" : "#b98cff" })} />,
  },
};

function Fish({ body, fin, className, style }: { body: string; fin: string; className: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 40 20" className={className} style={style}>
      <g className="cx-e-wiggle">
        <path d="M31 10 L40 3 L38 10 L40 17Z" fill={fin} />
      </g>
      <path d="M2 10 C8 2 22 0 32 10 C22 20 8 18 2 10Z" fill={body} />
      <path d="M14 4 C18 2 22 3 24 6 M16 16 C18 18 22 17 24 14" fill="none" stroke={fin} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 6 C20 9 20 11 18 14" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
      <circle cx="8" cy="9" r="1.6" fill="#101018" />
      <circle cx="7.6" cy="8.6" r="0.5" fill="#fff" />
    </svg>
  );
}

export const EXTRA_SCENES: Record<string, () => ReactNode> = {
  "rain-window": () => (
    <>
      <i className="cx-e-fog" />
      {[[14, 78, 9, "#ffb347"], [32, 86, 12, "#ff5ca8"], [56, 80, 8, "#5cc8ff"], [72, 90, 14, "#ffd36b"], [88, 76, 10, "#b07cff"], [44, 70, 6, "#5cffd0"]].map(([x, y, r, c], i) => (
        <i key={i} className="cx-e-bokeh" style={v({ left: `${x}%`, top: `${y}%`, "--r": `${r}cqw`, "--c": c, "--d": `${-i * 1.1}s` })} />
      ))}
      {Array.from({ length: 22 }, (_, i) => {
        const slides = i % 4 === 0;
        return (
          <i
            key={`d${i}`}
            className={`cx-e-drop${slides ? " cx-e-slide" : ""}`}
            style={v({ left: `${(noise(i, 3) * 96).toFixed(1)}%`, top: `${(noise(i, 4) * (slides ? 50 : 96)).toFixed(1)}%`, "--r": `${(1.2 + noise(i, 5) * 2.6).toFixed(2)}cqw`, "--d": `${(-noise(i, 6) * 6).toFixed(2)}s`, "--t": `${(5 + noise(i, 7) * 4).toFixed(2)}s` })}
          />
        );
      })}
    </>
  ),
  aquarium: () => (
    <>
      <i className="cx-e-caustics" />
      {[0, 1, 2].map((i) => (
        <i key={i} className="cx-e-ray" style={v({ left: `${18 + i * 30}%`, "--d": `${-i * 2}s` })} />
      ))}
      <Fish body="#ff8a3d" fin="#ffd0a8" className="cx-e-fish" style={v({ top: "58%", "--t": "13s", "--d": "-2s" })} />
      <Fish body="#5cc8ff" fin="#d6f3ff" className="cx-e-fish cx-e-fish-rev" style={v({ top: "74%", "--t": "17s", "--d": "-9s" })} />
      <Fish body="#ffd34d" fin="#fff3c2" className="cx-e-fish cx-e-fish-small" style={v({ top: "46%", "--t": "11s", "--d": "-6s" })} />
      {Array.from({ length: 10 }, (_, i) => (
        <i key={`b${i}`} className="cx-e-bubble" style={v({ left: `${(8 + noise(i, 3) * 84).toFixed(1)}%`, "--r": `${(1 + noise(i, 4) * 2).toFixed(2)}cqw`, "--d": `${(-noise(i, 5) * 6).toFixed(2)}s`, "--t": `${(4 + noise(i, 6) * 4).toFixed(2)}s` })} />
      ))}
    </>
  ),
  "signal-lost": () => (
    <>
      <i className="cx-e-scan" />
      <i className="cx-e-noise" />
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className="cx-e-bar" style={v({ top: `${(noise(i, 3) * 92).toFixed(1)}%`, "--h": `${(1.5 + noise(i, 4) * 6).toFixed(1)}%`, "--d": `${(-noise(i, 5) * 4).toFixed(2)}s`, "--x": `${((noise(i, 6) - 0.5) * 16).toFixed(1)}cqw` })} />
      ))}
      <i className="cx-e-split" />
    </>
  ),
  comet: () => (
    <>
      <i className="cx-e-stars" />
      <i className="cx-e-stars cx-e-stars-b" />
      <i className="cx-e-comet">
        <b />
      </i>
      <i className="cx-e-comet cx-e-comet-b">
        <b />
      </i>
    </>
  ),
};

export { BAT };
