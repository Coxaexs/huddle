import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { resetSnowflakeCache, snowflakeFor } from "@/lib/discord/snowflake";
import { handleDiscordRest } from "@/lib/discord/rest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

/** The schema build is not what these tests are about; the dispatcher runs it. */
vi.mock("@/lib/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema")>()),
  ensureSchema: vi.fn(async () => undefined),
}));

const auth = vi.hoisted(() => ({
  bot: {
    id: "bot1",
    name: "Test Bot",
    avatar: "🤖",
    serverId: "srv1" as string | null,
    isMaster: false,
    kind: "discord",
  },
}));

vi.mock("@/lib/bot-auth", () => ({
  authenticateBot: vi.fn(async () => auth.bot),
  botById: vi.fn(async () => auth.bot),
}));

type Row = Record<string, unknown>;

const GUILD = { id: "srv1", name: "The Hangout", icon: "HG", color: "#7b63e6" };
const CHANNEL = {
  id: "chan1",
  server_id: "srv1",
  name: "general",
  kind: "text",
  topic: "",
  position: 0,
  category_id: null,
  created_at: "2024-01-01T00:00:00.000Z",
};
const MEMBER = {
  id: "user1",
  username: "alice",
  display_name: "Alice",
  avatar: "A",
  color: "#ffffff",
  created_at: "2024-01-01T00:00:00.000Z",
};

/**
 * A hand-rolled D1, table by table.
 *
 * These routes read stored rows and answer, so the fake only has to hold what a
 * test seeds and recognise the handful of statements each route issues; the
 * thread suite's fake is the one with write paths worth exercising in detail.
 */
class FakeDatabase {
  tables: Record<string, Row[]> = {
    discord_ids: [],
    servers: [],
    channels: [],
    users: [],
    messages: [],
    server_members: [],
    member_roles: [],
    audit_log: [],
    invites: [],
  };

  prepare(sql: string) {
    return this.statement(sql.replace(/\s+/g, " ").trim(), []);
  }

  batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  private statement(query: string, args: unknown[]) {
    return {
      bind: (...next: unknown[]) => this.statement(query, next),
      run: async () => this.run(query, args),
      first: async () => this.first(query, args),
      all: async () => this.all(query, args),
    };
  }

  private table(name: string): Row[] {
    return this.tables[name] ?? [];
  }

  private async run(query: string, args: unknown[]): Promise<unknown> {
    if (query.startsWith("INSERT INTO discord_ids")) {
      const [snowflake, kind, nativeId, createdAt] = args as string[];
      if (!this.table("discord_ids").some((row) => row.snowflake === snowflake)) {
        this.table("discord_ids").push({
          snowflake,
          kind,
          native_id: nativeId,
          created_at: createdAt,
        });
      }
      return { success: true };
    }
    if (query.startsWith("UPDATE server_members SET nickname")) {
      const [nickname, serverId, userId] = args as [string | null, string, string];
      const member = this.table("server_members").find(
        (row) => row.server_id === serverId && row.user_id === userId,
      );
      if (member) member.nickname = nickname;
      return { success: true };
    }
    return { success: true };
  }

  private async first(query: string, args: unknown[]): Promise<Row | null> {
    if (query.includes("kind, native_id FROM discord_ids")) {
      const [snowflake] = args as string[];
      return (
        this.table("discord_ids").find((row) => row.snowflake === snowflake) ?? null
      );
    }
    if (query.includes("FROM discord_ids")) {
      const [kind, nativeId] = args as string[];
      return (
        this.table("discord_ids").find(
          (row) => row.kind === kind && row.native_id === nativeId,
        ) ?? null
      );
    }
    if (query.includes("FROM servers")) {
      const [id] = args as string[];
      return this.table("servers").find((row) => row.id === id) ?? null;
    }
    if (query.includes("FROM channels")) {
      // The invite route looks up the server's first text channel rather than
      // one channel by id, so the two forms are told apart here.
      if (query.includes("server_id = ?")) {
        const [serverId] = args as string[];
        return (
          this.table("channels").find(
            (row) => row.server_id === serverId && row.kind === "text",
          ) ?? null
        );
      }
      const [id] = args as string[];
      return this.table("channels").find((row) => row.id === id) ?? null;
    }
    if (query.includes("FROM users")) {
      const [id] = args as string[];
      return this.table("users").find((row) => row.id === id) ?? null;
    }
    if (query.includes("joined_at, nickname FROM server_members")) {
      const [serverId, userId] = args as string[];
      return (
        this.table("server_members").find(
          (row) => row.server_id === serverId && row.user_id === userId,
        ) ?? null
      );
    }
    if (query.includes("FROM messages")) {
      const [id] = args as string[];
      return (
        this.table("messages").find((row) => row.id === id && !row.deleted_at) ?? null
      );
    }
    return null;
  }

  private async all(query: string, args: unknown[]): Promise<{ results: Row[] }> {
    if (query.includes("FROM audit_log")) {
      const [serverId] = args as string[];
      return {
        results: this.table("audit_log").filter((row) => row.server_id === serverId),
      };
    }
    if (query.includes("FROM invites")) {
      const [serverId] = args as string[];
      return {
        results: this.table("invites").filter(
          (row) => row.server_id === serverId && !row.revoked,
        ),
      };
    }
    if (query.includes("FROM member_roles")) {
      const [serverId, userId] = args as string[];
      return {
        results: this.table("member_roles").filter(
          (row) => row.server_id === serverId && row.user_id === userId,
        ),
      };
    }
    if (query.includes("FROM messages")) {
      const [channelId] = args as string[];
      return {
        results: this.table("messages").filter(
          (row) => row.channel_id === channelId && !row.deleted_at && !row.thread_id,
        ),
      };
    }
    return { results: [] };
  }
}

function request(
  db: FakeDatabase,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  setBindings({ DB: db as unknown as D1Database });
  // Segments are the path only: a query string on the last segment would read
  // as part of the resource name and quietly turn into a 404.
  const [pathname] = path.split("?");
  return handleDiscordRest(
    new Request(`https://hoffle.test/hangout/api/v10${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    "10",
    pathname.split("/").filter(Boolean),
    "/hangout",
  );
}

function database(): FakeDatabase {
  const db = new FakeDatabase();
  db.tables.servers.push({
    ...GUILD,
    created_by: MEMBER.id,
    banner_url: null,
    created_at: "2024-01-01T00:00:00.000Z",
  });
  db.tables.channels.push({ ...CHANNEL });
  db.tables.users.push({ ...MEMBER });
  return db;
}

async function knownIds(
  db: FakeDatabase,
): Promise<{ guild: string; channel: string; user: string }> {
  setBindings({ DB: db as unknown as D1Database });
  return {
    guild: await snowflakeFor("guild", GUILD.id),
    channel: await snowflakeFor("channel", CHANNEL.id),
    user: await snowflakeFor("user", MEMBER.id),
  };
}

beforeEach(() => {
  resetSnowflakeCache();
  auth.bot = {
    id: "bot1",
    name: "Test Bot",
    avatar: "🤖",
    serverId: "srv1",
    isMaster: false,
    kind: "discord",
  };
});

afterEach(() => {
  setBindings(null);
  vi.clearAllMocks();
});

describe("guild audit logs", () => {
  function seedAudit(db: FakeDatabase): void {
    db.tables.audit_log.push(
      {
        id: "audit1",
        server_id: GUILD.id,
        actor_id: MEMBER.id,
        actor_name: MEMBER.display_name,
        action: "member.kick",
        target_id: "user2",
        target_name: "Bob",
        detail: "spamming",
        created_at: "2024-01-02T00:00:00.000Z",
      },
      {
        id: "audit2",
        server_id: GUILD.id,
        actor_id: null,
        actor_name: "System",
        action: "member.join",
        target_id: MEMBER.id,
        target_name: MEMBER.display_name,
        detail: null,
        created_at: "2024-01-01T00:00:00.000Z",
      },
    );
  }

  it("returns entries in Discord's envelope", async () => {
    const db = database();
    seedAudit(db);
    const { guild, user } = await knownIds(db);

    const res = await request(db, "GET", `/guilds/${guild}/audit-logs`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      audit_log_entries: Row[];
      users: Row[];
      guild_scheduled_events: unknown[];
    };
    expect(body.guild_scheduled_events).toEqual([]);
    // Discord lists the actors once, next to the entries that name them.
    expect(body.users.map((actor) => actor.id)).toEqual([user]);

    const [kicked, joined] = body.audit_log_entries;
    expect(kicked.action_type).toBe(20);
    expect(kicked.user_id).toBe(user);
    // The target is a member, so its id resolves as a user, not a channel.
    expect(kicked.target_id).toBe(await snowflakeFor("user", "user2"));
    expect(kicked.reason).toBe("spamming");
    expect(kicked.changes).toEqual([]);
    // Entry ids are snowflakes because clients derive `createdAt` from them.
    expect(String(kicked.id)).toMatch(/^\d+$/);

    // A join has no Discord action to map to, so it says so instead of
    // borrowing a neighbouring one.
    expect(joined.action_type).toBe(0);
    expect(joined.reason).toBe("member.join");
  });

  it("filters by action_type and by user", async () => {
    const db = database();
    seedAudit(db);
    const { guild, user } = await knownIds(db);

    const byAction = await request(
      db,
      "GET",
      `/guilds/${guild}/audit-logs?action_type=20`,
    );
    const actionBody = (await byAction.json()) as { audit_log_entries: Row[] };
    expect(actionBody.audit_log_entries).toHaveLength(1);
    expect(actionBody.audit_log_entries[0].reason).toBe("spamming");

    const byUser = await request(
      db,
      "GET",
      `/guilds/${guild}/audit-logs?user_id=${user}`,
    );
    const userBody = (await byUser.json()) as { audit_log_entries: Row[] };
    // The system entry has no actor, so only the kick survives the filter.
    expect(userBody.audit_log_entries).toHaveLength(1);
    expect(userBody.audit_log_entries[0].action_type).toBe(20);
  });
});

describe("guild invites", () => {
  it("serializes live codes and leaves revoked ones out", async () => {
    const db = database();
    db.tables.invites.push(
      {
        code: "abc123",
        server_id: GUILD.id,
        created_by: MEMBER.id,
        created_at: "2024-01-01T00:00:00.000Z",
        max_uses: 5,
        uses: 2,
        revoked: 0,
      },
      {
        code: "old999",
        server_id: GUILD.id,
        created_by: MEMBER.id,
        created_at: "2024-01-01T00:00:00.000Z",
        max_uses: 1,
        uses: 1,
        revoked: 1,
      },
    );
    const { guild, channel, user } = await knownIds(db);

    const res = await request(db, "GET", `/guilds/${guild}/invites`);

    expect(res.status).toBe(200);
    const invites = (await res.json()) as Row[];
    expect(invites).toHaveLength(1);
    const invite = invites[0];
    expect(invite.code).toBe("abc123");
    expect(invite.type).toBe(0);
    expect(invite.uses).toBe(2);
    expect(invite.max_uses).toBe(5);
    // Hoffle codes never expire and grant real membership, which is how
    // Discord spells both of those.
    expect(invite.max_age).toBe(0);
    expect(invite.temporary).toBe(false);
    expect(invite.expires_at).toBeNull();
    expect((invite.guild as Row).id).toBe(guild);
    expect((invite.channel as Row).id).toBe(channel);
    expect((invite.inviter as Row).id).toBe(user);
  });

  it("returns nothing when the guild has no live codes", async () => {
    const db = database();
    const { guild } = await knownIds(db);

    const res = await request(db, "GET", `/guilds/${guild}/invites`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("member nicknames", () => {
  function seedMember(db: FakeDatabase, nickname: string | null = null): void {
    db.tables.server_members.push({
      server_id: GUILD.id,
      user_id: MEMBER.id,
      joined_at: "2024-01-01T00:00:00.000Z",
      nickname,
    });
    db.tables.member_roles.push({
      server_id: GUILD.id,
      user_id: MEMBER.id,
      role_id: "role1",
    });
  }

  it("sets a nickname and returns the member as it now stands", async () => {
    const db = database();
    seedMember(db);
    const { guild, user } = await knownIds(db);

    const res = await request(db, "PATCH", `/guilds/${guild}/members/${user}`, {
      nick: "Al",
    });

    expect(res.status).toBe(200);
    const member = (await res.json()) as Row;
    expect(member.nick).toBe("Al");
    expect((member.user as Row).id).toBe(user);
    // The roles ride along, which is what a client's member cache expects.
    expect(member.roles).toHaveLength(1);
    expect(db.tables.server_members[0].nickname).toBe("Al");
  });

  it("clears a nickname with an explicit null", async () => {
    const db = database();
    seedMember(db, "Al");
    const { guild, user } = await knownIds(db);

    const res = await request(db, "PATCH", `/guilds/${guild}/members/${user}`, {
      nick: null,
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as Row).nick).toBeNull();
    expect(db.tables.server_members[0].nickname).toBeNull();
  });

  it("404s a user who is not in the guild", async () => {
    const db = database();
    seedMember(db);
    const { guild } = await knownIds(db);
    const stranger = await snowflakeFor("user", "user9");

    const res = await request(db, "PATCH", `/guilds/${guild}/members/${stranger}`, {
      nick: "Al",
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 10007 });
  });
});

describe("existing read routes", () => {
  it("fetches a single message by id", async () => {
    const db = database();
    db.tables.messages.push({
      id: "msg1",
      channel: "general",
      channel_id: CHANNEL.id,
      user_id: MEMBER.id,
      author: MEMBER.display_name,
      avatar: MEMBER.avatar,
      color: MEMBER.color,
      content: "hello",
      created_at: "2024-01-01T00:05:00.000Z",
      thread_id: null,
      is_bot: 0,
      deleted_at: null,
    });
    const { channel } = await knownIds(db);
    const message = await snowflakeFor("message", "msg1");

    const res = await request(db, "GET", `/channels/${channel}/messages/${message}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: message, content: "hello" });
  });

  it("404s a message that was deleted", async () => {
    const db = database();
    db.tables.messages.push({
      id: "msg1",
      channel_id: CHANNEL.id,
      content: "hello",
      created_at: "2024-01-01T00:05:00.000Z",
      deleted_at: "2024-01-02T00:00:00.000Z",
      thread_id: null,
    });
    const { channel } = await knownIds(db);
    const message = await snowflakeFor("message", "msg1");

    const res = await request(db, "GET", `/channels/${channel}/messages/${message}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 10008 });
  });

  it("fetches one member of the guild", async () => {
    const db = database();
    db.tables.server_members.push({
      server_id: GUILD.id,
      user_id: MEMBER.id,
      joined_at: "2024-01-01T00:00:00.000Z",
      nickname: "Al",
    });
    const { guild, user } = await knownIds(db);

    const res = await request(db, "GET", `/guilds/${guild}/members/${user}`);

    expect(res.status).toBe(200);
    const member = (await res.json()) as Row;
    expect(member.nick).toBe("Al");
    expect((member.user as Row).id).toBe(user);
  });
});
