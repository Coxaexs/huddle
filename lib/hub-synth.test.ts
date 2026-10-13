import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";
import { SYNTH_HUB_BUDGET } from "./gesture-synth";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A player and a listener in "room", and a bystander in another room. */
function rooms() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (connectionId: string, userId: string, voiceChannelId: string) => {
    let attachment = { connectionId, userId, displayName: userId, voiceChannelId, muted: false, deafened: false, important: false };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const player = seat("c-player", "u-player", "room");
  const listener = seat("c-listener", "u-listener", "room");
  const bystander = seat("c-other", "u-other", "elsewhere");
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: () => [player, listener, bystander],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const play = (event: object) =>
    hub.webSocketMessage(player as unknown as WebSocket, JSON.stringify({ t: "synth", ...event }));
  const heard = (socket: typeof listener) =>
    socket.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter((event) => event.t === "synth");
  return { hub, play, player, listener, bystander, heard };
}

const chord = { notes: [45, 61, 64, 69], lead: null, sound: "glass", bright: 0.4, label: "A (I)" };

it("passes a play to the rest of the voice room only, cleaned", async () => {
  const { play, player, listener, bystander, heard } = rooms();
  await play({ ...chord, notes: [...chord.notes, 999], label: "A (I)\u0000" });
  const [event] = heard(listener);
  expect(event).toMatchObject({ channelId: "room", connectionId: "c-player", userId: "u-player", displayName: "u-player" });
  expect(event.play).toEqual({ ...chord });
  expect(heard(player)).toEqual([]);
  expect(heard(bystander)).toEqual([]);
});

it("keeps a server-muted player silent but still lets their stop through", async () => {
  const { hub, play, listener, heard } = rooms();
  await hub.fetch(new Request("https://hub/force-mute", {
    method: "POST", body: JSON.stringify({ userId: "u-player", muted: true }),
  }));
  await play(chord);
  expect(heard(listener)).toEqual([]);
  await play({ notes: [], lead: null, sound: "glass", bright: 0.4, label: "" });
  expect(heard(listener).map((event) => event.play.notes)).toEqual([[]]);
});

it("caps how fast one seat can play, without ever eating a stop", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
  const { play, listener, heard } = rooms();
  for (let index = 0; index < SYNTH_HUB_BUDGET + 5; index += 1) await play({ ...chord, bright: index / 100 });
  expect(heard(listener)).toHaveLength(SYNTH_HUB_BUDGET);
  await play({ notes: [], lead: null, sound: "glass", bright: 0.4, label: "" });
  expect(heard(listener)).toHaveLength(SYNTH_HUB_BUDGET + 1);
  vi.setSystemTime(5_001_000);
  await play(chord);
  expect(heard(listener)).toHaveLength(SYNTH_HUB_BUDGET + 2);
});

it("ignores junk", async () => {
  const { play, listener, heard } = rooms();
  await play({ notes: "everything" });
  await play({});
  expect(heard(listener)).toEqual([]);
});
