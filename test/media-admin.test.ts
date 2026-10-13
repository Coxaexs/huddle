import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import type { User } from "@/lib/auth";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { DELETE, GET } from "@/app/api/admin/media/route";
import { deleteMedia, listMedia } from "@/lib/media-admin";

/** D1 over a real in-memory SQLite, so the schema and SQL run for real. */
function realDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (query: string, params: unknown[] = []) => {
    const values = params as Array<string | number | null>;
    return {
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
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) =>
      Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

/** Just the R2 surface the media admin uses. */
function fakeBucket(files: Record<string, { size: number; type: string; uploader?: string; at: string }>) {
  const store = new Map(Object.entries(files));
  const bucket = {
    async list() {
      return {
        truncated: false,
        objects: [...store].map(([key, file]) => ({
          key,
          size: file.size,
          uploaded: new Date(file.at),
          httpMetadata: { contentType: file.type },
          customMetadata: file.uploader ? { uploader: file.uploader } : {},
        })),
      };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, store };
}

const IMG = "11111111-1111-1111-1111-111111111111--cat.png";
const PDF = "22222222-2222-2222-2222-222222222222--notes.pdf";
const LONE = "33333333-3333-3333-3333-333333333333--old.mp4";
const NOW = "2026-10-12T10:00:00.000Z";

let db: D1Database;
let files: ReturnType<typeof fakeBucket>;

async function addUser(id: string, username: string, isAdmin = 0) {
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'x', '1', '#fff', ?, ?, ?)`,
    )
    .bind(id, username, username.toLowerCase(), username[0].toUpperCase() + username.slice(1), isAdmin, NOW, NOW)
    .run();
}

async function session(userId: string): Promise<string> {
  const token = `token-${userId}`;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(hash, userId, NOW, "2099-01-01T00:00:00.000Z")
    .run();
  return `huddle_session=${token}`;
}

// ensureSchema migrates once per process, so one database is reused and
// emptied between tests.
beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
});

beforeEach(async () => {
  for (const table of ["messages", "sessions", "users", "channels", "servers", "emojis", "audit_log"]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  await addUser("u-kiwi", "kiwi", 1);
  await addUser("u-flo", "flo");
  await addUser("u-rando", "rando");
  await db
    .prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1', 'Hoffle', 'H', '#000', 'u-kiwi', ?)")
    .bind(NOW)
    .run();
  await db
    .prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('c1', 's1', 'general', 'text', ?)")
    .bind(NOW)
    .run();
  // Rando posts the image and the PDF together, then uses the image as an avatar and an emoji.
  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, attachments, is_bot, created_at)
       VALUES ('m1', 'general', 'c1', 'u-rando', 'Rando', '1', '#fff', '', ?, 0, ?)`,
    )
    .bind(JSON.stringify([IMG, PDF]), NOW)
    .run();
  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
       VALUES ('m2', 'general', 'c1', 'u-rando', 'Rando', '1', '#fff', 'look', ?, 0, ?)`,
    )
    .bind(IMG, NOW)
    .run();
  await db
    .prepare("UPDATE users SET avatar_url = ? WHERE id = 'u-rando'")
    .bind(`/hangout/api/uploads/${encodeURIComponent(IMG)}`)
    .run();
  await db
    .prepare("INSERT INTO emojis (id, server_id, name, key, created_by, created_at) VALUES ('e1', 's1', 'cat', ?, 'u-rando', ?)")
    .bind(IMG, NOW)
    .run();

  files = fakeBucket({
    [IMG]: { size: 5000, type: "image/png", at: "2026-10-01T00:00:00Z" },
    [PDF]: { size: 900, type: "application/pdf", uploader: "u-rando", at: "2026-10-02T00:00:00Z" },
    [LONE]: { size: 40_000, type: "video/mp4", at: "2026-09-01T00:00:00Z" },
  });
  setBindings({ DB: db, UPLOADS: files.bucket, MEDIA_ADMIN_IDS: "u-flo" });
});

describe("media admin", () => {
  it("lists every file with its uploader and where it is used", async () => {
    const items = await listMedia(db, files.bucket);
    const byKey = new Map(items.map((item) => [item.key, item]));

    const img = byKey.get(IMG)!;
    expect(img.name).toBe("cat.png");
    expect(img.family).toBe("image");
    // No stored uploader on this one: it is inferred from the rows using it.
    expect(img.uploaderName).toBe("Rando");
    expect(img.refs.map((ref) => ref.kind).sort()).toEqual(["avatar", "emoji", "message", "message"]);
    expect(img.refs.find((ref) => ref.kind === "message")?.label).toBe("#general");

    expect(byKey.get(PDF)!.uploaderId).toBe("u-rando");
    expect(byKey.get(LONE)!.refs).toEqual([]);
  });

  it("deletes a file and detaches it everywhere it appears", async () => {
    const kiwi = { id: "u-kiwi", display_name: "Kiwi", is_admin: 1 } as User;
    await deleteMedia(db, files.bucket, [IMG], kiwi);

    expect(files.store.has(IMG)).toBe(false);
    expect(files.store.has(PDF)).toBe(true);

    const m1 = await db.prepare("SELECT attachments, content FROM messages WHERE id = 'm1'").first<{ attachments: string; content: string }>();
    expect(JSON.parse(m1!.attachments)).toEqual([PDF]);
    expect(m1!.content).toBe("");

    const m2 = await db.prepare("SELECT attachment_key, content FROM messages WHERE id = 'm2'").first<{ attachment_key: string | null; content: string }>();
    expect(m2).toEqual({ attachment_key: null, content: "look" });

    // An attachment-only message's automatic caption is replaced too.
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key, is_bot, created_at)
         VALUES ('m3', 'general', 'c1', 'u-rando', 'Rando', '1', '#fff', 'Shared a PDF document', ?, 0, ?)`,
      )
      .bind(PDF, NOW)
      .run();
    await deleteMedia(db, files.bucket, [PDF], kiwi);
    const m3 = await db.prepare("SELECT attachment_key, content FROM messages WHERE id = 'm3'").first<{ attachment_key: string | null; content: string }>();
    expect(m3).toEqual({ attachment_key: null, content: "(attachment removed by an admin)" });

    const rando = await db.prepare("SELECT avatar_url FROM users WHERE id = 'u-rando'").first<{ avatar_url: string | null }>();
    expect(rando!.avatar_url).toBeNull();
    expect(await db.prepare("SELECT 1 FROM emojis WHERE id = 'e1'").first()).toBeNull();

    const audit = await db.prepare("SELECT action, target_name FROM audit_log WHERE server_id = 's1'").all<{ action: string; target_name: string }>();
    expect(audit.results).toEqual([
      { action: "media.delete", target_name: "cat.png" },
      { action: "media.delete", target_name: "notes.pdf" },
    ]);
  });

  it("leaves a note when a message loses its only content", async () => {
    const kiwi = { id: "u-kiwi", display_name: "Kiwi", is_admin: 1 } as User;
    await deleteMedia(db, files.bucket, [IMG, PDF], kiwi);
    const m1 = await db.prepare("SELECT attachments, content FROM messages WHERE id = 'm1'").first<{ attachments: string | null; content: string }>();
    expect(m1).toEqual({ attachments: null, content: "(attachment removed by an admin)" });
  });

  it("only lets site admins and listed media admins in", async () => {
    const url = "https://hoffle.example/hangout/api/admin/media";
    const asRando = await GET(new Request(url, { headers: { cookie: await session("u-rando") } }));
    expect(asRando.status).toBe(403);

    const asFlo = await GET(new Request(url, { headers: { cookie: await session("u-flo") } }));
    expect(asFlo.status).toBe(200);
    expect(((await asFlo.json()) as { items: unknown[] }).items).toHaveLength(3);

    const randoDelete = await DELETE(
      new Request(url, {
        method: "DELETE",
        headers: { cookie: "huddle_session=token-u-rando", "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [LONE] }),
      }),
    );
    expect(randoDelete.status).toBe(403);
    expect(files.store.has(LONE)).toBe(true);

    const kiwiDelete = await DELETE(
      new Request(url, {
        method: "DELETE",
        headers: { cookie: await session("u-kiwi"), "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [LONE] }),
      }),
    );
    expect(kiwiDelete.status).toBe(200);
    expect(files.store.has(LONE)).toBe(false);
  });
});
