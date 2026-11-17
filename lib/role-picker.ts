/**
 * Roles members pick for themselves: an admin offers some roles with an emoji
 * and a line about each, and members toggle them on the welcome screen or later
 * from the server menu (Pick your roles). A role's ping (@Role) reaches whoever
 * holds it, so a "Notifications" role is how someone opts in to pings.
 *
 * Only roles without permissions can be offered, so nobody can hand themselves
 * powers. A role that gains permissions later simply stops being offered.
 */

import type { PublicRole } from "./servers";

export const MAX_PICK_ROLES = 25;
export const MAX_PICK_NOTE = 200;
const MAX_PICK_EMOJI = 8; // code points, enough for a flag or a family emoji

export interface RolePick {
  roleId: string;
  emoji: string;
  note: string;
}

/** What a role carries when it is offered (PublicRole.pick). */
export interface RolePickInfo {
  emoji: string;
  note: string;
  order: number;
}

/** Cleans an admin's list: known shape, unique roles, short emoji and note. */
export function sanitizePicks(raw: unknown): RolePick[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const picks: RolePick[] = [];
  for (const item of raw) {
    if (picks.length >= MAX_PICK_ROLES) break;
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const roleId = String(entry.roleId ?? "").trim();
    if (!roleId || seen.has(roleId)) continue;
    seen.add(roleId);
    const emoji = Array.from(String(entry.emoji ?? "").trim()).slice(0, MAX_PICK_EMOJI).join("");
    const note = String(entry.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PICK_NOTE);
    picks.push({ roleId, emoji, note });
  }
  return picks;
}

/** The roles on offer in a server, in the admin's order. */
export function pickableRoles(roles: PublicRole[]): Array<PublicRole & { pick: RolePickInfo }> {
  return roles
    .filter((role): role is PublicRole & { pick: RolePickInfo } => Boolean(role.pick) && role.permissions === 0)
    .sort((a, b) => a.pick.order - b.pick.order);
}

interface RoleRow {
  id: string;
  name: string;
  permissions: number;
  position: number;
}

/**
 * Saves which roles are offered. `canTouch` says whether the caller may manage
 * a role (below their highest one); roles they may not touch keep their state.
 * Returns an error to show, or null.
 */
export async function savePicks(
  db: D1Database,
  serverId: string,
  picks: RolePick[],
  canTouch: (role: { position: number }) => boolean,
): Promise<string | null> {
  const rows = await db
    .prepare("SELECT id, name, permissions, position FROM roles WHERE server_id = ?")
    .bind(serverId)
    .all<RoleRow>();
  const byId = new Map((rows.results || []).map((row) => [row.id, row]));
  for (const pick of picks) {
    const role = byId.get(pick.roleId);
    if (!role) return "One of those roles is gone. Reload and try again.";
    if (role.permissions !== 0) {
      return `"${role.name}" gives permissions, so members cannot pick it for themselves. Take its permissions away in Roles first.`;
    }
    if (!canTouch(role)) return `"${role.name}" is above your highest role.`;
  }
  const picked = new Map(picks.map((pick, index) => [pick.roleId, { ...pick, order: index }]));
  const statements: D1PreparedStatement[] = [];
  for (const role of byId.values()) {
    if (!canTouch(role)) continue;
    const pick = picked.get(role.id);
    statements.push(
      pick
        ? db
            .prepare("UPDATE roles SET pick_order = ?, pick_emoji = ?, pick_note = ? WHERE id = ?")
            .bind(pick.order, pick.emoji, pick.note, role.id)
        : db
            .prepare(
              "UPDATE roles SET pick_order = NULL, pick_emoji = NULL, pick_note = NULL WHERE id = ? AND pick_order IS NOT NULL",
            )
            .bind(role.id),
    );
  }
  if (statements.length) await db.batch(statements);
  return null;
}

async function offeredIds(db: D1Database, serverId: string): Promise<string[]> {
  const rows = await db
    .prepare(
      "SELECT id FROM roles WHERE server_id = ? AND pick_order IS NOT NULL AND permissions = 0",
    )
    .bind(serverId)
    .all<{ id: string }>();
  return (rows.results || []).map((row) => row.id);
}

/** The offered roles this member holds now. */
export async function memberPicks(db: D1Database, serverId: string, userId: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT mr.role_id AS id
         FROM member_roles mr JOIN roles r ON r.id = mr.role_id
        WHERE mr.server_id = ? AND mr.user_id = ? AND r.pick_order IS NOT NULL AND r.permissions = 0`,
    )
    .bind(serverId, userId)
    .all<{ id: string }>();
  return (rows.results || []).map((row) => row.id);
}

/**
 * Makes the member hold exactly `wanted` among the offered roles. Roles that
 * are not offered are never added or removed here. Returns what they hold now
 * and whether anything changed.
 */
export async function setMemberPicks(
  db: D1Database,
  serverId: string,
  userId: string,
  wanted: unknown,
): Promise<{ roleIds: string[]; changed: boolean }> {
  const offered = await offeredIds(db, serverId);
  const want = new Set(
    (Array.isArray(wanted) ? wanted : []).map(String).filter((id) => offered.includes(id)),
  );
  const have = new Set(await memberPicks(db, serverId, userId));
  const statements: D1PreparedStatement[] = [];
  for (const id of want) {
    if (!have.has(id)) {
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)")
          .bind(serverId, userId, id),
      );
    }
  }
  for (const id of have) {
    if (!want.has(id)) {
      statements.push(
        db
          .prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?")
          .bind(serverId, userId, id),
      );
    }
  }
  if (statements.length) await db.batch(statements);
  return { roleIds: offered.filter((id) => want.has(id)), changed: statements.length > 0 };
}
