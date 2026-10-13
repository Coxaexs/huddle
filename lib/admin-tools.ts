/**
 * Instance admin actions for /admin: invite codes, voice room regions, server
 * deletion and message search/removal across every server and DM. Each change
 * is written to the audit log.
 */

import { INSTANCE_AUDIT } from "./admin";
import { recordAudit } from "./audit";
import { generateInviteCode, type User } from "./auth";
import { dispatchMessageDelete } from "./discord/dispatch";
import { channelAudience } from "./dms";
import { publishMemberUpdate, publishMessageEvent, publishStructureChange } from "./hub-client";
import { DEFAULT_SERVER_ID } from "./schema";
import { deleteServerData } from "./servers";

// ---- Invites ----

export interface AdminInvite {
  code: string;
  createdBy: string | null;
  createdAt: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
  note: string | null;
  server: string | null;
}

export async function adminInvites(db: D1Database): Promise<AdminInvite[]> {
  const rows = await db
    .prepare(
      `SELECT i.code, i.created_at, i.uses, i.max_uses, i.revoked, i.note,
              u.display_name AS creator, s.name AS server
         FROM invites i
         LEFT JOIN users u ON u.id = i.created_by
         LEFT JOIN servers s ON s.id = i.server_id
        ORDER BY i.created_at DESC`,
    )
    .all<{
      code: string;
      created_at: string;
      uses: number;
      max_uses: number;
      revoked: number;
      note: string | null;
      creator: string | null;
      server: string | null;
    }>();
  return rows.results.map((row) => ({
    code: row.code,
    createdBy: row.creator,
    createdAt: row.created_at,
    uses: Number(row.uses),
    maxUses: Number(row.max_uses),
    revoked: Boolean(row.revoked),
    note: row.note,
    server: row.server,
  }));
}

export async function deleteInvites(db: D1Database, codes: string[], actor: User): Promise<number> {
  if (!codes.length) return 0;
  const result = await db
    .prepare(`DELETE FROM invites WHERE code IN (${codes.map(() => "?").join(",")})`)
    .bind(...codes)
    .run();
  const deleted = Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
  if (deleted) {
    await recordAudit(db, {
      serverId: INSTANCE_AUDIT,
      actor,
      action: "invite.delete",
      targetName: codes.length === 1 ? codes[0] : `${codes.length} invites`,
      detail: codes.length > 1 ? codes.join(", ") : null,
    });
  }
  return deleted;
}

// ---- Voice rooms ----

export const VOICE_REGIONS = {
  auto: "Automatic",
  nl: "Home (Netherlands)",
  de: "Oracle (Germany)",
} as const;
export type VoiceRegion = keyof typeof VOICE_REGIONS;

export interface AdminVoiceRoom {
  id: string;
  name: string;
  serverId: string;
  server: string;
  region: VoiceRegion;
}

export async function adminVoiceRooms(db: D1Database): Promise<AdminVoiceRoom[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.server_id, c.rtc_region, s.name AS server
         FROM channels c LEFT JOIN servers s ON s.id = c.server_id
        WHERE c.kind = 'voice'
        ORDER BY s.name, c.position, c.name`,
    )
    .all<{ id: string; name: string; server_id: string; rtc_region: string | null; server: string | null }>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    serverId: row.server_id,
    server: row.server ?? "—",
    region: (Object.hasOwn(VOICE_REGIONS, row.rtc_region ?? "") ? row.rtc_region : "auto") as VoiceRegion,
  }));
}

/** Moves a voice room to another LiveKit server. People reconnect on next join. */
export async function setVoiceRegion(
  db: D1Database,
  channelId: string,
  region: VoiceRegion,
  actor: User,
): Promise<boolean> {
  const channel = await db
    .prepare("SELECT id, name, server_id FROM channels WHERE id = ? AND kind = 'voice'")
    .bind(channelId)
    .first<{ id: string; name: string; server_id: string }>();
  if (!channel) return false;
  await db.prepare("UPDATE channels SET rtc_region = ? WHERE id = ?").bind(region, channelId).run();
  await recordAudit(db, {
    serverId: channel.server_id,
    actor,
    action: "channel.voice_region",
    targetId: channel.id,
    targetName: channel.name,
    detail: VOICE_REGIONS[region],
  });
  await publishStructureChange(channel.server_id);
  return true;
}

// ---- Servers ----

export type DeleteServerResult = { ok: true; name: string } | { ok: false; error: string; status: number };

/**
 * Deletes any server except the home one. `confirmName` must match exactly,
 * so a stray click or a wrong id cannot remove a community.
 */
export async function adminDeleteServer(
  db: D1Database,
  serverId: string,
  confirmName: string,
  actor: User,
): Promise<DeleteServerResult> {
  if (serverId === DEFAULT_SERVER_ID || serverId === "dm") {
    return { ok: false, status: 400, error: "The home server cannot be deleted." };
  }
  const server = await db
    .prepare("SELECT id, name FROM servers WHERE id = ?")
    .bind(serverId)
    .first<{ id: string; name: string }>();
  if (!server) return { ok: false, status: 404, error: "No such server." };
  if (confirmName !== server.name) {
    return { ok: false, status: 400, error: "Type the server's exact name to confirm." };
  }
  await deleteServerData(db, serverId);
  // The server's own audit log goes with it, so this lands in the instance log.
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: "server.delete",
    targetId: server.id,
    targetName: server.name,
  });
  await publishStructureChange(serverId);
  return { ok: true, name: server.name };
}

// ---- Messages ----

export interface AdminMessageHit {
  id: string;
  content: string;
  author: string;
  userId: string | null;
  channelId: string | null;
  channel: string;
  server: string;
  createdAt: string;
  deleted: boolean;
}

export interface MessageSearch {
  query: string;
  mode: "words" | "regex";
  serverId?: string | null;
  author?: string | null;
  includeDeleted?: boolean;
  /** Private messages are only searched when asked for explicitly. */
  includeDms?: boolean;
}

export const SEARCH_LIMIT = 200;
/** Regex search reads at most this many recent messages. */
export const REGEX_SCAN_LIMIT = 50_000;
const REGEX_BATCH = 2_000;

interface MessageRow {
  id: string;
  content: string;
  author: string;
  user_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_kind: string | null;
  server_name: string | null;
  created_at: string;
  deleted_at: string | null;
}

const SELECT_MESSAGES = `SELECT m.id, m.content, m.author, m.user_id, m.channel_id, m.created_at, m.deleted_at,
        c.name AS channel_name, c.kind AS channel_kind, s.name AS server_name
   FROM messages m
   LEFT JOIN channels c ON c.id = m.channel_id
   LEFT JOIN servers s ON s.id = c.server_id`;

function toHit(row: MessageRow): AdminMessageHit {
  return {
    id: row.id,
    content: row.content,
    author: row.author,
    userId: row.user_id,
    channelId: row.channel_id,
    channel: row.channel_kind === "dm" ? "DM" : row.channel_name ? `#${row.channel_name}` : "—",
    server: row.channel_kind === "dm" ? "Direct messages" : row.server_name ?? "—",
    createdAt: row.created_at,
    deleted: Boolean(row.deleted_at),
  };
}

/**
 * Word search: every word must appear (case-insensitive substring), so
 * "free nitro" finds "FREE Nitro here". Regex search runs a JavaScript
 * RegExp (case-insensitive) over the newest REGEX_SCAN_LIMIT messages.
 */
export async function searchMessages(
  db: D1Database,
  search: MessageSearch,
): Promise<{ hits: AdminMessageHit[]; scanned: number; truncated: boolean } | { error: string }> {
  const filters: string[] = [];
  const args: unknown[] = [];
  if (!search.includeDeleted) filters.push("m.deleted_at IS NULL");
  if (!search.includeDms) filters.push("(c.kind IS NULL OR c.kind != 'dm')");
  if (search.serverId) {
    filters.push("c.server_id = ?");
    args.push(search.serverId);
  }
  if (search.author?.trim()) {
    filters.push("LOWER(m.author) LIKE ?");
    args.push(`%${search.author.trim().toLowerCase()}%`);
  }

  if (search.mode === "words") {
    const words = search.query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
    if (!words.length) return { error: "Type something to search for." };
    for (const word of words) {
      filters.push("LOWER(m.content) LIKE ? ESCAPE '\\'");
      args.push(`%${word.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    const rows = await db
      .prepare(`${SELECT_MESSAGES} WHERE ${filters.join(" AND ")} ORDER BY m.created_at DESC LIMIT ?`)
      .bind(...args, SEARCH_LIMIT + 1)
      .all<MessageRow>();
    return {
      hits: rows.results.slice(0, SEARCH_LIMIT).map(toHit),
      scanned: rows.results.length,
      truncated: rows.results.length > SEARCH_LIMIT,
    };
  }

  if (!search.query || search.query.length > 300) return { error: "Regex must be 1–300 characters." };
  let pattern: RegExp;
  try {
    pattern = new RegExp(search.query, "i");
  } catch (error) {
    return { error: `That regex is not valid: ${error instanceof Error ? error.message : String(error)}` };
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const hits: AdminMessageHit[] = [];
  let scanned = 0;
  let before = "￿";
  while (scanned < REGEX_SCAN_LIMIT && hits.length <= SEARCH_LIMIT) {
    const rows = await db
      .prepare(
        `${SELECT_MESSAGES} ${where ? `${where} AND` : "WHERE"} m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`,
      )
      .bind(...args, before, REGEX_BATCH)
      .all<MessageRow>();
    if (!rows.results.length) break;
    for (const row of rows.results) {
      scanned += 1;
      if (pattern.test(row.content) || pattern.test(row.author)) hits.push(toHit(row));
    }
    before = rows.results[rows.results.length - 1].created_at;
    if (rows.results.length < REGEX_BATCH) break;
  }
  return {
    hits: hits.slice(0, SEARCH_LIMIT),
    scanned,
    truncated: hits.length > SEARCH_LIMIT || scanned >= REGEX_SCAN_LIMIT,
  };
}

/**
 * Hides a message for everyone, as its author deleting it would. Its files
 * stay in storage so they can still be reviewed in /admin/media.
 */
export async function adminDeleteMessage(db: D1Database, id: string, actor: User): Promise<boolean> {
  const message = await db
    .prepare(
      `SELECT m.id, m.channel_id, m.author, m.content, c.server_id, c.kind
         FROM messages m LEFT JOIN channels c ON c.id = m.channel_id
        WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
    .bind(id)
    .first<{ id: string; channel_id: string | null; author: string; content: string; server_id: string | null; kind: string | null }>();
  if (!message) return false;
  await db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  await recordAudit(db, {
    serverId: message.kind !== "dm" && message.server_id ? message.server_id : INSTANCE_AUDIT,
    actor,
    action: "message.delete",
    targetId: message.id,
    targetName: message.author,
    detail: message.content.slice(0, 200),
  });
  if (message.channel_id) {
    await publishMessageEvent(
      message.channel_id,
      { t: "message-deleted", id },
      await channelAudience(db, message.channel_id),
    );
    void dispatchMessageDelete(id, message.channel_id);
  }
  return true;
}

// ---- Creating invites ----

/**
 * An invite made from /admin. With a server id it joins that server; without
 * one it is a sign-up invite to the instance. `maxUses` 0 means unlimited.
 */
export async function adminCreateInvite(
  db: D1Database,
  options: { serverId: string | null; maxUses: number; note: string | null },
  actor: User,
): Promise<{ code: string } | { error: string }> {
  if (options.serverId) {
    const server = await db.prepare("SELECT id FROM servers WHERE id = ?").bind(options.serverId).first();
    if (!server) return { error: "No such server." };
  }
  const code = generateInviteCode();
  await db
    .prepare(
      "INSERT INTO invites (code, created_by, created_at, max_uses, uses, revoked, note, server_id) VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
    )
    .bind(code, actor.id, new Date().toISOString(), Math.max(0, Math.min(1000, Math.floor(options.maxUses))), options.note, options.serverId)
    .run();
  await recordAudit(db, {
    serverId: options.serverId || INSTANCE_AUDIT,
    actor,
    action: "invite.create",
    targetName: code,
    detail: options.note,
  });
  return { code };
}

// ---- Accounts ----

async function accountFor(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, username, display_name, is_admin FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string; username: string; display_name: string; is_admin: number }>();
}

/** Blocks or restores sign-in. Suspending also ends every session at once. */
export async function setSuspended(
  db: D1Database,
  userId: string,
  suspended: boolean,
  actor: User,
): Promise<{ ok: true } | { error: string; status: number }> {
  const target = await accountFor(db, userId);
  if (!target) return { error: "No such account.", status: 404 };
  if (target.id === actor.id) return { error: "You can't suspend yourself.", status: 400 };
  if (suspended && target.is_admin) return { error: "Site admins can't be suspended.", status: 400 };
  await db.batch([
    db.prepare("UPDATE users SET suspended_at = ? WHERE id = ?").bind(suspended ? new Date().toISOString() : null, userId),
    ...(suspended ? [db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId)] : []),
  ]);
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: suspended ? "member.suspend" : "member.unsuspend",
    targetId: target.id,
    targetName: target.display_name,
  });
  await publishMemberUpdate(userId);
  return { ok: true };
}

/** Hides every message one account has sent (spam clean-up). */
export async function purgeUserMessages(db: D1Database, userId: string, actor: User): Promise<number> {
  const target = await accountFor(db, userId);
  if (!target) return 0;
  const rows = await db
    .prepare("SELECT id, channel_id FROM messages WHERE user_id = ? AND deleted_at IS NULL")
    .bind(userId)
    .all<{ id: string; channel_id: string | null }>();
  if (!rows.results.length) return 0;
  await db
    .prepare("UPDATE messages SET deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL")
    .bind(new Date().toISOString(), userId)
    .run();
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: "member.purge_messages",
    targetId: target.id,
    targetName: target.display_name,
    detail: `${rows.results.length} messages`,
  });
  // Open tabs drop them right away; reloads would hide them anyway.
  const byChannel = new Map<string, string[]>();
  for (const row of rows.results) {
    if (!row.channel_id) continue;
    byChannel.set(row.channel_id, [...(byChannel.get(row.channel_id) ?? []), row.id]);
  }
  for (const [channelId, ids] of byChannel) {
    const audience = await channelAudience(db, channelId);
    for (const id of ids.slice(-200)) {
      await publishMessageEvent(channelId, { t: "message-deleted", id }, audience);
    }
  }
  return rows.results.length;
}

/**
 * Rows that only matter to the account itself, removed with it. Things others
 * use (servers, emojis, stickers, sounds, polls, events, themes, campaign and
 * recording history) stay, credited to a name that no longer signs in.
 */
const PERSONAL_ROWS: Array<[table: string, column: string]> = [
  ["sessions", "user_id"],
  ["channel_reads", "user_id"],
  ["dm_members", "user_id"],
  ["voice_prefs", "user_id"],
  ["voice_prefs", "target_id"],
  ["server_mutes", "target_id"],
  ["member_roles", "user_id"],
  ["bans", "user_id"],
  ["reactions", "user_id"],
  ["mentions", "user_id"],
  ["poll_votes", "user_id"],
  ["channel_prefs", "user_id"],
  ["server_members", "user_id"],
  ["push_subscriptions", "user_id"],
  ["friendships", "user_id"],
  ["friendships", "friend_id"],
  ["server_member_positions", "user_id"],
  ["event_rsvps", "user_id"],
  ["user_notes", "owner_id"],
  ["user_notes", "target_id"],
  ["server_folders", "user_id"],
  ["ai_usage", "user_id"],
  ["msn_contacts", "user_id"],
  ["user_emoticons", "user_id"],
  ["password_resets", "user_id"],
  ["email_verifications", "user_id"],
  ["saved_messages", "user_id"],
  ["reminders", "user_id"],
  ["scheduled_messages", "user_id"],
  ["qa_votes", "user_id"],
  ["server_welcome_answers", "user_id"],
];

/**
 * Deletes an account for good. `confirmUsername` must match, and with
 * `deleteMessages` everything they wrote is hidden first.
 */
export async function adminDeleteUser(
  db: D1Database,
  userId: string,
  options: { confirmUsername: string; deleteMessages: boolean },
  actor: User,
): Promise<{ ok: true; messages: number } | { error: string; status: number }> {
  const target = await accountFor(db, userId);
  if (!target) return { error: "No such account.", status: 404 };
  if (target.id === actor.id) return { error: "You can't delete your own account here.", status: 400 };
  if (target.is_admin) return { error: "Site admins can't be deleted from the panel.", status: 400 };
  if (options.confirmUsername !== target.username) {
    return { error: "Type their exact username to confirm.", status: 400 };
  }
  const messages = options.deleteMessages ? await purgeUserMessages(db, userId, actor) : 0;
  // Some feature tables are created on first use, so skip the ones not made yet.
  const existing = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all<{ name: string }>();
  const tables = new Set(existing.results.map((row) => row.name));
  await db.batch([
    ...PERSONAL_ROWS.filter(([table]) => tables.has(table)).map(([table, column]) =>
      db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(userId),
    ),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: "member.delete",
    targetId: target.id,
    targetName: `${target.display_name} (@${target.username})`,
    detail: options.deleteMessages ? `with ${messages} messages` : "messages kept",
  });
  await publishStructureChange();
  return { ok: true, messages };
}

// ---- Looking into a server without joining it ----

export interface PeekChannel {
  id: string;
  name: string;
  kind: string;
  messages: number;
}

/** A server's channels, read without becoming a member (nothing is recorded). */
export async function peekChannels(db: D1Database, serverId: string): Promise<PeekChannel[]> {
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.kind,
              (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id AND m.deleted_at IS NULL) AS messages
         FROM channels c WHERE c.server_id = ? ORDER BY c.position, c.name`,
    )
    .bind(serverId)
    .all<{ id: string; name: string; kind: string; messages: number }>();
  return rows.results.map((row) => ({ ...row, messages: Number(row.messages) }));
}

/**
 * The newest messages in a channel, oldest first, before `before` when paging.
 * Reads only: no read marker, no presence, no typing, so nobody can tell.
 */
export async function peekMessages(
  db: D1Database,
  channelId: string,
  before: string | null,
  limit = 100,
): Promise<AdminMessageHit[]> {
  const rows = await db
    .prepare(
      `${SELECT_MESSAGES} WHERE m.channel_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`,
    )
    .bind(channelId, before || "￿", limit)
    .all<MessageRow>();
  return rows.results.map(toHit).reverse();
}
