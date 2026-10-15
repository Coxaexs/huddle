import { DatabaseSync } from "node:sqlite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => true) }));

import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as session } from "@/app/api/auth/session/route";
import { POST as createServer } from "@/app/api/servers/route";
import { POST as openDm } from "@/app/api/dms/route";
import { POST as adminSignup, GET as adminSignupState } from "@/app/api/admin/signup/route";
import { consumeUploadQuota, RESTRICTED_DAILY_UPLOAD_BYTES } from "@/lib/upload-quota";
import { isRestrictedAccount } from "@/lib/trust";
import { verifyTurnstile } from "@/lib/signup";
import { currentUser } from "@/lib/auth";

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

const BASE = "https://hoffle.example/hangout/api";

function cookieOf(response: Response): string {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}


function post(path: string, body: unknown, options: { ip?: string; cookie?: string } = {}) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": options.ip ?? "10.1.1.1",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
const get = (path: string, cookie?: string) =>
  new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });

describe("open signup and its guardrails", () => {
  const db = realDb();
  let ownerCookie = "";
  let nextIp = 0;
  const freshIp = () => `10.9.${Math.floor(++nextIp / 250)}.${nextIp % 250}`;

  beforeAll(() => setBindings({ DB: db, ADMIN_IDS: "" }));
  beforeEach(async () => {
    for (const table of ["users", "sessions", "rate_limits", "invites", "meta", "servers", "server_members", "upload_usage", "dm_members", "friendships"]) {
      await db.prepare(`DELETE FROM ${table}`).run().catch(() => undefined);
    }
    const first = await signup(post("/auth/signup", { username: "owner", password: "owner-password" }, { ip: freshIp() }));
    expect(first.status).toBe(201);
    ownerCookie = cookieOf(first);
  });

  const setOpen = (open: boolean, serverId?: string | null) =>
    adminSignup(post("/admin/signup", { open, ...(serverId !== undefined ? { serverId } : {}) }, { cookie: ownerCookie }));

  const open = (username: string, extra: Record<string, unknown> = {}, ip = freshIp()) =>
    signup(post("/auth/signup", { username, password: "long-enough-pw", ...extra }, { ip }));

  it("stays invite-only until an admin turns it on", async () => {
    const refused = await open("guest");
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toMatch(/invite code is required/i);
    expect(((await (await session(get("/auth/session"))).json()) as { openSignup: boolean }).openSignup).toBe(false);
  });

  it("lets Create account through without a code once it is on, and marks the account", async () => {
    expect((await setOpen(true)).status).toBe(200);
    expect(((await (await session(get("/auth/session"))).json()) as { openSignup: boolean }).openSignup).toBe(true);
    const made = await open("guest");
    expect(made.status).toBe(201);
    const row = await db.prepare("SELECT signup_source, signup_ip_hash FROM users WHERE username = 'guest'").first<{ signup_source: string; signup_ip_hash: string }>();
    expect(row?.signup_source).toBe("open");
    expect(row?.signup_ip_hash).toMatch(/^[0-9a-f]{32}$/);
    const state = (await (await adminSignupState(get("/admin/signup", ownerCookie))).json()) as { stats: Record<string, { total: number }> };
    expect(state.stats.open.total).toBe(1);
    expect(state.stats.first.total).toBe(1);
  });

  it("puts invite-only straight back when switched off", async () => {
    await setOpen(true);
    await setOpen(false);
    expect((await open("guest")).status).toBe(403);
  });

  it("still redeems a typed invite, credits it, and does not fall back when it is wrong", async () => {
    await setOpen(true);
    await db.prepare("INSERT INTO invites (code, created_by, max_uses, uses, revoked, created_at) VALUES ('GOODCODE', NULL, 1, 0, 0, '')").run();
    const bad = await open("guest", { invite: "NOPE" });
    expect(bad.status).toBe(403);
    const good = await open("friend", { invite: "goodcode" });
    expect(good.status).toBe(201);
    expect((await db.prepare("SELECT uses FROM invites WHERE code = 'GOODCODE'").first<{ uses: number }>())?.uses).toBe(1);
    expect((await db.prepare("SELECT signup_source FROM users WHERE username = 'friend'").first<{ signup_source: string }>())?.signup_source).toBe("invite");
    // Spent now: a second use is refused rather than quietly becoming an open signup.
    expect((await open("another", { invite: "GOODCODE" })).status).toBe(403);
  });

  it("joins open-signup accounts to the chosen server", async () => {
    await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at, position) VALUES ('home', 'Home', 'H', '#fff', NULL, '', 0)").run();
    expect((await setOpen(true, "home")).status).toBe(200);
    const made = await open("guest");
    expect(made.status).toBe(201);
    const member = await db.prepare("SELECT 1 AS ok FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id = 'home' AND u.username = 'guest'").first();
    expect(member).toBeTruthy();
    expect((await setOpen(true, "missing")).status).toBe(400);
  });

  it("caps open signups per network per day", async () => {
    await setOpen(true);
    const sameNetwork = "203.0.113.7";
    for (let i = 0; i < 5; i++) expect((await open(`bot${i}`, {}, sameNetwork)).status).toBe(201);
    const sixth = await open("bot5", {}, sameNetwork);
    expect(sixth.status).toBe(429);
    // An invite still gets in from the same network.
    await db.prepare("INSERT INTO invites (code, max_uses, uses, revoked, created_at) VALUES ('VOUCH', 5, 0, 0, '')").run();
    expect((await open("vouched", { invite: "VOUCH" }, sameNetwork)).status).toBe(201);
  });

  it("does not spend an invite use when the username is already taken", async () => {
    await db.prepare("INSERT INTO invites (code, max_uses, uses, revoked, created_at) VALUES ('ONE', 1, 0, 0, '')").run();
    const taken = await open("owner", { invite: "ONE" });
    expect(taken.status).toBe(409);
    expect((await db.prepare("SELECT uses FROM invites WHERE code = 'ONE'").first<{ uses: number }>())?.uses).toBe(0);
  });

  it("does not let strangers lock someone else out of login", async () => {
    // An attacker hammering the owner's name from one address...
    for (let i = 0; i < 12; i++) {
      await login(post("/auth/login", { username: "owner", password: "wrong-guess" }, { ip: "198.51.100.9" }));
    }
    const blocked = await login(post("/auth/login", { username: "owner", password: "wrong-guess" }, { ip: "198.51.100.9" }));
    expect(blocked.status).toBe(429);
    // ...does not stop the owner signing in from their own address.
    const real = await login(post("/auth/login", { username: "owner", password: "owner-password" }, { ip: "192.0.2.50" }));
    expect(real.status).toBe(200);
  });

  describe("accounts in their first day of open signup", () => {
    let guestCookie = "";
    let ownerId = "";
    beforeEach(async () => {
      await setOpen(true);
      guestCookie = cookieOf(await open("guest"));
      ownerId = (await db.prepare("SELECT id FROM users WHERE username = 'owner'").first<{ id: string }>())!.id;
    });

    it("are restricted, invited and older accounts are not", async () => {
      const guest = await currentUser(get("/x", guestCookie));
      expect(isRestrictedAccount(guest!)).toBe(true);
      expect(isRestrictedAccount(guest!, Date.parse(guest!.created_at) + 25 * 3_600_000)).toBe(false);
      expect(isRestrictedAccount({ ...guest!, signup_source: "invite" })).toBe(false);
      expect(isRestrictedAccount({ ...guest!, signup_source: null })).toBe(false);
    });

    it("may make one server, not two", async () => {
      expect((await createServer(post("/servers", { name: "One" }, { cookie: guestCookie }))).status).toBe(201);
      const second = await createServer(post("/servers", { name: "Two" }, { cookie: guestCookie }));
      expect(second.status).toBe(403);
    });

    it("cannot start a DM with a stranger, but can with someone they share a server with", async () => {
      const stranger = await openDm(post("/dms", { userId: ownerId }, { cookie: guestCookie }));
      expect(stranger.status).toBe(403);
      await db.prepare("INSERT INTO servers (id, name, icon, color, created_by, created_at, position) VALUES ('s', 'S', 'S', '#fff', NULL, '', 0)").run();
      await db.prepare("INSERT INTO server_members (server_id, user_id, joined_at) SELECT 's', id, '' FROM users").run();
      expect((await openDm(post("/dms", { userId: ownerId }, { cookie: guestCookie }))).status).toBe(200);
    });

    it("stop at a small upload budget a day", async () => {
      const guest = (await currentUser(get("/x", guestCookie)))!;
      expect(await consumeUploadQuota(db, guest, 30 * 1024 * 1024)).toBeNull();
      const over = await consumeUploadQuota(db, guest, RESTRICTED_DAILY_UPLOAD_BYTES);
      expect(over?.status).toBe(413);
      // The admin has no budget.
      const admin = (await currentUser(get("/x", ownerCookie)))!;
      expect(await consumeUploadQuota(db, admin, 5 * 1024 ** 3)).toBeNull();
    });
  });
});

describe("Turnstile check", () => {
  it("passes when not configured, and fails closed when it is", async () => {
    setBindings({});
    expect(await verifyTurnstile(undefined, new Request("https://x/"))).toBe(true);
    setBindings({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" });
    const ok = vi.fn(async () => Response.json({ success: true }));
    const no = vi.fn(async () => Response.json({ success: false }));
    const boom = vi.fn(async () => { throw new Error("offline"); });
    const request = new Request("https://x/", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(await verifyTurnstile("", request, ok as never)).toBe(false);
    expect(ok).not.toHaveBeenCalled();
    expect(await verifyTurnstile("token", request, ok as never)).toBe(true);
    expect(await verifyTurnstile("token", request, no as never)).toBe(false);
    expect(await verifyTurnstile("token", request, boom as never)).toBe(false);
  });
});
