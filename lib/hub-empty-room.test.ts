import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EMPTY_ROOM_STOP_MS, HuddleHub } from "./hub";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
const djControl = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("./musicbot", () => ({ djControl }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  djControl.mockClear();
});

interface Seat {
  connectionId: string;
  userId: string;
  voiceChannelId: string | null;
  bot?: boolean;
  recorder?: boolean;
  bridge?: boolean;
  discord?: boolean;
}

/** A hub whose open sockets are whatever `seats` holds at the time. */
function hubWith(seats: Seat[]) {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const socketFor = (seat: Seat) => ({
    readyState: 1,
    deserializeAttachment: () => ({ muted: false, deafened: false, important: false, ...seat }),
    serializeAttachment: vi.fn(),
    send: vi.fn(),
  });
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: () => seats.map(socketFor),
    storage: {
      get: vi.fn(async () => undefined), put: vi.fn(async () => undefined),
      getAlarm: vi.fn(async () => null), setAlarm: vi.fn(async () => undefined),
    },
  };
  return new HuddleHub(ctx as unknown as DurableObjectState, {});
}

const track = {
  id: "t1", title: "Hard To Explain", artist: "The Strokes", thumbnail: null,
  duration: 3600, audioUrl: "https://example.com/a.mp3", pageUrl: null, requestedBy: "u1",
};
const live = {
  id: "dj:A:1", title: "Youngblood", artist: "5 Seconds of Summer", thumbnail: null,
  duration: 230, positionMs: 0, paused: false, source: "dj" as const,
};
const bot: Seat = { connectionId: "bot", userId: "music", voiceChannelId: "room", bot: true };
const person: Seat = { connectionId: "c1", userId: "u1", voiceChannelId: "room" };

/** The room's player, read through a harmless action. */
const playing = async (hub: HuddleHub) =>
  (await hub.applyPlayerAction("room", { name: "volume", volume: 80 })).track?.id ?? null;

it("stops the music five minutes after the last person leaves", async () => {
  const seats: Seat[] = [person, bot];
  const hub = hubWith(seats);
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.applyPlayerAction("room", { name: "play", track: { ...track, id: "t2" } });
  seats.splice(0, 1); // only the bot's own seat is left
  await hub.alarm();
  vi.advanceTimersByTime(EMPTY_ROOM_STOP_MS - 10_000);
  await hub.alarm();
  expect(await playing(hub)).toBe("t1");
  vi.advanceTimersByTime(20_000);
  await hub.alarm();
  const state = await hub.applyPlayerAction("room", { name: "volume", volume: 80 });
  expect(state.track).toBeNull();
  expect(state.queue).toEqual([]);
});

it("keeps playing while someone listens, a Discord person on the bridge included", async () => {
  const seats: Seat[] = [bot, { connectionId: "d1", userId: "discord:1", voiceChannelId: "room", bridge: true, discord: true }];
  const hub = hubWith(seats);
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.alarm();
  vi.advanceTimersByTime(EMPTY_ROOM_STOP_MS * 2);
  await hub.alarm();
  expect(await playing(hub)).toBe("t1");
});

it("starts over when someone drops by; a recorder is nobody", async () => {
  const seats: Seat[] = [bot, { connectionId: "r1", userId: "rec", voiceChannelId: "room", recorder: true }];
  const hub = hubWith(seats);
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.alarm();
  vi.advanceTimersByTime(EMPTY_ROOM_STOP_MS - 60_000);
  seats.push(person);
  await hub.alarm(); // someone is back: the clock clears
  seats.pop();
  vi.advanceTimersByTime(60_000);
  await hub.alarm(); // empty again: five new minutes start here
  vi.advanceTimersByTime(EMPTY_ROOM_STOP_MS - 10_000);
  await hub.alarm();
  expect(await playing(hub)).toBe("t1");
  vi.advanceTimersByTime(20_000);
  await hub.alarm();
  expect(await playing(hub)).toBeNull();
});

it("ends a DJ set playing to an empty room", async () => {
  const hub = hubWith([bot]);
  await hub.applyPlayerAction("room", { name: "play", track });
  await hub.applyPlayerAction("room", { name: "live", live });
  await hub.alarm();
  vi.advanceTimersByTime(EMPTY_ROOM_STOP_MS + 1000);
  await hub.applyPlayerAction("room", { name: "live", live }); // the booth keeps reporting
  await hub.alarm();
  expect(djControl).toHaveBeenCalledWith("room", "stop");
  expect(await playing(hub)).toBeNull();
});
