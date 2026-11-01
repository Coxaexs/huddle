import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { setBindings } from "@/lib/storage";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  currentUser: vi.fn(),
  unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));

vi.mock("@/lib/dms", () => ({
  isDmMember: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/servers", () => ({
  findChannel: vi.fn().mockResolvedValue({ id: "v1", server_id: "s1" }),
  isServerMember: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/hub-client", () => ({
  hubState: vi.fn().mockResolvedValue(null),
  watchLiveKit: vi.fn().mockResolvedValue(undefined),
}));

import { currentUser } from "@/lib/auth";
import { hubState } from "@/lib/hub-client";
import { discordBridgeToken } from "@/lib/bot-auth";

beforeEach(() => {
  setBindings({
    LIVEKIT_URL: "wss://test.livekit.local",
    LIVEKIT_API_KEY: "testkey",
    LIVEKIT_API_SECRET: "testsecret1234567890123456789012",
  });
});

afterEach(() => {
  setBindings(null);
  vi.clearAllMocks();
});

it("returns enabled: false when LiveKit is not configured", async () => {
  setBindings({});
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { enabled?: boolean };
  expect(data.enabled).toBe(false);
});

it("rejects unauthenticated requests", async () => {
  vi.mocked(currentUser).mockResolvedValue(null);
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(401);
});

it("validates channelId presence", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/hangout/api/voice/token"));
  expect(res.status).toBe(400);
});

it("mints an authenticated LiveKit token when valid", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/hangout/api/voice/token?channelId=v1"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as Record<string, unknown>;
  expect(data.enabled).toBe(true);
  expect(data.url).toBe("wss://test.livekit.local");
  expect(typeof data.token).toBe("string");
  expect(data.identity).toBe("u1");
  expect(data.room).toBe("v1");
});

it("binds the identity to the user and their hub connection", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const ok = await GET(new Request("http://localhost/api/voice/token?channelId=v1&connectionId=3f2a-b9"));
  const bad = await GET(new Request("http://localhost/api/voice/token?channelId=v1&connectionId=u2|x"));
  expect(bad.status).toBe(400);
});

it("mints token for Germany when region=de is explicitly requested", async () => {
  setBindings({
    LIVEKIT_URL: "wss://test.livekit.local",
    LIVEKIT_URL_DE: "wss://test-de.livekit.local",
    LIVEKIT_API_KEY: "testkey",
    LIVEKIT_API_SECRET: "testsecret1234567890123456789012",
  });
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/api/voice/token?channelId=v1&region=de"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { enabled?: boolean; url?: string; region?: string };
  expect(data.enabled).toBe(true);
  expect(data.url).toBe("wss://test-de.livekit.local");
  expect(data.region).toBe("de");
});

it("respects channel rtc_region configuration", async () => {
  const { findChannel } = await import("@/lib/servers");
  vi.mocked(findChannel).mockResolvedValueOnce({
    id: "v1",
    server_id: "s1",
    rtc_region: "de",
  } as any);

  setBindings({
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          // The channel's permission overwrites: none.
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    } as any,
    LIVEKIT_URL: "wss://test.livekit.local",
    LIVEKIT_URL_DE: "wss://test-de.livekit.local",
    LIVEKIT_API_KEY: "testkey",
    LIVEKIT_API_SECRET: "testsecret1234567890123456789012",
  });
  vi.mocked(currentUser).mockResolvedValue({
    id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar: "",
    color: "#ffffff",
    is_admin: 0,
    created_at: "",
    last_seen_at: "",
  });
  const res = await GET(new Request("http://localhost/api/voice/token?channelId=v1"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { enabled?: boolean; url?: string; region?: string };
  expect(data.enabled).toBe(true);
  expect(data.url).toBe("wss://test-de.livekit.local");
  expect(data.region).toBe("de");
});

function claims(token: string): Record<string, any> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

it("gives the Discord bridge a token only for a Discord seat it holds, microphone only", async () => {
  setBindings({
    LIVEKIT_URL: "wss://test.livekit.local",
    LIVEKIT_API_KEY: "testkey",
    LIVEKIT_API_SECRET: "testsecret1234567890123456789012",
    BOT_TOKEN: "master-token",
  });
  vi.mocked(currentUser).mockResolvedValue(null);
  const seat = (extra: Record<string, unknown>) => ({
    connectionId: "c-discord",
    id: "discord:888888888888",
    username: "Ayşe",
    displayName: "Ayşe",
    avatar: "A",
    color: "#5865f2",
    joinedAt: 1,
    muted: false,
    deafened: false,
    sfu: true,
    discord: true,
    speakAllowed: true,
    ...extra,
  });
  vi.mocked(hubState).mockResolvedValue({
    online: [],
    voice: { v1: [seat({}), seat({ connectionId: "c-member", id: "u1", discord: undefined })] },
    players: {},
    recordings: {},
    serverNow: 0,
  } as never);
  const auth = { authorization: `Bot ${await discordBridgeToken("master-token")}` };
  const ask = (query: string, headers: Record<string, string> = auth) =>
    GET(new Request(`http://localhost/hangout/api/voice/token?${query}`, { headers }));

  const res = await ask("channelId=v1&connectionId=c-discord");
  expect(res.status).toBe(200);
  const data = (await res.json()) as { token: string; identity: string };
  expect(data.identity).toBe("discord:888888888888|c-discord");
  const grant = claims(data.token).video;
  expect(grant).toMatchObject({ room: "v1", roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
  expect(grant.canPublishSources).toEqual(["microphone"]);

  // Someone else's seat, a seat in another room, a wrong token: no.
  expect((await ask("channelId=v1&connectionId=c-member")).status).toBe(403);
  expect((await ask("channelId=v2&connectionId=c-discord")).status).toBe(403);
  expect((await ask("channelId=v1&connectionId=c-discord", { authorization: "Bot hfl_bridge_nope" })).status).toBe(401);

  // A seat that may not be heard gets a listen-only token.
  vi.mocked(hubState).mockResolvedValue({
    online: [],
    voice: { v1: [seat({ serverMuted: true })] },
    players: {},
    recordings: {},
    serverNow: 0,
  } as never);
  const muted = (await (await ask("channelId=v1&connectionId=c-discord")).json()) as { token: string };
  expect(claims(muted.token).video.canPublish).toBe(false);
});
