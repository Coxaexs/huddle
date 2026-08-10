/** Shared shapes for the voice-channel battlemap (a small VTT). */

export interface MapToken {
  id: string;
  label: string;
  color: string;
  /** Uploaded picture for the token, usually the owner's avatar. */
  avatarUrl?: string | null;
  /** Grid coordinates, not pixels, so any screen size lines up. */
  x: number;
  y: number;
  /** Token diameter in grid cells (default 1). Shared so everyone sees the same size. */
  size?: number;
  /** Who may move it; GMs may move anything. Null tokens are free-for-all. */
  ownerId?: string | null;
  hp?: number | null;
  maxHp?: number | null;
}

export interface MapStroke {
  id: string;
  color: string;
  width: number;
  /** Flat [x0,y0,x1,y1,…] in grid units, kept compact for the socket. */
  points: number[];
  by?: string;
}

/** A rectangle of fog hiding part of the map from non-GM players. */
export interface MapFog {
  id: string;
  /** Top-left corner in grid units. */
  x: number;
  y: number;
  /** Width/height in grid units. */
  w: number;
  h: number;
}

export interface Battlemap {
  id: string;
  channelId: string;
  name: string;
  imageUrl: string | null;
  /** Columns across the map; rows follow the image's aspect ratio. */
  grid: number;
  tokens: MapToken[];
  strokes: MapStroke[];
  /** Rectangles of fog hiding parts of the map from non-GMs. */
  fog: MapFog[];
}

export interface BattlemapRow {
  id: string;
  channel_id: string;
  name: string;
  image_key: string | null;
  grid: number;
  tokens: string;
  strokes: string;
  fog?: string;
  active: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function publicBattlemap(row: BattlemapRow): Battlemap {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    imageUrl: row.image_key
      ? `/hangout/api/uploads/${encodeURIComponent(row.image_key)}`
      : null,
    grid: row.grid || 20,
    tokens: parseJson<MapToken[]>(row.tokens, []),
    strokes: parseJson<MapStroke[]>(row.strokes, []),
    fog: parseJson<MapFog[]>(row.fog, []),
  };
}

/** Clamps a token to the board and rounds to a sensible precision. */
export function clampPoint(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(max, value)) * 100) / 100;
}
