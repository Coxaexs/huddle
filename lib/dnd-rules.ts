/**
 * Per-server D&D settings (table server_dnd_settings, created in lib/schema):
 * which rules /spell, /monster and /condition look up by default (2014 SRD or
 * the 2024 books), homebrew entries imported as JSON, and the music a
 * battlemap switches the call to when the GM starts or ends combat.
 */

export type DndEdition = "2014" | "2024";

export const HOMEBREW_KINDS = ["spell", "monster", "condition", "item", "feat", "race", "class"] as const;
export type HomebrewKind = (typeof HOMEBREW_KINDS)[number];

export interface HomebrewItem {
  name: string;
  kind: HomebrewKind;
  description: string;
  level?: number;
  school?: string;
  type?: string;
  source?: string;
}

export interface DndSettings {
  edition: DndEdition;
  homebrew: HomebrewItem[];
  /** A playlist link or a search, e.g. "epic battle music". Empty leaves the music alone. */
  combatMusic: string;
  exploreMusic: string;
}

/** A server's homebrew is one JSON column; these keep it a sensible size. */
export const MAX_HOMEBREW = 300;
const MAX_DESCRIPTION = 4000;

const DEFAULTS: DndSettings = { edition: "2014", homebrew: [], combatMusic: "", exploreMusic: "" };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** One imported entry, or null if it has no name or an unknown kind. */
export function cleanHomebrew(raw: unknown): HomebrewItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const name = text(entry.name, 80);
  const kind = text(entry.kind, 20).toLowerCase().replace(/s$/, "") as HomebrewKind;
  if (!name || !HOMEBREW_KINDS.includes(kind)) return null;
  const item: HomebrewItem = { name, kind, description: text(entry.description, MAX_DESCRIPTION) };
  const level = Number(entry.level);
  if (entry.level !== undefined && Number.isInteger(level) && level >= 0 && level <= 30) item.level = level;
  for (const key of ["school", "type", "source"] as const) {
    const value = text(entry[key], 80);
    if (value) item[key] = value;
  }
  return item;
}

export async function getDndSettings(db: D1Database, serverId: string): Promise<DndSettings> {
  const row = await db
    .prepare("SELECT edition, homebrew_json, combat_music, explore_music FROM server_dnd_settings WHERE server_id = ?")
    .bind(serverId)
    .first<{ edition: string | null; homebrew_json: string | null; combat_music: string | null; explore_music: string | null }>()
    .catch(() => null);
  if (!row) return { ...DEFAULTS };
  let homebrew: HomebrewItem[] = [];
  try {
    const parsed = JSON.parse(row.homebrew_json || "[]");
    if (Array.isArray(parsed)) homebrew = parsed.map(cleanHomebrew).filter((item): item is HomebrewItem => item !== null);
  } catch {
    // A broken column reads as no homebrew.
  }
  return {
    edition: row.edition === "2024" ? "2024" : "2014",
    homebrew,
    combatMusic: row.combat_music || "",
    exploreMusic: row.explore_music || "",
  };
}

export async function saveDndSettings(db: D1Database, serverId: string, settings: DndSettings): Promise<void> {
  await db
    .prepare(
      `INSERT INTO server_dnd_settings (server_id, edition, homebrew_json, combat_music, explore_music, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(server_id) DO UPDATE SET edition = ?2, homebrew_json = ?3, combat_music = ?4,
         explore_music = ?5, updated_at = ?6`,
    )
    .bind(
      serverId,
      settings.edition,
      JSON.stringify(settings.homebrew),
      settings.combatMusic || null,
      settings.exploreMusic || null,
      Date.now(),
    )
    .run();
}

/**
 * Adds imported entries; one with the same kind and name replaces the old one.
 * Returns how many were taken, or an error when the server would go past
 * MAX_HOMEBREW.
 */
export function mergeHomebrew(
  existing: HomebrewItem[],
  incoming: unknown[],
): { homebrew: HomebrewItem[]; added: number; skipped: number } | { error: string } {
  const byKey = new Map(existing.map((item) => [`${item.kind}:${item.name.toLowerCase()}`, item]));
  let added = 0;
  let skipped = 0;
  for (const raw of incoming) {
    const item = cleanHomebrew(raw);
    if (!item) {
      skipped += 1;
      continue;
    }
    byKey.set(`${item.kind}:${item.name.toLowerCase()}`, item);
    added += 1;
  }
  if (byKey.size > MAX_HOMEBREW) {
    return { error: `A server can keep ${MAX_HOMEBREW} homebrew entries; this would make ${byKey.size}.` };
  }
  return { homebrew: [...byKey.values()], added, skipped };
}

/** The homebrew entry a lookup names exactly, if the server has one. */
export function findHomebrew(homebrew: HomebrewItem[], kind: string, query: string): HomebrewItem | null {
  const wanted = kind.toLowerCase().replace(/s$/, "");
  const name = query.trim().toLowerCase();
  return homebrew.find((item) => item.kind === wanted && item.name.toLowerCase() === name) ?? null;
}
