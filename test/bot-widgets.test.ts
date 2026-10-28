import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const published: Array<{ channelId: string; event: Record<string, unknown>; audience?: string[] | null }> = [];
vi.mock("@/lib/hub-client", () => ({
  publishMessageEvent: async (channelId: string, event: Record<string, unknown>, audience?: string[] | null) => {
    published.push({ channelId, event, audience });
  },
  publishMessage: async () => undefined,
}));

import { ensureSchema } from "@/lib/schema";
import { handleWidgetRoutes } from "@/lib/discord/widgets";
import { snowflakeFor } from "@/lib/discord/snowflake";
import {
  listServerWidgets,
  parseWidgetMessageId,
  widgetHasComponent,
  widgetMessageId,
} from "@/lib/bot-widgets";

/** D1 over a real in-memory SQLite, so the schema and SQL run for real. */
function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    const self = {
      bind: (...args: unknown[]) => statement(query, args),
      async first<T>() {
        return (sqlite.prepare(query).get(...values) ?? null) as T;
      },
      async all<T>() {
        return { results: sqlite.prepare(query).all(...values) as T[] };
      },
      async run() {
        const result = sqlite.prepare(query).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      async raw() {
        return sqlite.prepare(query).all(...values).map((row) => Object.values(row as object));
      },
    };
    return self;
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) =>
      Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}



describe("bot widgets over the Discord REST surface", () => {
  const db = realDb();
  const bot = { id: "bot1", name: "Jukebox", avatar: "🎵", serverId: "srv1" as string | null, isMaster: false, kind: "custom" };

  beforeAll(async () => {
    setBindings({ DB: db });
    await ensureSchema(db);
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO servers (id, name, owner_id, created_at) VALUES ('srv1', 'One', 'u1', ?)").bind(now).run().catch(() => undefined);
    await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) VALUES ('srv1', 'u1', ?), ('srv1', 'u2', ?)").bind(now, now).run();
    await db.prepare("INSERT INTO channels (id, server_id, name, kind, topic, created_at) VALUES ('room1', 'srv1', 'Kitchen', 'voice', '', ?)").bind(now).run().catch(async () => {
      await db.prepare("INSERT INTO channels (id, server_id, name, kind, topic) VALUES ('room1', 'srv1', 'Kitchen', 'voice', '')").run();
    });
    await db.prepare("INSERT INTO server_bots (id, server_id, name, avatar, token, kind, enabled, created_at) VALUES ('bot1', 'srv1', 'Jukebox', '🎵', 'tok', 'custom', 1, ?)").bind(now).run();
  });

  beforeEach(() => {
    published.length = 0;
  });

  const call = (method: string, path: string[], body?: unknown, query = "") =>
    handleWidgetRoutes(
      {
        db,
        bot,
        request: new Request(`https://x/api/v10/applications/1/${path.join("/")}${query}`, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        url: new URL(`https://x/api/v10/applications/1/${path.join("/")}${query}`),
      } as never,
      ["1", ...path],
    );

  const playing = {
    title: "Now playing",
    sizes: ["small", "medium"],
    webview_url: "https://example.com/dashboard",
    embeds: [{ title: "Song A", description: "Artist" }],
    components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: "pause", emoji: { name: "⏸" } }] }],
  };

  it("creates a widget and tells every member of the server", async () => {
    const response = await call("PUT", ["widgets", "now-playing"], playing);
    expect(response.status).toBe(200);
    const saved = (await response.json()) as Record<string, unknown>;
    expect(saved).toMatchObject({ name: "now-playing", title: "Now playing", sizes: ["small", "medium"], channel_id: null });
    expect(published).toHaveLength(1);
    expect(published[0].event).toMatchObject({ t: "bot-widget", serverId: "srv1" });
    expect(published[0].audience?.sort()).toEqual(["u1", "u2"]);
    const [widget] = await listServerWidgets(db, "srv1");
    expect(widget).toMatchObject({ key: "bot:bot1:now-playing", botName: "Jukebox", webviewUrl: "https://example.com/dashboard" });
    expect(widgetHasComponent(widget, "pause")).toBe(true);
    expect(widgetHasComponent(widget, "skip")).toBe(false);
  });

  it("PATCH changes only what it names; PUT replaces the message", async () => {
    await call("PUT", ["widgets", "now-playing"], playing);
    await call("PATCH", ["widgets", "now-playing"], { embeds: [{ title: "Song B" }] });
    let [widget] = await listServerWidgets(db, "srv1");
    expect((widget.embeds[0] as { title: string }).title).toBe("Song B");
    expect(widgetHasComponent(widget, "pause")).toBe(true);

    await call("PUT", ["widgets", "now-playing"], { embeds: [{ title: "Song C" }] });
    [widget] = await listServerWidgets(db, "srv1");
    expect(widget.components).toEqual([]);
    // The title and sizes stay from before: PUT replaces the message, not the widget.
    expect(widget.title).toBe("Now playing");
  });

  it("keeps a copy per room that starts from the server-wide one", async () => {
    await call("PUT", ["widgets", "now-playing"], playing);
    const room = await snowflakeFor("channel", "room1");
    const response = await call("PATCH", ["widgets", "now-playing"], { channel_id: room, embeds: [{ title: "In the kitchen" }] });
    expect(response.status).toBe(200);
    const copies = await listServerWidgets(db, "srv1");
    const roomCopy = copies.find((widget) => widget.channelId === "room1");
    expect(roomCopy).toMatchObject({ title: "Now playing", sizes: ["small", "medium"] });
    expect(copies.filter((widget) => widget.key === "bot:bot1:now-playing")).toHaveLength(2);

    await call("DELETE", ["widgets", "now-playing"]);
    expect(await listServerWidgets(db, "srv1")).toEqual([]);
    expect(published.at(-1)?.event).toMatchObject({ removed: { key: "bot:bot1:now-playing", channelId: "*" } });
  });

  it("refuses bad names, plain-http web views, other servers' channels and an eleventh widget", async () => {
    expect((await call("PUT", ["widgets", "Bad Name"], playing)).status).toBe(400);
    expect((await call("PUT", ["widgets", "x"], { ...playing, webview_url: "http://example.com" })).status).toBe(400);
    expect((await call("PUT", ["widgets", "x"], { ...playing, sizes: [] })).status).toBe(400);
    expect((await call("PUT", ["widgets", "x"], playing, "?channel_id=999")).status).toBe(404);
    for (let index = 0; index < 10; index += 1) {
      expect((await call("PUT", ["widgets", `w${index}`], playing)).status).toBe(200);
    }
    expect((await call("PUT", ["widgets", "w10"], playing)).status).toBe(400);
    // Changing one it already has is still fine.
    expect((await call("PATCH", ["widgets", "w3"], { content: "hi" })).status).toBe(200);
  });

  it("lets a server's bot touch only its own server", async () => {
    const other = await snowflakeFor("guild", "srv2");
    expect((await call("PUT", ["guilds", other, "widgets", "x"], playing)).status).toBe(403);
  });

  it("round-trips the stand-in message id a press travels on", () => {
    const id = widgetMessageId("srv1", "bot1", "now-playing", "room1");
    expect(parseWidgetMessageId(id)).toEqual({ serverId: "srv1", botId: "bot1", name: "now-playing", channelId: "room1" });
    expect(parseWidgetMessageId(widgetMessageId("srv1", "bot1", "x", null))?.channelId).toBeNull();
    expect(parseWidgetMessageId("an-ordinary-message")).toBeNull();
  });
});
