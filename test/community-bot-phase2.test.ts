import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({
  publishMessage: vi.fn().mockResolvedValue(undefined),
  publishMessageEvent: vi.fn().mockResolvedValue(undefined),
  publishStructureChange: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/dms", () => ({
  channelAudience: vi.fn().mockResolvedValue(undefined),
}));

import { saveCommunityBotConfig } from "@/lib/community-bot/store";
import { maybeRunCustomCommand, saveCustomCommand } from "@/lib/community-bot/custom-commands";
import { saveAndOptionallyPublishEmbed } from "@/lib/community-bot/embeds";
import { deliverDueTimers, saveTimer } from "@/lib/community-bot/timers";
import {
  createGiveaway,
  endDueGiveaways,
  handleGiveawayEnterButton,
} from "@/lib/community-bot/giveaways";
import { handleStarboardReaction } from "@/lib/community-bot/starboard";
import {
  createAndPublishTicketPanel,
  handleTicketButton,
  listTickets,
} from "@/lib/community-bot/ticketing";
import { emitServerLog } from "@/lib/community-bot/logs";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT, icon_url TEXT, created_by TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lower TEXT, display_name TEXT, avatar TEXT, avatar_url TEXT, color TEXT);
    CREATE TABLE server_members (server_id TEXT, user_id TEXT, joined_at TEXT, timeout_until TEXT, PRIMARY KEY (server_id, user_id));
    CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, position INTEGER DEFAULT 0);
    CREATE TABLE roles (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, color TEXT, position INTEGER DEFAULT 0);
    CREATE TABLE member_roles (server_id TEXT, user_id TEXT, role_id TEXT, PRIMARY KEY (server_id, user_id, role_id));
    CREATE TABLE reactions (message_id TEXT, user_id TEXT, emoji TEXT, created_at TEXT, PRIMARY KEY (message_id, user_id, emoji));
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, channel TEXT, channel_id TEXT, user_id TEXT, author TEXT, avatar TEXT, color TEXT,
      content TEXT, attachment_key TEXT, is_bot INTEGER, created_at TEXT, payload TEXT,
      reply_to TEXT, thread_id TEXT, command_text TEXT, command_by TEXT, sender_id TEXT,
      edited_at TEXT, deleted_at TEXT
    );
    CREATE TABLE community_bot_config (
      server_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, bot_name TEXT NOT NULL DEFAULT 'HoffBot',
      bot_avatar TEXT NOT NULL DEFAULT '🤖', bot_color TEXT NOT NULL DEFAULT '#6366f1',
      plugins_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
    );
    CREATE TABLE community_custom_commands (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, trigger TEXT NOT NULL, response TEXT NOT NULL,
      use_embed INTEGER NOT NULL DEFAULT 0, embed_title TEXT, embed_color TEXT NOT NULL DEFAULT '#6366f1',
      grant_role_id TEXT, remove_role_id TEXT, cooldown_sec INTEGER NOT NULL DEFAULT 5,
      enabled INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE community_embeds (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
      name TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', embed_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE community_timers (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, name TEXT NOT NULL,
      message TEXT NOT NULL, use_embed INTEGER NOT NULL DEFAULT 0, embed_color TEXT NOT NULL DEFAULT '#6366f1',
      interval_min INTEGER NOT NULL DEFAULT 60, enabled INTEGER NOT NULL DEFAULT 1,
      next_run_at INTEGER NOT NULL, last_run_at INTEGER, created_at TEXT NOT NULL
    );
    CREATE TABLE community_giveaways (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
      prize TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', winner_count INTEGER NOT NULL DEFAULT 1,
      required_role_id TEXT, host_id TEXT NOT NULL, ends_at INTEGER NOT NULL,
      ended INTEGER NOT NULL DEFAULT 0, winner_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
    );
    CREATE TABLE community_giveaway_entries (
      giveaway_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (giveaway_id, user_id)
    );
    CREATE TABLE community_starboard_posts (
      server_id TEXT NOT NULL, source_message_id TEXT NOT NULL, starboard_message_id TEXT NOT NULL,
      star_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      PRIMARY KEY (server_id, source_message_id)
    );
    CREATE TABLE community_ticket_panels (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
      title TEXT NOT NULL, description TEXT NOT NULL, button_label TEXT NOT NULL DEFAULT 'Open Ticket',
      button_emoji TEXT NOT NULL DEFAULT '🎫', color TEXT NOT NULL DEFAULT '#6366f1',
      welcome_message TEXT NOT NULL, support_role_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE community_tickets (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, panel_id TEXT, channel_id TEXT NOT NULL,
      thread_id TEXT, opener_id TEXT NOT NULL, claimer_id TEXT, status TEXT NOT NULL DEFAULT 'open',
      subject TEXT NOT NULL DEFAULT 'Support Ticket', created_at TEXT NOT NULL, closed_at TEXT
    );

    INSERT INTO servers VALUES ('srv1', 'Test Guild', 'T', '#6366f1', NULL, 'owner1');
    INSERT INTO users VALUES
      ('owner1', 'owner', 'owner', 'Owner', '👑', NULL, '#f59e0b'),
      ('u1', 'alice', 'alice', 'Alice', '🦊', NULL, '#6366f1'),
      ('u2', 'bob', 'bob', 'Bob', '🐻', NULL, '#22c55e');
    INSERT INTO channels VALUES
      ('ch-gen', 'srv1', 'general', 'text', 0),
      ('ch-star', 'srv1', 'starboard', 'text', 1),
      ('ch-logs', 'srv1', 'server-logs', 'text', 2),
      ('ch-supp', 'srv1', 'support', 'text', 3);
    INSERT INTO roles VALUES ('r-vip', 'srv1', 'VIP', '#f59e0b', 1);
  `);

  const db = {
    prepare: (sql: string) => {
      const statement = sqlite.prepare(sql);
      const bound = (args: unknown[]) => ({
        all: async () => ({ results: statement.all(...(args as never[])) }),
        first: async () => statement.get(...(args as never[])) ?? null,
        run: async () => {
          const info = statement.run(...(args as never[]));
          return { meta: { changes: Number(info.changes ?? 0) } };
        },
      });
      return { ...bound([]), bind: (...args: unknown[]) => bound(args) };
    },
  } as unknown as D1Database;

  return { sqlite, db };
}

describe("Phase 2 Community Bot plugins", () => {
  it("runs custom commands with role grant and template variables", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", { enabled: true });
    const cmd = await saveCustomCommand(db, "srv1", {
      trigger: "vip",
      response: "Welcome {user} to VIP! ({args})",
      grantRoleId: "r-vip",
    });
    expect("error" in cmd).toBe(false);

    const ran = await maybeRunCustomCommand(db, {
      serverId: "srv1",
      channelId: "ch-gen",
      userId: "u1",
      username: "alice",
      displayName: "Alice",
      content: "!vip hello world",
    });
    expect(ran).toBe(true);

    const msg = sqlite.prepare("SELECT content FROM messages WHERE channel_id = 'ch-gen'").get() as { content: string };
    expect(msg.content).toBe("Welcome @alice to VIP! (hello world)");
    const role = sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").get() as { role_id: string };
    expect(role.role_id).toBe("r-vip");
  });

  it("publishes & updates embeds and delivers due recurring timers", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", { enabled: true });

    const em = await saveAndOptionallyPublishEmbed(db, "srv1", {
      channelId: "ch-gen",
      name: "Rules",
      publish: true,
      embed: { title: "Server Rules", description: "Be kind", color: "#22c55e" },
    });
    expect("saved" in em && Boolean(em.saved.messageId)).toBe(true);

    const t = await saveTimer(db, "srv1", {
      channelId: "ch-gen",
      name: "Reminder",
      message: "Drink water!",
      intervalMin: 10,
    });
    expect("error" in t).toBe(false);
    if ("error" in t) return;

    const sent = await deliverDueTimers(db, t.nextRunAt + 1000);
    expect(sent).toBe(1);
    const msgs = sqlite.prepare("SELECT id FROM messages WHERE channel_id = 'ch-gen'").all();
    expect(msgs.length).toBe(2);
  });

  it("runs giveaways end-to-end (create, enter, auto-end winner selection)", async () => {
    const { db } = createDb();
    await saveCommunityBotConfig(db, "srv1", { enabled: true });

    const gw = await createGiveaway(db, "srv1", {
      channelId: "ch-gen",
      prize: "Nitro",
      winnerCount: 1,
      durationMin: 10,
      hostId: "owner1",
    });
    expect("error" in gw).toBe(false);
    if ("error" in gw) return;

    const enter = await handleGiveawayEnterButton(db, "srv1", "u1", `cb:gw:${gw.id}`);
    expect(enter.ok).toBe(true);

    const ended = await endDueGiveaways(db, gw.endsAt + 1000);
    expect(ended).toBe(1);
  });

  it("posts to starboard when star threshold is met and logs server events", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        starboard: { enabled: true, channelId: "ch-star", emoji: "⭐", threshold: 2, allowSelfStar: false },
        logs: { enabled: true, channelId: "ch-logs", logMessageDelete: true },
      },
    });

    sqlite.exec(`
      INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at)
      VALUES ('m1', 'general', 'ch-gen', 'u1', 'Alice', '🦊', '#6366f1', 'Hilarious joke', 0, '2026-01-01T00:00:00Z');
      INSERT INTO reactions VALUES ('m1', 'u2', '⭐', '2026-01-01T00:01:00Z');
      INSERT INTO reactions VALUES ('m1', 'owner1', '⭐', '2026-01-01T00:02:00Z');
    `);

    await handleStarboardReaction(db, { messageId: "m1", channelId: "ch-gen", reactorUserId: "owner1", emoji: "⭐" });
    const starMsgs = sqlite.prepare("SELECT content FROM messages WHERE channel_id = 'ch-star'").all() as Array<{ content: string }>;
    expect(starMsgs.length).toBe(1);
    expect(starMsgs[0].content).toContain("2");

    await emitServerLog(db, "srv1", {
      kind: "message_delete",
      channelName: "general",
      author: "Alice",
      content: "oops",
      deletedBy: "Owner",
    });
    const logMsgs = sqlite.prepare("SELECT id FROM messages WHERE channel_id = 'ch-logs'").all();
    expect(logMsgs.length).toBe(1);
  });

  it("opens, claims, and closes support tickets via panel buttons", async () => {
    const { db } = createDb();
    await saveCommunityBotConfig(db, "srv1", { enabled: true });

    const panel = await createAndPublishTicketPanel(db, "srv1", {
      channelId: "ch-supp",
      title: "Support",
      description: "Open a ticket",
    });
    expect("error" in panel).toBe(false);
    if ("error" in panel) return;

    const opened = await handleTicketButton(db, "srv1", "u1", `cb:tk:open:${panel.id}`);
    expect(opened.ok).toBe(true);

    let tickets = await listTickets(db, "srv1");
    expect(tickets.length).toBe(1);
    expect(tickets[0].status).toBe("open");

    const claimed = await handleTicketButton(db, "srv1", "owner1", `cb:tk:claim:${tickets[0].id}`);
    expect(claimed.ok).toBe(true);

    const closed = await handleTicketButton(db, "srv1", "owner1", `cb:tk:close:${tickets[0].id}`);
    expect(closed.ok).toBe(true);

    tickets = await listTickets(db, "srv1");
    expect(tickets[0].status).toBe("closed");
    expect(tickets[0].claimerId).toBe("owner1");
  });
});
