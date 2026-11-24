import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DISCOVER_CATEGORIES,
  findServerTemplate,
  isDiscoverCategory,
  SERVER_TEMPLATES,
  wireTemplateExtras,
} from "./server-templates";
import { serverSettings as en } from "./i18n-catalog/en/serverSettings";
import { serverSettings as tr } from "./i18n-catalog/tr/serverSettings";

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
    async batch(statements: ReturnType<typeof statement>[]) {
      const results = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

describe("Expanded starter server templates", () => {
  it("provides 8 unique templates with valid categories, layouts, and translations", () => {
    expect(SERVER_TEMPLATES).toHaveLength(8);
    const ids = new Set(SERVER_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(8);

    for (const tpl of SERVER_TEMPLATES) {
      expect(DISCOVER_CATEGORIES).toContain(tpl.discoverCategory);
      expect(isDiscoverCategory(tpl.discoverCategory)).toBe(true);
      expect(en[tpl.titleKey]).toBeTruthy();
      expect(tr[tpl.titleKey]).toBeTruthy();
      expect(en[tpl.descKey]).toBeTruthy();
      expect(tr[tpl.descKey]).toBeTruthy();
      expect((tpl.layout.categories?.length ?? 0) > 0).toBe(true);
      expect(findServerTemplate(tpl.id)?.id).toBe(tpl.id);
    }

    const dnd = findServerTemplate("dnd");
    expect(dnd?.gmRoleName).toBe("Game Master");
    expect(isDiscoverCategory("invalid")).toBe(false);
  });

  it("auto-wires discover_category and server_dnd_settings.gm_role_id via wireTemplateExtras", async () => {
    const db = realDb();
    await db.exec(`
      CREATE TABLE servers (id TEXT PRIMARY KEY, discover_category TEXT NOT NULL DEFAULT 'community');
      CREATE TABLE roles (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE server_dnd_settings (server_id TEXT PRIMARY KEY, edition TEXT NOT NULL DEFAULT '2014', gm_role_id TEXT, updated_at INTEGER NOT NULL);
    `);

    await db.prepare("INSERT INTO servers (id) VALUES ('srv-dnd')").run();
    await db.prepare("INSERT INTO roles (id, server_id, name) VALUES ('role-gm', 'srv-dnd', 'Game Master')").run();

    const dnd = findServerTemplate("dnd")!;
    await wireTemplateExtras(db, "srv-dnd", dnd);

    const srv = await db
      .prepare("SELECT discover_category FROM servers WHERE id = 'srv-dnd'")
      .first<{ discover_category: string }>();
    const settings = await db
      .prepare("SELECT gm_role_id FROM server_dnd_settings WHERE server_id = 'srv-dnd'")
      .first<{ gm_role_id: string }>();

    expect(srv?.discover_category).toBe("dnd");
    expect(settings?.gm_role_id).toBe("role-gm");
  });
});
