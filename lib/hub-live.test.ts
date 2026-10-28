import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";
import { heard, type PlayerState } from "./protocol";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
const djControl = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("./musicbot", () => ({ djControl }));
afterEach(() => vi.unstubAllGlobals());

function room() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const attachment = { connectionId: "c1", userId: "u1", voiceChannelId: "room", muted: false, deafened: false, important: false };
  const socket = {
    readyState: 1,
    deserializeAttachment: () => ({ ...attachment }),
    serializeAttachment: vi.fn(),
    send: vi.fn(),
  };
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [socket],
    storage: {
      get: vi.fn(async () => undefined), put: vi.fn(async () => undefined),
      getAlarm: vi.fn(async () => null), setAlarm: vi.fn(async () => undefined),
    },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const send = (event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  return { hub, send };
}

const track = {
  id: "hub-1", title: "Hard To Explain", artist: "The Strokes", thumbnail: null,
  duration: 200, audioUrl: "https://example.com/a.mp3", pageUrl: null, requestedBy: "u1",
};
const live = {
  id: "dj:A:1", title: "Youngblood", artist: "5 Seconds of Summer", thumbnail: null,
  duration: 230, positionMs: 42_000, paused: false, source: "dj" as const,
};

it("shows the DJ booth's track while it is on air, with no local audio", async () => {
  const { hub } = room();
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.applyPlayerAction("room", { name: "pause" });
  const state = await hub.applyPlayerAction("room", { name: "live", live });
  expect(state.track?.id).toBe("hub-1");             // the hub's own track waits underneath
  const view = heard(state);
  expect(view.track?.title).toBe("Youngblood");
  expect(view.track?.audioUrl).toBe("");
  expect(view.paused).toBe(false);
  expect(view.positionMs).toBe(42_000);

  const back = await hub.applyPlayerAction("room", { name: "live", live: null });
  expect(heard(back).track?.id).toBe("hub-1");
  expect(heard(back).paused).toBe(true);
});

it("ignores listeners' transport controls while the booth is on air", async () => {
  const { hub, send } = room();
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.applyPlayerAction("room", { name: "pause" });
  await hub.applyPlayerAction("room", { name: "live", live });
  await send({ t: "player", channelId: "room", action: { name: "toggle" } });
  await send({ t: "player", channelId: "room", action: { name: "skip" } });
  const state = await hub.applyPlayerAction("room", { name: "volume", volume: 50 });
  expect(state.paused).toBe(true);
  expect(state.track?.id).toBe("hub-1");
  expect((state as PlayerState).volume).toBe(50);
});

it("forgets a booth that stopped reporting", async () => {
  const { hub } = room();
  await hub.applyPlayerAction("room", { name: "play", track });
  const state = await hub.applyPlayerAction("room", { name: "live", live });
  expect(heard(state).track?.title).toBe("Youngblood");
  expect(heard(state, Date.now() + 121_000).track?.id).toBe("hub-1");
});

it("stop ends the DJ set as well as the room's own queue", async () => {
  const { hub, send } = room();
  djControl.mockClear();
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.applyPlayerAction("room", { name: "play", track: { ...track, id: "hub-2" } });
  await hub.applyPlayerAction("room", { name: "live", live });
  await send({ t: "player", channelId: "room", action: { name: "stop" } });
  const state = await hub.applyPlayerAction("room", { name: "volume", volume: 50 });
  expect(state.live).toBeNull();
  expect(state.track).toBeNull();
  expect(state.queue).toEqual([]);
  expect(heard(state).track).toBeNull();
  expect(djControl).toHaveBeenCalledWith("room", "stop");
});

it("tags /playnext for the DJ booth, and carries the booth's key to the singing voice", async () => {
  const { hub } = room();
  await hub.applyPlayerAction("room", { name: "play", track });
  let state = await hub.applyPlayerAction("room", { name: "playnext", track: { ...track, id: "hub-2" } });
  expect(state.queue[0].playNext).toBe(true);
  // The bot putting a bumped song back keeps it untagged.
  state = await hub.applyPlayerAction("room", { name: "playnext", track: { ...track, id: "hub-3", playNext: false } });
  expect(state.queue.map((t) => [t.id, t.playNext])).toEqual([["hub-3", false], ["hub-2", true]]);

  state = await hub.applyPlayerAction("room", { name: "live", live: { ...live, key: "8A", keyShift: 0.3 } });
  expect(heard(state).track?.key).toBe("8A");
  expect(heard(state).track?.keyShift).toBe(0.3);
});
