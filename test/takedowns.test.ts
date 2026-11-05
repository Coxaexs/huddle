import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";
import { ensureSchema } from "@/lib/schema";
import { resetMemoryRateLimits } from "@/lib/rate-limit";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/hub-client", () => ({ publishMessageEvent: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushNotifications: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  currentUser: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { sendPushNotifications } from "@/lib/push";
import { GET as getFile } from "@/app/api/uploads/[key]/route";
import { GET as list, POST as post } from "@/app/api/admin/takedowns/route";
import { PATCH as patch } from "@/app/api/admin/takedowns/[id]/route";
import { messageFiles, parseTakedownLink } from "@/lib/takedowns";

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
    };
  };
  return {
    prepare: (query: string) => statement(query),
    batch: async (list: Array<ReturnType<typeof statement>>) => Promise.all(list.map((item) => item.run())),
    exec: async (query: string) => sqlite.exec(query),
  } as unknown as D1Database;
}

let db: D1Database;
const NOW = new Date().toISOString();
const KEY = "abc123--holiday.png";
const files = new Map<string, string>();
const bucket = {
  get: async (key: string) => (files.has(key) ? { body: files.get(key), httpMetadata: { contentType: "image/png" } } : null),
  delete: async (key: string) => void files.delete(key),
};
const messageLink = (id: string) => `https://chat.hoffle.online/hangout?server=s1&channel=c1&message=${id}`;
const fileLink = (key: string) => `https://chat.hoffle.online/hangout/api/uploads/${encodeURIComponent(key)}`;
const fetchFile = (key: string) => getFile(new Request("http://x/"), { params: Promise.resolve({ key }) });

function asMail(links: unknown, token = "mail-secret") {
  return post(new Request("http://x/", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ links, from: "orders@atkm.nl", subject: "Verwijderingsbevel" }),
  }));
}
function signIn(admin: boolean) {
  (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue(
    admin ? { id: "root", username: "root", display_name: "Root", is_admin: 1 } : { id: "u1", username: "u1", display_name: "U1", is_admin: 0 },
  );
}
const act = (id: string, action: string) => patch(new Request("http://x/", { method: "PATCH", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id }) });
const message = (id: string) => db.prepare("SELECT content, deleted_at, attachment_key FROM messages WHERE id = ?").bind(id).first<{ content: string; deleted_at: string | null; attachment_key: string | null }>();
async function takedowns() {
  signIn(true);
  return ((await (await list(new Request("http://x/"))).json()) as { takedowns: Array<Record<string, unknown>> }).takedowns;
}

beforeAll(async () => {
  db = realDb();
  await ensureSchema(db);
});

beforeEach(async () => {
  vi.clearAllMocks();
  resetMemoryRateLimits();
  setBindings({ DB: db, UPLOADS: bucket, OPERATOR_ALERT_TOKEN: "mail-secret" } as never);
  files.clear();
  files.set(KEY, "picture");
  for (const table of ["takedowns", "blocked_uploads", "messages", "channels", "servers", "users"]) await db.exec(`DELETE FROM ${table}`);
  await db
    .prepare(
      `INSERT INTO users (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES ('root','root','root','Root','x','a','#000',1,?,?)`,
    )
    .bind(NOW, NOW)
    .run();
  await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at) VALUES ('s1','Srv','S','#000','root',?)").bind(NOW).run();
  await db.prepare("INSERT INTO channels (id, server_id, name, kind, created_at) VALUES ('c1','s1','general','text',?)").bind(NOW).run();
  for (const [id, key] of [["m1", KEY], ["m2", KEY], ["m3", null]]) {
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, author, avatar, color, content, attachment_key, is_bot, created_at)
         VALUES (?, 'general', 'c1', 'sam', 'a', '#000', 'look at this', ?, 0, ?)`,
      )
      .bind(id, key, NOW)
      .run();
  }
});

describe("reading a link", () => {
  it("finds messages and files on this Hoffle only", () => {
    expect(parseTakedownLink(messageLink("m1"))).toEqual({ messageId: "m1" });
    expect(parseTakedownLink(fileLink(KEY))).toEqual({ fileKey: KEY });
    expect(parseTakedownLink("https://evil.example/hangout?message=m1")).toBeNull();
    expect(parseTakedownLink("https://chat.hoffle.online.evil.example/?message=m1")).toBeNull();
    expect(parseTakedownLink("https://chat.hoffle.online/hangout")).toBeNull();
    expect(parseTakedownLink("not a link")).toBeNull();
    expect(parseTakedownLink("https://chat.hoffle.online/hangout?message=' OR 1=1")).toBeNull();
  });

  it("finds every file a message carries", () => {
    expect(messageFiles({ attachment_key: "a", attachments: '["b"]', audio_url: "/hangout/api/uploads/c" }).sort()).toEqual(["a", "b", "c"]);
    expect(messageFiles({ attachment_key: null, attachments: "broken" })).toEqual([]);
  });
});

describe("a takedown", () => {
  it("hides the message and stops its file being served, for everyone", async () => {
    expect((await fetchFile(KEY)).status).toBe(200);
    const res = await asMail([messageLink("m1")]);
    expect(await res.json()).toMatchObject({ down: 1, unmatched: 0 });
    expect((await message("m1"))!.deleted_at).toBeTruthy();
    const blocked = await fetchFile(KEY);
    expect(blocked.status).toBe(451);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  });

  it("from a file link hides every message carrying that file", async () => {
    await asMail([fileLink(KEY)]);
    expect((await message("m1"))!.deleted_at).toBeTruthy();
    expect((await message("m2"))!.deleted_at).toBeTruthy();
    expect((await message("m3"))!.deleted_at).toBeNull();
  });

  it("blocks a file no message carries any more", async () => {
    files.set("zzz--orphan.png", "x");
    await asMail([fileLink("zzz--orphan.png")]);
    expect((await fetchFile("zzz--orphan.png")).status).toBe(451);
  });

  it("rings the admin urgently, and says what it could not match", async () => {
    await asMail([messageLink("m1"), "https://evil.example/x"]);
    const [, ids, payload] = (sendPushNotifications as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ids).toEqual(["root"]);
    expect(payload.urgent).toBe(true);
    expect(payload.body).toContain("1 more could not be matched");
  });

  it("does nothing for links it cannot match", async () => {
    const res = await asMail(["https://evil.example/hangout?message=m1", messageLink("no-such")]);
    expect(await res.json()).toMatchObject({ down: 0, unmatched: 2 });
    expect((await message("m1"))!.deleted_at).toBeNull();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM takedowns").first()).toEqual({ n: 0 });
  });

  it("counts the same message once", async () => {
    await asMail([messageLink("m1")]);
    expect(await (await asMail([messageLink("m1")])).json()).toMatchObject({ down: 0, already: 1 });
  });

  it("handles at most 20 links from one mail", async () => {
    const links = Array.from({ length: 30 }, (_, i) => messageLink(`no-${i}`));
    expect(await (await asMail(links)).json()).toMatchObject({ unmatched: 20, skipped: 10 });
  });
});

describe("who can do it", () => {
  it("refuses a wrong token and ordinary people", async () => {
    signIn(false);
    expect((await asMail([messageLink("m1")], "wrong")).status).toBe(403);
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await asMail([messageLink("m1")], "wrong")).status).toBe(401);
    expect((await message("m1"))!.deleted_at).toBeNull();
  });

  it("has no mail route until the token is set", async () => {
    setBindings({ DB: db, UPLOADS: bucket } as never);
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await asMail([messageLink("m1")], "undefined")).status).toBe(401);
  });

  it("lets an admin take down a pasted link", async () => {
    signIn(true);
    const res = await post(new Request("http://x/", { method: "POST", body: JSON.stringify({ links: [messageLink("m1")] }) }));
    expect(await res.json()).toMatchObject({ down: 1 });
  });

  it("only lets a person restore or erase, never the mail token", async () => {
    await asMail([messageLink("m1")]);
    const [item] = await takedowns();
    (currentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await patch(
      new Request("http://x/", { method: "PATCH", headers: { authorization: "Bearer mail-secret" }, body: JSON.stringify({ action: "restore" }) }),
      { params: Promise.resolve({ id: String(item.id) }) },
    );
    expect(res.status).toBe(401);
    signIn(false);
    expect((await act(String(item.id), "erase")).status).toBe(403);
    expect((await message("m1"))!.deleted_at).toBeTruthy();
  });
});

describe("the panel", () => {
  it("shows what, who and where, but never a way to the file", async () => {
    await asMail([messageLink("m1")]);
    const [item] = await takedowns();
    expect(item).toMatchObject({ text: "look at this", author: "sam", where: "Srv #general", files: ["holiday.png"], status: "down", source: "order-mail" });
    expect(String(item.sourceDetail)).toContain("orders@atkm.nl");
    expect(JSON.stringify({ ...item, link: "" })).not.toContain("abc123");
  });

  it("restores the message and the file", async () => {
    await asMail([messageLink("m1")]);
    const [item] = await takedowns();
    expect((await act(String(item.id), "restore")).status).toBe(200);
    expect((await message("m1"))!.deleted_at).toBeNull();
    expect((await fetchFile(KEY)).status).toBe(200);
    expect((await takedowns())[0].status).toBe("restored");
  });

  it("does not bring back what its author had deleted", async () => {
    await db.prepare("UPDATE messages SET deleted_at = ? WHERE id = 'm3'").bind(NOW).run();
    await asMail([messageLink("m3")]);
    const [item] = await takedowns();
    await act(String(item.id), "restore");
    expect((await message("m3"))!.deleted_at).toBe(NOW);
  });

  it("keeps a file blocked while another takedown holds it", async () => {
    await asMail([fileLink(KEY)]);
    const items = await takedowns();
    expect(items).toHaveLength(2);
    await act(String(items[0].id), "restore");
    expect((await fetchFile(KEY)).status).toBe(451);
    await act(String(items[1].id), "restore");
    expect((await fetchFile(KEY)).status).toBe(200);
  });

  it("deletes for good, after which nothing comes back", async () => {
    await asMail([messageLink("m1")]);
    const [item] = await takedowns();
    expect((await act(String(item.id), "erase")).status).toBe(200);
    expect(files.has(KEY)).toBe(false);
    expect(await message("m1")).toMatchObject({ content: "", attachment_key: null });
    expect((await takedowns())[0]).toMatchObject({ status: "erased", text: "" });
    expect((await act(String(item.id), "restore")).status).toBe(404);
    expect((await fetchFile(KEY)).status).toBe(451);
  });
});

describe("telling a real order from a fake one", async () => {
  const { isVerifiedOrder, linksIn, parseSenders } = (await import("../deploy/mail-alert/verify.js" as string)) as {
    isVerifiedOrder: (raw: string, senders: string[], server: string) => boolean;
    linksIn: (text: string) => string[];
    parseSenders: (list: string) => string[];
  };
  const SERVER = "mx.cloudflare.net";
  const mail = (headers: string[]) => `${headers.join("\r\n")}\r\n\r\nbody`;
  const pass = "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=atkm.nl; spf=pass";
  const check = (headers: string[], senders = ["atkm.nl"]) => isVerifiedOrder(mail(headers), senders, SERVER);

  it("accepts a signed mail from a listed sender", () => {
    expect(check([pass, "From: ATKM <orders@atkm.nl>", "Subject: x"])).toBe(true);
    expect(check(["Authentication-Results: mx.cloudflare.net;\r\n dkim=pass\r\n header.d=atkm.nl", "From: orders@atkm.nl"])).toBe(true);
  });

  it("is off while no sender is listed", () => {
    expect(check([pass, "From: orders@atkm.nl"], [])).toBe(false);
    expect(parseSenders("")).toEqual([]);
    expect(parseSenders(" atkm.nl, Other.NL ")).toEqual(["atkm.nl", "other.nl"]);
  });

  it("refuses a forged From with no signature", () => {
    expect(check(["From: orders@atkm.nl"])).toBe(false);
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=fail header.d=atkm.nl", "From: orders@atkm.nl"])).toBe(false);
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=none", "From: orders@atkm.nl"])).toBe(false);
  });

  it("refuses a signature from someone else's domain", () => {
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=pass header.d=evil.example", "From: orders@atkm.nl"])).toBe(false);
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=pass header.d=atkm.nl.evil.example", "From: orders@atkm.nl"])).toBe(false);
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=fail header.d=atkm.nl; dkim=pass header.d=evil.example", "From: orders@atkm.nl"])).toBe(false);
  });

  it("refuses look-alike senders", () => {
    expect(check([pass, "From: orders@atkm.nl.evil.example"])).toBe(false);
    expect(check([pass, "From: orders@xatkm.nl"])).toBe(false);
    expect(check([pass, 'From: "orders@atkm.nl" <me@evil.example>'])).toBe(false);
  });

  it("ignores a pass the sender wrote below the real result", () => {
    expect(check(["Authentication-Results: mx.cloudflare.net; dkim=fail header.d=atkm.nl", pass, "From: orders@atkm.nl"])).toBe(false);
  });

  it("ignores a result written by any other server", () => {
    expect(check(["Authentication-Results: evil.example; dkim=pass header.d=atkm.nl", "From: orders@atkm.nl"])).toBe(false);
  });

  it("refuses two From lines", () => {
    expect(check([pass, "From: orders@atkm.nl", "From: me@evil.example"])).toBe(false);
  });

  it("does not read headers out of the body", () => {
    expect(isVerifiedOrder(`From: orders@atkm.nl\r\n\r\n${pass}`, ["atkm.nl"], SERVER)).toBe(false);
  });

  it("finds links in text and html", () => {
    expect(linksIn('see https://chat.hoffle.online/hangout?a=1&amp;message=m1. <a href="https://x.example/y">z</a>')).toEqual([
      "https://chat.hoffle.online/hangout?a=1&message=m1",
      "https://x.example/y",
    ]);
  });
});

describe("deleting a message takes its file with it", () => {
  const remove = (id: string) => db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").bind(NOW, id).run();

  it("stops serving a file once every message carrying it is deleted", async () => {
    signIn(false);
    await remove("m1");
    expect((await fetchFile(KEY)).status).toBe(200);
    await remove("m2");
    expect((await fetchFile(KEY)).status).toBe(404);
  });

  it("still shows it to the instance admin for review", async () => {
    await remove("m1");
    await remove("m2");
    signIn(true);
    expect((await fetchFile(KEY)).status).toBe(200);
  });

  it("covers extra attachments and voice messages", async () => {
    signIn(false);
    files.set("xx--second.png", "b");
    files.set("yy--voice.ogg", "c");
    await db
      .prepare(
        `INSERT INTO messages (id, channel, channel_id, author, avatar, color, content, attachments, audio_url, is_bot, created_at)
         VALUES ('m4', 'general', 'c1', 'sam', 'a', '#000', 'x', '["xx--second.png"]', '/hangout/api/uploads/yy--voice.ogg', 0, ?)`,
      )
      .bind(NOW)
      .run();
    expect((await fetchFile("xx--second.png")).status).toBe(200);
    await remove("m4");
    expect((await fetchFile("xx--second.png")).status).toBe(404);
    expect((await fetchFile("yy--voice.ogg")).status).toBe(404);
  });

  it("leaves files no message carries alone", async () => {
    signIn(false);
    files.set("avatar--me.png", "d");
    expect((await fetchFile("avatar--me.png")).status).toBe(200);
  });
});

