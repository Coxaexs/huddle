import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A room shard: the music bot's feed, a dancer, someone at the bar who never opened the club, and a dancer in another room. */
function club() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (fields: Record<string, unknown>) => {
    let attachment = { displayName: String(fields.userId), muted: false, deafened: false, bot: false, ...fields };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const feed = seat({ connectionId: "c-feed", userId: "bot:music", bot: true, feed: true, channelId: "room", voiceChannelId: null });
  const dancer = seat({ connectionId: "c-dancer", userId: "u-dancer", voiceChannelId: "room" });
  const sitter = seat({ connectionId: "c-sitter", userId: "u-sitter", voiceChannelId: "room" });
  const elsewhere = seat({ connectionId: "c-else", userId: "u-else", voiceChannelId: "other", clubWatch: true });
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: () => [feed, dancer, sitter, elsewhere],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const say = (socket: typeof feed, event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const got = (socket: typeof feed, t: string) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter((event) => event.t === t);
  return { feed, dancer, sitter, elsewhere, say, got };
}

const batch = { t: "club", at: 1_000, f: btoa("ÿ\u0000\u0080\u0000@À"), b: 4.5, bpm: 124, stems: true };

it("tells the feed nobody is watching, then wakes it when someone opens the club", async () => {
  const { feed, dancer, sitter, say, got } = club();
  await say(feed, batch);
  expect(got(feed, "club-idle")).toHaveLength(1);
  expect(got(dancer, "club")).toEqual([]);
  await say(dancer, { t: "club-watch", on: true });
  expect(got(feed, "club-wake")).toHaveLength(1);
  await say(feed, { ...batch, extra: "dropped" });
  const [event] = got(dancer, "club");
  expect(event).toMatchObject({ channelId: "room", at: 1_000, f: batch.f, b: 4.5, bpm: 124, stems: true });
  expect(event.extra).toBeUndefined();
  // Only the room's watchers: not the person at the bar, and not a club in another room.
  expect(got(sitter, "club")).toEqual([]);
  await say(dancer, { t: "club-watch", on: false });
  await say(feed, batch);
  expect(got(dancer, "club")).toHaveLength(1);
});

it("takes light only from the music bot's feed socket", async () => {
  const { dancer, sitter, elsewhere, say, got } = club();
  await say(dancer, { t: "club-watch", on: true });
  await say(sitter, batch);
  await say(elsewhere, batch);
  expect(got(dancer, "club")).toEqual([]);
});

it("caps the feed at thirty batches a second", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(9_000_000);
  const { feed, dancer, say, got } = club();
  await say(dancer, { t: "club-watch", on: true });
  for (let i = 0; i < 40; i++) await say(feed, { ...batch, at: 1_000 + i });
  expect(got(dancer, "club")).toHaveLength(30);
  vi.setSystemTime(9_001_000);
  await say(feed, batch);
  expect(got(dancer, "club")).toHaveLength(31);
});
