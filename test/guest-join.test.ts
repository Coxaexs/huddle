import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

const state = vi.hoisted(() => ({ db: null as D1Database | null, open: true, user: null as Record<string, unknown> | null }));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/storage", () => ({ bindings: () => ({ DB: state.db }) }));
vi.mock("@/lib/schema", () => ({ ensureSchema: async () => undefined, DEFAULT_SERVER_ID: "hangout", DM_SERVER_ID: "dm" }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  clientIp: () => "1.2.3.4",
  RateLimitError: class { response() { return new Response("", { status: 429 }); } },
}));
vi.mock("@/lib/signup", () => ({
  getSignupSettings: async () => ({ open: state.open, serverId: null }),
  OPEN_SIGNUPS_PER_ADDRESS_PER_DAY: 2,
  signupAddressHash: async () => "addr-1",
  verifyTurnstile: async () => true,
}));
vi.mock("@/lib/servers", () => ({ markServerRead: async () => undefined }));
vi.mock("@/lib/email-verify", () => ({ emailCodeLimit: async () => true, startEmailVerification: async () => undefined }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  hashPassword: async (p: string) => `hash:${p.length}`,
  createSession: async () => "token",
  sessionCookie: () => "hoffle_session=token",
  currentUser: async () => state.user,
}));

const { POST: guest } = await import("@/app/api/auth/guest/route");
const { POST: claim } = await import("@/app/api/auth/claim/route");

const join = (body: Record<string, unknown>) =>
  guest(new Request("http://x/api/auth/guest", { method: "POST", body: JSON.stringify({ agreed: true, ...body }) }));

describe.skipIf(!sqliteAvailable)("quick join as a guest", () => {
  beforeEach(async () => {
    state.open = true;
    state.user = null;
    state.db = sqliteD1();
    await state.db.batch([
      state.db.prepare(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_lower TEXT UNIQUE, display_name TEXT, password_hash TEXT,
        email TEXT, avatar TEXT, color TEXT, is_admin INTEGER, can_invite INTEGER, created_at TEXT, last_seen_at TEXT, signup_source TEXT, signup_ip_hash TEXT)`),
      state.db.prepare("CREATE TABLE invites (code TEXT PRIMARY KEY, server_id TEXT, max_uses INTEGER, uses INTEGER, revoked INTEGER)"),
      state.db.prepare("CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT)"),
      state.db.prepare("CREATE TABLE server_members (server_id TEXT, user_id TEXT, joined_at TEXT, PRIMARY KEY (server_id, user_id))"),
      state.db.prepare("INSERT INTO servers VALUES ('s1', 'Tuesday Crew')"),
      state.db.prepare("INSERT INTO invites VALUES ('CREW', 's1', 100, 0, 0), ('ACCOUNT', NULL, 10, 0, 0), ('DONE', 's1', 1, 1, 0)"),
    ]);
  });

  it("makes a guest with just a name, in the invite's server", async () => {
    const res = await join({ displayName: "  Kai  ", invite: "crew" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { displayName: string; isGuest?: boolean; username: string }; server: { id: string } };
    expect(body.user).toMatchObject({ displayName: "Kai", isGuest: true });
    expect(body.user.username).toMatch(/^guest-[0-9a-f]{8}$/);
    expect(body.server.id).toBe("s1");
    const member = await state.db!.prepare("SELECT 1 AS ok FROM server_members WHERE server_id = 's1'").first<{ ok: number }>();
    expect(member?.ok).toBe(1);
    expect((await state.db!.prepare("SELECT uses FROM invites WHERE code = 'CREW'").first<{ uses: number }>())?.uses).toBe(1);
    expect(res.headers.get("Set-Cookie")).toContain("hoffle_session");
  });

  it("refuses without open signup, a server invite with uses left, a name, or the terms", async () => {
    expect((await join({ displayName: "Kai", invite: "ACCOUNT" })).status).toBe(403);
    expect((await join({ displayName: "Kai", invite: "DONE" })).status).toBe(403);
    expect((await join({ displayName: "Kai", invite: "NOPE" })).status).toBe(403);
    expect((await join({ displayName: "   ", invite: "CREW" })).status).toBe(400);
    expect((await guest(new Request("http://x", { method: "POST", body: JSON.stringify({ displayName: "Kai", invite: "CREW" }) }))).status).toBe(400);
    state.open = false;
    expect((await join({ displayName: "Kai", invite: "CREW" })).status).toBe(403);
  });

  it("caps accounts per network per day, guests and open signups together", async () => {
    expect((await join({ displayName: "A", invite: "CREW" })).status).toBe(201);
    expect((await join({ displayName: "B", invite: "CREW" })).status).toBe(201);
    expect((await join({ displayName: "C", invite: "CREW" })).status).toBe(429);
  });

  it("saves a guest's account with a username and password", async () => {
    const made = (await (await join({ displayName: "Kai", invite: "CREW" })).json()) as { user: { id: string } };
    state.user = await state.db!.prepare("SELECT * FROM users WHERE id = ?").bind(made.user.id).first();
    const res = await claim(new Request("http://x", { method: "POST", body: JSON.stringify({ username: "kai", password: "a good password" }) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string; isGuest?: boolean } };
    expect(body.user.username).toBe("kai");
    expect(body.user.isGuest).toBeUndefined();
    const row = await state.db!.prepare("SELECT username, signup_source FROM users WHERE id = ?").bind(made.user.id).first<{ username: string; signup_source: string }>();
    expect(row).toEqual({ username: "kai", signup_source: "open" });
    // Saved once is saved.
    state.user = await state.db!.prepare("SELECT * FROM users WHERE id = ?").bind(made.user.id).first();
    expect((await claim(new Request("http://x", { method: "POST", body: JSON.stringify({ username: "kai2", password: "a good password" }) }))).status).toBe(400);
  });

  it("won't save a guest under a taken username", async () => {
    await state.db!.prepare("INSERT INTO users (id, username, username_lower, signup_source) VALUES ('u0', 'Mira', 'mira', 'open')").run();
    const made = (await (await join({ displayName: "Kai", invite: "CREW" })).json()) as { user: { id: string } };
    state.user = await state.db!.prepare("SELECT * FROM users WHERE id = ?").bind(made.user.id).first();
    expect((await claim(new Request("http://x", { method: "POST", body: JSON.stringify({ username: "MIRA", password: "a good password" }) }))).status).toBe(409);
  });
});
