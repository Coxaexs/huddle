import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteAvailable, sqliteD1 } from "./stubs/sqlite-d1";

const state = vi.hoisted(() => ({ db: null as D1Database | null, codes: 0 }));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/storage", () => ({ bindings: () => ({ DB: state.db }) }));
vi.mock("@/lib/schema", () => ({ ensureSchema: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/servers", () => ({ isServerMember: vi.fn(async () => true) }));
vi.mock("@/lib/permissions", () => ({ can: vi.fn(async () => true), Permission: { CREATE_INVITES: 1 } }));
vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(async () => ({ id: "u1", display_name: "mewis" })),
  canUserCreateInvites: vi.fn(async () => false),
  isFirstUserOrOwner: vi.fn(async () => false),
  generateInviteCode: () => `CODE${++state.codes}`,
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));

const { POST } = await import("@/app/api/invites/route");

type Invite = { code: string; maxUses: number; channelId: string | null };

async function create(body: Record<string, unknown>) {
  const res = await POST(new Request("http://x/api/invites", { method: "POST", body: JSON.stringify(body) }));
  return (await res.json()) as { invite: Invite };
}

describe.skipIf(!sqliteAvailable)("invite dialog: POST /api/invites", () => {
  beforeEach(async () => {
    state.codes = 0;
    state.db = sqliteD1();
    await state.db.batch([
      state.db.prepare(`CREATE TABLE invites (
        code TEXT PRIMARY KEY, created_by TEXT, created_at TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1,
        uses INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, note TEXT, server_id TEXT,
        default_theme TEXT, default_server_id TEXT, channel_id TEXT)`),
      state.db.prepare("CREATE TABLE channels (id TEXT PRIMARY KEY, server_id TEXT, kind TEXT)"),
      state.db.prepare("INSERT INTO channels VALUES ('general', 's1', 'text'), ('lounge', 's1', 'voice'), ('other', 's2', 'text')"),
    ]);
  });

  it("keeps the landing channel, but only a message channel of that server", async () => {
    expect((await create({ serverId: "s1", channelId: "general", maxUses: 100 })).invite.channelId).toBe("general");
    expect((await create({ serverId: "s1", channelId: "lounge", maxUses: 100 })).invite.channelId).toBeNull();
    expect((await create({ serverId: "s1", channelId: "other", maxUses: 100 })).invite.channelId).toBeNull();
  });

  it("hands back your own working link instead of making another", async () => {
    const first = (await create({ serverId: "s1", channelId: "general", maxUses: 100, reuse: true })).invite;
    expect((await create({ serverId: "s1", channelId: "general", maxUses: 100, reuse: true })).invite.code).toBe(first.code);
    // Another channel, another limit, or no reuse: a new link.
    expect((await create({ serverId: "s1", maxUses: 100, reuse: true })).invite.code).not.toBe(first.code);
    expect((await create({ serverId: "s1", channelId: "general", maxUses: 5, reuse: true })).invite.code).not.toBe(first.code);
    expect((await create({ serverId: "s1", channelId: "general", maxUses: 100 })).invite.code).not.toBe(first.code);
  });

  it("does not reuse a link that is used up or revoked", async () => {
    const first = (await create({ serverId: "s1", maxUses: 1, reuse: true })).invite;
    await state.db!.prepare("UPDATE invites SET uses = 1 WHERE code = ?").bind(first.code).run();
    const second = (await create({ serverId: "s1", maxUses: 1, reuse: true })).invite;
    expect(second.code).not.toBe(first.code);
    await state.db!.prepare("UPDATE invites SET revoked = 1 WHERE code = ?").bind(second.code).run();
    expect((await create({ serverId: "s1", maxUses: 1, reuse: true })).invite.code).not.toBe(second.code);
  });
});
