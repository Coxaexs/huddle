/**
 * Giveaways plugin: timed giveaways with interactive "Enter Giveaway" buttons,
 * optional required role, multiple winners, automatic ending on schedule,
 * manual end, and winner rerolling.
 */

import {
  getCommunityBotConfig,
  getMemberRoleIds,
  postCommunityBotMessage,
  updateCommunityBotMessage,
} from "./store";
import type { Giveaway } from "./types";

interface GiveawayRow {
  id: string;
  server_id: string;
  channel_id: string;
  message_id: string | null;
  prize: string;
  description: string;
  winner_count: number;
  required_role_id: string | null;
  host_id: string;
  ends_at: number;
  ended: number;
  winner_ids_json: string;
  created_at: string;
  entry_count?: number;
}

function rowToGiveaway(r: GiveawayRow): Giveaway {
  let winnerIds: string[] = [];
  try {
    const parsed = JSON.parse(r.winner_ids_json || "[]");
    if (Array.isArray(parsed)) winnerIds = parsed.map(String);
  } catch {
    winnerIds = [];
  }
  return {
    id: r.id,
    serverId: r.server_id,
    channelId: r.channel_id,
    messageId: r.message_id,
    prize: r.prize,
    description: r.description,
    winnerCount: r.winner_count,
    requiredRoleId: r.required_role_id,
    hostId: r.host_id,
    endsAt: r.ends_at,
    ended: Boolean(r.ended),
    winnerIds,
    entryCount: Number(r.entry_count ?? 0),
    createdAt: r.created_at,
  };
}

export async function listGiveaways(
  db: D1Database,
  serverId: string,
): Promise<Giveaway[]> {
  const { results } = await db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM community_giveaway_entries e WHERE e.giveaway_id = g.id) AS entry_count
         FROM community_giveaways g
        WHERE g.server_id = ?
        ORDER BY g.created_at DESC LIMIT 50`,
    )
    .bind(serverId)
    .all<GiveawayRow>();
  return (results || []).map(rowToGiveaway);
}

function buildGiveawayPayload(
  gw: Giveaway,
  winnerLabels: string[] = [],
): { embeds: Array<Record<string, unknown>>; components: Array<Record<string, unknown>> } {
  const endsStr = new Date(gw.endsAt).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Winners", value: String(gw.winnerCount), inline: true },
    { name: "Entries", value: String(gw.entryCount), inline: true },
    { name: gw.ended ? "Status" : "Ends", value: gw.ended ? "Ended" : endsStr, inline: true },
  ];
  if (gw.ended) {
    fields.push({
      name: "🏆 Winners",
      value: winnerLabels.length ? winnerLabels.join(", ") : "No valid entries",
      inline: false,
    });
  }

  return {
    embeds: [
      {
        title: `🎉 GIVEAWAY: ${gw.prize}`,
        description: gw.description || "Click the button below to enter!",
        color: gw.ended ? "#64748b" : "#ec4899",
        fields,
        footer: { text: gw.ended ? "Giveaway ended" : "Click 🎉 Enter Giveaway to join" },
      },
    ],
    components: gw.ended
      ? []
      : [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: `Enter Giveaway (${gw.entryCount})`,
                emoji: { name: "🎉" },
                custom_id: `cb:gw:${gw.id}`,
              },
            ],
          },
        ],
  };
}

export async function createGiveaway(
  db: D1Database,
  serverId: string,
  input: {
    channelId: string;
    prize: string;
    description?: string;
    winnerCount?: number;
    durationMin?: number;
    requiredRoleId?: string | null;
    hostId: string;
  },
): Promise<Giveaway | { error: string }> {
  const prize = input.prize.trim().slice(0, 150);
  if (!prize) return { error: "Enter a giveaway prize." };
  const description = (input.description || "").trim().slice(0, 1000);
  const winnerCount = Math.max(1, Math.min(20, Math.round(Number(input.winnerCount) || 1)));
  const durationMin = Math.max(1, Math.min(43200, Math.round(Number(input.durationMin) || 60)));
  const now = Date.now();
  const endsAt = now + durationMin * 60_000;
  const createdAt = new Date(now).toISOString();
  const id = crypto.randomUUID();
  const requiredRoleId = input.requiredRoleId?.trim() || null;

  const gw: Giveaway = {
    id,
    serverId,
    channelId: input.channelId,
    messageId: null,
    prize,
    description,
    winnerCount,
    requiredRoleId,
    hostId: input.hostId,
    endsAt,
    ended: false,
    winnerIds: [],
    entryCount: 0,
    createdAt,
  };

  const payload = buildGiveawayPayload(gw);
  const posted = await postCommunityBotMessage(db, serverId, input.channelId, {
    content: "",
    embeds: payload.embeds,
    components: payload.components,
  });
  if (!posted) return { error: "Target channel was not found." };
  gw.messageId = posted.id;

  await db
    .prepare(
      `INSERT INTO community_giveaways
         (id, server_id, channel_id, message_id, prize, description, winner_count,
          required_role_id, host_id, ends_at, ended, winner_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?)`,
    )
    .bind(
      gw.id,
      serverId,
      gw.channelId,
      gw.messageId,
      gw.prize,
      gw.description,
      gw.winnerCount,
      gw.requiredRoleId,
      gw.hostId,
      gw.endsAt,
      createdAt,
    )
    .run();

  return gw;
}

/** Handles clicks on `cb:gw:<giveawayId>` buttons. */
export async function handleGiveawayEnterButton(
  db: D1Database,
  serverId: string,
  userId: string,
  customId: string,
): Promise<{ ok: boolean; notice: string }> {
  const giveawayId = customId.split(":")[2] || "";
  const row = await db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM community_giveaway_entries e WHERE e.giveaway_id = g.id) AS entry_count
         FROM community_giveaways g WHERE g.id = ? AND g.server_id = ?`,
    )
    .bind(giveawayId, serverId)
    .first<GiveawayRow>();
  if (!row) return { ok: false, notice: "This giveaway no longer exists." };

  const gw = rowToGiveaway(row);
  if (gw.ended || Date.now() >= gw.endsAt) {
    return { ok: false, notice: "This giveaway has already ended." };
  }

  if (gw.requiredRoleId) {
    const roles = await getMemberRoleIds(db, serverId, userId);
    if (!roles.includes(gw.requiredRoleId)) {
      return { ok: false, notice: "You do not have the required role to enter this giveaway." };
    }
  }

  const already = await db
    .prepare("SELECT 1 FROM community_giveaway_entries WHERE giveaway_id = ? AND user_id = ?")
    .bind(gw.id, userId)
    .first();

  let notice: string;
  if (already) {
    await db
      .prepare("DELETE FROM community_giveaway_entries WHERE giveaway_id = ? AND user_id = ?")
      .bind(gw.id, userId)
      .run();
    gw.entryCount = Math.max(0, gw.entryCount - 1);
    notice = "You left the giveaway.";
  } else {
    await db
      .prepare(
        "INSERT OR IGNORE INTO community_giveaway_entries (giveaway_id, user_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(gw.id, userId, new Date().toISOString())
      .run();
    gw.entryCount += 1;
    notice = `🎉 You're entered to win **${gw.prize}**!`;
  }

  if (gw.messageId) {
    const payload = buildGiveawayPayload(gw);
    await updateCommunityBotMessage(db, serverId, gw.channelId, gw.messageId, {
      content: "",
      embeds: payload.embeds,
      components: payload.components,
    });
  }

  return { ok: true, notice };
}

/** Ends a giveaway (or rerolls winners on an already-ended giveaway). */
export async function finishOrRerollGiveaway(
  db: D1Database,
  serverId: string,
  giveawayId: string,
  reroll = false,
): Promise<{ winnerIds: string[] } | { error: string }> {
  const row = await db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM community_giveaway_entries e WHERE e.giveaway_id = g.id) AS entry_count
         FROM community_giveaways g WHERE g.id = ? AND g.server_id = ?`,
    )
    .bind(giveawayId, serverId)
    .first<GiveawayRow>();
  if (!row) return { error: "Giveaway not found." };

  const gw = rowToGiveaway(row);
  if (gw.ended && !reroll) return { winnerIds: gw.winnerIds };

  const { results } = await db
    .prepare("SELECT user_id FROM community_giveaway_entries WHERE giveaway_id = ?")
    .bind(gw.id)
    .all<{ user_id: string }>();
  const pool = (results || []).map((r) => r.user_id);

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const winnerIds = pool.slice(0, gw.winnerCount);

  await db
    .prepare("UPDATE community_giveaways SET ended = 1, winner_ids_json = ? WHERE id = ?")
    .bind(JSON.stringify(winnerIds), gw.id)
    .run();

  const winnerLabels: string[] = [];
  for (const uid of winnerIds) {
    const u = await db
      .prepare("SELECT username, display_name FROM users WHERE id = ?")
      .bind(uid)
      .first<{ username: string; display_name: string }>();
    winnerLabels.push(u ? `${u.display_name} (@${u.username})` : uid);
  }

  gw.ended = true;
  gw.winnerIds = winnerIds;

  if (gw.messageId) {
    const payload = buildGiveawayPayload(gw, winnerLabels);
    await updateCommunityBotMessage(db, serverId, gw.channelId, gw.messageId, {
      content: "",
      embeds: payload.embeds,
      components: payload.components,
    });
  }

  const config = await getCommunityBotConfig(db, serverId);
  await postCommunityBotMessage(
    db,
    serverId,
    gw.channelId,
    {
      content: winnerLabels.length
        ? `${reroll ? "🔄 **Reroll!** " : "🎉 "}Congratulations ${winnerLabels.join(", ")}! You won **${gw.prize}**!`
        : `Giveaway for **${gw.prize}** ended with no entries.`,
    },
    config,
  );

  return { winnerIds };
}

/** Called from HuddleHub's periodic alarm to end all due giveaways. */
export async function endDueGiveaways(
  db: D1Database,
  now = Date.now(),
): Promise<number> {
  const { results } = await db
    .prepare("SELECT id, server_id FROM community_giveaways WHERE ended = 0 AND ends_at <= ? LIMIT 25")
    .bind(now)
    .all<{ id: string; server_id: string }>();
  let ended = 0;
  for (const r of results || []) {
    const res = await finishOrRerollGiveaway(db, r.server_id, r.id, false);
    if (!("error" in res)) ended++;
  }
  return ended;
}
