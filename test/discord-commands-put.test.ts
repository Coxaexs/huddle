import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { ensureSchema } from "@/lib/schema";
import { handleCommandRoutes } from "@/lib/discord/interactions";

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


describe("PUT /applications/{id}/commands", () => {
  const db = realDb();
  const bot = { id: "bot1", name: "Bot", avatar: "B", serverId: null as string | null, isMaster: false, kind: "discord" };

  beforeAll(async () => {
    setBindings({ DB: db });
    await ensureSchema(db);
  });

  const put = (names: string[]) =>
    handleCommandRoutes(
      {
        db,
        bot,
        request: new Request("https://x/api/v10/applications/1/commands", {
          method: "PUT",
          body: JSON.stringify(names.map((name) => ({ name, description: `the ${name} command` }))),
        }),
      } as never,
      ["1", "commands"],
    );

  async function stored() {
    const rows = await db.prepare("SELECT id, name FROM discord_commands WHERE bot_id = 'bot1' ORDER BY name").all<{ id: string; name: string }>();
    return rows.results;
  }

  it("keeps each command's id when a bot registers the same set again", async () => {
    expect((await put(["ping", "roll"])).status).toBe(200);
    const first = await stored();
    const firstIds = await (await put(["ping", "roll"])).json() as Array<{ id: string; name: string }>;
    const second = await stored();
    expect(second).toEqual(first);
    expect(firstIds.map((c) => c.name).sort()).toEqual(["ping", "roll"]);
    const snowflakes = await db.prepare("SELECT COUNT(*) AS n FROM discord_ids WHERE kind = 'command'").first<{ n: number }>();
    // One id and one version per command, no matter how often it registers.
    await put(["ping", "roll"]);
    await put(["ping", "roll"]);
    const after = await db.prepare("SELECT COUNT(*) AS n FROM discord_ids WHERE kind = 'command'").first<{ n: number }>();
    expect(after?.n).toBe(snowflakes?.n);
  });

  it("drops commands that are no longer in the set and adds new ones", async () => {
    await put(["ping", "roll"]);
    await put(["roll", "poll"]);
    expect((await stored()).map((row) => row.name)).toEqual(["poll", "roll"]);
  });

  it("leaves the existing commands alone when one entry is invalid", async () => {
    await put(["ping", "roll"]);
    const before = await stored();
    const bad = await put(["ping", "not valid!"]);
    expect(bad.status).toBe(400);
    expect(await stored()).toEqual(before);
  });

  it("also keeps ids for a bot registered to one server", async () => {
    bot.serverId = "srv1";
    try {
      await put(["ping"]);
      const first = await stored();
      await put(["ping"]);
      expect(await stored()).toEqual(first);
    } finally {
      bot.serverId = null;
    }
  });
});
