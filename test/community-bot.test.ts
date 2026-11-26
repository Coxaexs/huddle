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

import {
  levelFromXp,
  renderProgressBar,
  renderTemplate,
  sanitizePlugins,
  totalXpForLevel,
  xpNeededForNextLevel,
} from "@/lib/community-bot/types";
import { saveCommunityBotConfig } from "@/lib/community-bot/store";
import { awardMessageXp, getServerLeaderboard, getUserRank, setMemberXp } from "@/lib/community-bot/levels";
import { handleMemberJoin, handleMemberLeave } from "@/lib/community-bot/welcome";
import {
  handleReactionRoleButton,
  handleReactionRoleEmoji,
  publishReactionPanel,
  saveReactionPanel,
} from "@/lib/community-bot/reaction-roles";
import {
  clearChannelMessages,
  clearUserWarnings,
  issueWarning,
  listWarnings,
} from "@/lib/community-bot/moderation";

function createTestDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT, icon_url TEXT, created_by TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lower TEXT, display_name TEXT, avatar TEXT, avatar_url TEXT, color TEXT);
    CREATE TABLE server_members (server_id TEXT, user_id TEXT, joined_at TEXT, timeout_until TEXT, PRIMARY KEY (server_id, user_id));
    CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, position INTEGER DEFAULT 0);
    CREATE TABLE roles (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, color TEXT, position INTEGER DEFAULT 0);
    CREATE TABLE member_roles (server_id TEXT, user_id TEXT, role_id TEXT, PRIMARY KEY (server_id, user_id, role_id));
    CREATE TABLE bans (server_id TEXT, user_id TEXT, banned_by TEXT, created_at TEXT, PRIMARY KEY (server_id, user_id));
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, server_id TEXT, actor_id TEXT, actor_name TEXT, action TEXT, target_id TEXT, target_name TEXT, detail TEXT, created_at TEXT);
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
    CREATE TABLE community_xp (
      server_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 0,
      messages INTEGER NOT NULL DEFAULT 0, voice_minutes INTEGER NOT NULL DEFAULT 0, last_xp_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (server_id, user_id)
    );
    CREATE TABLE community_warnings (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE community_reaction_panels (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
      title TEXT NOT NULL, description TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6366f1',
      mode TEXT NOT NULL DEFAULT 'normal', style TEXT NOT NULL DEFAULT 'buttons',
      items_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );

    INSERT INTO servers VALUES ('srv1', 'Test Guild', 'T', '#6366f1', NULL, 'owner1');
    INSERT INTO users VALUES
      ('owner1', 'owner', 'owner', 'Owner', '👑', NULL, '#f59e0b'),
      ('u1', 'alice', 'alice', 'Alice', '🦊', NULL, '#6366f1'),
      ('u2', 'bob', 'bob', 'Bob', '🐻', NULL, '#22c55e');
    INSERT INTO server_members VALUES
      ('srv1', 'owner1', '2026-01-01T00:00:00Z', NULL),
      ('srv1', 'u1', '2026-01-01T00:00:00Z', NULL),
      ('srv1', 'u2', '2026-01-01T00:00:00Z', NULL);
    INSERT INTO channels VALUES
      ('ch-gen', 'srv1', 'general', 'text', 0),
      ('ch-mod', 'srv1', 'mod-log', 'text', 1),
      ('ch-spam', 'srv1', 'bot-spam', 'text', 2);
    INSERT INTO roles VALUES
      ('r-member', 'srv1', 'Member', '#94a3b8', 1),
      ('r-lv1', 'srv1', 'Level 1', '#22c55e', 2),
      ('r-red', 'srv1', 'Team Red', '#ef4444', 3),
      ('r-blue', 'srv1', 'Team Blue', '#3b82f6', 4);
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
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;

  return { sqlite, db };
}

describe("Community Bot XP math & helpers", () => {
  it("matches MEE6 level curve", () => {
    expect(xpNeededForNextLevel(0)).toBe(100);
    expect(xpNeededForNextLevel(1)).toBe(155);
    expect(totalXpForLevel(2)).toBe(255);
    expect(levelFromXp(0)).toEqual({ level: 0, currentLevelXp: 0, nextLevelXp: 100, progressPct: 0 });
    expect(levelFromXp(100)).toEqual({ level: 1, currentLevelXp: 0, nextLevelXp: 155, progressPct: 0 });
    expect(levelFromXp(255).level).toBe(2);
    expect(renderProgressBar(50, 10)).toBe("█████░░░░░ 50%");
  });

  it("interpolates templates and sanitizes plugins safely", () => {
    expect(renderTemplate("Hi {user} in {server} (Lv {level})", { user: "@alice", server: "Hoffle", level: 3 }))
      .toBe("Hi @alice in Hoffle (Lv 3)");
    const clean = sanitizePlugins({ levels: { minXp: 50, maxXp: 10, cooldownSec: 1 } });
    expect(clean.levels.minXp).toBe(50);
    expect(clean.levels.maxXp).toBe(50);
    expect(clean.levels.cooldownSec).toBe(5);
  });
});

describe("Levels & XP engine", () => {
  it("awards XP with cooldown, levels up, grants role rewards, and populates leaderboard", async () => {
    const { sqlite, db } = createTestDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        levels: {
          enabled: true,
          minXp: 60,
          maxXp: 60,
          cooldownSec: 60,
          multiplier: 1,
          announceMode: "current",
          ignoredChannelIds: ["ch-spam"],
          roleRewards: [{ level: 1, roleId: "r-lv1" }],
        },
      },
    });

    // Ignored channel awards nothing
    const ignored = await awardMessageXp(db, {
      serverId: "srv1", channelId: "ch-spam", userId: "u1", displayName: "Alice", username: "alice", now: 1000,
    });
    expect(ignored.awarded).toBe(false);

    // First message awards 60 XP
    const r1 = await awardMessageXp(db, {
      serverId: "srv1", channelId: "ch-gen", userId: "u1", displayName: "Alice", username: "alice", now: 1000, random: () => 0,
    });
    expect(r1).toMatchObject({ awarded: true, xpGained: 60, totalXp: 60, newLevel: 0, leveledUp: false });

    // Within cooldown -> no XP
    const r2 = await awardMessageXp(db, {
      serverId: "srv1", channelId: "ch-gen", userId: "u1", displayName: "Alice", username: "alice", now: 30_000, random: () => 0,
    });
    expect(r2.awarded).toBe(false);

    // After cooldown -> levels up to 1, grants r-lv1, posts level-up message
    const r3 = await awardMessageXp(db, {
      serverId: "srv1", channelId: "ch-gen", userId: "u1", displayName: "Alice", username: "alice", now: 70_000, random: () => 0,
    });
    expect(r3).toMatchObject({ awarded: true, xpGained: 60, totalXp: 120, oldLevel: 0, newLevel: 1, leveledUp: true });

    const roles = sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").all() as Array<{ role_id: string }>;
    expect(roles.map((r) => r.role_id)).toContain("r-lv1");

    const botMsgs = sqlite.prepare("SELECT author, is_bot FROM messages WHERE channel_id = 'ch-gen'").all();
    expect(botMsgs.length).toBe(1);

    await setMemberXp(db, "srv1", "u2", 500);
    const lb = await getServerLeaderboard(db, "srv1");
    expect(lb[0].userId).toBe("u2");
    expect(lb[1].userId).toBe("u1");

    const rank = await getUserRank(db, "srv1", "u1");
    expect(rank?.rank).toBe(2);
    expect(rank?.level).toBe(1);
  });
});

describe("Welcome, Goodbye & Auto-Roles", () => {
  it("assigns auto-roles and posts welcome/goodbye embeds", async () => {
    const { sqlite, db } = createTestDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        welcome: {
          enabled: true,
          joinChannelId: "ch-gen",
          joinMessage: "Welcome {user} to {server}!",
          joinUseEmbed: true,
          autoRoleIds: ["r-member"],
          leaveEnabled: true,
          leaveChannelId: "ch-gen",
          leaveMessage: "Bye {username}!",
        },
      },
    });

    await handleMemberJoin(db, "srv1", { id: "u1", username: "alice", displayName: "Alice" });
    const roles = sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").all() as Array<{ role_id: string }>;
    expect(roles.map((r) => r.role_id)).toContain("r-member");

    await handleMemberLeave(db, "srv1", { id: "u1", username: "alice", displayName: "Alice" });
    const msgs = sqlite.prepare("SELECT payload FROM messages WHERE channel_id = 'ch-gen'").all();
    expect(msgs.length).toBe(2);
  });
});

describe("Reaction Roles (buttons & emoji)", () => {
  it("handles unique button mode and emoji reaction mode", async () => {
    const { sqlite, db } = createTestDb();
    await saveCommunityBotConfig(db, "srv1", { enabled: true });

    const panel = await saveReactionPanel(db, "srv1", {
      channelId: "ch-gen",
      title: "Pick a Team",
      description: "Choose one",
      mode: "unique",
      style: "buttons",
      items: [
        { id: "red", roleId: "r-red", label: "Team Red", emoji: "🔴", buttonStyle: 4 },
        { id: "blue", roleId: "r-blue", label: "Team Blue", emoji: "🔵", buttonStyle: 1 },
      ],
    });
    const pub = await publishReactionPanel(db, "srv1", panel.id);
    expect("messageId" in pub).toBe(true);

    // Click Red -> gets r-red
    const res1 = await handleReactionRoleButton(db, "srv1", "u1", `cb:rr:${panel.id}:red`);
    expect(res1.ok).toBe(true);
    let roles = (sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").all() as Array<{ role_id: string }>).map((r) => r.role_id);
    expect(roles).toEqual(["r-red"]);

    // Click Blue in unique mode -> removes r-red, adds r-blue
    const res2 = await handleReactionRoleButton(db, "srv1", "u1", `cb:rr:${panel.id}:blue`);
    expect(res2.ok).toBe(true);
    roles = (sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").all() as Array<{ role_id: string }>).map((r) => r.role_id);
    expect(roles).toEqual(["r-blue"]);

    // Emoji reaction panel
    const emojiPanel = await saveReactionPanel(db, "srv1", {
      channelId: "ch-gen",
      title: "Emoji Roles",
      description: "React",
      mode: "normal",
      style: "reactions",
      items: [{ id: "m", roleId: "r-member", label: "Member", emoji: "✅", buttonStyle: 2 }],
    });
    const epub = await publishReactionPanel(db, "srv1", emojiPanel.id);
    if (!("messageId" in epub)) throw new Error("expected messageId");

    await handleReactionRoleEmoji(db, { messageId: epub.messageId, userId: "u2", emoji: "✅", added: true });
    let u2Roles = (sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u2'").all() as Array<{ role_id: string }>).map((r) => r.role_id);
    expect(u2Roles).toEqual(["r-member"]);

    await handleReactionRoleEmoji(db, { messageId: epub.messageId, userId: "u2", emoji: "✅", added: false });
    u2Roles = (sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u2'").all() as Array<{ role_id: string }>).map((r) => r.role_id);
    expect(u2Roles).toEqual([]);
  });
});

describe("Moderation, Warnings & Escalation", () => {
  it("tracks warnings, auto-escalates to timeout/kick, logs to mod-log, and clears messages", async () => {
    const { sqlite, db } = createTestDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        moderation: {
          enabled: true,
          modLogChannelId: "ch-mod",
          escalations: [
            { warns: 2, action: "timeout", durationMin: 15 },
            { warns: 3, action: "kick" },
          ],
        },
      },
    });

    const w1 = await issueWarning(db, { serverId: "srv1", userId: "u1", moderatorId: "owner1", reason: "Spam" });
    expect(w1.totalWarnings).toBe(1);
    expect(w1.escalated).toBeUndefined();

    const w2 = await issueWarning(db, { serverId: "srv1", userId: "u1", moderatorId: "owner1", reason: "More spam" });
    expect(w2.totalWarnings).toBe(2);
    expect(w2.escalated).toEqual({ action: "timeout", durationMin: 15 });

    const memberRow = sqlite.prepare("SELECT timeout_until FROM server_members WHERE user_id = 'u1'").get() as { timeout_until: string | null };
    expect(memberRow.timeout_until).toBeTruthy();

    const w3 = await issueWarning(db, { serverId: "srv1", userId: "u1", moderatorId: "owner1", reason: "Final strike" });
    expect(w3.escalated).toEqual({ action: "kick" });
    const kicked = sqlite.prepare("SELECT 1 FROM server_members WHERE user_id = 'u1'").get();
    expect(kicked).toBeUndefined();

    expect((await listWarnings(db, "srv1", "u1")).length).toBe(3);
    expect(await clearUserWarnings(db, "srv1", "u1")).toBe(3);
    expect((await listWarnings(db, "srv1", "u1")).length).toBe(0);

    // Mod-log should have 3 warning embeds
    const modLogs = sqlite.prepare("SELECT id FROM messages WHERE channel_id = 'ch-mod' AND deleted_at IS NULL").all();
    expect(modLogs.length).toBe(3);

    // Bulk clear 2 messages from mod-log
    expect(await clearChannelMessages(db, "ch-mod", 2)).toBe(2);
    const remaining = sqlite.prepare("SELECT id FROM messages WHERE channel_id = 'ch-mod' AND deleted_at IS NULL").all();
    expect(remaining.length).toBe(1);
  });
});
