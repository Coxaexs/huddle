/**
 * The Winamp theme's equalizer, the part that is only numbers: its ten bands,
 * Winamp's own presets, and what a setting does to the sound. The sliders are
 * in app/components/retro-chrome.tsx, the filters in app/lib/spatial-audio.ts;
 * the setting is this browser's own (app/lib/winamp-eq-store.ts) and only
 * changes how the music bot sounds here.
 */

/** Winamp 2's bands, in Hz. */
export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;
export const EQ_LABELS = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"] as const;
/** The sliders go from -12 dB at the bottom to +12 dB at the top. */
export const EQ_MAX_DB = 12;

export interface WinampEqSettings {
  /** The ON button. */
  on: boolean;
  /** The preamp slider, dB. */
  preamp: number;
  /** One per band, dB. */
  bands: number[];
  /** The preset last loaded, until a slider moves. */
  preset: string | null;
}

export const FLAT_EQ: WinampEqSettings = { on: true, preamp: 0, bands: EQ_FREQS.map(() => 0), preset: null };

/** Winamp's slider steps (1 .. 64, 33 the middle) as dB. */
const fromSteps = (steps: number[]) => steps.map((step) => Math.round(((step - 33) * EQ_MAX_DB / 31) * 10) / 10);

/** The presets Winamp came with, in the order its menu had them. */
export const EQ_PRESETS: ReadonlyArray<{ name: string; bands: number[] }> = [
  { name: "Classical", bands: fromSteps([33, 33, 33, 33, 33, 33, 20, 20, 20, 16]) },
  { name: "Club", bands: fromSteps([33, 33, 38, 42, 42, 42, 38, 33, 33, 33]) },
  { name: "Dance", bands: fromSteps([48, 44, 36, 32, 32, 22, 20, 20, 32, 32]) },
  { name: "Full Bass", bands: fromSteps([48, 48, 48, 42, 35, 25, 18, 15, 14, 14]) },
  { name: "Full Bass & Treble", bands: fromSteps([44, 42, 33, 20, 24, 35, 46, 50, 52, 52]) },
  { name: "Full Treble", bands: fromSteps([16, 16, 16, 25, 37, 50, 58, 58, 58, 60]) },
  { name: "Laptop Speakers / Headphone", bands: fromSteps([40, 50, 41, 26, 28, 35, 40, 48, 53, 56]) },
  { name: "Large Hall", bands: fromSteps([49, 49, 42, 42, 33, 24, 24, 24, 33, 33]) },
  { name: "Live", bands: fromSteps([24, 33, 39, 41, 42, 42, 39, 37, 37, 36]) },
  { name: "Party", bands: fromSteps([44, 44, 33, 33, 33, 33, 33, 33, 44, 44]) },
  { name: "Pop", bands: fromSteps([29, 40, 44, 45, 41, 30, 28, 28, 29, 29]) },
  { name: "Reggae", bands: fromSteps([33, 33, 31, 22, 33, 43, 43, 33, 33, 33]) },
  { name: "Rock", bands: fromSteps([45, 40, 23, 19, 26, 39, 47, 50, 50, 50]) },
  { name: "Ska", bands: fromSteps([28, 24, 25, 31, 39, 42, 47, 48, 50, 48]) },
  { name: "Soft", bands: fromSteps([40, 35, 30, 28, 30, 39, 46, 48, 50, 52]) },
  { name: "Soft Rock", bands: fromSteps([39, 39, 36, 31, 25, 23, 26, 31, 37, 47]) },
  { name: "Techno", bands: fromSteps([45, 42, 33, 23, 24, 33, 45, 48, 48, 47]) },
];

const clampDb = (value: unknown) => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, n)) * 10) / 10;
};

/** A stored setting, made safe: anything missing or out of range is flat. */
export function cleanEq(raw: unknown): WinampEqSettings {
  if (!raw || typeof raw !== "object") return { ...FLAT_EQ, bands: [...FLAT_EQ.bands] };
  const value = raw as Partial<Record<keyof WinampEqSettings, unknown>>;
  const bands = Array.isArray(value.bands) ? value.bands : [];
  const preset = typeof value.preset === "string" && EQ_PRESETS.some((p) => p.name === value.preset) ? value.preset : null;
  return { on: value.on !== false, preamp: clampDb(value.preamp), bands: EQ_FREQS.map((_, i) => clampDb(bands[i])), preset };
}

export function isFlat(eq: WinampEqSettings): boolean {
  return eq.preamp === 0 && eq.bands.every((band) => band === 0);
}

/**
 * The filters a setting asks for: the preamp and each band, in dB, or null when it leaves the sound alone
 * (switched off, or every slider in the middle). Boosts eat into the headroom a loud song doesn't have, so
 * three quarters of the biggest boost comes off the preamp: it sounds like the curve, and never clips.
 */
export function eqGains(eq: WinampEqSettings): { preamp: number; bands: number[] } | null {
  if (!eq.on || isFlat(eq)) return null;
  const boost = Math.max(0, ...eq.bands);
  return { preamp: eq.preamp - boost * 0.75, bands: [...eq.bands] };
}

/** The curve's level at `freq` (dB), straight between the bands on a log scale, flat beyond the ends. */
export function eqDbAt(freq: number, bands: readonly number[]): number {
  if (freq <= EQ_FREQS[0]) return bands[0] ?? 0;
  const last = EQ_FREQS.length - 1;
  if (freq >= EQ_FREQS[last]) return bands[last] ?? 0;
  let i = 0;
  while (EQ_FREQS[i + 1] < freq) i++;
  const k = Math.log(freq / EQ_FREQS[i]) / Math.log(EQ_FREQS[i + 1] / EQ_FREQS[i]);
  return (bands[i] ?? 0) * (1 - k) + (bands[i + 1] ?? 0) * k;
}

/** The graph over the sliders: the curve through the bands as an SVG polyline in a 100 × 20 box (top +12 dB). */
export function eqGraphPoints(bands: readonly number[]): string {
  const points: string[] = [];
  const steps = 45;
  for (let s = 0; s <= steps; s++) {
    // Smooth (Catmull-Rom) through the ten bands, evenly spaced across the graph as Winamp draws them.
    const at = (s / steps) * (bands.length - 1);
    const i = Math.min(bands.length - 2, Math.floor(at));
    const k = at - i;
    const p0 = bands[Math.max(0, i - 1)], p1 = bands[i], p2 = bands[i + 1], p3 = bands[Math.min(bands.length - 1, i + 2)];
    const db = 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k * k + (-p0 + 3 * p1 - 3 * p2 + p3) * k * k * k);
    const y = 10 - (Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, db)) / EQ_MAX_DB) * 9;
    points.push(`${((s / steps) * 100).toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}
