"use client";

import type { CSSProperties, ReactNode } from "react";

/*
 * Minecraft and zombie cosmetics: nameplates, avatar decorations, profile
 * frames and profile effects. Same contracts as cosmetics-extra.tsx (and merged
 * into cosmetics.tsx the same way); styles live in app/cosmetics-mz.css under
 * the `mz-` prefix. Minecraft pieces are pixel art drawn from character grids,
 * the zombie ones are vector.
 */

/** Deterministic 0..1 noise, so pixels and particles land the same way every render. */
function noise(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** CSS custom properties for an animated part. */
const v = (values: Record<string, string | number>) => values as CSSProperties;

/* ================================================================== */
/* Pixel art                                                           */
/* ================================================================== */

/** A palette entry: one colour, or several picked per pixel for texture. */
type Palette = Record<string, string | string[]>;

/**
 * Draws a character grid as pixels: each character is a palette key, "." is
 * empty. Runs of a flat colour merge into one rect; textured keys pick a
 * shade per pixel from `seed`, so two blocks of the same kind still differ.
 */
function Pixels({ rows, pal, x = 0, y = 0, s = 1, seed = 0, className, style }: { rows: string[]; pal: Palette; x?: number; y?: number; s?: number; seed?: number; className?: string; style?: CSSProperties }) {
  const rects: ReactNode[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const ch = row[c];
      const paint = pal[ch];
      if (ch === "." || ch === " " || !paint) {
        c++;
        continue;
      }
      if (Array.isArray(paint)) {
        rects.push(<rect key={`${r}-${c}`} x={x + c * s} y={y + r * s} width={s} height={s} fill={paint[Math.floor(noise(r * 37 + c + seed * 101, 7) * paint.length)]} />);
        c++;
        continue;
      }
      let end = c;
      while (end < row.length && row[end] === ch) end++;
      rects.push(<rect key={`${r}-${c}`} x={x + c * s} y={y + r * s} width={(end - c) * s} height={s} fill={paint} />);
      c = end;
    }
  });
  return (
    <g shapeRendering="crispEdges" className={className} style={style}>
      {rects}
    </g>
  );
}

const GRASS = ["#5d9b3a", "#6aab44", "#4e8a30", "#79bd4f", "#5a9636"];
const DIRT = ["#8b5a2b", "#7a4d24", "#9a6634", "#6b4220", "#87562a"];
const STONE = ["#8a8a8a", "#7c7c7c", "#979797", "#6f6f6f", "#858585"];
const CREEPER = ["#5fbf4a", "#4ea83a", "#6fd257", "#3f8f2e", "#7be063", "#58b545"];
const NETHERRACK = ["#7a2626", "#6a1f1f", "#8a2e2e", "#5c1a1a", "#93393a"];
const OBSIDIAN = ["#1a1026", "#24163a", "#140b1e", "#2e1d48"];

const BLOCK_PAL: Palette = {
  g: GRASS,
  d: DIRT,
  s: STONE,
  c: ["#5ce1e6", "#a6fff7", "#2bb5c2"],
  y: ["#fcee4b", "#d9a520", "#fff6a0"],
  r: ["#ff2a1a", "#b80d0d", "#ff6a4a"],
  k: ["#262626", "#3a3a3a"],
  n: NETHERRACK,
  o: OBSIDIAN,
  K: "#0d1a0b",
  G: CREEPER,
  L: ["#3f8f2e", "#357a27", "#4a9c37"],
  R: ["#db2f20", "#c22a1c"],
  r2: "#a8230f",
  W: "#f2f2f2",
  T: "#1a1a1a",
};

/** An 8x8 grass block seen from the side. */
const GRASS_BLOCK = ["gggggggg", "gggggggg", "gdgggdgg", "ddgddddg", "dddddddd", "dddddddd", "dddddddd", "dddddddd"];
const STONE_BLOCK = ["ssssssss", "ssssssss", "ssssssss", "ssssssss", "ssssssss", "ssssssss", "ssssssss", "ssssssss"];
const DIAMOND_ORE = ["ssssssss", "sccsssss", "scccsscs", "sssssccs", "ssscssss", "sscccsss", "sssscssc", "ssssssss"];
const GOLD_ORE = ["ssssssss", "ssyysssy", "ssyssyys", "sssssyss", "syysssss", "ssysssys", "sssssyys", "ssssssss"];
const REDSTONE_ORE = ["ssssssss", "srsssrrs", "ssssssss", "ssrrssss", "sssssrss", "srsssrss", "sssrssss", "ssssssss"];
const COAL_ORE = ["ssssssss", "skkssssk", "sskssssk", "ssssskks", "skssssks", "skksssss", "sssskkss", "ssssssss"];
const NETHER_BLOCK = ["nnnnnnnn", "nnnnnnnn", "nnnnnnnn", "nnnnnnnn", "nnnnnnnn", "nnnnnnnn", "nnnnnnnn", "nnnnnnnn"];

/** The creeper's face, 8x8. */
const CREEPER_FACE = ["GGGGGGGG", "GGGGGGGG", "GKKGGKKG", "GKKGGKKG", "GGGKKGGG", "GGKKKKGG", "GGKKKKGG", "GGKGGKGG"];
/** A whole creeper from the front: head, body and four stubby legs. */
const CREEPER_BODY = [
  ...CREEPER_FACE,
  "KGGGGGGK",
  ...Array.from({ length: 11 }, () => "GGGGGGGG"),
  "LLLLLLLL",
  "LLLLLLLL",
  "LLLKKLLL",
  "LLLKKLLL",
  "LLLKKLLL",
  "LLLKKLLL",
];

/** TNT, 16x16: red stripes, a white band and the letters. */
const TNT = [
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "WWWWWWWWWWWWWWWW",
  "WWTTTWTWWTWTTTWW",
  "WWWTWWTTWTWWTWWW",
  "WWWTWWTWTTWWTWWW",
  "WWWTWWTWWTWWTWWW",
  "WWWTWWTWWTWWTWWW",
  "WWWWWWWWWWWWWWWW",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
  "RRrRRrRRrRRrRRrR",
];
const TNT_PAL: Palette = { R: ["#db2f20", "#cf2b1d", "#e03a2a"], r: "#9e1f10", W: ["#f2f2f2", "#e6e6e6"], T: "#1a1a1a" };

/** A diamond sword pointing up-right, 16x16 (hilt bottom-left). */
const SWORD = [
  ".............OO.",
  "............OccO",
  "...........OcwcO",
  "..........OcwcO.",
  ".........OcwcO..",
  "........OcwcO...",
  ".......OcwcO....",
  "......OcwcO.....",
  "..OO.OcwcO......",
  "..OyOcwcO.......",
  "...OycccO.......",
  "....OyyO........",
  "...OhOyyO.......",
  "..OhhO.OO.......",
  ".OhhO...........",
  ".OOO............",
];
const SWORD_PAL: Palette = { O: "#0d2a2e", c: "#33ebcb", w: "#c9fff6", y: "#4a3417", h: "#6b4a22" };

/** A diamond pickaxe, 16x16 (handle bottom-left). */
const PICKAXE = [
  "....OOOOOO......",
  "...OcccwccO.....",
  "....OOOOccO.....",
  "........OccO....",
  ".......OhOcO....",
  "......OhO.OcO...",
  ".....OhO..OcO...",
  "....OhO....OO...",
  "...OhO..........",
  "..OhO...........",
  ".OhO............",
  "OhO.............",
  "OO..............",
  "................",
  "................",
  "................",
];

/** A poppy, 5 wide. */
const POPPY = [".rr..", "rrrr.", ".rr..", "..g..", ".gg..", "..g.."];
const DANDELION = [".yy.", "yyyy", ".yy.", "..g.", "..g."];
const FLOWER_PAL: Palette = { r: "#d8232a", y: "#f5d10f", g: "#3f8f2e" };

/** A plain row of blocks. */
function BlockRow({ x, y, count, s, block, seed = 0 }: { x: number; y: number; count: number; s: number; block: (i: number) => string[]; seed?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Pixels key={i} rows={block(i)} pal={BLOCK_PAL} x={x + i * 8 * s} y={y} s={s} seed={seed + i} />
      ))}
    </>
  );
}

/** Enchanting-table glyphs (after the Standard Galactic Alphabet), drawn as strokes in a 6x6 box. */
const GLYPHS = [
  "M0 0 H6 M6 0 V6",
  "M0 0 V6 M3 0 V6 M0 3 H6",
  "M0 6 L3 0 L6 6",
  "M0 0 H6 M3 0 V6 M0 6 H6",
  "M1 0 V6 M5 0 V6",
  "M0 3 H6 M3 0 V3",
  "M0 0 L6 6 M6 0 L3 3",
  "M0 0 V6 H6",
  "M3 0 V2 M3 4 V6 M0 3 H6",
  "M0 0 H6 V6 H0",
  "M0 1 H6 M0 5 H6 M3 1 V5",
  "M2 0 V6 M0 2 H4 M4 4 H6",
];

/* ================================================================== */
/* Zombie art                                                          */
/* ================================================================== */

/** A rotting hand reaching up, wrist at (0,0), fingertips around y -40. */
function Hand({ x, y, rot = 0, s = 1, skin = "#8fa57a", dark = "#4c5c3e", sleeve = "#3b3a30", className, style, bloody = true }: { x: number; y: number; rot?: number; s?: number; skin?: string; dark?: string; sleeve?: string; className?: string; style?: CSSProperties; bloody?: boolean }) {
  const fingers = ["M-6 -20 L-8.5 -31 L-6.5 -38", "M-2 -21 L-2.2 -34 L-0.4 -41", "M2.6 -21 L3.6 -33 L5.6 -38.5", "M6.4 -19 L8.6 -28 L10.8 -31.5"];
  const thumb = "M-8 -9 L-14 -17 L-15.5 -23";
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <g className={className} style={style}>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {[...fingers, thumb].map((d, i) => (
            <path key={`o${i}`} d={d} stroke={dark} strokeWidth="6.4" />
          ))}
        </g>
        <path d="M-9.4 -2 C-10.6 -10 -10.4 -17 -8.4 -22.5 L8.4 -22.5 C10.4 -17 10.6 -10 9.4 -2Z" fill={skin} stroke={dark} strokeWidth="1.4" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {[...fingers, thumb].map((d, i) => (
            <path key={`f${i}`} d={d} stroke={skin} strokeWidth="4.4" />
          ))}
        </g>
        {[[-6.5, -38], [-0.4, -41], [5.6, -38.5], [10.8, -31.5], [-15.5, -23]].map(([nx, ny], i) => (
          <circle key={i} cx={nx} cy={ny} r="1.5" fill="#2b2a22" />
        ))}
        <path d="M-5 -8 C-2 -12 3 -11 5 -7 M-3 -16 L1 -14" fill="none" stroke={dark} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        {bloody && <path d="M2 -6 C4 -9 7 -8 6.4 -4 C6 -2 3.4 -2 2 -6Z" fill="#6b0f0f" opacity="0.85" />}
        <path d="M-12 12 L-11 -1 L-8 -5 L-5 -1 L-1 -6 L3 -2 L7 -6 L11 -1 L12 12Z" fill={sleeve} stroke="#1f1e18" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M-9 4 L-6 8 M4 2 L7 7" stroke="#1f1e18" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      </g>
    </g>
  );
}

/** The biohazard trefoil, centred on (0,0) with radius about 10. */
function Biohazard({ id, color, className, style }: { id: string; color: string; className?: string; style?: CSSProperties }) {
  const angles = [-90, 30, 150].map((a) => (a * Math.PI) / 180);
  return (
    <g className={className} style={style}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="-14" y="-14" width="28" height="28">
          <rect x="-14" y="-14" width="28" height="28" fill="#fff" />
          {angles.map((a, i) => (
            <circle key={i} cx={Math.cos(a) * 7.8} cy={Math.sin(a) * 7.8} r="4.9" fill="#000" />
          ))}
          <circle r="2.1" fill="#000" />
          {angles.map((a, i) => (
            <path key={`g${i}`} d={`M0 0 L${(Math.cos(a + Math.PI) * 12).toFixed(2)} ${(Math.sin(a + Math.PI) * 12).toFixed(2)}`} stroke="#000" strokeWidth="1.1" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill={color}>
        {angles.map((a, i) => (
          <circle key={i} cx={Math.cos(a) * 5.4} cy={Math.sin(a) * 5.4} r="6.6" />
        ))}
      </g>
      <circle r="5.6" fill="none" stroke={color} strokeWidth="1.3" mask={`url(#${id})`} />
    </g>
  );
}

/** A shambling silhouette facing right, in a 40x60 box. */
const SHAMBLER = "M22 4 C26 4 28 7 28 10 C28 13 26 16 22 16 C24 17 26 18 27 19 L39 22 C40.5 22.5 40.5 25 39 25.4 L27 25 C27.5 30 28 35 28 40 L32 57 C32.5 59 29.5 60 29 58 L25 44 L21 44 L18 58 C17.5 60 14.5 59 15 57 L17 40 C16.5 33 16 27 17 21 L13 34 C12.5 36 10 35.5 10.5 33.5 L14 19 C15 17 17 16 18.5 15.5 C16.5 14 16 12 16.5 9.5 C17 6 19 4 22 4Z";

/** Caution tape between two points, with repeating text. */
function Tape({ id, x1, y1, x2, y2, w = 9, text = "QUARANTINE", className }: { id: string; x1: number; y1: number; x2: number; y2: number; w?: number; text?: string; className?: string }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const words = Array.from({ length: Math.ceil(len / (text.length * w * 0.62 + w)) + 2 }, () => text).join("  ●  ");
  return (
    <g transform={`translate(${x1} ${y1}) rotate(${angle})`}>
      <defs>
        <clipPath id={id}>
          <rect x="0" y={-w / 2} width={len} height={w} />
        </clipPath>
      </defs>
      <rect x="0" y={-w / 2} width={len} height={w} fill="#f5c400" stroke="#1a1600" strokeWidth="0.8" />
      <g clipPath={`url(#${id})`}>
        <text x="0" y={w * 0.3} fontFamily="'Black Ops One', Impact, system-ui, sans-serif" fontWeight="900" fontSize={w * 0.78} fill="#141100" className={className}>
          {words}
        </text>
      </g>
    </g>
  );
}

/* ================================================================== */
/* Nameplates                                                          */
/* Art sits in a 160x48 strip; only x 60..160 shows. Cropped plates    */
/* keep the subject inside y 10..38.                                   */
/* ================================================================== */

export const MZ_NAMEPLATE_FIT_WHOLE = new Set<string>(["quarantine"]);

export const MZ_NAMEPLATE_ART: Record<string, (u: string) => ReactNode> = {
  overworld: () => (
    <>
      <g className="mz-np-sun">
        <rect x="136" y="6" width="12" height="12" fill="#fff6a8" shapeRendering="crispEdges" />
        <rect x="138" y="8" width="8" height="8" fill="#ffe25a" shapeRendering="crispEdges" />
      </g>
      {[[0, 12, 0], [1, 20, -7]].map(([k, y, d]) => (
        <g key={k} className="mz-np-cloud" style={v({ "--d": `${d}s` })}>
          <Pixels rows={["..WWWW....", "WWWWWWWWW.", ".WWWWWWWWW"]} pal={{ W: "#ffffff" }} x={0} y={y} s={2} />
        </g>
      ))}
      <Pixels rows={["..LLLL..", ".LLLLLL.", "LLLLLLLL", "LLLLLLLL", ".LLLLLL.", "...tt...", "...tt...", "...tt..."]} pal={{ L: ["#3e8a2a", "#347a22", "#4a9c35", "#2f6e1e"], t: ["#6b4a22", "#5a3d1b"] }} x={98} y={2} s={3.6} seed={4} />
      <BlockRow x={60} y={32} count={13} s={1} block={(i) => (i === 9 ? GRASS_BLOCK : GRASS_BLOCK)} />
      <BlockRow x={60} y={40} count={13} s={1} block={() => STONE_BLOCK.map((r) => r.replace(/s/g, "d"))} seed={20} />
      <Pixels rows={POPPY} pal={FLOWER_PAL} x={84} y={26} s={1} />
      <Pixels rows={DANDELION} pal={FLOWER_PAL} x={126} y={27} s={1} />
      <g className="mz-np-creep">
        <Pixels rows={CREEPER_BODY} pal={BLOCK_PAL} x={146} y={10} s={0.85} seed={9} />
      </g>
    </>
  ),
  "diamond-mine": () => (
    <>
      <defs>
        <radialGradient id="mz-torch-glow">
          <stop offset="0" stopColor="#ffc46b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffc46b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <BlockRow x={60} y={0} count={13} s={1} block={(i) => [STONE_BLOCK, COAL_ORE, STONE_BLOCK, STONE_BLOCK, GOLD_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, REDSTONE_ORE, STONE_BLOCK, STONE_BLOCK, COAL_ORE, STONE_BLOCK][i]} seed={3} />
      <BlockRow x={60} y={8} count={13} s={1} block={(i) => [STONE_BLOCK, STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, COAL_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK][i]} seed={17} />
      <BlockRow x={60} y={16} count={13} s={1} block={(i) => [COAL_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, REDSTONE_ORE, STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK, GOLD_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK][i]} seed={31} />
      <BlockRow x={60} y={24} count={13} s={1} block={(i) => [STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, GOLD_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK, REDSTONE_ORE, STONE_BLOCK][i]} seed={47} />
      <BlockRow x={60} y={32} count={13} s={1} block={(i) => [STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, COAL_ORE, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, STONE_BLOCK, GOLD_ORE, STONE_BLOCK, DIAMOND_ORE][i]} seed={59} />
      <BlockRow x={60} y={40} count={13} s={1} block={() => STONE_BLOCK} seed={71} />
      <rect x="60" y="0" width="100" height="48" fill="#05060a" opacity="0.38" />
      <circle cx="112" cy="22" r="24" fill="url(#mz-torch-glow)" className="mz-np-torchglow" />
      <Pixels rows={["y", "o", "h", "h", "h", "h"]} pal={{ y: "#fff3a0", o: "#ffae2a", h: "#6b4a22" }} x={111} y={16} s={2} className="mz-np-torch" />
      {[[78, 13], [129, 13], [114, 21], [148, 37], [68, 37], [132, 29]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 2.4} L${x + 0.6} ${y - 0.6} L${x + 2.4} ${y} L${x + 0.6} ${y + 0.6} L${x} ${y + 2.4} L${x - 0.6} ${y + 0.6} L${x - 2.4} ${y} L${x - 0.6} ${y - 0.6}Z`} fill="#e6fffd" className="mz-np-glint" style={v({ "--d": `${-i * 0.55}s` })} />
      ))}
    </>
  ),
  nether: () => (
    <>
      <BlockRow x={60} y={30} count={13} s={1} block={() => NETHER_BLOCK} seed={5} />
      <BlockRow x={60} y={38} count={13} s={1} block={() => NETHER_BLOCK} seed={18} />
      <BlockRow x={60} y={46} count={13} s={1} block={() => NETHER_BLOCK} seed={33} />
      {[[92, 0], [140, 1]].map(([x, i]) => (
        <g key={x}>
          <rect x={x} y="0" width="6" height="34" fill="#ff7a12" className="mz-np-lavafall" style={v({ "--d": `${-i * 0.6}s` })} shapeRendering="crispEdges" />
          <rect x={x + 1.5} y="0" width="2" height="34" fill="#ffd25a" opacity="0.8" shapeRendering="crispEdges" />
          <rect x={x - 4} y="29" width="14" height="3" fill="#ff9a2a" shapeRendering="crispEdges" />
        </g>
      ))}
      <g className="mz-np-ghast">
        <Pixels
          rows={["WWWWWWWW", "WWWWWWWW", "WKWWWWKW", "WKWWWWKW", "WWWWWWWW", "WWWKKWWW", "WWWWWWWW", "WWWWWWWW", "W.W.W.W.", "W...W..."]}
          pal={{ W: ["#f2f2f2", "#e4e4e4", "#ffffff"], K: "#4a4a4a" }}
          x={112}
          y={9}
          s={2}
          seed={12}
        />
      </g>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={64 + noise(i, 3) * 94} y="40" width="1.2" height="1.2" fill={i % 2 ? "#ffb347" : "#ff5a1a"} className="mz-np-ember" style={v({ "--d": `${-noise(i, 4) * 3}s`, "--t": `${2 + noise(i, 5) * 2}s` })} />
      ))}
    </>
  ),
  "dead-city": () => (
    <>
      <circle cx="140" cy="14" r="9" fill="#e9f2c8" opacity="0.9" />
      <circle cx="140" cy="14" r="14" fill="#cfe89a" opacity="0.16" />
      <path d="M60 48 V30 H66 V22 L70 24 V18 H78 V26 L82 22 V30 H88 V14 L92 12 L96 16 V30 H100 V24 H106 L109 20 L112 26 V34 H118 V20 L124 16 V22 L128 18 V34 H134 V28 H142 L146 24 V32 H152 V22 L156 26 L160 22 V48Z" fill="#141a12" />
      {[[70, 28], [90, 18], [90, 24], [120, 24], [124, 28], [136, 32], [154, 28]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="2.2" height="2.2" fill="#d9e86a" opacity="0.7" className={i % 3 === 0 ? "mz-np-flicker" : undefined} style={v({ "--d": `${-i * 0.7}s` })} />
      ))}
      <path d="M92 12 L94 9 L95 13" fill="none" stroke="#141a12" strokeWidth="1" />
      <g className="mz-np-walk" fill="#0a0d08">
        <path d={SHAMBLER} transform="translate(0 20) scale(0.42)" />
        <path d={SHAMBLER} transform="translate(-22 22) scale(0.36)" className="mz-np-walk-b" />
      </g>
      <g className="mz-np-fog">
        <ellipse cx="90" cy="42" rx="34" ry="6" fill="#9fc27a" opacity="0.22" />
        <ellipse cx="140" cy="44" rx="30" ry="5" fill="#9fc27a" opacity="0.18" />
      </g>
    </>
  ),
  quarantine: (u) => (
    <>
      <g transform="translate(140 24)">
        <circle r="16" fill="#f5c400" opacity="0.12" className="mz-np-alarm" />
        <Biohazard id={`${u}bh`} color="#f5c400" className="mz-np-bio" />
      </g>
      <Tape id={`${u}t1`} x1={70} y1={44} x2={166} y2={6} w={7.5} className="mz-np-tape" />
      <circle cx="104" cy="8" r="3" fill="#ff2a2a" className="mz-np-beacon" />
    </>
  ),
};

/* ================================================================== */
/* Avatar decorations                                                  */
/* A 120x120 box; the avatar is the circle at (60,60) r50.             */
/* ================================================================== */

export const MZ_DECORATIONS: Record<string, (u: string) => ReactNode> = {
  "creeper-peek": () => (
    <>
      <g className="mz-d-peek">
        <g className="mz-d-swell">
          <Pixels rows={CREEPER_FACE} pal={BLOCK_PAL} x={82} y={-6} s={4.2} seed={2} />
          <rect x="82" y="-6" width="33.6" height="33.6" fill="#fff" className="mz-d-hiss" />
        </g>
      </g>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={84 + i * 9} y="28" width="2" height="2" fill="#555" className="mz-d-powder" style={v({ "--d": `${-i * 0.8}s` })} />
      ))}
    </>
  ),
  "block-head": () => (
    <g className="mz-d-hat">
      <g transform="rotate(-10 60 8)">
        <Pixels rows={["gggggggg", "gggggggg", "gggggggg"]} pal={BLOCK_PAL} x={38} y={-12} s={5.5} seed={7} />
        <Pixels rows={GRASS_BLOCK.slice(0, 5)} pal={BLOCK_PAL} x={38} y={4.5} s={5.5} seed={8} />
        <rect x="38" y="-12" width="44" height="44" fill="none" stroke="#1b2a10" strokeOpacity="0.35" strokeWidth="1" />
        <Pixels rows={POPPY} pal={FLOWER_PAL} x={66} y={-25} s={2.4} className="mz-d-flower" />
      </g>
    </g>
  ),
  "enchanted-blade": (u) => (
    <>
      <defs>
        <linearGradient id={`${u}gl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.35" stopColor="#b37bff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#d9b8ff" stopOpacity="0.95" />
          <stop offset="0.65" stopColor="#b37bff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${u}m`} maskUnits="userSpaceOnUse" x="60" y="56" width="72" height="72">
          <Pixels rows={SWORD} pal={{ O: "#fff", c: "#fff", w: "#fff", y: "#fff", h: "#fff" }} x={64} y={60} s={3.6} />
        </mask>
      </defs>
      <Pixels rows={SWORD} pal={SWORD_PAL} x={64} y={60} s={3.6} />
      <g mask={`url(#${u}m)`}>
        <rect x="20" y="20" width="60" height="60" fill={`url(#${u}gl)`} className="mz-d-glint" />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} className="mz-d-orb" style={v({ "--d": `${-i * 1.1}s`, "--a": `${i * 90}deg` })}>
          <rect x="-2.6" y="-2.6" width="5.2" height="5.2" fill="#c8ff4a" stroke="#4a8a10" strokeWidth="0.8" />
          <rect x="-1" y="-1" width="2" height="2" fill="#fbffd6" />
        </g>
      ))}
    </>
  ),
  "zombie-hands": () => (
    <>
      <Hand x={16} y={114} rot={34} s={1.05} className="mz-d-claw" />
      <Hand x={104} y={114} rot={-36} s={1} className="mz-d-claw mz-d-claw-b" skin="#94a07a" />
    </>
  ),
  infected: (u) => (
    <>
      <defs>
        <linearGradient id={`${u}sl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6ff4a" />
          <stop offset="1" stopColor="#5fbf1a" />
        </linearGradient>
        <filter id={`${u}gw`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <circle cx="60" cy="60" r="51" fill="none" stroke="#9cff2e" strokeWidth="4" opacity="0.45" filter={`url(#${u}gw)`} className="mz-d-pulse" />
      <path d="M12 46 C14 30 30 10 60 9 C90 10 106 30 108 46 C104 40 100 42 98 38 C94 30 86 24 80 26 C76 28 72 22 66 24 C62 26 58 22 52 24 C46 26 42 22 36 26 C30 30 26 36 22 38 C18 42 14 40 12 46Z" fill={`url(#${u}sl)`} stroke="#3a7a0a" strokeWidth="1.2" />
      {[[24, 38, 0, 9], [44, 25, -1.2, 13], [66, 25, -2.1, 11], [86, 27, -0.6, 15], [98, 38, -1.7, 8]].map(([x, y, d, len], i) => (
        <g key={i} className="mz-d-drip" style={v({ "--d": `${d}s`, "--len": `${len}px` })}>
          <path d={`M${x - 2.6} ${y} C${x - 2.6} ${y + 6} ${x - 1.6} ${y + 10} ${x} ${y + 10} C${x + 1.6} ${y + 10} ${x + 2.6} ${y + 6} ${x + 2.6} ${y}Z`} fill="#a6ff3a" />
          <circle cx={x - 0.8} cy={y + 6} r="0.9" fill="#f2ffd0" opacity="0.8" />
        </g>
      ))}
      {[[30, 18], [52, 14], [78, 15], [92, 22]].map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r="2.2" fill="none" stroke="#e8ffb0" strokeWidth="0.8" opacity="0.8" className="mz-d-bubble" style={v({ "--d": `${-i * 0.9}s` })} />
      ))}
      <g transform="translate(98 98)">
        <circle r="13" fill="#1a1a12" stroke="#f5c400" strokeWidth="2.2" />
        <g transform="scale(0.95)">
          <Biohazard id={`${u}bh`} color="#f5c400" className="mz-d-bio" />
        </g>
      </g>
    </>
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

export const MZ_FRAME_ART: Record<string, (u: string) => ReactNode> = {
  "grass-block": () => (
    <>
      <Piece at="top" width={104} overlap={0.42} viewBox="0 0 208 34">
        <BlockRow x={0} y={10} count={13} s={2} block={() => GRASS_BLOCK.slice(0, 6)} seed={2} />
        {[[14, 3], [46, 5], [96, 2], [150, 4], [188, 3]].map(([x, h], i) => (
          <Pixels key={i} rows={Array.from({ length: h }, (_, k) => (k % 2 ? "g.g" : ".g."))} pal={BLOCK_PAL} x={x} y={10 - h * 2} s={2} seed={i} className="mz-f-tuft" />
        ))}
        <Pixels rows={POPPY} pal={FLOWER_PAL} x={70} y={-2} s={2} className="mz-f-sway" />
        <Pixels rows={DANDELION} pal={FLOWER_PAL} x={128} y={0} s={2} className="mz-f-sway mz-f-sway-b" />
        <Pixels rows={POPPY} pal={FLOWER_PAL} x={172} y={-2} s={2} className="mz-f-sway" />
      </Piece>
      <Piece at="bottom" width={104} overlap={0.5} viewBox="0 0 208 32">
        <BlockRow x={0} y={0} count={13} s={2} block={(i) => [STONE_BLOCK, STONE_BLOCK, COAL_ORE, STONE_BLOCK, DIAMOND_ORE, STONE_BLOCK, STONE_BLOCK, GOLD_ORE, STONE_BLOCK, STONE_BLOCK, REDSTONE_ORE, STONE_BLOCK, DIAMOND_ORE][i]} seed={40} />
        {[[72, 8], [80, 12], [198, 6], [200, 12]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="2" height="2" fill="#e6fffd" className="mz-np-glint" style={v({ "--d": `${-i * 0.7}s` })} />
        ))}
      </Piece>
    </>
  ),
  tnt: () => (
    <>
      <Piece at="top" width={34} right={-4} overlap={0.34} viewBox="0 0 70 76">
        <Pixels rows={TNT} pal={TNT_PAL} x={2} y={42} s={2} seed={1} />
        <Pixels rows={TNT} pal={TNT_PAL} x={36} y={42} s={2} seed={2} />
        <Pixels rows={TNT} pal={TNT_PAL} x={19} y={10} s={2} seed={3} />
        <rect x="19" y="10" width="32" height="2" fill="#7a7a7a" shapeRendering="crispEdges" />
        <path d="M35 10 V2" stroke="#d9d0b0" strokeWidth="1.6" />
        <g className="mz-f-fuse">
          <circle cx="35" cy="1.5" r="3.2" fill="#ffe35c" />
          <circle cx="35" cy="1.5" r="1.6" fill="#fff" />
        </g>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="34" y="0" width="1.6" height="1.6" fill="#ffb347" className="mz-f-spark" style={v({ "--d": `${-i * 0.18}s`, "--dx": `${(i - 1.5) * 5}px` })} />
        ))}
      </Piece>
      <Piece at="bottom" width={13} left={-4} overlap={0.3} viewBox="0 0 24 66">
        <g className="mz-f-creeper">
          <Pixels rows={CREEPER_BODY} pal={BLOCK_PAL} x={2} y={0} s={2.5} seed={6} />
        </g>
      </Piece>
    </>
  ),
  "zombie-hands": () => (
    <>
      <Piece at="top" width={100} overlap={0.5} viewBox="0 0 300 70">
        <Hand x={46} y={72} rot={-8} s={1.25} className="mz-f-grip" />
        <Hand x={150} y={74} rot={6} s={1.1} className="mz-f-grip mz-f-grip-b" skin="#94a07a" />
        <Hand x={250} y={72} rot={14} s={1.2} className="mz-f-grip mz-f-grip-c" skin="#86977a" bloody={false} />
      </Piece>
      <Piece at="bottom" width={70} left={-6} overlap={0.55} viewBox="0 0 220 80">
        <path d="M0 80 C20 56 60 40 110 42 C160 44 200 58 220 80Z" fill="#2c2418" />
        <path d="M14 66 C40 50 70 44 110 46 C150 48 180 56 206 68" fill="none" stroke="#4a3d2a" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 6" />
        <g transform="translate(150 46)">
          <path d="M-18 0 V-30 C-18 -42 18 -42 18 -30 V0Z" fill="#6e6f78" stroke="#3a3b42" strokeWidth="2" />
          <path d="M-18 0 V-30 C-18 -42 0 -42 0 -42 C-10 -38 -12 -30 -12 -24 V0Z" fill="#83848e" />
          <text x="0" y="-18" textAnchor="middle" fontFamily="'Special Elite', Georgia, serif" fontSize="11" fontWeight="700" fill="#2a2b30">RIP</text>
          <path d="M-10 -8 H10" stroke="#3a3b42" strokeWidth="1.4" />
        </g>
        <Hand x={64} y={56} rot={-14} s={0.95} className="mz-f-rise" />
        {[[40, 50], [92, 46], [104, 50]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="5" height="4" rx="1" fill="#3a2f1e" className="mz-f-clod" style={v({ "--d": `${-i * 0.4}s` })} />
        ))}
      </Piece>
    </>
  ),
  quarantine: (u) => (
    <>
      <Piece at="top" width={46} left={-8} overlap={0.6} viewBox="0 0 140 90">
        <Tape id={`${u}a`} x1={-10} y1={86} x2={150} y2={6} w={13} />
        <Tape id={`${u}b`} x1={4} y1={20} x2={120} y2={96} w={11} text="DO NOT ENTER" />
      </Piece>
      <Piece at="top" width={22} overlap={0.55} viewBox="0 0 60 50">
        <path d="M6 48 L30 4 L54 48Z" fill="#f5c400" stroke="#1a1600" strokeWidth="3" strokeLinejoin="round" />
        <g transform="translate(30 32) scale(0.9)">
          <Biohazard id={`${u}bh`} color="#1a1600" />
        </g>
        <circle cx="30" cy="2" r="4" fill="#ff2a2a" className="mz-np-beacon" />
      </Piece>
      <Piece at="bottom" width={46} right={-8} overlap={0.55} viewBox="0 0 140 90">
        <Tape id={`${u}c`} x1={-10} y1={84} x2={150} y2={4} w={13} />
      </Piece>
    </>
  ),
};

/* ================================================================== */
/* Profile effects                                                     */
/* ================================================================== */

export interface MzEffectSpec {
  motion: "fall" | "rise" | "twinkle" | "wander" | "streak";
  count: number;
  size: [number, number];
  time: [number, number];
  spin?: boolean;
  shape: (i: number) => ReactNode;
}

export const MZ_EFFECTS: Record<string, MzEffectSpec> = {
  "xp-orbs": {
    motion: "wander",
    count: 16,
    size: [7, 13],
    time: [3, 6],
    shape: (i) => (
      <svg viewBox="0 0 8 8" className="mz-e-orb" style={v({ "--d": `${-noise(i, 3) * 2}s` })} shapeRendering="crispEdges">
        <path d="M2 0 H6 V1 H7 V2 H8 V6 H7 V7 H6 V8 H2 V7 H1 V6 H0 V2 H1 V1 H2Z" fill="#4a8a10" />
        <path d="M2 1 H6 V2 H7 V6 H6 V7 H2 V6 H1 V2 H2Z" fill={i % 3 ? "#b6f53a" : "#e1ff5a"} />
        <rect x="2" y="2" width="2" height="2" fill="#fbffd6" />
      </svg>
    ),
  },
  "mz-glyphs": {
    motion: "rise",
    count: 18,
    size: [8, 14],
    time: [5, 9],
    shape: (i) => (
      <svg viewBox="-1 -1 8 8" className="mz-e-glyph">
        <path d={GLYPHS[i % GLYPHS.length]} fill="none" stroke={i % 4 ? "#e7dcff" : "#b98cff"} strokeWidth="1" strokeLinecap="square" />
      </svg>
    ),
  },
  "mz-spores": {
    motion: "rise",
    count: 22,
    size: [3, 8],
    time: [5, 10],
    shape: (i) => <span className="mz-e-spore" style={v({ "--c": i % 3 ? "#a6ff3a" : "#e8ffb0" })} />,
  },
};

/** Particle effects that a scene adds on top. */
export const MZ_SCENE_EXTRA: Record<string, string> = {
  enchanted: "mz-glyphs",
  outbreak: "mz-spores",
  horde: "mz-spores",
};

export const MZ_SCENES: Record<string, () => ReactNode> = {
  creeper: () => (
    <>
      <i className="mz-e-creeper">
        <svg viewBox="0 0 8 26" className="mz-e-creeper-body">
          <Pixels rows={CREEPER_BODY} pal={BLOCK_PAL} seed={4} />
        </svg>
      </i>
      <i className="mz-e-flash" />
      {Array.from({ length: 16 }, (_, i) => (
        <i
          key={i}
          className="mz-e-debris"
          style={v({
            "--a": `${(i * (360 / 16) + noise(i, 2) * 18).toFixed(1)}deg`,
            "--r": `${(26 + noise(i, 3) * 30).toFixed(1)}cqw`,
            "--s": `${(2.4 + noise(i, 4) * 2.6).toFixed(2)}cqw`,
            "--c": [CREEPER[0], CREEPER[3], "#3a3a3a", "#6b6b6b", "#e8e8e8"][i % 5],
            "--spin": `${Math.round((noise(i, 5) - 0.5) * 720)}deg`,
          })}
        />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <i key={`s${i}`} className="mz-e-smoke" style={v({ "--a": `${(i * 60 + noise(i, 6) * 30).toFixed(0)}deg`, "--d": `${(i * 0.05).toFixed(2)}s` })} />
      ))}
    </>
  ),
  enchanted: () => (
    <>
      <i className="mz-e-glint" />
      <i className="mz-e-glint mz-e-glint-b" />
    </>
  ),
  horde: () => (
    <>
      <i className="mz-e-moon" />
      <i className="mz-e-ground" />
      {[[0.9, 26, -2, 0], [0.7, 34, -13, 1], [1.05, 22, -21, 0], [0.8, 30, -7, 1]].map(([scale, time, delay, back], i) => (
        <i key={i} className={`mz-e-walker${back ? " mz-e-walker-back" : ""}`} style={v({ "--s": scale, "--t": `${time}s`, "--d": `${delay}s` })}>
          <svg viewBox="0 0 40 60">
            <g className="mz-e-shamble" style={v({ "--d": `${-i * 0.4}s` })}>
              <path d={SHAMBLER} fill="#0b0f08" />
            </g>
          </svg>
        </i>
      ))}
      {[[16, 0], [52, -3.1], [82, -5.4]].map(([left, delay], i) => (
        <i key={`h${i}`} className="mz-e-hand" style={v({ left: `${left}%`, "--d": `${delay}s` })}>
          <svg viewBox="-20 -46 40 60">
            <Hand x={0} y={8} rot={i === 1 ? 8 : -6} skin={i === 2 ? "#94a07a" : "#8fa57a"} className="mz-e-handclaw" />
          </svg>
        </i>
      ))}
      <i className="mz-e-fog" />
      <i className="mz-e-fog mz-e-fog-b" />
    </>
  ),
  outbreak: () => (
    <>
      <i className="mz-e-alarm" />
      <i className="mz-e-vignette" />
      <i className="mz-e-bio">
        <svg viewBox="-12 -12 24 24">
          <Biohazard id="mz-e-bio" color="#c6ff4a" />
        </svg>
      </i>
      <i className="mz-e-lamp" />
      <i className="mz-e-tape">
        <svg viewBox="0 0 240 14">
          <Tape id="mz-e-tape" x1={0} y1={7} x2={240} y2={7} w={13} text="QUARANTINE ZONE" />
        </svg>
      </i>
    </>
  ),
};
