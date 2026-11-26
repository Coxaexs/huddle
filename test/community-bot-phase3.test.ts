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
import {
  buyShopItem,
  claimDaily,
  doWork,
  getBalance,
  payMember,
  saveShopItem,
} from "@/lib/community-bot/economy";
import {
  deliverDueBirthdays,
  parseBirthdayInput,
  setBirthday,
} from "@/lib/community-bot/birthdays";
import {
  maybeCreateTempVoiceChannel,
  maybeDeleteEmptyTempVoiceChannel,
} from "@/lib/community-bot/temp-voice";
import { syncServerStats } from "@/lib/community-bot/server-stats";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT, icon_url TEXT, created_by TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lower TEXT, display_name TEXT, avatar TEXT, avatar_url TEXT, color TEXT);
    CREATE TABLE server_members (server_id TEXT, user_id TEXT, joined_at TEXT, timeout_until TEXT, PRIMARY KEY (server_id, user_id));
    CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, kind TEXT, topic TEXT, position INTEGER DEFAULT 0, category_id TEXT, created_at TEXT);
    CREATE TABLE roles (id TEXT PRIMARY KEY, server_id TEXT, name TEXT, color TEXT, position INTEGER DEFAULT 0);
    CREATE TABLE member_roles (server_id TEXT, user_id TEXT, role_id TEXT, PRIMARY KEY (server_id, user_id, role_id));
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
    CREATE TABLE community_economy (
      server_id TEXT NOT NULL, user_id TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
      last_daily_at INTEGER NOT NULL DEFAULT 0, last_work_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (server_id, user_id)
    );
    CREATE TABLE community_shop_items (
      id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      emoji TEXT NOT NULL DEFAULT '🎁', price INTEGER NOT NULL DEFAULT 100, role_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE community_birthdays (
      server_id TEXT NOT NULL, user_id TEXT NOT NULL, month INTEGER NOT NULL, day INTEGER NOT NULL,
      last_wished_year INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (server_id, user_id)
    );
    CREATE TABLE community_temp_voice (
      channel_id TEXT PRIMARY KEY, server_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL
    );

    INSERT INTO servers VALUES ('srv1', 'Test Guild', 'T', '#6366f1', NULL, 'owner1');
    INSERT INTO users VALUES
      ('u1', 'alice', 'alice', 'Alice', '🦊', NULL, '#6366f1'),
      ('u2', 'bob', 'bob', 'Bob', '🐻', NULL, '#22c55e');
    INSERT INTO server_members VALUES
      ('srv1', 'u1', '2026-01-01T00:00:00Z', NULL),
      ('srv1', 'u2', '2026-01-01T00:00:00Z', NULL);
    INSERT INTO channels VALUES
      ('ch-gen', 'srv1', 'general', 'text', '', 0, NULL, '2026-01-01T00:00:00Z'),
      ('vc-create', 'srv1', 'Join to Create', 'voice', '', 1, NULL, '2026-01-01T00:00:00Z'),
      ('ch-stat-mem', 'srv1', 'Members: 0', 'voice', '', 2, NULL, '2026-01-01T00:00:00Z'),
      ('ch-stat-onl', 'srv1', 'Online: 0', 'voice', '', 3, NULL, '2026-01-01T00:00:00Z');
    INSERT INTO roles VALUES
      ('r-vip', 'srv1', 'VIP', '#f59e0b', 1),
      ('r-bday', 'srv1', 'Birthday', '#ec4899', 2);
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

describe("Phase 3 Community Bot plugins", () => {
  it("handles Economy (/daily, /work, /pay) and Role Shop purchases", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        economy: { enabled: true, startingBalance: 100, dailyAmount: 250, workMin: 50, workMax: 50 },
      },
    });

    expect((await getBalance(db, "srv1", "u1")).balance).toBe(100);
    const d1 = await claimDaily(db, "srv1", "u1", 10_000);
    expect(d1.ok && d1.balance === 350).toBe(true);
    // Cooldown enforced
    const d2 = await claimDaily(db, "srv1", "u1", 20_000);
    expect(d2.ok).toBe(false);

    const w1 = await doWork(db, "srv1", "u1", 10_000, () => 0);
    expect(w1.ok && w1.balance === 400).toBe(true);

    const p1 = await payMember(db, "srv1", "u1", "u2", 100);
    expect(p1.ok && p1.fromBalance === 300 && p1.toBalance === 200).toBe(true);

    await saveShopItem(db, "srv1", { name: "VIP Pass", price: 250, roleId: "r-vip" });
    const bought = await buyShopItem(db, "srv1", "u1", "VIP Pass");
    expect(bought.ok && bought.remainingBalance === 50).toBe(true);

    const role = sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").get() as { role_id: string };
    expect(role.role_id).toBe("r-vip");
  });

  it("parses birthdays, wishes once per year, and grants birthday role", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        birthdays: { enabled: true, channelId: "ch-gen", birthdayRoleId: "r-bday" },
      },
    });

    expect(parseBirthdayInput("07-14")).toEqual({ month: 7, day: 14 });
    expect(parseBirthdayInput("1999-11-26")).toEqual({ month: 11, day: 26 });
    expect(parseBirthdayInput("13-40")).toBeNull();

    await setBirthday(db, "srv1", "u1", 11, 26);
    const now = new Date("2026-11-26T10:00:00Z");
    expect(await deliverDueBirthdays(db, now)).toBe(1);
    // Does not double-wish in the same year
    expect(await deliverDueBirthdays(db, now)).toBe(0);

    const role = sqlite.prepare("SELECT role_id FROM member_roles WHERE user_id = 'u1'").get() as { role_id: string };
    expect(role.role_id).toBe("r-bday");
  });

  it("creates temporary voice channels on join and deletes them when empty", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        tempVoice: { enabled: true, creatorChannelId: "vc-create", nameTemplate: "🎙️ {username}'s Room" },
      },
    });

    const created = await maybeCreateTempVoiceChannel(db, "vc-create", "u1", "Alice");
    expect(created).toBeTruthy();
    if (!created) return;

    const ch = sqlite.prepare("SELECT name FROM channels WHERE id = ?").get(created.channelId) as { name: string };
    expect(ch.name).toBe("🎙️ Alice's Room");

    expect(await maybeDeleteEmptyTempVoiceChannel(db, created.channelId)).toBe(true);
    const gone = sqlite.prepare("SELECT id FROM channels WHERE id = ?").get(created.channelId);
    expect(gone).toBeUndefined();
  });

  it("syncs server stat counter channel names", async () => {
    const { sqlite, db } = createDb();
    await saveCommunityBotConfig(db, "srv1", {
      enabled: true,
      plugins: {
        serverStats: {
          enabled: true,
          memberCountChannelId: "ch-stat-mem",
          memberCountTemplate: "👥 Members: {count}",
          onlineCountChannelId: "ch-stat-onl",
          onlineCountTemplate: "🟢 Online: {count}",
        },
      },
    });

    const updated = await syncServerStats(db, "srv1", new Set(["u1"]));
    expect(updated).toBe(2);

    const memCh = sqlite.prepare("SELECT name FROM channels WHERE id = 'ch-stat-mem'").get() as { name: string };
    const onlCh = sqlite.prepare("SELECT name FROM channels WHERE id = 'ch-stat-onl'").get() as { name: string };
    expect(memCh.name).toBe("👥 Members: 2");
    expect(onlCh.name).toBe("🟢 Online: 1");
  });
});
