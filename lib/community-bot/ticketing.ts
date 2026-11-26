/**
 * Ticketing plugin: support ticket panels with an "Open Ticket" button that
 * creates a dedicated ticket thread/anchor message with Claim & Close buttons,
 * plus full ticket tracking in the web dashboard.
 */

import {
  getCommunityBotConfig,
  postCommunityBotMessage,
  updateCommunityBotMessage,
} from "./store";
import { type SupportTicket, type TicketPanel, sanitizeHexColor } from "./types";

interface PanelRow {
  id: string;
  server_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  button_label: string;
  button_emoji: string;
  color: string;
  welcome_message: string;
  support_role_id: string | null;
  created_at: string;
}

interface TicketRow {
  id: string;
  server_id: string;
  panel_id: string | null;
  channel_id: string;
  thread_id: string | null;
  opener_id: string;
  claimer_id: string | null;
  status: string;
  subject: string;
  created_at: string;
  closed_at: string | null;
  opener_name?: string | null;
  claimer_name?: string | null;
}

function rowToPanel(r: PanelRow): TicketPanel {
  return {
    id: r.id,
    serverId: r.server_id,
    channelId: r.channel_id,
    messageId: r.message_id,
    title: r.title,
    description: r.description,
    buttonLabel: r.button_label,
    buttonEmoji: r.button_emoji,
    color: sanitizeHexColor(r.color),
    welcomeMessage: r.welcome_message,
    supportRoleId: r.support_role_id,
    createdAt: r.created_at,
  };
}

function rowToTicket(r: TicketRow): SupportTicket {
  return {
    id: r.id,
    serverId: r.server_id,
    panelId: r.panel_id,
    channelId: r.channel_id,
    threadId: r.thread_id,
    openerId: r.opener_id,
    openerName: r.opener_name || r.opener_id,
    claimerId: r.claimer_id,
    claimerName: r.claimer_name || (r.claimer_id ?? undefined),
    status: r.status === "closed" ? "closed" : "open",
    subject: r.subject,
    createdAt: r.created_at,
    closedAt: r.closed_at,
  };
}

export async function listTicketPanels(
  db: D1Database,
  serverId: string,
): Promise<TicketPanel[]> {
  const { results } = await db
    .prepare("SELECT * FROM community_ticket_panels WHERE server_id = ? ORDER BY created_at DESC")
    .bind(serverId)
    .all<PanelRow>();
  return (results || []).map(rowToPanel);
}

export async function listTickets(
  db: D1Database,
  serverId: string,
  limit = 100,
): Promise<SupportTicket[]> {
  const { results } = await db
    .prepare(
      `SELECT t.*, u1.display_name AS opener_name, u2.display_name AS claimer_name
         FROM community_tickets t
         LEFT JOIN users u1 ON u1.id = t.opener_id
         LEFT JOIN users u2 ON u2.id = t.claimer_id
        WHERE t.server_id = ?
        ORDER BY t.created_at DESC LIMIT ?`,
    )
    .bind(serverId, limit)
    .all<TicketRow>();
  return (results || []).map(rowToTicket);
}

export async function createAndPublishTicketPanel(
  db: D1Database,
  serverId: string,
  input: {
    channelId: string;
    title: string;
    description: string;
    buttonLabel?: string;
    buttonEmoji?: string;
    color?: string;
    welcomeMessage?: string;
    supportRoleId?: string | null;
  },
): Promise<TicketPanel | { error: string }> {
  const id = crypto.randomUUID();
  const title = input.title.trim().slice(0, 120) || "Need Support?";
  const description =
    input.description.trim().slice(0, 2000) || "Click the button below to open a support ticket.";
  const buttonLabel = (input.buttonLabel || "Open Ticket").trim().slice(0, 40);
  const buttonEmoji = (input.buttonEmoji || "🎫").trim().slice(0, 12);
  const color = sanitizeHexColor(input.color);
  const welcomeMessage =
    (input.welcomeMessage || "Thanks for opening a ticket! Describe your issue and staff will be right with you.")
      .trim()
      .slice(0, 1000);
  const supportRoleId = input.supportRoleId?.trim() || null;
  const createdAt = new Date().toISOString();

  const posted = await postCommunityBotMessage(db, serverId, input.channelId, {
    content: "",
    embeds: [{ title, description, color }],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: buttonLabel,
            emoji: buttonEmoji ? { name: buttonEmoji } : undefined,
            custom_id: `cb:tk:open:${id}`,
          },
        ],
      },
    ],
  });
  if (!posted) return { error: "Target channel not found." };

  await db
    .prepare(
      `INSERT INTO community_ticket_panels
         (id, server_id, channel_id, message_id, title, description, button_label,
          button_emoji, color, welcome_message, support_role_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      serverId,
      input.channelId,
      posted.id,
      title,
      description,
      buttonLabel,
      buttonEmoji,
      color,
      welcomeMessage,
      supportRoleId,
      createdAt,
    )
    .run();

  return {
    id,
    serverId,
    channelId: input.channelId,
    messageId: posted.id,
    title,
    description,
    buttonLabel,
    buttonEmoji,
    color,
    welcomeMessage,
    supportRoleId,
    createdAt,
  };
}

export async function deleteTicketPanel(
  db: D1Database,
  serverId: string,
  panelId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM community_ticket_panels WHERE id = ? AND server_id = ?")
    .bind(panelId, serverId)
    .run();
}

/** Handles `cb:tk:open:<panelId>`, `cb:tk:claim:<ticketId>`, `cb:tk:close:<ticketId>`. */
export async function handleTicketButton(
  db: D1Database,
  serverId: string,
  userId: string,
  customId: string,
): Promise<{ ok: boolean; notice: string }> {
  const config = await getCommunityBotConfig(db, serverId);
  if (!config.enabled || !config.plugins.ticketing.enabled) {
    return { ok: false, notice: "Ticketing is disabled on this server." };
  }

  const parts = customId.split(":");
  const action = parts[2];
  const targetId = parts[3] || "";

  if (action === "open") {
    const panel = await db
      .prepare("SELECT * FROM community_ticket_panels WHERE id = ? AND server_id = ?")
      .bind(targetId, serverId)
      .first<PanelRow>();
    if (!panel) return { ok: false, notice: "This ticket panel no longer exists." };

    const existingOpen = await db
      .prepare(
        "SELECT id FROM community_tickets WHERE server_id = ? AND opener_id = ? AND status = 'open' LIMIT 1",
      )
      .bind(serverId, userId)
      .first<{ id: string }>();
    if (existingOpen) {
      return { ok: false, notice: "You already have an open ticket in this server." };
    }

    const user = await db
      .prepare("SELECT username, display_name FROM users WHERE id = ?")
      .bind(userId)
      .first<{ username: string; display_name: string }>();
    const ticketId = crypto.randomUUID();
    const shortId = ticketId.slice(0, 6).toUpperCase();
    const subject = `Ticket #${shortId} — ${user?.display_name || "Member"}`;
    const createdAt = new Date().toISOString();

    const anchor = await postCommunityBotMessage(
      db,
      serverId,
      panel.channel_id,
      {
        content: `@${user?.username || userId} opened **${subject}**`,
        embeds: [
          {
            title: `🎫 ${subject}`,
            description: panel.welcome_message,
            color: panel.color,
            fields: [
              { name: "Opened by", value: user?.display_name || userId, inline: true },
              { name: "Status", value: "🟢 Open", inline: true },
            ],
            footer: { text: "Reply in this message's thread to talk with support." },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: "Claim Ticket",
                emoji: { name: "✋" },
                custom_id: `cb:tk:claim:${ticketId}`,
              },
              {
                type: 2,
                style: 4,
                label: "Close Ticket",
                emoji: { name: "🔒" },
                custom_id: `cb:tk:close:${ticketId}`,
              },
            ],
          },
        ],
      },
      config,
    );
    if (!anchor) return { ok: false, notice: "Could not open ticket in this channel." };

    await db
      .prepare(
        `INSERT INTO community_tickets
           (id, server_id, panel_id, channel_id, thread_id, opener_id, claimer_id, status, subject, created_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'open', ?, ?, NULL)`,
      )
      .bind(ticketId, serverId, panel.id, panel.channel_id, anchor.id, userId, subject, createdAt)
      .run();

    return { ok: true, notice: `🎫 Opened ${subject}! Reply in its thread.` };
  }

  if (action === "claim") {
    const ticket = await db
      .prepare("SELECT * FROM community_tickets WHERE id = ? AND server_id = ?")
      .bind(targetId, serverId)
      .first<TicketRow>();
    if (!ticket) return { ok: false, notice: "Ticket not found." };
    if (ticket.status === "closed") return { ok: false, notice: "This ticket is already closed." };

    const claimer = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .bind(userId)
      .first<{ display_name: string }>();

    await db
      .prepare("UPDATE community_tickets SET claimer_id = ? WHERE id = ?")
      .bind(userId, ticket.id)
      .run();

    if (ticket.thread_id) {
      await postCommunityBotMessage(
        db,
        serverId,
        ticket.channel_id,
        {
          content: `✋ **${claimer?.display_name || "Staff"}** claimed this ticket.`,
          threadId: ticket.thread_id,
        },
        config,
      );
    }
    return { ok: true, notice: `Claimed ${ticket.subject}.` };
  }

  if (action === "close") {
    return closeTicket(db, serverId, targetId, userId);
  }

  return { ok: false, notice: "Unknown ticket action." };
}

export async function closeTicket(
  db: D1Database,
  serverId: string,
  ticketId: string,
  closedByUserId: string,
): Promise<{ ok: boolean; notice: string }> {
  const ticket = await db
    .prepare("SELECT * FROM community_tickets WHERE id = ? AND server_id = ?")
    .bind(ticketId, serverId)
    .first<TicketRow>();
  if (!ticket) return { ok: false, notice: "Ticket not found." };
  if (ticket.status === "closed") return { ok: true, notice: "Ticket is already closed." };

  const closedAt = new Date().toISOString();
  await db
    .prepare("UPDATE community_tickets SET status = 'closed', closed_at = ? WHERE id = ?")
    .bind(closedAt, ticket.id)
    .run();

  const closer = await db
    .prepare("SELECT display_name FROM users WHERE id = ?")
    .bind(closedByUserId)
    .first<{ display_name: string }>();

  const config = await getCommunityBotConfig(db, serverId);
  if (ticket.thread_id) {
    await updateCommunityBotMessage(db, serverId, ticket.channel_id, ticket.thread_id, {
      content: "",
      embeds: [
        {
          title: `🔒 ${ticket.subject} (Closed)`,
          description: `Closed by **${closer?.display_name || "Staff"}**.`,
          color: "#64748b",
          timestamp: closedAt,
        },
      ],
      components: [],
    });
  }

  return { ok: true, notice: `🔒 Closed ${ticket.subject}.` };
}
