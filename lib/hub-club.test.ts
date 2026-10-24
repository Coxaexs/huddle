import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";
import { DEFAULT_DESK } from "./club-desk";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A room shard: the music bot's feed, a dancer, someone at the bar who never opened the club, and a dancer in another room. */
function club(poses: { dancer?: object; sitter?: object } = {}) {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (fields: Record<string, unknown>) => {
    let attachment = { displayName: String(fields.userId), muted: false, deafened: false, bot: false, shard: true, ...fields };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const feed = seat({ connectionId: "c-feed", userId: "bot:music", bot: true, feed: true, channelId: "room", voiceChannelId: null });
  const dancer = seat({ connectionId: "c-dancer", userId: "u-dancer", voiceChannelId: "room", lounge: poses.dancer ?? null });
  const sitter = seat({ connectionId: "c-sitter", userId: "u-sitter", voiceChannelId: "room", lounge: poses.sitter ?? null });
  const elsewhere = seat({ connectionId: "c-else", userId: "u-else", voiceChannelId: "other", clubWatch: true });
  const kept = new Map<string, unknown>();
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: () => [feed, dancer, sitter, elsewhere],
    storage: { get: vi.fn(async (key: string) => kept.get(key)), put: vi.fn(async (key: string, value: unknown) => { kept.set(key, value); }) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const say = (socket: typeof feed, event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const got = (socket: typeof feed, t: string) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter((event) => event.t === t);
  return { feed, dancer, sitter, elsewhere, say, got };
}

const batch = { t: "club", at: 1_000, f: btoa("ÿ\u0000\u0080\u0000@À"), n: btoa("\u009a\u0031\u0045"), b: 4.5, bpm: 124, stems: true };

it("tells the feed nobody is watching, then wakes it when someone opens the club", async () => {
  const { feed, dancer, sitter, say, got } = club();
  await say(feed, batch);
  expect(got(feed, "club-idle")).toHaveLength(1);
  expect(got(dancer, "club")).toEqual([]);
  await say(dancer, { t: "club-watch", on: true });
  expect(got(feed, "club-wake")).toHaveLength(1);
  await say(feed, { ...batch, extra: "dropped" });
  const [event] = got(dancer, "club");
  expect(event).toMatchObject({ channelId: "room", at: 1_000, f: batch.f, n: batch.n, b: 4.5, bpm: 124, stems: true });
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

const atDecks = { x: 0, z: -4, facing: 0, seat: "club-dj", venue: "club" };
const desk = { ...DEFAULT_DESK, scene: "custom", master: 0.4, colour: "pick", hue: 0.3, laserFx: "sheet" };

it("lets anyone run the light desk while the decks are free, and keeps it for whoever opens the club later", async () => {
  const { feed, dancer, sitter, elsewhere, say, got } = club();
  await say(sitter, { t: "club-desk", desk: { ...desk, master: 7, extra: "no" } });
  // The room has it, cleaned; the sender already does (an echo would drag a moving slider back).
  const [heard] = got(dancer, "club-desk");
  expect(heard).toMatchObject({ channelId: "room", by: "u-sitter", desk: { ...desk, master: 1 } });
  expect(heard.desk.extra).toBeUndefined();
  expect(got(sitter, "club-desk")).toEqual([]);
  expect(got(feed, "club-desk")).toEqual([]);
  expect(got(elsewhere, "club-desk")).toEqual([]);
  // Opening the club later: the desk as the room left it.
  await say(dancer, { t: "club-watch", on: true });
  expect(got(dancer, "club-desk").at(-1)).toMatchObject({ desk: { master: 1, laserFx: "sheet" }, by: "u-sitter" });
  await say(dancer, { t: "club-fx", fx: { thing: "confetti" } });
  expect(got(sitter, "club-fx")).toEqual([expect.objectContaining({ channelId: "room", fx: { thing: "confetti" } })]);
  await say(dancer, { t: "club-fx", fx: { thing: "fireworks" } });
  expect(got(sitter, "club-fx")).toHaveLength(1);
});

it("gives the light desk to the DJ alone once someone is at the decks", async () => {
  const { dancer, sitter, say, got } = club({ dancer: atDecks, sitter: { ...atDecks, seat: "club-bar-1" } });
  await say(dancer, { t: "club-desk", desk });
  expect(got(sitter, "club-desk")).toHaveLength(1);
  // Someone at the bar moves a fader: not the room's, and their own desk is put back.
  await say(sitter, { t: "club-desk", desk: { ...desk, master: 1 } });
  expect(got(dancer, "club-desk")).toEqual([]);
  expect(got(sitter, "club-desk").at(-1)).toMatchObject({ desk: { master: 0.4 }, by: "u-dancer" });
  await say(sitter, { t: "club-fx", fx: { thing: "blackout", on: true } });
  expect(got(dancer, "club-fx")).toEqual([]);
  await say(dancer, { t: "club-fx", fx: { thing: "blackout", on: true } });
  expect(got(sitter, "club-fx")).toEqual([expect.objectContaining({ fx: { thing: "blackout", on: true } })]);
});

it("puts a refused desk back to the default when the room never set one", async () => {
  const { dancer, sitter, say, got } = club({ dancer: atDecks });
  await say(sitter, { t: "club-desk", desk });
  expect(got(sitter, "club-desk")).toEqual([expect.objectContaining({ desk: DEFAULT_DESK, by: null })]);
  expect(got(dancer, "club-desk")).toEqual([]);
});

it("caps the light desk at sixteen messages a second", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(9_000_000);
  const { dancer, sitter, say, got } = club();
  for (let i = 0; i < 24; i++) await say(sitter, { t: "club-desk", desk: { ...desk, master: i / 100 } });
  expect(got(dancer, "club-desk")).toHaveLength(16);
});

it("tells a newcomer who is where from the room's shard, the DJ at the decks included", async () => {
  const { dancer, sitter, say, got } = club({ dancer: atDecks });
  await say(sitter, { t: "lounge-sync" });
  const [state] = got(sitter, "lounge-state");
  expect(state).toMatchObject({ channelId: "room", shard: true, poses: [{ connectionId: "c-dancer", pose: atDecks }] });
  // Not the venue or shared state: those are the main hub's to tell.
  expect(state.venue).toBeUndefined();
  expect(state.shared).toBeUndefined();
  expect(got(dancer, "lounge-state")).toEqual([]);
});

it("passes More / Chill and the club's cheers to the DJ, and nothing from outside the club", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(9_000_000);
  const { feed, dancer, sitter, say, got } = club();
  await say(dancer, { t: "club-watch", on: true });
  await say(dancer, { t: "club-crowd", kind: "more" });
  await say(dancer, { t: "club-crowd", kind: "hype" });
  await say(sitter, { t: "club-crowd", kind: "chill" });
  expect(got(feed, "club-crowd")).toEqual([{ t: "club-crowd", kind: "more", by: "c-dancer", people: 1 }]);
  const pose = { t: "lounge", x: 0, z: 0, facing: 0, seat: null, venue: "club" };
  await say(dancer, { ...pose, emote: "🔥" });
  await say(dancer, { ...pose, emote: "😂" });
  await say(sitter, { ...pose, emote: "🎉" });
  expect(got(feed, "club-crowd").map((event) => event.kind)).toEqual(["more", "cheer"]);
  // Four a second each, however fast someone taps.
  for (let i = 0; i < 6; i++) await say(dancer, { ...pose, emote: "👏" });
  expect(got(feed, "club-crowd")).toHaveLength(4);
});

it("carries what the crowd said to the DJ back to the club bar", async () => {
  const { feed, dancer, say, got } = club();
  await say(dancer, { t: "club-watch", on: true });
  await say(feed, { ...batch, info: { mode: "real", vibe: "hype", crowd: { more: 2, chill: -3, said: "drop", extra: 1 } } });
  await say(feed, { ...batch, info: { mode: "real", crowd: { more: 1, said: "louder" } } });
  const [first, second] = got(dancer, "club");
  expect(first.info).toMatchObject({ mode: "real", vibe: "hype", crowd: { more: 2, chill: 0, said: "drop" } });
  expect(first.info.crowd.extra).toBeUndefined();
  expect(second.info.crowd).toEqual({ more: 1, chill: 0, said: null });
});
