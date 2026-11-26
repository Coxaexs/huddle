/**
 * Visual Embed Builder plugin: save, publish, and update rich Discord-style
 * embeds in any text channel from the web dashboard.
 */

import { postCommunityBotMessage, updateCommunityBotMessage } from "./store";
import { type SavedEmbed, type SavedEmbedData, sanitizeHexColor } from "./types";

interface EmbedRow {
  id: string;
  server_id: string;
  channel_id: string;
  message_id: string | null;
  name: string;
  content: string;
  embed_json: string;
  created_at: string;
  updated_at: string;
}

function sanitizeEmbedData(raw: unknown): SavedEmbedData {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (Array.isArray(o.fields)) {
    for (const f of o.fields) {
      if (fields.length >= 25) break;
      if (!f || typeof f !== "object") continue;
      const fo = f as Record<string, unknown>;
      const name = String(fo.name ?? "").trim().slice(0, 256);
      const value = String(fo.value ?? "").trim().slice(0, 1024);
      if (!name || !value) continue;
      fields.push({ name, value, inline: Boolean(fo.inline) });
    }
  }
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  return {
    title: str(o.title, 256),
    description: str(o.description, 4000),
    url: str(o.url, 500),
    color: sanitizeHexColor(o.color, "#6366f1"),
    authorName: str(o.authorName, 128),
    authorIconUrl: str(o.authorIconUrl, 500),
    footerText: str(o.footerText, 500),
    thumbnailUrl: str(o.thumbnailUrl, 500),
    imageUrl: str(o.imageUrl, 500),
    includeTimestamp: Boolean(o.includeTimestamp),
    fields,
  };
}

function rowToSavedEmbed(row: EmbedRow): SavedEmbed {
  let embed: SavedEmbedData = {};
  try {
    embed = sanitizeEmbedData(JSON.parse(row.embed_json || "{}"));
  } catch {
    embed = {};
  }
  return {
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    name: row.name,
    content: row.content,
    embed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildDiscordEmbed(data: SavedEmbedData): Record<string, unknown> {
  const out: Record<string, unknown> = {
    color: data.color || "#6366f1",
  };
  if (data.title) out.title = data.title;
  if (data.description) out.description = data.description;
  if (data.url) out.url = data.url;
  if (data.authorName) {
    out.author = {
      name: data.authorName,
      icon_url: data.authorIconUrl,
    };
  }
  if (data.footerText) out.footer = { text: data.footerText };
  if (data.thumbnailUrl) out.thumbnail = { url: data.thumbnailUrl };
  if (data.imageUrl) out.image = { url: data.imageUrl };
  if (data.includeTimestamp) out.timestamp = new Date().toISOString();
  if (data.fields?.length) out.fields = data.fields;
  return out;
}

export async function listSavedEmbeds(
  db: D1Database,
  serverId: string,
): Promise<SavedEmbed[]> {
  const { results } = await db
    .prepare("SELECT * FROM community_embeds WHERE server_id = ? ORDER BY updated_at DESC")
    .bind(serverId)
    .all<EmbedRow>();
  return (results || []).map(rowToSavedEmbed);
}

export async function saveAndOptionallyPublishEmbed(
  db: D1Database,
  serverId: string,
  input: {
    id?: string;
    channelId: string;
    name: string;
    content?: string;
    embed: unknown;
    publish?: boolean;
  },
): Promise<{ saved: SavedEmbed } | { error: string }> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || crypto.randomUUID();
  const name = input.name.trim().slice(0, 80) || "Untitled Embed";
  const content = (input.content || "").trim().slice(0, 2000);
  const embed = sanitizeEmbedData(input.embed);

  const existing = await db
    .prepare("SELECT * FROM community_embeds WHERE id = ? AND server_id = ?")
    .bind(id, serverId)
    .first<EmbedRow>();

  let messageId = existing?.message_id ?? null;

  if (input.publish) {
    const discordEmbed = buildDiscordEmbed(embed);
    if (messageId && existing?.channel_id === input.channelId) {
      const updated = await updateCommunityBotMessage(db, serverId, input.channelId, messageId, {
        content,
        embeds: [discordEmbed],
      });
      if (!updated) {
        const posted = await postCommunityBotMessage(db, serverId, input.channelId, {
          content,
          embeds: [discordEmbed],
        });
        if (!posted) return { error: "Target channel not found." };
        messageId = posted.id;
      }
    } else {
      const posted = await postCommunityBotMessage(db, serverId, input.channelId, {
        content,
        embeds: [discordEmbed],
      });
      if (!posted) return { error: "Target channel not found." };
      messageId = posted.id;
    }
  }

  if (existing) {
    await db
      .prepare(
        `UPDATE community_embeds
            SET channel_id = ?, message_id = ?, name = ?, content = ?, embed_json = ?, updated_at = ?
          WHERE id = ? AND server_id = ?`,
      )
      .bind(input.channelId, messageId, name, content, JSON.stringify(embed), now, id, serverId)
      .run();
    return {
      saved: {
        id,
        serverId,
        channelId: input.channelId,
        messageId,
        name,
        content,
        embed,
        createdAt: existing.created_at,
        updatedAt: now,
      },
    };
  }

  await db
    .prepare(
      `INSERT INTO community_embeds
         (id, server_id, channel_id, message_id, name, content, embed_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, serverId, input.channelId, messageId, name, content, JSON.stringify(embed), now, now)
    .run();

  return {
    saved: {
      id,
      serverId,
      channelId: input.channelId,
      messageId,
      name,
      content,
      embed,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function deleteSavedEmbed(
  db: D1Database,
  serverId: string,
  embedId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_embeds WHERE id = ? AND server_id = ?")
    .bind(embedId, serverId)
    .run();
}
