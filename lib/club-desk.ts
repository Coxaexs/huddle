/**
 * The club's light desk: how the lights play the music, as whoever has the
 * decks sets it (anyone in the room, while the decks are free).
 *
 * Nothing here is rendered anywhere but in each listener's own browser: the
 * music bot sends what the music is doing (lib/club-feed.ts), the desk is a
 * handful of numbers and choices on top, and every tab draws the show from
 * the two. The room's hub keeps the desk for whoever opens the club later.
 * Moments (confetti, CO2, flames, a flash, a blackout or strobe held down)
 * go out once and are never kept.
 */

/** The seat behind the club's decks (app/lib/living-room.ts): whoever sits there runs the desk. */
export const CLUB_DECKS_SEAT = "club-dj";

/** Ready-made looks; "custom" once a slider has moved off one. */
export const CLUB_SCENES = ["auto", "warmup", "peak", "chill", "lasers", "custom"] as const;
export type ClubScene = (typeof CLUB_SCENES)[number];

/** Where the colours come from: the room theme's palette, the whole wheel, the song's key, or one picked colour. */
export const CLUB_COLOURS = ["theme", "rainbow", "key", "pick"] as const;
export type ClubColour = (typeof CLUB_COLOURS)[number];

/** Each fixture's pattern; "auto" lets the music's sections choose. */
export const FLOOR_FX = ["auto", "ripple", "checker", "stems", "chase", "sparkle"] as const;
export const WALL_FX = ["auto", "bars", "rings", "tunnel", "waves", "history"] as const;
export const BEAM_FX = ["auto", "sweep", "fan", "circle", "crowd", "still"] as const;
export const LASER_FX = ["auto", "fan", "sheet", "sweep", "cross"] as const;
export type FloorFx = (typeof FLOOR_FX)[number];
export type WallFx = (typeof WALL_FX)[number];
export type BeamFx = (typeof BEAM_FX)[number];
export type LaserFx = (typeof LASER_FX)[number];

/** The desk's faders, 0..1 each. `mix`: how many colours at once, from one for the whole room to every light its own. */
export const CLUB_FADERS = ["master", "beams", "move", "lasers", "strobe", "haze", "floor", "react", "colourSpeed", "mix"] as const;
export type ClubFader = (typeof CLUB_FADERS)[number];

export interface ClubDesk extends Record<ClubFader, number> {
  scene: ClubScene;
  colour: ClubColour;
  /** The picked colour's hue, 0..1 (colour "pick"). */
  hue: number;
  floorFx: FloorFx;
  wallFx: WallFx;
  beamFx: BeamFx;
  laserFx: LaserFx;
  /** Confetti and CO2 on the music's drops by themselves (the buttons always work). */
  autoFx: boolean;
  /**
   * The colours follow the notes: each part's lights (the floor the bass, the beams the chords, the lasers the
   * voice) take the colour of the note it is on, as far round from the show's colour as the note is round the
   * circle of fifths from the middle of the music. Off: the colours spread by where each light is.
   */
  notes: boolean;
}

export const DEFAULT_DESK: ClubDesk = {
  scene: "auto",
  master: 0.9, beams: 0.75, move: 0.5, lasers: 0.6, strobe: 0.6, haze: 0.55, floor: 0.75, react: 0.6, colourSpeed: 0.5, mix: 0.85,
  colour: "theme", hue: 0.9,
  floorFx: "auto", wallFx: "auto", beamFx: "auto", laserFx: "auto",
  autoFx: true,
  notes: true,
};

/** What each scene sets; the rest stays as it was. */
export const SCENE_DESKS: Record<Exclude<ClubScene, "custom">, Partial<ClubDesk>> = {
  auto: { master: 0.9, beams: 0.75, move: 0.5, lasers: 0.6, strobe: 0.6, haze: 0.55, floor: 0.75, react: 0.6, colourSpeed: 0.5, mix: 0.85, floorFx: "auto", wallFx: "auto", beamFx: "auto", laserFx: "auto", autoFx: true },
  warmup: { master: 0.6, beams: 0.45, move: 0.25, lasers: 0, strobe: 0, haze: 0.65, floor: 0.45, react: 0.4, colourSpeed: 0.25, mix: 0.4, floorFx: "ripple", wallFx: "waves", beamFx: "sweep", laserFx: "auto", autoFx: false },
  peak: { master: 1, beams: 1, move: 0.85, lasers: 1, strobe: 1, haze: 0.75, floor: 1, react: 0.95, colourSpeed: 0.8, mix: 1, floorFx: "auto", wallFx: "auto", beamFx: "auto", laserFx: "auto", autoFx: true },
  chill: { master: 0.55, beams: 0.4, move: 0.15, lasers: 0.25, strobe: 0, haze: 0.85, floor: 0.35, react: 0.3, colourSpeed: 0.15, mix: 0.5, floorFx: "stems", wallFx: "waves", beamFx: "still", laserFx: "sheet", autoFx: false },
  lasers: { master: 0.8, beams: 0.25, move: 0.6, lasers: 1, strobe: 0.4, haze: 0.95, floor: 0.4, react: 0.7, colourSpeed: 0.5, mix: 0.9, floorFx: "chase", wallFx: "tunnel", beamFx: "still", laserFx: "sheet", autoFx: true },
};

export function sceneDesk(scene: Exclude<ClubScene, "custom">, from: ClubDesk = DEFAULT_DESK): ClubDesk {
  return { ...from, ...SCENE_DESKS[scene], scene };
}

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  (options as readonly unknown[]).includes(value) ? (value as T) : fallback;
const unit = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) / 100 : fallback;

/** A whole desk from whatever was sent: unknown fields dropped, missing or bad ones from the default. */
export function cleanClubDesk(raw: unknown): ClubDesk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const desk: ClubDesk = {
    ...DEFAULT_DESK,
    scene: pick(CLUB_SCENES, value.scene, "custom"),
    colour: pick(CLUB_COLOURS, value.colour, DEFAULT_DESK.colour),
    hue: unit(value.hue, DEFAULT_DESK.hue),
    floorFx: pick(FLOOR_FX, value.floorFx, "auto"),
    wallFx: pick(WALL_FX, value.wallFx, "auto"),
    beamFx: pick(BEAM_FX, value.beamFx, "auto"),
    laserFx: pick(LASER_FX, value.laserFx, "auto"),
    autoFx: typeof value.autoFx === "boolean" ? value.autoFx : DEFAULT_DESK.autoFx,
    notes: typeof value.notes === "boolean" ? value.notes : DEFAULT_DESK.notes,
  };
  for (const fader of CLUB_FADERS) desk[fader] = unit(value[fader], DEFAULT_DESK[fader]);
  return desk;
}

/** Moments from the desk's buttons. blackout and strobe are held: on when pressed, off when let go. */
export const CLUB_FX = ["confetti", "co2", "pyro", "flash", "drop", "blackout", "strobe"] as const;
export type ClubFxThing = (typeof CLUB_FX)[number];
export interface ClubFx { thing: ClubFxThing; on?: boolean }
export const HELD_FX: readonly ClubFxThing[] = ["blackout", "strobe"];
/** A held moment lets go by itself after this long, in case the letting go never arrives. */
export const HOLD_MAX_MS = 8000;

export function cleanClubFx(raw: unknown): ClubFx | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!(CLUB_FX as readonly unknown[]).includes(value.thing)) return null;
  const thing = value.thing as ClubFxThing;
  return HELD_FX.includes(thing) ? { thing, on: value.on === true } : { thing };
}

/**
 * The hue (0..1) of a song's Camelot key: the wheel's twelve hours around the
 * colour wheel, so a harmonic mix (a step round the wheel) is a small change
 * of colour and a key clash a big one. B (major) sits a little warmer than A.
 */
export function keyHue(camelot: string | null | undefined): number | null {
  const match = CAMELOT.exec(camelot?.trim() ?? "");
  if (!match) return null;
  const hour = Number(match[1]) - 1;
  return ((hour / 12 + (match[2].toUpperCase() === "B" ? 0.03 : 0)) % 1 + 1) % 1;
}

const CAMELOT = /^(1[0-2]|[1-9])([AB])$/i;

/** A note's place round the circle of fifths, 0..11: C 0, G 1, D 2 ... F 11. */
export const fifths = (pc: number) => (pc * 7) % 12;

/**
 * The middle of a song's key round the circle of fifths (0..11, as fifths()): the
 * key's seven notes sit three fifths either side of it. C major and A minor (8B,
 * 8A) are centred on D. Null for no key.
 */
export function keyMiddle(camelot: string | null | undefined): number | null {
  const match = CAMELOT.exec(camelot?.trim() ?? "");
  // Camelot's hours step round the circle of fifths too: a major key's hour, less one, is its tonic's place
  // plus 7 (C major is 8B, C's place 0), and the middle is two fifths past the tonic.
  return match ? (Number(match[1]) - 1 + 7) % 12 : null;
}
