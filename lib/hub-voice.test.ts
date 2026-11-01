import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub, resumedSeat, type Attachment } from "./hub";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => vi.unstubAllGlobals());

function room() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  let attachment = { connectionId: "speaker", userId: "u1", voiceChannelId: "room", muted: false, deafened: false, important: false };
  const socket = {
    readyState: 1,
    deserializeAttachment: () => ({ ...attachment }),
    serializeAttachment: (value: typeof attachment) => { attachment = value; },
    send: vi.fn(),
  };
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [socket],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const send = (event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const latest = () => JSON.parse(socket.send.mock.calls.at(-1)![0]);
  return { hub, send, latest };
}

it("broadcasts important state to listeners and clears it on mute and room departure", async () => {
  const { send, latest } = room();
  await send({ t: "voice-state", important: true });
  expect(latest().participants[0].important).toBe(true);
  await send({ t: "voice-state", muted: true });
  expect(latest().participants[0].important).toBe(false);
  await send({ t: "voice-state", important: true });
  expect(latest().participants[0].important).toBe(false);
  await send({ t: "voice-state", muted: false });
  expect(latest().participants[0].important).toBe(false);
  await send({ t: "voice-state", important: true });
  await send({ t: "voice-leave" });
  expect(latest().participants).toEqual([]);
  await send({ t: "voice-join", channelId: "room" });
  expect(latest().participants[0].important).toBe(false);
});

it("does not revive important speech after a moderator mute is removed", async () => {
  const { hub, send, latest } = room();
  await send({ t: "voice-state", important: true });
  for (const muted of [true, false]) {
    await hub.fetch(new Request("https://hub/force-mute", {
      method: "POST", body: JSON.stringify({ userId: "u1", muted }),
    }));
    expect(latest().participants[0].important).toBe(false);
  }
});

it("reports when each seat was taken, and only restarts it on a real re-join", async () => {
  vi.useFakeTimers();
  try {
    const { send, latest } = room();
    vi.setSystemTime(1_000_000);
    await send({ t: "voice-join", channelId: "room" });
    expect(latest().participants[0].joinedAt).toBe(1_000_000);

    // Everyday traffic in the room does not disturb the clock.
    vi.setSystemTime(1_060_000);
    await send({ t: "voice-state", muted: true });
    expect(latest().participants[0].joinedAt).toBe(1_000_000);

    // Re-announcing the same room (a reconnect) keeps the time already spent.
    await send({ t: "voice-join", channelId: "room" });
    expect(latest().participants[0].joinedAt).toBe(1_000_000);

    // Moving rooms is a new seat.
    await send({ t: "voice-join", channelId: "other" });
    expect(latest().participants[0].joinedAt).toBe(1_060_000);

    // Leaving clears it, and coming back starts over.
    await send({ t: "voice-leave" });
    vi.setSystemTime(1_120_000);
    await send({ t: "voice-join", channelId: "room" });
    expect(latest().participants[0].joinedAt).toBe(1_120_000);
  } finally {
    vi.useRealTimers();
  }
});

it("drops a silent old connection from the room when the same person rejoins", async () => {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (connectionId: string, voiceChannelId: string | null) => {
    let attachment = { connectionId, userId: "u1", voiceChannelId, muted: false, deafened: false, important: false };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  // The old connection's network died without a close, so it still looks open.
  const stale = seat("old", "room");
  const fresh = seat("new", null);
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [stale, fresh],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  // The hub has already read the old seat, so it is cached.
  await hub.webSocketMessage(stale as unknown as WebSocket, JSON.stringify({ t: "voice-state", muted: false }));

  await hub.webSocketMessage(fresh as unknown as WebSocket, JSON.stringify({ t: "voice-join", channelId: "room" }));
  const roster = JSON.parse(fresh.send.mock.calls.at(-1)![0]);
  expect(roster.participants.map((p: { connectionId: string }) => p.connectionId)).toEqual(["new"]);
});

it("moves a resumed connection's seat over as it was, under the new connect's identity", () => {
  const old: Attachment = {
    connectionId: "c1", userId: "u1", username: "old", displayName: "Old", avatar: "O", avatarUrl: null,
    color: "#000000", channelId: "text", voiceChannelId: "room", voiceJoinedAt: 5, muted: true, deafened: false,
    cameraStreamId: null, screenStreamId: "screen", bot: false, recorder: false, handRaised: true,
  };
  const fresh: Attachment = {
    ...old, username: "new", displayName: "New", avatar: "N", channelId: null, voiceChannelId: null,
    voiceJoinedAt: null, muted: false, screenStreamId: null, handRaised: undefined,
  };
  expect(resumedSeat(fresh, old)).toEqual({ ...old, username: "new", displayName: "New", avatar: "N" });
});

it("leaves a resumed seat to the new socket when the retired one finally closes", async () => {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (extra: object) => {
    let attachment = { connectionId: "c1", userId: "u1", voiceChannelId: "room", muted: false, deafened: false, ...extra };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  // The dead socket still looks open: the hub never saw it drop.
  const retired = seat({ replaced: true });
  const fresh = seat({});
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [retired, fresh],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});

  await hub.webSocketClose(retired as unknown as WebSocket);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fresh.send).not.toHaveBeenCalled();

  await hub.webSocketMessage(fresh as unknown as WebSocket, JSON.stringify({ t: "voice-state", muted: true }));
  const roster = JSON.parse(fresh.send.mock.calls.at(-1)![0]);
  expect(roster.participants.map((p: { connectionId: string }) => p.connectionId)).toEqual(["c1"]);
});

it("keeps a re-announced seat's screen share and raised hand, but not a fresh join's", async () => {
  vi.useFakeTimers();
  try {
    const { send, latest } = room();
    vi.setSystemTime(1_000_000);
    await send({ t: "voice-join", channelId: "room", muted: true });
    await send({ t: "voice-state", screenStreamId: "screen-1", handRaised: true });
    expect(latest().participants[0]).toMatchObject({ screenStreamId: "screen-1", handRaised: true });

    // A tab back from a blip re-announces the seat it already holds, clock and all.
    vi.setSystemTime(1_030_000);
    await send({ t: "voice-join", channelId: "room", since: 1_000_000, muted: true });
    expect(latest().participants[0]).toMatchObject({ joinedAt: 1_000_000, screenStreamId: "screen-1", handRaised: true });

    // Without the seat's clock it is a fresh join, which starts clean.
    await send({ t: "voice-join", channelId: "room", muted: true });
    expect(latest().participants[0].screenStreamId).toBeNull();
    expect(latest().participants[0].handRaised).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

it("gives a room one karaoke lead at a time, and frees it when the lead stops or leaves", async () => {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (connectionId: string, userId: string) => {
    let attachment = { connectionId, userId, voiceChannelId: "room", muted: false, deafened: false };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const a = seat("a", "u1");
  const b = seat("b", "u2");
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [a, b],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const from = (socket: typeof a, event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const leads = () => {
    const participants: Array<{ connectionId: string; karaokeLead?: boolean }> = JSON.parse(a.send.mock.calls.at(-1)![0]).participants;
    return participants.filter((p) => p.karaokeLead).map((p) => p.connectionId);
  };

  await from(a, { t: "voice-state", karaokeLead: true });
  expect(leads()).toEqual(["a"]);
  await from(b, { t: "voice-state", karaokeLead: true });
  expect(leads()).toEqual(["a"]);
  await from(a, { t: "voice-state", karaokeLead: false });
  await from(b, { t: "voice-state", karaokeLead: true });
  expect(leads()).toEqual(["b"]);
  await from(b, { t: "voice-leave" });
  await from(a, { t: "voice-state", karaokeLead: true });
  expect(leads()).toEqual(["a"]);
});
