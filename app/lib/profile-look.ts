"use client";

import { useEffect, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { NAME_FONTS, hexToRgb, nameEffect, nameFont, rgbToHex, themeIsLight, type NameFontSpec, type ProfileStyle } from "@/lib/profile-style";

/*
 * Client side of profile styles (catalog and validation: lib/profile-style.ts,
 * visuals: app/profile-style.css). This turns a ProfileStyle into class names
 * and CSS variables, loads name fonts on demand, and drives the card's tilt.
 */

/* ------------------------------------------------------------------ */
/* Registry: voice tiles only get presence data, so chat-shell feeds   */
/* every loaded member in here and anything can look a style up by id. */
/* ------------------------------------------------------------------ */

const registry = new Map<string, ProfileStyle>();
const listeners = new Set<() => void>();
let version = 0;

export function registerProfileStyles(people: Array<{ id: string; profileStyle?: ProfileStyle }>) {
  let changed = false;
  for (const person of people) {
    const next = person.profileStyle || {};
    const prev = registry.get(person.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
      registry.set(person.id, next);
      changed = true;
    }
  }
  if (!changed) return;
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when any registered style changes; returns a lookup by user id. */
export function useProfileStyles(): (id: string | undefined) => ProfileStyle | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return (id) => (id ? registry.get(id) : undefined);
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

const requested = new Set<string>();

function fontQuery(families: readonly NameFontSpec[]) {
  return families
    .filter((font) => font.family && !requested.has(font.family))
    .map((font) => {
      requested.add(font.family!);
      return `family=${font.family!.replace(/ /g, "+")}:wght@${font.weight ?? 400}`;
    })
    .join("&");
}

function addFontSheet(query: string) {
  if (!query || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  document.head.appendChild(link);
}

/** Fetches a name font the first time anyone on screen wears it. */
export function loadNameFont(id: string | undefined) {
  const spec = nameFont(id);
  if (spec?.family && !requested.has(spec.family)) addFontSheet(fontQuery([spec]));
}

/** Every name font at once, for the editor's font grid. */
export function loadAllNameFonts() {
  addFontSheet(fontQuery(NAME_FONTS));
}

/* ------------------------------------------------------------------ */
/* Display names                                                       */
/* ------------------------------------------------------------------ */

export interface NameLook {
  className: string;
  style: CSSProperties;
  /** The effect animates letter by letter. */
  letters: boolean;
}

/**
 * Classes and variables for a styled display name, or null when the style
 * leaves the name alone. `live` names animate all the time (cards, voice);
 * the rest only while their row is hovered, so chat stays calm.
 */
export function nameLook(style: ProfileStyle | undefined, live = false): NameLook | null {
  if (!style) return null;
  const font = nameFont(style.font);
  const effect = nameEffect(style.effect);
  if (!effect && (!font || !font.family)) return null;
  const classes = ["pn"];
  const css: Record<string, string | number> = {};
  if (font?.family) {
    classes.push("pn-font");
    css["--pn-family"] = `"${font.family}"`;
    css["--pn-weight"] = font.weight ?? 400;
    css["--pn-scale"] = font.scale ?? 1;
    if (font.tracking) css["--pn-track"] = font.tracking;
  }
  if (effect) {
    classes.push(`pn-fx-${effect.id}`);
    const colors = style.nameColors?.length ? style.nameColors : [...effect.defaults];
    colors.forEach((color, index) => {
      css[`--n${index + 1}`] = color;
    });
    // Effects written for two or three stops still work with fewer colours.
    if (colors.length) {
      css["--n2"] ??= colors[0];
      css["--n3"] ??= colors[1] ?? colors[0];
      if (colors.length === 3) classes.push("pn-three");
    }
  }
  if (live) classes.push("pn-live");
  return { className: classes.join(" "), style: css as CSSProperties, letters: Boolean(effect?.letters) };
}

/** Letters for per-letter effects; spaces stay plain text so they keep their width. */
export function splitGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
  return Array.from(text);
}

/* ------------------------------------------------------------------ */
/* Profile cards                                                       */
/* ------------------------------------------------------------------ */

/** The theme a card uses: the chosen pair, or one made from the profile colour. */
export function cardTheme(style: ProfileStyle | undefined, color?: string | null): [string, string] | null {
  if (style?.theme) return style.theme;
  if (!style?.finish && !style?.pattern && !style?.edge) return null;
  const base = /^#[0-9a-f]{6}$/i.test(color || "") ? color! : "#5865f2";
  return [base, darken(base, 0.72)];
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - amount;
  return rgbToHex(((n >> 16) & 255) * k + 8 * amount, ((n >> 8) & 255) * k + 8 * amount, (n & 255) * k + 14 * amount);
}

/** A button colour from the theme that white text reads well on. */
function buttonColor(theme: [string, string]): string {
  // Start from the more colourful of the two, then darken it in HSL so a
  // pastel turns into a deeper shade of itself rather than grey.
  const hsl = theme.map((hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, sat, l] as const;
  });
  let [h, sat, l] = hsl[0][1] >= hsl[1][1] ? hsl[0] : hsl[1];
  if (sat > 0.08) sat = Math.max(sat, 0.5);
  l = Math.min(Math.max(l, 0.2), 0.4);
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export interface CardLook {
  /** On the card element itself. */
  card: string;
  /** On the card's host (.pframe-host): entrance, motion and the overlays. */
  host: string;
  style: CSSProperties;
  themed: boolean;
}

export function cardLook(style: ProfileStyle | undefined, color?: string | null): CardLook {
  const theme = cardTheme(style, color);
  // People who never touched their card keep a still one.
  const motion = style?.motion || (theme ? "tilt" : "still");
  const host = ["pst-host", `pst-m-${motion}`];
  if (style?.entrance) host.push(`pst-in-${style.entrance}`);
  if (!theme) return { card: "", host: host.join(" "), style: {}, themed: false };
  const finish = style?.finish || "gradient";
  host.push(`pst-edge-${style?.edge || "soft"}`, `pst-f-${finish}`);
  const card = ["pst", `pst-f-${finish}`, themeIsLight(theme) ? "pst-light" : "pst-dark"];
  if (style?.pattern) card.push("pst-pat", `pst-pat-${style.pattern}`);
  if (card.includes("pst-light")) host.push("pst-tone-light");
  return {
    card: card.join(" "),
    host: host.join(" "),
    style: { "--pt-a": theme[0], "--pt-b": theme[1], "--pt-btn": buttonColor(theme) } as CSSProperties,
    themed: true,
  };
}

/**
 * Pointer tracking for a card host: tilt toward the pointer (motion "tilt")
 * and feed --mx/--my to the glare and holo foil. Mouse only, and off for
 * reduced motion.
 */
export function useCardPointer(ref: RefObject<HTMLElement | null>, motion: string | undefined, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.dataset.motion === "reduced") return;
    const tilt = (motion || "tilt") === "tilt";
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        if (tilt) {
          el.style.setProperty("--rx", `${((0.5 - y) * 8).toFixed(2)}deg`);
          el.style.setProperty("--ry", `${((x - 0.5) * 10).toFixed(2)}deg`);
        }
        el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        el.style.setProperty("--hue", `${Math.round((x + y) * 180)}deg`);
        el.classList.add("is-pointing");
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.classList.remove("is-pointing");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ref, motion, enabled]);
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

/** The colour someone's speaking ring uses. */
export function ringColor(style: ProfileStyle | undefined, fallback?: string | null): string {
  return style?.ringColor || style?.theme?.[0] || style?.nameColors?.[0] || fallback || "#23a55a";
}

/** Class and variables for a voice tile that wears someone's style. */
export function voiceTileLook(style: ProfileStyle | undefined, fallback?: string | null): { className: string; style: CSSProperties } {
  if (!style) return { className: "", style: {} };
  const classes: string[] = [];
  const css: Record<string, string> = {};
  if (style.ring) {
    classes.push("vt-ring");
    css["--va"] = ringColor(style, fallback);
  }
  if (style.theme && style.tile !== "plain") {
    classes.push("vt-theme");
    css["--pt-a"] = style.theme[0];
    css["--pt-b"] = style.theme[1];
  }
  return { className: classes.join(" "), style: css as CSSProperties };
}

/* ------------------------------------------------------------------ */
/* Colours from an avatar                                              */
/* ------------------------------------------------------------------ */

/**
 * Two colours that suit a picture: the most common vivid colour, and the most
 * common one that sits well away from it. Null when the image can't be read.
 */
export async function colorsFromImage(url: string): Promise<[string, string] | null> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  const buckets = new Map<number, { count: number; r: number; g: number; b: number; weight: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // Vivid, mid-bright colours make better themes than greys and near-blacks.
    const weight = 0.25 + sat * (max > 40 ? 1 : 0.3);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, weight: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.weight += weight;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .map((bucket) => ({ rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as const, score: bucket.weight }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const first = ranked[0].rgb;
  const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const second = ranked.find((entry) => distance(entry.rgb, first) > 90)?.rgb ?? first.map((v) => v * 0.35);
  return [rgbToHex(first[0], first[1], first[2]), rgbToHex(second[0], second[1], second[2])];
}
