import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => vi.unstubAllGlobals());

/** A tiny D1 stand-in: answers the few queries the hub makes from fixed tables. */
function fakeDb() {
  const channels: Record<string, { kind: string; server_id: string }> = {
    "a-text": { kind: "text", server_id: "server-a" },
    "a-voice": { kind: "voice", server_id: "server-a" },
    "b-voice": { kind: "voice", server_id: "server-b" },
    "dm-1": { kind: "dm", server_id: "dm" },
  };
  const members = [
    { user_id: "alice", server_id: "server-a" },
    { user_id: "bob", server_id: "server-a" },
    { user_id: "eve", server_id: "server-b" },
  ];
  const dmMembers = [{ channel_id: "dm-1", user_id: "alice" }, { channel_id: "dm-1", user_id: "bob" }];
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first() {
          if (sql.includes("FROM channels")) return channels[String(args[0])] ?? null;
          if (sql.includes("FROM bans")) return null;
          if (sql.includes("FROM friendships")) return null;
          return null;
        },
        async all() {
          if (sql.includes("FROM server_members")) {
            return { results: members.filter((row) => args.includes(row.user_id)) };
          }
          if (sql.includes("FROM dm_members")) {
            return { results: dmMembers.filter((row) => row.channel_id === args[0]) };
          }
          return { results: [] };
        },
        async run() {
          return {};
        },
      };
      return statement;
    },
  };
}

function hubWith(people: Array<{ connectionId: string; userId: string; voiceChannelId?: string | null }>) {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const sockets = people.map((person) => {
    let attachment = {
      username: person.userId, displayName: person.userId, avatar: "x", avatarUrl: null, color: "#fff",
      channelId: null, voiceJoinedAt: null, muted: false, deafened: false, cameraStreamId: null,
      screenStreamId: null, bot: false, recorder: false, voiceChannelId: null as string | null,
      ...person,
    };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
      get attachment() { return attachment; },
    };
  });
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: (tag?: string) => (tag ? [] : sockets),
    waitUntil: vi.fn(),
    storage: {
      get: vi.fn(async () => undefined), put: vi.fn(async () => undefined),
      getAlarm: vi.fn(async () => null), setAlarm: vi.fn(async () => undefined),
    },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, { DB: fakeDb() });
  const byId = Object.fromEntries(sockets.map((socket) => [socket.attachment.userId, socket]));
  const sent = (userId: string) =>
    byId[userId].send.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));
  const act = (userId: string, event: object) =>
    hub.webSocketMessage(byId[userId] as unknown as WebSocket, JSON.stringify(event));
  return { hub, sent, act, byId };
}

it("delivers a server's messages only to that server's members", async () => {
  const { hub, sent } = hubWith([
    { connectionId: "c-alice", userId: "alice" },
    { connectionId: "c-eve", userId: "eve" },
  ]);
  await hub.fetch(new Request("https://huddle.hub/broadcast", {
    method: "POST",
    body: JSON.stringify({ channelId: "a-text", message: { id: "m1", text: "secret" } }),
  }));
  expect(sent("alice").some((event) => event.t === "message")).toBe(true);
  expect(sent("eve").some((event) => event.t === "message")).toBe(false);
});

it("keeps DM traffic to the DM's participants even with no audience passed", async () => {
  const { hub, sent } = hubWith([
    { connectionId: "c-alice", userId: "alice" },
    { connectionId: "c-eve", userId: "eve" },
  ]);
  await hub.fetch(new Request("https://huddle.hub/event", {
    method: "POST",
    body: JSON.stringify({ channelId: "dm-1", event: { t: "message-deleted", id: "m1" } }),
  }));
  expect(sent("alice").some((event) => event.t === "message-deleted")).toBe(true);
  expect(sent("eve").some((event) => event.t === "message-deleted")).toBe(false);
});

it("refuses a voice seat in a server you are not in", async () => {
  const { act, sent, byId } = hubWith([{ connectionId: "c-eve", userId: "eve" }]);
  await act("eve", { t: "voice-join", channelId: "a-voice" });
  expect(byId.eve.attachment.voiceChannelId).toBe(null);
  expect(sent("eve").some((event) => event.t === "voice-evicted")).toBe(true);
});

it("only relays WebRTC signals between seats in the same room", async () => {
  const { act, sent } = hubWith([
    { connectionId: "c-alice", userId: "alice", voiceChannelId: "a-voice" },
    { connectionId: "c-bob", userId: "bob", voiceChannelId: "a-voice" },
    { connectionId: "c-eve", userId: "eve", voiceChannelId: "b-voice" },
  ]);
  await act("eve", { t: "signal", to: "c-alice", data: { kind: "offer" } });
  expect(sent("alice").some((event) => event.t === "signal")).toBe(false);
  await act("bob", { t: "signal", to: "c-alice", data: { kind: "offer" } });
  expect(sent("alice").some((event) => event.t === "signal")).toBe(true);
});

it("ignores player commands from someone outside the room", async () => {
  const { act, sent } = hubWith([
    { connectionId: "c-alice", userId: "alice", voiceChannelId: "a-voice" },
    { connectionId: "c-bob", userId: "bob" },
  ]);
  await act("bob", { t: "player", channelId: "a-voice", action: { name: "stop" } });
  expect(sent("alice").some((event) => event.t === "player")).toBe(false);
});
