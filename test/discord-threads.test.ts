import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { resetSnowflakeCache, snowflakeFor } from "@/lib/discord/snowflake";
import { handleDiscordRest } from "@/lib/discord/rest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

/**
 * ensureSchema issues about a hundred statements and builds the FTS tables. The
 * dispatcher only needs it to have run, so it is stubbed: every test below cares
 * about what the routes do afterwards.
 */
vi.mock("@/lib/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema")>()),
  ensureSchema: vi.fn(async () => undefined),
}));

/**
 * Authentication is a token lookup against `server_bots`; here the test picks
 * the identity instead, which is what makes the permission cases possible
 * without a token table.
 */
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

const CHANNEL = {
  id: "chan1",
  server_id: "srv1",
  name: "general",
  kind: "text",
  position: 0,
};
const GUILD = { id: "srv1", name: "The Hangout", icon: "HG", color: "#7b63e6" };
const MEMBER = {
  id: "user1",
  username: "alice",
  display_name: "Alice",
  avatar: "A",
  color: "#ffffff",
  created_at: "2024-01-01T00:00:00.000Z",
};

/**
 * A hand-rolled D1.
 *
 * The surface under test is routed SQL — one statement at a time against real
 * tables — so the fake keeps rows per table and answers by matching the shape of
 * the query rather than by replaying the whole schema. `statements` records
 * every query, which lets a test assert what a route asked for without a real
 * engine to ask.
 */
class FakeDatabase {
  tables: Record<string, Row[]> = {
    discord_ids: [],
    discord_threads: [],
    channels: [],
    servers: [],
    messages: [],
    users: [],
    server_members: [],
    member_roles: [],
    audit_log: [],
    invites: [],
  };

  statements: string[] = [];

  prepare(sql: string) {
    return this.statement(this.normalize(sql), []);
  }

  batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  private normalize(sql: string): string {
    const query = sql.replace(/\s+/g, " ").trim();
    this.statements.push(query);
    return query;
  }

  private statement(query: string, args: unknown[]) {
    return {
      bind: (...next: unknown[]) => this.statement(query, next),
      run: async () => this.run(query, args),
      first: async () => this.first(query, args),
      all: async () => this.all(query, args),
    };
  }

  private rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  private async run(query: string, args: unknown[]): Promise<unknown> {
    if (query.startsWith("CREATE TABLE") || query.startsWith("CREATE INDEX")) {
      return { success: true };
    }
    if (query.startsWith("INSERT INTO discord_ids")) {
      const [snowflake, kind, nativeId, createdAt] = args as string[];
      if (!this.rows("discord_ids").some((row) => row.snowflake === snowflake)) {
        this.tables.discord_ids.push({
          snowflake,
          kind,
          native_id: nativeId,
          created_at: createdAt,
        });
      }
      return { success: true };
    }
    if (query.startsWith("INSERT INTO discord_threads")) {
      const [
        id,
        channelId,
        serverId,
        name,
        anchor,
        type,
        autoArchive,
        ownerBot,
        ownerUser,
        ts,
      ] = args as Array<string | number | null>;
      this.tables.discord_threads.push({
        id,
        channel_id: channelId,
        server_id: serverId,
        name,
        anchor_message_id: anchor,
        type,
        auto_archive_duration: autoArchive,
        owner_bot_id: ownerBot,
        owner_user_id: ownerUser,
        locked: 0,
        archived: 0,
        archive_timestamp: ts,
        created_at: ts,
      });
      return { success: true };
    }
    if (query.startsWith("UPDATE discord_threads")) {
      const [name, autoArchive, archived, locked, archiveTimestamp, id] = args as [
        string,
        number,
        number,
        number,
        string,
        string,
      ];
      const thread = this.rows("discord_threads").find((row) => row.id === id);
      if (thread) {
        Object.assign(thread, {
          name,
          auto_archive_duration: autoArchive,
          archived,
          locked,
          archive_timestamp: archiveTimestamp,
        });
      }
      return { success: true };
    }
    if (query.startsWith("INSERT INTO messages")) {
      const [
        id,
        channel,
        channelId,
        userId,
        author,
        avatar,
        color,
        content,
        createdAt,
        payload,
        replyTo,
        threadId,
      ] = args as Array<string | null>;
      this.tables.messages.push({
        id,
        channel,
        channel_id: channelId,
        user_id: userId,
        author,
        avatar,
        color,
        content,
        created_at: createdAt,
        payload,
        reply_to: replyTo,
        thread_id: threadId,
        is_bot: 1,
        deleted_at: null,
      });
      return { success: true };
    }
    return { success: true };
  }

  private async first(query: string, args: unknown[]): Promise<Row | null> {
    if (query.includes("kind, native_id FROM discord_ids")) {
      const [snowflake] = args as string[];
      return this.rows("discord_ids").find((row) => row.snowflake === snowflake) ?? null;
    }
    if (query.includes("FROM discord_ids")) {
      const [kind, nativeId] = args as string[];
      return (
        this.rows("discord_ids").find(
          (row) => row.kind === kind && row.native_id === nativeId,
        ) ?? null
      );
    }
    if (query.includes("FROM discord_threads")) {
      const column = query.includes("anchor_message_id = ?") ? "anchor_message_id" : "id";
      const [value] = args as string[];
      return this.rows("discord_threads").find((row) => row[column] === value) ?? null;
    }
    if (query.includes("FROM channels")) {
      const [id] = args as string[];
      return this.rows("channels").find((row) => row.id === id) ?? null;
    }
    if (query.includes("FROM servers")) {
      const [id] = args as string[];
      return this.rows("servers").find((row) => row.id === id) ?? null;
    }
    if (query.includes("joined_at, nickname FROM server_members")) {
      const [serverId, userId] = args as string[];
      return (
        this.rows("server_members").find(
          (row) => row.server_id === serverId && row.user_id === userId,
        ) ?? null
      );
    }
    if (query.includes("FROM messages")) {
      const [id] = args as string[];
      return (
        this.rows("messages").find((row) => row.id === id && !row.deleted_at) ?? null
      );
    }
    return null;
  }

  private async all(query: string, args: unknown[]): Promise<{ results: Row[] }> {
    if (query.includes("AS member_count")) {
      // A page of reply tallies. The fake aggregates in JS: one bucket per
      // thread id over the rows that are still there.
      const ids = args as string[];
      const buckets = new Map<string, Row[]>();
      for (const row of this.rows("messages")) {
        const threadId = String(row.thread_id ?? "");
        if (!ids.includes(threadId) || row.deleted_at) continue;
        buckets.set(threadId, [...(buckets.get(threadId) ?? []), row]);
      }
      return {
        results: [...buckets.entries()].map(([threadId, messages]) => {
          const sorted = [...messages].sort((a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)),
          );
          const authors = new Set(
            messages.map((message) => message.user_id ?? message.author),
          );
          return {
            thread_id: threadId,
            message_count: messages.length,
            member_count: authors.size,
            last_message_id: sorted[sorted.length - 1]?.id ?? null,
          };
        }),
      };
    }
    if (query.includes("FROM discord_threads")) {
      const filters: Array<(row: Row) => boolean> = [];
      let index = 0;
      if (query.includes("archived = ?")) {
        const wanted = args[index++];
        filters.push((row) => row.archived === wanted);
      }
      if (query.includes("channel_id = ?")) {
        const wanted = args[index++];
        filters.push((row) => row.channel_id === wanted);
      }
      if (query.includes("server_id = ?")) {
        const wanted = args[index++];
        filters.push((row) => row.server_id === wanted);
      }
      return {
        results: this.rows("discord_threads").filter((row) =>
          filters.every((matches) => matches(row)),
        ),
      };
    }
    if (query.includes("FROM audit_log")) {
      return { results: this.rows("audit_log") };
    }
    if (query.includes("FROM invites")) {
      return { results: this.rows("invites") };
    }
    if (query.includes("FROM member_roles")) {
      const [serverId, userId] = args as string[];
      return {
        results: this.rows("member_roles").filter(
          (row) => row.server_id === serverId && row.user_id === userId,
        ),
      };
    }
    if (query.includes("FROM messages")) {
      const [channelId, second] = args as Array<string | undefined>;
      // A channel's history and a thread's are the same rows narrowed two ways,
      // which is exactly how the routes tell them apart.
      const inThread = query.includes("thread_id = ?");
      const parentOnly = query.includes("thread_id IS NULL");
      return {
        results: this.rows("messages").filter(
          (row) =>
            row.channel_id === channelId &&
            !row.deleted_at &&
            (inThread
              ? row.thread_id === second
              : parentOnly
                ? !row.thread_id
                : true),
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
  db.tables.channels.push({
    ...CHANNEL,
    topic: "",
    category_id: null,
    created_at: "2024-01-01T00:00:00.000Z",
  });
  db.tables.servers.push({
    ...GUILD,
    created_by: "user1",
    created_at: "2024-01-01T00:00:00.000Z",
  });
  db.tables.users.push(MEMBER);
  db.tables.server_members.push({
    server_id: "srv1",
    user_id: "user1",
    joined_at: "2024-01-01T00:00:00.000Z",
    nickname: null,
  });
  return db;
}

/** The ids a bot would already hold after reading the guild once. */
async function knownIds(
  db: FakeDatabase,
): Promise<{ guild: string; channel: string }> {
  setBindings({ DB: db as unknown as D1Database });
  return {
    guild: await snowflakeFor("guild", GUILD.id),
    channel: await snowflakeFor("channel", CHANNEL.id),
  };
}

beforeEach(() => {
  // The snowflake memo outlives a swapped-in database, so every test starts
  // from an empty one rather than inheriting the previous test's ids.
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

/** A message in `general`, as a bot would already hold the snowflake for. */
async function seededMessage(
  db: FakeDatabase,
  id = "msg1",
  content = "the build is broken",
): Promise<string> {
  db.tables.messages.push({
    id,
    channel: "general",
    channel_id: CHANNEL.id,
    user_id: MEMBER.id,
    author: MEMBER.display_name,
    avatar: MEMBER.avatar,
    color: MEMBER.color,
    content,
    created_at: "2024-01-01T00:05:00.000Z",
    thread_id: null,
    is_bot: 0,
    deleted_at: null,
  });
  setBindings({ DB: db as unknown as D1Database });
  return snowflakeFor("message", id);
}

describe("thread replies", () => {
  /** A thread started from `msg1`, plus the ids a client would be holding. */
  async function startedThread(db: FakeDatabase) {
    const { guild, channel } = await knownIds(db);
    const message = await seededMessage(db);
    const created = await request(
      db,
      "POST",
      `/channels/${channel}/messages/${message}/threads`,
      { name: "Build failures" },
    );
    const thread = (await created.json()) as Row;
    return { guild, channel, message, thread, threadId: String(thread.id) };
  }

  it("stores a reply against the parent channel and the thread, as the UI does", async () => {
    const db = database();
    const { threadId } = await startedThread(db);

    const res = await request(db, "POST", `/channels/${threadId}/messages`, {
      content: "looking now",
    });

    expect(res.status).toBe(200);
    const reply = (await res.json()) as Row;
    // Clients address thread messages by the thread, never by its parent.
    expect(reply.channel_id).toBe(threadId);
    expect(reply.guild_id).toBe(await snowflakeFor("guild", GUILD.id));

    const stored = db.tables.messages.find((row) => row.content === "looking now");
    expect(stored?.channel_id).toBe(CHANNEL.id);
    expect(stored?.thread_id).toBe("msg1");
  });

  it("lists the thread's replies and keeps them out of the channel's history", async () => {
    const db = database();
    const { channel, threadId } = await startedThread(db);
    await request(db, "POST", `/channels/${threadId}/messages`, {
      content: "looking now",
    });

    const inThread = await request(db, "GET", `/channels/${threadId}/messages`);
    const replies = (await inThread.json()) as Row[];
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe("looking now");
    expect(replies[0].channel_id).toBe(threadId);

    const inChannel = await request(db, "GET", `/channels/${channel}/messages`);
    // The starter message is all the channel flow shows: thread replies belong
    // in the thread panel, exactly as the web UI renders them.
    expect(((await inChannel.json()) as Row[]).map((row) => row.content)).toEqual([
      "the build is broken",
    ]);
  });

  it("reports the thread's tallies and its own id as a channel", async () => {
    const db = database();
    const { channel, threadId } = await startedThread(db);
    await request(db, "POST", `/channels/${threadId}/messages`, {
      content: "looking now",
    });

    const res = await request(db, "GET", `/channels/${threadId}`);
    expect(res.status).toBe(200);
    const thread = (await res.json()) as Row;
    expect(thread.id).toBe(threadId);
    expect(thread.type).toBe(11);
    expect(thread.parent_id).toBe(channel);
    expect(thread.message_count).toBe(1);
    expect(thread.member_count).toBe(1);
    expect(thread.last_message_id).toBe(
      await snowflakeFor("message", String(db.tables.messages[1].id)),
    );
  });
});

describe("thread members", () => {
  async function threadId(db: FakeDatabase): Promise<string> {
    const { channel } = await knownIds(db);
    const created = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
    });
    return String(((await created.json()) as Row).id);
  }

  it("answers @me with the bot's own membership", async () => {
    const db = database();
    const thread = await threadId(db);

    const res = await request(db, "GET", `/channels/${thread}/thread-members/@me`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: thread,
      user_id: await snowflakeFor("user", "bot:bot1"),
      flags: 0,
    });
  });

  it("treats joining as a no-op and still answers 204", async () => {
    const db = database();
    const thread = await threadId(db);

    const res = await request(db, "PUT", `/channels/${thread}/thread-members/@me`);

    expect(res.status).toBe(204);
  });

  it("refuses a membership on a channel that is not a thread", async () => {
    const db = database();
    const { channel } = await knownIds(db);

    const res = await request(db, "PUT", `/channels/${channel}/thread-members/@me`);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 50035 });
  });

  it("has no membership to report for anyone but itself", async () => {
    const db = database();
    const thread = await threadId(db);

    const res = await request(
      db,
      "GET",
      `/channels/${thread}/thread-members/${await snowflakeFor("user", MEMBER.id)}`,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 10007 });
  });
});

describe("starting threads", () => {
  it("starts a thread and serializes it as a public thread channel", async () => {
    const db = database();
    const { guild, channel } = await knownIds(db);

    const res = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
      auto_archive_duration: 4320,
    });

    expect(res.status).toBe(201);
    const thread = (await res.json()) as Row;
    expect(thread.type).toBe(11);
    expect(thread.name).toBe("Bug triage");
    expect(thread.parent_id).toBe(channel);
    expect(thread.guild_id).toBe(guild);
    // The bot's own account owns it, which is what a client renders the
    // thread's creator from.
    expect(thread.owner_id).toBe(await snowflakeFor("user", "bot:bot1"));
    expect(thread.thread_metadata).toMatchObject({
      archived: false,
      auto_archive_duration: 4320,
      locked: false,
    });
    expect(typeof (thread.thread_metadata as Row).archive_timestamp).toBe("string");
    expect(thread.message_count).toBe(0);
    expect(thread.member_count).toBe(0);
    expect(thread.total_message_sent).toBe(0);
    expect((thread.member as Row).user_id).toBe(thread.owner_id);

    const stored = db.tables.discord_threads[0];
    expect(stored.server_id).toBe(GUILD.id);
    expect(stored.channel_id).toBe(CHANNEL.id);
    expect(stored.anchor_message_id).toBeNull();
  });

  it("keys a thread started from a message on that message", async () => {
    const db = database();
    const { channel } = await knownIds(db);
    const message = await seededMessage(db);

    const res = await request(
      db,
      "POST",
      `/channels/${channel}/messages/${message}/threads`,
      { name: "Build failures" },
    );

    expect(res.status).toBe(201);
    const thread = (await res.json()) as Row;
    // The web UI opens `?threadId=<anchor message id>`, so the thread has to be
    // the same thread a person would open from that message.
    expect(db.tables.discord_threads[0].id).toBe("msg1");
    expect(db.tables.discord_threads[0].anchor_message_id).toBe("msg1");
    expect(thread.parent_id).toBe(channel);
    expect((thread.thread_metadata as Row).auto_archive_duration).toBe(1440);
    expect(thread.total_message_sent).toBe(1);
  });

  it("refuses a second thread for the same message", async () => {
    const db = database();
    const { channel } = await knownIds(db);
    const message = await seededMessage(db);
    await request(db, "POST", `/channels/${channel}/messages/${message}/threads`, {
      name: "first",
    });

    const res = await request(
      db,
      "POST",
      `/channels/${channel}/messages/${message}/threads`,
      { name: "second" },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 160004 });
  });

  it("requires a name", async () => {
    const db = database();
    const { channel } = await knownIds(db);

    const res = await request(db, "POST", `/channels/${channel}/threads`, {});

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 50035 });
  });

  it("refuses a private thread instead of quietly making it public", async () => {
    const db = database();
    const { channel } = await knownIds(db);

    const res = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "mod chat",
      type: 12,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string; code: number };
    expect(body.code).toBe(50035);
    expect(body.message).toContain("Private");
  });

  it("rejects an archive window Discord does not offer", async () => {
    const db = database();
    const { channel } = await knownIds(db);

    const res = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
      auto_archive_duration: 900,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 50035 });
  });
});

describe("archived threads", () => {
  async function startedThread(db: FakeDatabase) {
    const { guild, channel } = await knownIds(db);
    const created = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
    });
    const thread = (await created.json()) as Row;
    return { guild, channel, threadId: String(thread.id) };
  }

  it("moves a thread between the active and archived lists", async () => {
    const db = database();
    const { guild, threadId } = await startedThread(db);

    const active = await request(db, "GET", `/guilds/${guild}/threads/active`);
    const activeBody = (await active.json()) as { threads: Row[]; members: Row[] };
    expect(activeBody.threads.map((thread) => thread.id)).toEqual([threadId]);
    // Discord's active list carries one member object per listed thread.
    expect(activeBody.members.map((member) => member.id)).toEqual([threadId]);

    const archived = await request(db, "PATCH", `/channels/${threadId}`, {
      archived: true,
      locked: true,
    });
    expect(archived.status).toBe(200);
    expect((await archived.json() as Row).thread_metadata).toMatchObject({
      archived: true,
      locked: true,
    });

    const empty = await request(db, "GET", `/guilds/${guild}/threads/active`);
    expect(((await empty.json()) as { threads: Row[] }).threads).toEqual([]);

    const list = await request(
      db,
      "GET",
      `/channels/${db.tables.discord_threads[0].channel_id}/threads/archived/public`,
    );
    expect(list.status).toBe(200);
    const page = (await list.json()) as {
      threads: Row[];
      members: Row[];
      has_more: boolean;
    };
    expect(page.threads.map((thread) => thread.id)).toEqual([threadId]);
    expect(page.members.map((member) => member.id)).toEqual([threadId]);
    expect(page.has_more).toBe(false);
  });

  it("answers an empty page when nothing has been archived", async () => {
    const db = database();
    const { channel } = await knownIds(db);
    await request(db, "POST", `/channels/${channel}/threads`, { name: "Bug triage" });

    const res = await request(
      db,
      "GET",
      `/channels/${channel}/threads/archived/public`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threads: [], members: [], has_more: false });
  });

  it("has no private threads to list", async () => {
    const db = database();
    const { channel } = await knownIds(db);

    const res = await request(
      db,
      "GET",
      `/channels/${channel}/threads/archived/private`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ threads: [], has_more: false });
  });
});

describe("threads started in the web UI", () => {
  /**
   * A thread the web UI opened: an ordinary message, plus replies pointing at
   * it. Nothing in `discord_threads` names it, which is the case a bot meets
   * when it hears about the thread from a message event.
   */
  async function webThread(db: FakeDatabase) {
    const { channel } = await knownIds(db);
    await seededMessage(db);
    db.tables.messages.push({
      id: "msg2",
      channel: "general",
      channel_id: CHANNEL.id,
      user_id: MEMBER.id,
      author: MEMBER.display_name,
      avatar: MEMBER.avatar,
      color: MEMBER.color,
      content: "me too",
      created_at: "2024-01-01T00:06:00.000Z",
      thread_id: "msg1",
      is_bot: 0,
      deleted_at: null,
    });
    setBindings({ DB: db as unknown as D1Database });
    // The id a gateway payload hands out for a message inside the thread.
    const thread = await snowflakeFor("channel", "msg1");
    return { channel, thread };
  }

  it("resolves it as a public thread named after the message it hangs off", async () => {
    const db = database();
    const { channel, thread } = await webThread(db);

    const res = await request(db, "GET", `/channels/${thread}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Row;
    expect(body.type).toBe(11);
    expect(body.id).toBe(thread);
    expect(body.parent_id).toBe(channel);
    // Discord names a thread after its starter message, and so does the web
    // UI's own panel, so the two agree on what the thread is called.
    expect(body.name).toBe("the build is broken");
    expect(body.owner_id).toBe(await snowflakeFor("user", MEMBER.id));
    expect(body.message_count).toBe(1);
    expect(body.member_count).toBe(1);
  });

  it("lists its replies and accepts new ones", async () => {
    const db = database();
    const { thread } = await webThread(db);

    const listed = await request(db, "GET", `/channels/${thread}/messages`);
    const replies = (await listed.json()) as Row[];
    expect(replies.map((reply) => reply.content)).toEqual(["me too"]);
    expect(replies[0].channel_id).toBe(thread);

    const posted = await request(db, "POST", `/channels/${thread}/messages`, {
      content: "fixed",
    });
    expect(posted.status).toBe(200);
    const stored = db.tables.messages.find((row) => row.content === "fixed");
    expect(stored?.channel_id).toBe(CHANNEL.id);
    expect(stored?.thread_id).toBe("msg1");
  });

  it("adopts it when a bot opens a thread from the same message", async () => {
    const db = database();
    const { channel } = await webThread(db);
    const message = await snowflakeFor("message", "msg1");

    const res = await request(
      db,
      "POST",
      `/channels/${channel}/messages/${message}/threads`,
      { name: "Build failures" },
    );

    expect(res.status).toBe(201);
    // The thread the web UI started and the thread the bot just made are one
    // thread, not a second one beside it.
    expect(db.tables.discord_threads).toHaveLength(1);
    expect(db.tables.discord_threads[0].id).toBe("msg1");
    expect(((await res.json()) as Row).message_count).toBe(1);
  });

  it("archives it by storing it on first change", async () => {
    const db = database();
    const { thread, channel } = await webThread(db);

    const res = await request(db, "PATCH", `/channels/${thread}`, {
      archived: true,
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as Row).thread_metadata).toMatchObject({
      archived: true,
    });
    // A web-UI thread only becomes a row once something needs to remember
    // something about it.
    expect(db.tables.discord_threads).toHaveLength(1);
    expect(db.tables.discord_threads[0].owner_user_id).toBe(MEMBER.id);

    const list = await request(
      db,
      "GET",
      `/channels/${channel}/threads/archived/public`,
    );
    const page = (await list.json()) as { threads: Row[] };
    expect(page.threads.map((entry) => entry.id)).toEqual([thread]);
  });
});

describe("thread failures", () => {
  it("404s an unknown channel", async () => {
    const db = database();

    const res = await request(
      db,
      "POST",
      "/channels/123456789012345678/threads",
      { name: "Bug triage" },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 10003 });
  });

  it("404s an unknown thread channel", async () => {
    const db = database();

    const res = await request(db, "GET", "/channels/123456789012345678/thread-members/@me");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 10003 });
  });

  it("denies a bot scoped to another server", async () => {
    const db = database();
    const { channel } = await knownIds(db);
    auth.bot = { ...auth.bot, serverId: "srv2" };

    const res = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 50001 });
    expect(db.tables.discord_threads).toEqual([]);
  });

  it("hides a thread that belongs to another server", async () => {
    const db = database();
    const { channel } = await knownIds(db);
    const created = await request(db, "POST", `/channels/${channel}/threads`, {
      name: "Bug triage",
    });
    const threadId = String(((await created.json()) as Row).id);
    auth.bot = { ...auth.bot, serverId: "srv2" };

    const res = await request(db, "GET", `/channels/${threadId}`);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 50001 });
  });
});

