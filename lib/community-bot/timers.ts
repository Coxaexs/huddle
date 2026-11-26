/**
 * Recurring Timers plugin: interval-based automated announcements delivered
 * by Hoffle's Durable Object alarm (or triggered immediately from the dashboard).
 */

import { getCommunityBotConfig, postCommunityBotMessage } from "./store";
import { type RecurringTimer, sanitizeHexColor } from "./types";

interface TimerRow {
  id: string;
  server_id: string;
  channel_id: string;
  name: string;
  message: string;
  use_embed: number;
  embed_color: string;
  interval_min: number;
  enabled: number;
  next_run_at: number;
  last_run_at: number | null;
  created_at: string;
}

function rowToTimer(r: TimerRow): RecurringTimer {
  return {
    id: r.id,
    serverId: r.server_id,
    channelId: r.channel_id,
    name: r.name,
    message: r.message,
    useEmbed: Boolean(r.use_embed),
    embedColor: sanitizeHexColor(r.embed_color),
    intervalMin: r.interval_min,
    enabled: Boolean(r.enabled),
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
  };
}

export async function listTimers(
  db: D1Database,
  serverId: string,
): Promise<RecurringTimer[]> {
  const { results } = await db
    .prepare("SELECT * FROM community_timers WHERE server_id = ? ORDER BY created_at DESC")
    .bind(serverId)
    .all<TimerRow>();
  return (results || []).map(rowToTimer);
}

export async function saveTimer(
  db: D1Database,
  serverId: string,
  input: {
    id?: string;
    channelId: string;
    name: string;
    message: string;
    useEmbed?: boolean;
    embedColor?: string;
    intervalMin?: number;
    enabled?: boolean;
  },
): Promise<RecurringTimer | { error: string }> {
  const message = input.message.trim().slice(0, 2000);
  if (!message) return { error: "Timer message cannot be empty." };
  const name = input.name.trim().slice(0, 80) || "Scheduled Announcement";
  const intervalMin = Math.max(5, Math.min(43200, Math.round(Number(input.intervalMin) || 60)));
  const useEmbed = Boolean(input.useEmbed);
  const embedColor = sanitizeHexColor(input.embedColor);
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const nowMs = Date.now();
  const nextRunAt = nowMs + intervalMin * 60_000;
  const nowIso = new Date(nowMs).toISOString();
  const id = input.id?.trim() || crypto.randomUUID();

  const existing = await db
    .prepare("SELECT * FROM community_timers WHERE id = ? AND server_id = ?")
    .bind(id, serverId)
    .first<TimerRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE community_timers
            SET channel_id = ?, name = ?, message = ?, use_embed = ?, embed_color = ?,
                interval_min = ?, enabled = ?, next_run_at = ?
          WHERE id = ? AND server_id = ?`,
      )
      .bind(
        input.channelId,
        name,
        message,
        useEmbed ? 1 : 0,
        embedColor,
        intervalMin,
        enabled ? 1 : 0,
        nextRunAt,
        id,
        serverId,
      )
      .run();
    return {
      id,
      serverId,
      channelId: input.channelId,
      name,
      message,
      useEmbed,
      embedColor,
      intervalMin,
      enabled,
      nextRunAt,
      lastRunAt: existing.last_run_at,
      createdAt: existing.created_at,
    };
  }

  await db
    .prepare(
      `INSERT INTO community_timers
         (id, server_id, channel_id, name, message, use_embed, embed_color, interval_min, enabled, next_run_at, last_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      id,
      serverId,
      input.channelId,
      name,
      message,
      useEmbed ? 1 : 0,
      embedColor,
      intervalMin,
      enabled ? 1 : 0,
      nextRunAt,
      nowIso,
    )
    .run();

  return {
    id,
    serverId,
    channelId: input.channelId,
    name,
    message,
    useEmbed,
    embedColor,
    intervalMin,
    enabled,
    nextRunAt,
    lastRunAt: null,
    createdAt: nowIso,
  };
}

export async function deleteTimer(
  db: D1Database,
  serverId: string,
  timerId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_timers WHERE id = ? AND server_id = ?")
    .bind(timerId, serverId)
    .run();
}

/** Sends a single timer immediately and advances its `next_run_at`. */
export async function runTimerNow(
  db: D1Database,
  serverId: string,
  timerId: string,
  now = Date.now(),
): Promise<boolean> {
  const row = await db
    .prepare("SELECT * FROM community_timers WHERE id = ? AND server_id = ?")
    .bind(timerId, serverId)
    .first<TimerRow>();
  if (!row) return false;

  const timer = rowToTimer(row);
  const config = await getCommunityBotConfig(db, serverId);
  if (timer.useEmbed) {
    await postCommunityBotMessage(
      db,
      serverId,
      timer.channelId,
      {
        content: "",
        embeds: [{ title: timer.name, description: timer.message, color: timer.embedColor }],
      },
      config,
    );
  } else {
    await postCommunityBotMessage(
      db,
      serverId,
      timer.channelId,
      { content: timer.message },
      config,
    );
  }

  await db
    .prepare("UPDATE community_timers SET last_run_at = ?, next_run_at = ? WHERE id = ?")
    .bind(now, now + timer.intervalMin * 60_000, timer.id)
    .run();
  return true;
}

/** Called from HuddleHub's periodic alarm to deliver all due recurring timers. */
export async function deliverDueTimers(
  db: D1Database,
  now = Date.now(),
): Promise<number> {
  const { results } = await db
    .prepare("SELECT * FROM community_timers WHERE enabled = 1 AND next_run_at <= ? LIMIT 25")
    .bind(now)
    .all<TimerRow>();
  let sent = 0;
  for (const row of results || []) {
    const config = await getCommunityBotConfig(db, row.server_id);
    if (!config.enabled || !config.plugins.timers.enabled) {
      await db
        .prepare("UPDATE community_timers SET next_run_at = ? WHERE id = ?")
        .bind(now + row.interval_min * 60_000, row.id)
        .run();
      continue;
    }
    const ok = await runTimerNow(db, row.server_id, row.id, now);
    if (ok) sent++;
  }
  return sent;
}
