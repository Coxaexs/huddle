/**
 * Per-server D&D settings (table server_dnd_settings, created in lib/schema):
 * which game the tabletop plays (D&D 5e or Vampire: The Masquerade V5), which rules /spell, /monster and /condition look up by default (2014 SRD or
 * the 2024 books), homebrew entries imported as JSON, and the music a
 * battlemap switches the call to when the GM starts or ends combat.
 */

import { can, Permission } from "./permissions";
import { isGameSystem, type GameSystem } from "./v5-sheet";

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
  /** The game the tabletop plays: the sheet, the screen pages and whether rolls answer as the Storyteller. */
  system: GameSystem;
  edition: DndEdition;
  homebrew: HomebrewItem[];
  /** A playlist link or a search, e.g. "epic battle music". Empty leaves the music alone. */
  combatMusic: string;
  exploreMusic: string;
  /** Optional server role ID whose holders automatically count as Game Masters. */
  gmRoleId: string | null;
}

/** A server's homebrew is one JSON column; these keep it a sensible size. */
export const MAX_HOMEBREW = 300;
const MAX_DESCRIPTION = 4000;

const DEFAULTS: DndSettings = {
  system: "dnd5e",
  edition: "2014",
  homebrew: [],
  combatMusic: "",
  exploreMusic: "",
  gmRoleId: null,
};

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
    .prepare(
      "SELECT game_system, edition, homebrew_json, combat_music, explore_music, gm_role_id FROM server_dnd_settings WHERE server_id = ?",
    )
    .bind(serverId)
    .first<{
      game_system: string | null;
      edition: string | null;
      homebrew_json: string | null;
      combat_music: string | null;
      explore_music: string | null;
      gm_role_id?: string | null;
    }>()
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
    system: isGameSystem(row.game_system) ? row.game_system : "dnd5e",
    edition: row.edition === "2024" ? "2024" : "2014",
    homebrew,
    combatMusic: row.combat_music || "",
    exploreMusic: row.explore_music || "",
    gmRoleId: typeof row.gm_role_id === "string" && row.gm_role_id.trim() ? row.gm_role_id.trim() : null,
  };
}

export async function saveDndSettings(db: D1Database, serverId: string, settings: DndSettings): Promise<void> {
  await db
    .prepare(
      `INSERT INTO server_dnd_settings (server_id, edition, homebrew_json, combat_music, explore_music, updated_at, game_system, gm_role_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(server_id) DO UPDATE SET edition = ?2, homebrew_json = ?3, combat_music = ?4,
         explore_music = ?5, updated_at = ?6, game_system = ?7, gm_role_id = ?8`,
    )
    .bind(
      serverId,
      settings.edition,
      JSON.stringify(settings.homebrew),
      settings.combatMusic || null,
      settings.exploreMusic || null,
      Date.now(),
      settings.system,
      settings.gmRoleId || null,
    )
    .run();
}

/** True when `userId` holds the server's configured Game Master role. */
export async function hasConfiguredGmRole(
  db: D1Database,
  userId: string,
  serverId: string,
): Promise<boolean> {
  if (!userId || !serverId) return false;
  const row = await db
    .prepare(
      `SELECT 1 AS ok
         FROM server_dnd_settings s
         JOIN member_roles mr ON mr.server_id = s.server_id AND mr.role_id = s.gm_role_id
        WHERE s.server_id = ? AND s.gm_role_id IS NOT NULL AND mr.user_id = ?
        LIMIT 1`,
    )
    .bind(serverId, userId)
    .first<{ ok: number }>()
    .catch(() => null);
  return Boolean(row?.ok);
}

/**
 * True when `userId` acts as Game Master in `serverId`: either they hold the
 * server's configured GM role, or they can manage channels (owner, admin, or
 * channel manager).
 */
export async function isServerDm(
  db: D1Database,
  userId: string,
  serverId: string,
): Promise<boolean> {
  if (!userId || !serverId) return false;
  if (await hasConfiguredGmRole(db, userId, serverId)) return true;
  const manageChannels = Permission?.MANAGE_CHANNELS ?? (1 << 1);
  return can(db, userId, serverId, manageChannels);
}

/** True if `userId` holds a configured GM role in any server they belong to (used by SSO when serverId is omitted). */
export async function userHasAnyGmRole(db: D1Database, userId: string): Promise<boolean> {
  if (!userId) return false;
  const row = await db
    .prepare(
      `SELECT 1 AS ok
         FROM server_dnd_settings s
         JOIN member_roles mr ON mr.server_id = s.server_id AND mr.role_id = s.gm_role_id
        WHERE s.gm_role_id IS NOT NULL AND mr.user_id = ?
        LIMIT 1`,
    )
    .bind(userId)
    .first<{ ok: number }>()
    .catch(() => null);
  return Boolean(row?.ok);
}

/** User IDs that act as Game Masters in `serverId` (used for blind DM roll delivery and hidden token broadcasts). */
export async function serverDmUserIds(db: D1Database, serverId: string): Promise<string[]> {
  if (!serverId) return [];
  const mask = (Permission?.ADMINISTRATOR ?? (1 << 0)) | (Permission?.MANAGE_CHANNELS ?? (1 << 1));
  const ids = new Set<string>();

  const [admins, owner, settings, permHolders] = await Promise.all([
    db.prepare("SELECT id FROM users WHERE is_admin = 1").all<{ id: string }>().catch(() => null),
    db.prepare("SELECT created_by FROM servers WHERE id = ?").bind(serverId).first<{ created_by: string | null }>().catch(() => null),
    db.prepare("SELECT gm_role_id FROM server_dnd_settings WHERE server_id = ?").bind(serverId).first<{ gm_role_id: string | null }>().catch(() => null),
    db
      .prepare(
        `SELECT DISTINCT mr.user_id AS user_id
           FROM member_roles mr
           JOIN roles r ON r.id = mr.role_id
          WHERE mr.server_id = ? AND (r.permissions & ?) != 0`,
      )
      .bind(serverId, mask)
      .all<{ user_id: string }>()
      .catch(() => null),
  ]);

  for (const row of admins?.results || []) if (row.id) ids.add(row.id);
  if (owner?.created_by) ids.add(owner.created_by);
  for (const row of permHolders?.results || []) if (row.user_id) ids.add(row.user_id);

  const gmRoleId = settings?.gm_role_id?.trim();
  if (gmRoleId) {
    const gmHolders = await db
      .prepare("SELECT user_id FROM member_roles WHERE server_id = ? AND role_id = ?")
      .bind(serverId, gmRoleId)
      .all<{ user_id: string }>()
      .catch(() => null);
    for (const row of gmHolders?.results || []) if (row.user_id) ids.add(row.user_id);
  }

  return [...ids];
}

/** Just the server's game system (no homebrew to read): what a roll checks to pick its bot. */
export async function getGameSystem(db: D1Database, serverId: string): Promise<GameSystem> {
  const row = await db
    .prepare("SELECT game_system FROM server_dnd_settings WHERE server_id = ?")
    .bind(serverId)
    .first<{ game_system: string | null }>()
    .catch(() => null);
  return isGameSystem(row?.game_system) ? row.game_system : "dnd5e";
}

/** Who answers a roll: the Storyteller at a Vampire table (and for V5 dice anywhere), else the D&D Bot. */
export function rollBot(storyteller: boolean): { author: string; avatar: string; color: string } {
  return storyteller
    ? { author: "Storyteller", avatar: "🩸", color: "#b3122a" }
    : { author: "D&D Bot", avatar: "⚔", color: "#b8a6ff" };
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
