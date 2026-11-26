/**
 * Reaction Roles plugin: button-based & emoji-reaction-based self-role panels
 * with Normal, Unique (only 1 role per panel), Reverse, and Drop (remove-only) modes.
 */

import {
  assignRoleToMember,
  getCommunityBotConfig,
  getMemberRoleIds,
  postCommunityBotMessage,
  removeRoleFromMember,
  updateCommunityBotMessage,
} from "./store";
import {
  type ReactionPanelItem,
  type ReactionPanelMode,
  type ReactionPanelStyle,
  type ReactionRolePanel,
  sanitizeHexColor,
  sanitizePanelItems,
} from "./types";

interface PanelRow {
  id: string;
  server_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  color: string;
  mode: string;
  style: string;
  items_json: string;
  created_at: string;
  updated_at: string;
}

const MODES: ReactionPanelMode[] = ["normal", "unique", "reverse", "drop"];
const STYLES: ReactionPanelStyle[] = ["buttons", "reactions"];

function rowToPanel(row: PanelRow): ReactionRolePanel {
  let items: ReactionPanelItem[] = [];
  try {
    items = sanitizePanelItems(JSON.parse(row.items_json || "[]"));
  } catch {
    items = [];
  }
  return {
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    color: sanitizeHexColor(row.color),
    mode: MODES.includes(row.mode as ReactionPanelMode) ? (row.mode as ReactionPanelMode) : "normal",
    style: STYLES.includes(row.style as ReactionPanelStyle) ? (row.style as ReactionPanelStyle) : "buttons",
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listReactionPanels(
  db: D1Database,
  serverId: string,
): Promise<ReactionRolePanel[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM community_reaction_panels WHERE server_id = ? ORDER BY created_at DESC",
    )
    .bind(serverId)
    .all<PanelRow>();
  return (results || []).map(rowToPanel);
}

export async function getReactionPanel(
  db: D1Database,
  serverId: string,
  panelId: string,
): Promise<ReactionRolePanel | null> {
  const row = await db
    .prepare("SELECT * FROM community_reaction_panels WHERE id = ? AND server_id = ?")
    .bind(panelId, serverId)
    .first<PanelRow>();
  return row ? rowToPanel(row) : null;
}

export async function saveReactionPanel(
  db: D1Database,
  serverId: string,
  input: {
    id?: string;
    channelId: string;
    title: string;
    description: string;
    color?: string;
    mode?: string;
    style?: string;
    items: unknown;
  },
): Promise<ReactionRolePanel> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || crypto.randomUUID();
  const existing = await getReactionPanel(db, serverId, id);
  const title = input.title.trim().slice(0, 120) || "Choose your roles";
  const description = input.description.trim().slice(0, 2000);
  const color = sanitizeHexColor(input.color, existing?.color ?? "#6366f1");
  const mode: ReactionPanelMode = MODES.includes(input.mode as ReactionPanelMode)
    ? (input.mode as ReactionPanelMode)
    : "normal";
  const style: ReactionPanelStyle = STYLES.includes(input.style as ReactionPanelStyle)
    ? (input.style as ReactionPanelStyle)
    : "buttons";
  const items = sanitizePanelItems(input.items);

  if (existing) {
    await db
      .prepare(
        `UPDATE community_reaction_panels
            SET channel_id = ?, title = ?, description = ?, color = ?,
                mode = ?, style = ?, items_json = ?, updated_at = ?
          WHERE id = ? AND server_id = ?`,
      )
      .bind(
        input.channelId,
        title,
        description,
        color,
        mode,
        style,
        JSON.stringify(items),
        now,
        id,
        serverId,
      )
      .run();
    return {
      ...existing,
      channelId: input.channelId,
      title,
      description,
      color,
      mode,
      style,
      items,
      updatedAt: now,
    };
  }

  await db
    .prepare(
      `INSERT INTO community_reaction_panels
         (id, server_id, channel_id, message_id, title, description, color, mode, style, items_json, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      serverId,
      input.channelId,
      title,
      description,
      color,
      mode,
      style,
      JSON.stringify(items),
      now,
      now,
    )
    .run();

  return {
    id,
    serverId,
    channelId: input.channelId,
    messageId: null,
    title,
    description,
    color,
    mode,
    style,
    items,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteReactionPanel(
  db: D1Database,
  serverId: string,
  panelId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_reaction_panels WHERE id = ? AND server_id = ?")
    .bind(panelId, serverId)
    .run();
}

/** Builds Discord-shaped embed + button rows for a Reaction Role panel. */
function buildPanelPayload(panel: ReactionRolePanel): {
  embeds: Array<Record<string, unknown>>;
  components: Array<Record<string, unknown>>;
} {
  const modeHint =
    panel.mode === "unique"
      ? "Pick one role (selecting another replaces your current choice)."
      : panel.mode === "reverse"
        ? "Selecting removes the role; unselecting adds it."
        : panel.mode === "drop"
          ? "Click to remove a role from yourself."
          : "Click any option below to toggle your roles.";

  const lines = panel.items.map((item) =>
    item.emoji ? `${item.emoji} **${item.label}**` : `• **${item.label}**`,
  );

  const embeds = [
    {
      title: panel.title,
      description: [panel.description, lines.length ? lines.join("\n") : ""].filter(Boolean).join("\n\n"),
      color: panel.color,
      footer: { text: modeHint },
    },
  ];

  const components: Array<Record<string, unknown>> = [];
  if (panel.style === "buttons" && panel.items.length > 0) {
    // Up to 5 buttons per ActionRow, max 5 rows.
    for (let i = 0; i < panel.items.length && components.length < 5; i += 5) {
      const slice = panel.items.slice(i, i + 5);
      components.push({
        type: 1,
        components: slice.map((item) => ({
          type: 2,
          style: item.buttonStyle || 2,
          label: item.label,
          emoji: item.emoji ? { name: item.emoji } : undefined,
          custom_id: `cb:rr:${panel.id}:${item.id}`,
        })),
      });
    }
  }

  return { embeds, components };
}

/**
 * Publishes a reaction role panel to its target channel (or updates its
 * existing message if it was already published to the same channel).
 */
export async function publishReactionPanel(
  db: D1Database,
  serverId: string,
  panelId: string,
): Promise<{ messageId: string } | { error: string }> {
  const panel = await getReactionPanel(db, serverId, panelId);
  if (!panel) return { error: "Reaction role panel not found." };
  if (!panel.items.length) return { error: "Add at least one role option before publishing." };

  const { embeds, components } = buildPanelPayload(panel);

  if (panel.messageId) {
    const updated = await updateCommunityBotMessage(
      db,
      serverId,
      panel.channelId,
      panel.messageId,
      { content: "", embeds, components },
    );
    if (updated) {
      if (panel.style === "reactions") {
        await seedPanelReactions(db, panel.messageId, panel.items);
      }
      return { messageId: panel.messageId };
    }
  }

  const posted = await postCommunityBotMessage(db, serverId, panel.channelId, {
    content: "",
    embeds,
    components,
  });
  if (!posted) return { error: "Target channel was not found in this server." };

  await db
    .prepare("UPDATE community_reaction_panels SET message_id = ?, updated_at = ? WHERE id = ?")
    .bind(posted.id, new Date().toISOString(), panel.id)
    .run();

  if (panel.style === "reactions") {
    await seedPanelReactions(db, posted.id, panel.items);
  }

  return { messageId: posted.id };
}

async function seedPanelReactions(
  db: D1Database,
  messageId: string,
  items: ReactionPanelItem[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const item of items) {
    if (!item.emoji) continue;
    await db
      .prepare(
        "INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(messageId, "bot:community", item.emoji, now)
      .run();
  }
}

/** Applies a single panel item toggle for a user and returns a short confirmation message. */
async function applyPanelRoleAction(
  db: D1Database,
  panel: ReactionRolePanel,
  item: ReactionPanelItem,
  userId: string,
  trigger: "toggle" | "add" | "remove",
): Promise<string> {
  const roleRow = await db
    .prepare("SELECT name FROM roles WHERE id = ? AND server_id = ?")
    .bind(item.roleId, panel.serverId)
    .first<{ name: string }>();
  const roleName = roleRow?.name ?? item.label;

  const held = new Set(await getMemberRoleIds(db, panel.serverId, userId));
  const hasRole = held.has(item.roleId);

  if (panel.mode === "drop") {
    if (hasRole) {
      await removeRoleFromMember(db, panel.serverId, userId, item.roleId);
      return `Removed role **${roleName}**.`;
    }
    return `You don't have the **${roleName}** role.`;
  }

  if (panel.mode === "reverse") {
    if (trigger === "add" || (trigger === "toggle" && hasRole)) {
      await removeRoleFromMember(db, panel.serverId, userId, item.roleId);
      return `Removed role **${roleName}**.`;
    }
    await assignRoleToMember(db, panel.serverId, userId, item.roleId);
    return `Added role **${roleName}**.`;
  }

  // Normal or Unique
  const shouldAdd = trigger === "add" ? true : trigger === "remove" ? false : !hasRole;

  if (shouldAdd) {
    if (panel.mode === "unique") {
      for (const other of panel.items) {
        if (other.roleId !== item.roleId && held.has(other.roleId)) {
          await removeRoleFromMember(db, panel.serverId, userId, other.roleId);
        }
      }
    }
    await assignRoleToMember(db, panel.serverId, userId, item.roleId);
    return `Added role **${roleName}**.`;
  } else {
    await removeRoleFromMember(db, panel.serverId, userId, item.roleId);
    return `Removed role **${roleName}**.`;
  }
}

/** Handles button clicks with `customId = cb:rr:<panelId>:<itemId>`. */
export async function handleReactionRoleButton(
  db: D1Database,
  serverId: string,
  userId: string,
  customId: string,
): Promise<{ ok: boolean; notice: string }> {
  const parts = customId.split(":");
  if (parts.length < 4 || parts[0] !== "cb" || parts[1] !== "rr") {
    return { ok: false, notice: "Unknown button." };
  }
  const panelId = parts[2];
  const itemId = parts[3];

  const config = await getCommunityBotConfig(db, serverId);
  if (!config.enabled || !config.plugins.reactionRoles.enabled) {
    return { ok: false, notice: "Reaction Roles are currently disabled on this server." };
  }

  const panel = await getReactionPanel(db, serverId, panelId);
  if (!panel) return { ok: false, notice: "This role panel no longer exists." };

  const item = panel.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, notice: "That role option is no longer on this panel." };

  const notice = await applyPanelRoleAction(db, panel, item, userId, "toggle");
  return { ok: true, notice };
}

/** Handles emoji reaction add/remove on messages linked to a Reaction Role panel. */
export async function handleReactionRoleEmoji(
  db: D1Database,
  input: {
    messageId: string;
    userId: string;
    emoji: string;
    added: boolean;
  },
): Promise<void> {
  const row = await db
    .prepare("SELECT * FROM community_reaction_panels WHERE message_id = ?")
    .bind(input.messageId)
    .first<PanelRow>();
  if (!row) return;

  const panel = rowToPanel(row);
  if (panel.style !== "reactions") return;

  const config = await getCommunityBotConfig(db, panel.serverId);
  if (!config.enabled || !config.plugins.reactionRoles.enabled) return;

  const item = panel.items.find((i) => i.emoji && i.emoji === input.emoji);
  if (!item) return;

  await applyPanelRoleAction(
    db,
    panel,
    item,
    input.userId,
    input.added ? "add" : "remove",
  );
}
