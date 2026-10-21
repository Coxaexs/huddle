import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/bot/servers keeps the server list for 10 s; voice state stays live.

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/storage", () => ({ bindings: () => ({ BOT_TOKEN: "t", DB: {} }) }));

const listServers = vi.fn();
vi.mock("@/lib/servers", () => ({ listServers: (...args: unknown[]) => listServers(...args) }));

let voice: Record<string, Array<{ id: string; displayName: string }>> = {};
vi.mock("@/lib/hub-client", () => ({
  hubState: vi.fn(async () => ({ online: [], voice, players: {}, recordings: {}, serverNow: Date.now() })),
}));

import { GET, resetBotServerCache } from "@/app/api/bot/servers/route";

const server = {
  id: "hangout",
  name: "The Hangout",
  icon: "HG",
  channels: [
    { id: "general", name: "general", kind: "text" },
    { id: "lounge", name: "Lounge", kind: "voice" },
  ],
};

function poll() {
  return GET(new Request("http://x/api/bot/servers", { headers: { authorization: "Bearer t" } }));
}

describe("bot server list cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBotServerCache();
    listServers.mockReset();
    listServers.mockResolvedValue([server]);
    voice = {};
  });
  afterEach(() => vi.useRealTimers());

  it("reads the servers once per 10 s but reports voice members on every poll", async () => {
    await poll();
    voice = { lounge: [{ id: "u1", displayName: "mewis" }] };
    const body = (await (await poll()).json()) as {
      servers: Array<{ voiceChannels: Array<{ members: unknown }> }>;
    };
    expect(listServers).toHaveBeenCalledTimes(1);
    expect(body.servers[0].voiceChannels[0].members).toEqual([{ id: "u1", name: "mewis", bot: false }]);

    vi.advanceTimersByTime(10_000);
    await poll();
    expect(listServers).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed read", async () => {
    listServers.mockRejectedValueOnce(new Error("D1 busy"));
    await expect(poll()).rejects.toThrow("D1 busy");
    await poll();
    expect(listServers).toHaveBeenCalledTimes(2);
  });

  it("still refuses a wrong token before touching the database", async () => {
    const response = await GET(new Request("http://x/api/bot/servers", { headers: { authorization: "Bearer no" } }));
    expect(response.status).toBe(401);
    expect(listServers).not.toHaveBeenCalled();
  });
});
