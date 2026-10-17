import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";
import { LONG_HISTORY_LIMIT, type Track } from "./protocol";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => vi.unstubAllGlobals());

function room() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const stored = new Map<string, unknown>();
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [],
    storage: {
      get: vi.fn(async (key: string) => stored.get(key)),
      put: vi.fn(async (key: string, value: unknown) => void stored.set(key, value)),
      getAlarm: vi.fn(async () => null), setAlarm: vi.fn(async () => undefined),
    },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  return { hub, stored };
}

const song = (n: number): Track => ({
  id: `t${n}`, title: `Song ${n}`, artist: "Band", thumbnail: null, duration: 180,
  audioUrl: "https://example.com/a.mp3", pageUrl: null, requestedBy: "u1",
});

async function longHistory(hub: HuddleHub) {
  const response = await hub.fetch(new Request("https://hub/player-history?channelId=room"));
  return ((await response.json()) as { history: Array<{ title: string }> }).history;
}

it("keeps up to 250 plays for /longhistory while /history stays at 25", async () => {
  const { hub, stored } = room();
  await hub.applyPlayerAction("room", { name: "play", track: song(0) });
  for (let n = 1; n <= LONG_HISTORY_LIMIT + 20; n++) {
    await hub.applyPlayerAction("room", { name: "play", track: song(n) });
    const state = await hub.applyPlayerAction("room", { name: "skip" });
    expect(state.track?.id).toBe(`t${n}`);
  }
  const state = await hub.applyPlayerAction("room", { name: "skip" });
  expect(state.history).toHaveLength(25);
  expect("longHistory" in state).toBe(false); // never rides along on player broadcasts

  const played = await longHistory(hub);
  expect(played).toHaveLength(LONG_HISTORY_LIMIT);
  expect(played[0].title).toBe(`Song ${LONG_HISTORY_LIMIT + 20}`);
  expect(stored.get("longHistory")).toBeTruthy();
});

it("reads the long history back after the hub wakes up", async () => {
  const first = room();
  await first.hub.applyPlayerAction("room", { name: "play", track: song(1) });
  await first.hub.applyPlayerAction("room", { name: "skip" });

  const again = room();
  for (const [key, value] of first.stored) again.stored.set(key, value);
  expect((await longHistory(again.hub)).map((t) => t.title)).toEqual(["Song 1"]);
});
