/**
 * Custom Commands plugin: server-defined `!trigger` commands with text/embed
 * replies, template variables (`{user}`, `{username}`, `{server}`, `{args}`),
 * optional role grant/remove, and usage counters.
 */

import {
  assignRoleToMember,
  getCommunityBotConfig,
  postCommunityBotMessage,
  removeRoleFromMember,
} from "./store";
import { type CustomCommand, renderTemplate, sanitizeHexColor } from "./types";

interface CommandRow {
  id: string;
  server_id: string;
  trigger: string;
  response: string;
  use_embed: number;
  embed_title: string | null;
  embed_color: string;
  grant_role_id: string | null;
  remove_role_id: string | null;
  cooldown_sec: number;
  enabled: number;
  uses: number;
  created_at: string;
  updated_at: string;
}

function rowToCmd(r: CommandRow): CustomCommand {
  return {
    id: r.id,
    serverId: r.server_id,
    trigger: r.trigger,
    response: r.response,
    useEmbed: Boolean(r.use_embed),
    embedTitle: r.embed_title,
    embedColor: sanitizeHexColor(r.embed_color),
    grantRoleId: r.grant_role_id,
    removeRoleId: r.remove_role_id,
    cooldownSec: r.cooldown_sec,
    enabled: Boolean(r.enabled),
    uses: r.uses,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listCustomCommands(
  db: D1Database,
  serverId: string,
): Promise<CustomCommand[]> {
  const { results } = await db
    .prepare("SELECT * FROM community_custom_commands WHERE server_id = ? ORDER BY trigger ASC")
    .bind(serverId)
    .all<CommandRow>();
  return (results || []).map(rowToCmd);
}

export async function saveCustomCommand(
  db: D1Database,
  serverId: string,
  input: {
    id?: string;
    trigger: string;
    response: string;
    useEmbed?: boolean;
    embedTitle?: string | null;
    embedColor?: string;
    grantRoleId?: string | null;
    removeRoleId?: string | null;
    cooldownSec?: number;
    enabled?: boolean;
  },
): Promise<CustomCommand | { error: string }> {
  const trigger = input.trigger.trim().toLowerCase().replace(/^[!/]+/, "").replace(/\s+/g, "-").slice(0, 32);
  if (!trigger || !/^[a-z0-9_-]+$/.test(trigger)) {
    return { error: "Trigger must be 1–32 letters, numbers, hyphens, or underscores." };
  }
  const response = input.response.trim().slice(0, 2000);
  if (!response) return { error: "Response message cannot be empty." };

  const now = new Date().toISOString();
  const id = input.id?.trim() || crypto.randomUUID();
  const useEmbed = Boolean(input.useEmbed);
  const embedTitle = input.embedTitle?.trim().slice(0, 120) || null;
  const embedColor = sanitizeHexColor(input.embedColor);
  const grantRoleId = input.grantRoleId?.trim() || null;
  const removeRoleId = input.removeRoleId?.trim() || null;
  const cooldownSec = Math.max(0, Math.min(3600, Math.round(Number(input.cooldownSec) || 5)));
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);

  const existing = await db
    .prepare("SELECT id, uses, created_at FROM community_custom_commands WHERE id = ? AND server_id = ?")
    .bind(id, serverId)
    .first<{ id: string; uses: number; created_at: string }>();

  const clash = await db
    .prepare("SELECT id FROM community_custom_commands WHERE server_id = ? AND trigger = ? AND id != ?")
    .bind(serverId, trigger, id)
    .first<{ id: string }>();
  if (clash) return { error: `A custom command named "${trigger}" already exists.` };

  if (existing) {
    await db
      .prepare(
        `UPDATE community_custom_commands
            SET trigger = ?, response = ?, use_embed = ?, embed_title = ?, embed_color = ?,
                grant_role_id = ?, remove_role_id = ?, cooldown_sec = ?, enabled = ?, updated_at = ?
          WHERE id = ? AND server_id = ?`,
      )
      .bind(
        trigger,
        response,
        useEmbed ? 1 : 0,
        embedTitle,
        embedColor,
        grantRoleId,
        removeRoleId,
        cooldownSec,
        enabled ? 1 : 0,
        now,
        id,
        serverId,
      )
      .run();
    return {
      id,
      serverId,
      trigger,
      response,
      useEmbed,
      embedTitle,
      embedColor,
      grantRoleId,
      removeRoleId,
      cooldownSec,
      enabled,
      uses: existing.uses,
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }

  await db
    .prepare(
      `INSERT INTO community_custom_commands
         (id, server_id, trigger, response, use_embed, embed_title, embed_color,
          grant_role_id, remove_role_id, cooldown_sec, enabled, uses, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      serverId,
      trigger,
      response,
      useEmbed ? 1 : 0,
      embedTitle,
      embedColor,
      grantRoleId,
      removeRoleId,
      cooldownSec,
      enabled ? 1 : 0,
      now,
      now,
    )
    .run();

  return {
    id,
    serverId,
    trigger,
    response,
    useEmbed,
    embedTitle,
    embedColor,
    grantRoleId,
    removeRoleId,
    cooldownSec,
    enabled,
    uses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteCustomCommand(
  db: D1Database,
  serverId: string,
  commandId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_custom_commands WHERE id = ? AND server_id = ?")
    .bind(commandId, serverId)
    .run();
}

/**
 * Checks if an incoming chat message starts with the server's custom command
 * prefix (e.g. `!rules`) and runs the matching custom command.
 */
export async function maybeRunCustomCommand(
  db: D1Database,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    username: string;
    displayName: string;
    content: string;
  },
): Promise<boolean> {
  const text = input.content.trim();
  if (!text) return false;

  const config = await getCommunityBotConfig(db, input.serverId);
  if (!config.enabled || !config.plugins.customCommands.enabled) return false;

  const prefix = config.plugins.customCommands.prefix || "!";
  if (!text.startsWith(prefix)) return false;

  const afterPrefix = text.slice(prefix.length).trim();
  if (!afterPrefix) return false;
  const spaceIdx = afterPrefix.search(/\s/);
  const trigger = (spaceIdx === -1 ? afterPrefix : afterPrefix.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : afterPrefix.slice(spaceIdx + 1).trim();

  const row = await db
    .prepare(
      "SELECT * FROM community_custom_commands WHERE server_id = ? AND trigger = ? AND enabled = 1",
    )
    .bind(input.serverId, trigger)
    .first<CommandRow>();
  if (!row) return false;

  const cmd = rowToCmd(row);
  const server = await db
    .prepare("SELECT name FROM servers WHERE id = ?")
    .bind(input.serverId)
    .first<{ name: string }>();

  const rendered = renderTemplate(cmd.response, {
    user: `@${input.username}`,
    username: input.displayName,
    server: server?.name ?? "this server",
    args,
  });

  if (cmd.grantRoleId) {
    await assignRoleToMember(db, input.serverId, input.userId, cmd.grantRoleId);
  }
  if (cmd.removeRoleId) {
    await removeRoleFromMember(db, input.serverId, input.userId, cmd.removeRoleId);
  }

  await db
    .prepare("UPDATE community_custom_commands SET uses = uses + 1 WHERE id = ?")
    .bind(cmd.id)
    .run();

  if (cmd.useEmbed) {
    await postCommunityBotMessage(
      db,
      input.serverId,
      input.channelId,
      {
        content: "",
        embeds: [
          {
            title: cmd.embedTitle || `${prefix}${cmd.trigger}`,
            description: rendered,
            color: cmd.embedColor,
          },
        ],
      },
      config,
    );
  } else {
    await postCommunityBotMessage(
      db,
      input.serverId,
      input.channelId,
      { content: rendered },
      config,
    );
  }

  return true;
}
