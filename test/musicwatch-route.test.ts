import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const state = {
  user: null as Record<string, unknown> | null,
  channel: null as Record<string, unknown> | null,
  member: true,
  perms: new Set<string>(),
  bot: true,
  startedBy: null as string | null,
  overwrites: null as number | null,
};
const botFetch = vi.fn<(path: string, cookie: string, init?: { body?: string }) => Promise<Record<string, unknown>>>();

vi.mock("@/lib/auth", () => ({
  currentUser: async () => state.user,
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/servers", () => ({
  findChannel: async () => state.channel,
  isServerMember: async () => state.member,
}));
vi.mock("@/lib/permissions", () => ({
  Permission: { CONNECT: 1, MANAGE_CHANNELS: "manage-channels", MODERATE: "moderate" },
  can: async (_db: unknown, _user: string, _server: string, flag: string) => state.perms.has(flag),
  hasPermission: (bits: number, flag: number) => (bits & flag) === flag,
}));
vi.mock("@/lib/channel-permissions", () => ({
  // null: the room has no overwrites; a number: what they leave this member.
  channelOverwritePermissions: async () => state.overwrites,
  mayView: (bits: number) => (bits & 2) === 2,
}));
vi.mock("@/lib/music-bot", () => ({
  MUSIC_BOT_MISSING: "The Music Bot isn't in this server yet.",
  musicBotInServer: async () => state.bot,
}));
vi.mock("@/lib/musicbot", () => ({
  botSession: async () => "mb_session=1",
  botFetch: (path: string, cookie: string, init?: { body?: string }) => botFetch(path, cookie, init),
}));
vi.mock("@/lib/rate-limit", () => ({ limitUser: async () => null }));
vi.mock("@/lib/users", () => ({
  isSafeProfileImage: (value: string | null | undefined) => Boolean(value?.startsWith("/hangout/api/uploads/")),
}));
const db = {
  prepare: () => ({
    bind: () => ({ first: async () => (state.startedBy ? { created_by: state.startedBy } : null) }),
  }),
};
vi.mock("@/lib/storage", () => ({
  bindings: () => ({ DB: db, MUSICWATCH_PUBLIC_URL: "https://chat.example" }),
}));

import { POST } from "@/app/api/(features)/integrations/musicwatch/route";

function ask(body: Record<string, unknown>) {
  return POST(
    new Request("http://chat.example/hangout/api/integrations/musicwatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify(body),
    }),
  );
}
const json = async (response: Response) => (await response.json()) as { error?: string; url?: string };
const sent = (call = 0) => JSON.parse(botFetch.mock.calls[call][2]?.body || "{}");

beforeEach(() => {
  state.user = {
    id: "u1", display_name: "Ana", avatar: "🦊", avatar_url: "/hangout/api/uploads/a.png", color: "#7c5cbf",
  };
  state.channel = { id: "lounge", name: "Lounge", kind: "voice", server_id: "s1" };
  state.member = true;
  state.perms = new Set();
  state.bot = true;
  state.startedBy = null;
  state.overwrites = null;
  botFetch.mockReset();
  botFetch.mockResolvedValue({ ticket: "T1", room: "wh_lounge", path: "/watch/" });
});

describe("Watch and Reels Together tickets", () => {
  it("needs someone signed in who may join that voice room", async () => {
    state.user = null;
    expect((await ask({ channelId: "lounge" })).status).toBe(401);
    state.user = { id: "u1", display_name: "Ana", avatar: "A", color: "#000" };
    state.member = false;
    expect((await ask({ channelId: "lounge" })).status).toBe(403);
    state.member = true;
    state.overwrites = 2;          // may see the room, may not connect
    expect((await ask({ channelId: "lounge" })).status).toBe(403);
    state.overwrites = 3;          // may see it and connect
    expect((await ask({ channelId: "lounge" })).status).toBe(200);
    state.overwrites = null;
    state.channel = { id: "general", name: "general", kind: "text", server_id: "s1" };
    expect((await ask({ channelId: "general" })).status).toBe(403);
    expect(botFetch).toHaveBeenCalledTimes(1);
  });

  it("is not there without the Music Bot", async () => {
    state.bot = false;
    const response = await ask({ channelId: "lounge" });
    expect(response.status).toBe(409);
    expect((await json(response)).error).toMatch(/Music Bot/);
    expect(botFetch).not.toHaveBeenCalled();
  });

  it("hands each member their own link with who they are", async () => {
    const response = await ask({ channelId: "lounge", mode: "watch" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://chat.example/watch/?room=wh_lounge#ticket=T1", mode: "watch" });
    expect(botFetch.mock.calls[0][0]).toBe("/api/admin/watch-ticket");
    expect(sent()).toEqual({
      mode: "watch",
      channel_id: "lounge",
      room_name: "Lounge",
      user: { id: "u1", name: "Ana", avatar: "🦊", avatar_url: "https://chat.example/hangout/api/uploads/a.png", color: "#7c5cbf" },
      host: false,
      moderator: false,
    });
  });

  it("makes whoever started it the host, and server moderators its moderators", async () => {
    state.startedBy = "u1";
    state.perms = new Set(["moderate"]);
    botFetch.mockResolvedValue({ ticket: "T2", room: "rh_lounge", path: "/watch/reels" });
    const response = await ask({ channelId: "lounge", mode: "reels" });
    expect((await json(response)).url).toBe("https://chat.example/watch/reels?room=rh_lounge#ticket=T2");
    expect(sent()).toMatchObject({ mode: "reels", host: true, moderator: true });
  });

  it("queues a link on Watch Together and seeds Reels Together", async () => {
    botFetch.mockResolvedValue({ ok: true });
    await ask({ channelId: "lounge", action: "add", q: "https://youtu.be/abc" });
    expect(botFetch.mock.calls[0][0]).toBe("/api/admin/watch-command");
    expect(sent(0)).toMatchObject({ mode: "watch", action: "add", q: "https://youtu.be/abc", channel_id: "lounge" });
    await ask({ channelId: "lounge", action: "seed", q: "cats" });
    expect(sent(1)).toMatchObject({ mode: "reels", action: "seed", q: "cats" });
    expect((await ask({ channelId: "lounge", action: "add", q: "  " })).status).toBe(400);
  });

  it("says what went wrong when the bot is down", async () => {
    botFetch.mockRejectedValue(new Error("Music dashboard login failed."));
    const response = await ask({ channelId: "lounge" });
    expect(response.status).toBe(502);
    expect((await json(response)).error).toBe("Music dashboard login failed.");
  });
});
