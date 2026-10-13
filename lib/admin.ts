/**
 * Instance-wide oversight for /admin: counts, people, servers and the audit
 * trail across every server. Read-heavy and unpaginated, which is fine for a
 * few hundred members; everything here is behind isInstanceAdmin.
 */

import { recordAudit } from "./audit";
import type { User } from "./auth";
import { SIDE_FEATURES, disabledFeatures, runtimeDisabledFeatures, type SideFeature } from "./features";
import { hubState } from "./hub-client";

/** Audit rows for instance-wide actions use this in place of a server id. */
export const INSTANCE_AUDIT = "instance";

export interface AdminOverview {
  users: number;
  signups24h: number;
  signups7d: number;
  active24h: number;
  messages: number;
  messages24h: number;
  messages7d: number;
  servers: number;
  channels: number;
  storageBytes: number;
  storageFiles: number;
  /** Last 14 days, oldest first, including empty days. */
  messagesPerDay: Array<{ day: string; count: number }>;
  online: Array<{ id: string; name: string }>;
  voice: Array<{ channelId: string; channel: string; server: string; people: string[] }>;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  createdAt: string;
  lastSeenAt: string;
  isAdmin: boolean;
  messages: number;
  servers: number;
  sessions: number;
  online: boolean;
  suspended: boolean;
}

export interface AdminServer {
  id: string;
  name: string;
  owner: string | null;
  createdAt: string;
  members: number;
  channels: number;
  messages: number;
  messages7d: number;
}

export interface AdminAuditEntry {
  id: string;
  serverId: string;
  serverName: string;
  actorName: string;
  action: string;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}

export interface AdminFeature {
  id: SideFeature;
  label: string;
  /** Off in wrangler config: only a config change turns it back on. */
  offInConfig: boolean;
  /** Off from this panel. */
  offHere: boolean;
}

function since(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;

async function count(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...args).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function storageTotals(bucket: R2Bucket | undefined) {
  let bytes = 0;
  let files = 0;
  if (!bucket) return { bytes, files };
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, cursor });
    for (const object of page.objects) {
      bytes += object.size;
      files += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { bytes, files };
}

export async function adminOverview(db: D1Database, bucket?: R2Bucket): Promise<AdminOverview> {
  const day = since(DAY);
  const week = since(7 * DAY);
  const fortnight = new Date(Date.now() - 13 * DAY).toISOString().slice(0, 10);

  const [
    users,
    signups24h,
    signups7d,
    active24h,
    messages,
    messages24h,
    messages7d,
    servers,
    channels,
    perDay,
    storage,
    hub,
    names,
  ] = await Promise.all([
    count(db, "SELECT COUNT(*) AS n FROM users"),
    count(db, "SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", day),
    count(db, "SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", week),
    count(db, "SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?", day),
    count(db, "SELECT COUNT(*) AS n FROM messages WHERE deleted_at IS NULL"),
    count(db, "SELECT COUNT(*) AS n FROM messages WHERE deleted_at IS NULL AND created_at >= ?", day),
    count(db, "SELECT COUNT(*) AS n FROM messages WHERE deleted_at IS NULL AND created_at >= ?", week),
    count(db, "SELECT COUNT(*) AS n FROM servers"),
    count(db, "SELECT COUNT(*) AS n FROM channels WHERE kind != 'dm'"),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM messages
          WHERE deleted_at IS NULL AND created_at >= ? GROUP BY day`,
      )
      .bind(fortnight)
      .all<{ day: string; n: number }>(),
    storageTotals(bucket),
    hubState(),
    db.prepare("SELECT id, display_name FROM users").all<{ id: string; display_name: string }>(),
  ]);

  const byDay = new Map(perDay.results.map((row) => [row.day, Number(row.n)]));
  const messagesPerDay = Array.from({ length: 14 }, (_, index) => {
    const dayKey = new Date(Date.now() - (13 - index) * DAY).toISOString().slice(0, 10);
    return { day: dayKey, count: byDay.get(dayKey) ?? 0 };
  });

  const nameOf = new Map(names.results.map((row) => [row.id, row.display_name]));
  const online = (hub?.online ?? [])
    .filter((id) => !id.startsWith("bot:"))
    .map((id) => ({ id, name: nameOf.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const voiceIds = Object.keys(hub?.voice ?? {}).filter((id) => (hub?.voice[id]?.length ?? 0) > 0);
  const rooms = voiceIds.length
    ? await db
        .prepare(
          `SELECT c.id, c.name, s.name AS server FROM channels c
             LEFT JOIN servers s ON s.id = c.server_id
            WHERE c.id IN (${voiceIds.map(() => "?").join(",")})`,
        )
        .bind(...voiceIds)
        .all<{ id: string; name: string; server: string | null }>()
    : { results: [] };
  const roomOf = new Map(rooms.results.map((row) => [row.id, row]));
  const voice = voiceIds.map((channelId) => {
    const participants = hub?.voice[channelId] ?? [];
    return {
      channelId,
      channel: roomOf.get(channelId)?.name ?? channelId,
      server: roomOf.get(channelId)?.server ?? "",
      people: [
        ...new Set(
          participants.map(
            (p) => (p as { displayName?: string }).displayName ?? nameOf.get((p as { userId?: string }).userId ?? "") ?? "someone",
          ),
        ),
      ],
    };
  });

  return {
    users,
    signups24h,
    signups7d,
    active24h,
    messages,
    messages24h,
    messages7d,
    servers,
    channels,
    storageBytes: storage.bytes,
    storageFiles: storage.files,
    messagesPerDay,
    online,
    voice,
  };
}

export async function adminUsers(db: D1Database, onlineIds: Set<string>): Promise<AdminUser[]> {
  const [users, messages, servers, sessions] = await Promise.all([
    db
      .prepare(
        `SELECT id, username, display_name, avatar, avatar_url, color, created_at, last_seen_at, is_admin, suspended_at
           FROM users ORDER BY created_at DESC`,
      )
      .all<{
        id: string;
        username: string;
        display_name: string;
        avatar: string;
        avatar_url: string | null;
        color: string;
        created_at: string;
        last_seen_at: string;
        is_admin: number;
        suspended_at: string | null;
      }>(),
    db
      .prepare("SELECT user_id, COUNT(*) AS n FROM messages WHERE deleted_at IS NULL AND user_id IS NOT NULL GROUP BY user_id")
      .all<{ user_id: string; n: number }>(),
    db.prepare("SELECT user_id, COUNT(*) AS n FROM server_members GROUP BY user_id").all<{ user_id: string; n: number }>(),
    db
      .prepare("SELECT user_id, COUNT(*) AS n FROM sessions WHERE expires_at > ? GROUP BY user_id")
      .bind(new Date().toISOString())
      .all<{ user_id: string; n: number }>(),
  ]);
  const tally = (rows: Array<{ user_id: string; n: number }>) =>
    new Map(rows.map((row) => [row.user_id, Number(row.n)]));
  const messageCount = tally(messages.results);
  const serverCount = tally(servers.results);
  const sessionCount = tally(sessions.results);
  return users.results.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    avatarUrl: row.avatar_url,
    color: row.color,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    isAdmin: Boolean(row.is_admin),
    messages: messageCount.get(row.id) ?? 0,
    servers: serverCount.get(row.id) ?? 0,
    sessions: sessionCount.get(row.id) ?? 0,
    online: onlineIds.has(row.id),
    suspended: Boolean(row.suspended_at),
  }));
}

export async function adminServers(db: D1Database): Promise<AdminServer[]> {
  const week = since(7 * DAY);
  const rows = await db
    .prepare(
      `SELECT s.id, s.name, s.created_at, u.display_name AS owner,
              (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) AS members,
              (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) AS channels,
              (SELECT COUNT(*) FROM messages msg JOIN channels c ON c.id = msg.channel_id
                WHERE c.server_id = s.id AND msg.deleted_at IS NULL) AS messages,
              (SELECT COUNT(*) FROM messages msg JOIN channels c ON c.id = msg.channel_id
                WHERE c.server_id = s.id AND msg.deleted_at IS NULL AND msg.created_at >= ?) AS messages7d
         FROM servers s LEFT JOIN users u ON u.id = s.created_by
        WHERE s.id NOT IN (SELECT DISTINCT server_id FROM channels WHERE kind = 'dm')
        ORDER BY messages7d DESC, members DESC`,
    )
    .bind(week)
    .all<{
      id: string;
      name: string;
      created_at: string;
      owner: string | null;
      members: number;
      channels: number;
      messages: number;
      messages7d: number;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    owner: row.owner,
    createdAt: row.created_at,
    members: Number(row.members),
    channels: Number(row.channels),
    messages: Number(row.messages),
    messages7d: Number(row.messages7d),
  }));
}

export async function adminAudit(db: D1Database, limit = 200): Promise<AdminAuditEntry[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.server_id, s.name AS server_name, a.actor_name, a.action, a.target_name, a.detail, a.created_at
         FROM audit_log a LEFT JOIN servers s ON s.id = a.server_id
        ORDER BY a.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      server_id: string;
      server_name: string | null;
      actor_name: string;
      action: string;
      target_name: string | null;
      detail: string | null;
      created_at: string;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    serverId: row.server_id,
    serverName: row.server_id === INSTANCE_AUDIT ? "Whole instance" : row.server_name ?? "Deleted server",
    actorName: row.actor_name,
    action: row.action,
    targetName: row.target_name,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export async function adminFeatures(
  db: D1Database,
  env: { FEATURES_DISABLED?: string },
): Promise<AdminFeature[]> {
  const inConfig = new Set(disabledFeatures(env));
  const here = new Set(await runtimeDisabledFeatures(db));
  return (Object.keys(SIDE_FEATURES) as SideFeature[]).map((id) => ({
    id,
    label: SIDE_FEATURES[id],
    offInConfig: inConfig.has(id),
    offHere: here.has(id),
  }));
}

/** Ends every session a person has, so each device has to sign in again. */
export async function signOutEverywhere(db: D1Database, target: { id: string; display_name: string }, actor: User) {
  const result = await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id).run();
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: "member.signout_all",
    targetId: target.id,
    targetName: target.display_name,
  });
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
}
