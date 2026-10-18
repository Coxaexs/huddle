import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const FRAME = `data:image/jpeg;base64,${"A".repeat(400)}`;

/** A streamer and a viewer in one room, and someone in another room. */
function room() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (connectionId: string, userId: string, voiceChannelId: string | null) => {
    let attachment: Record<string, unknown> = { connectionId, userId, voiceChannelId, muted: false, deafened: false, important: false, screenStreamId: null, cameraStreamId: null };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: Record<string, unknown>) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const streamer = seat("streamer", "u1", "room");
  const viewer = seat("viewer", "u2", "room");
  const ctx = {
    setWebSocketAutoResponse: vi.fn(), getWebSockets: () => [streamer, viewer],
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const from = (socket: typeof streamer) => (event: object) =>
    hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const sent = (socket: typeof streamer) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
  return { streamer, viewer, asStreamer: from(streamer), asViewer: from(viewer), sent };
}

it("stamps when a screen share starts and clears it when it stops", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
  const { asStreamer, sent, viewer } = room();
  await asStreamer({ t: "voice-state", screenStreamId: "screen-1" });
  const seatOf = () => sent(viewer).filter((e) => e.t === "voice").at(-1).participants.find((p: { connectionId: string }) => p.connectionId === "streamer");
  expect(seatOf().screenStartedAt).toBe(5_000_000);

  // Other changes keep the clock.
  vi.setSystemTime(5_060_000);
  await asStreamer({ t: "voice-state", muted: true, screenStreamId: "screen-1" });
  expect(seatOf().screenStartedAt).toBe(5_000_000);

  await asStreamer({ t: "voice-state", screenStreamId: null });
  expect(seatOf().screenStartedAt).toBeNull();
});

it("keeps a sharing seat's preview frame and hands it to whoever asks", async () => {
  const { asStreamer, asViewer, sent, viewer } = room();
  await asStreamer({ t: "voice-state", screenStreamId: "screen-1" });
  await asStreamer({ t: "stream-preview", image: FRAME, title: "Valheim" });
  await asViewer({ t: "stream-preview-get", connectionId: "streamer" });
  const answer = sent(viewer).filter((e) => e.t === "stream-preview").at(-1);
  expect(answer).toMatchObject({ connectionId: "streamer", image: FRAME, title: "Valheim" });
});

it("refuses frames from seats not sharing, and anything but a small JPEG", async () => {
  const { asStreamer, asViewer, sent, viewer } = room();
  await asStreamer({ t: "stream-preview", image: FRAME });
  await asStreamer({ t: "voice-state", screenStreamId: "screen-1" });
  await asStreamer({ t: "stream-preview", image: "data:image/svg+xml;base64,PHN2Zz4=" });
  await asStreamer({ t: "stream-preview", image: `data:image/jpeg;base64,${"A".repeat(90_000)}` });
  await asViewer({ t: "stream-preview-get", connectionId: "streamer" });
  expect(sent(viewer).filter((e) => e.t === "stream-preview").at(-1).image).toBeNull();
});

it("forgets the frame when the share stops", async () => {
  const { asStreamer, asViewer, sent, viewer } = room();
  await asStreamer({ t: "voice-state", screenStreamId: "screen-1" });
  await asStreamer({ t: "stream-preview", image: FRAME });
  await asStreamer({ t: "voice-state", screenStreamId: null });
  const before = sent(viewer).filter((e) => e.t === "stream-preview").length;
  await asViewer({ t: "stream-preview-get", connectionId: "streamer" });
  // Not sharing any more: nothing to answer.
  expect(sent(viewer).filter((e) => e.t === "stream-preview").length).toBe(before);
});

it("tells the room when a watch party starts, changes film and ends", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(7_000_000);
  const { asViewer, sent, streamer } = room();
  await asViewer({ t: "lounge-set", key: "watch", value: { url: "https://example.com/a.mp4", title: "Film A", position: 0, paused: false } });
  const watches = () => sent(streamer).filter((e) => e.t === "room-watch");
  expect(watches().at(-1)).toMatchObject({ channelId: "room", watch: { title: "Film A", startedAt: 7_000_000 } });

  // Pausing is not news for the channel list.
  vi.setSystemTime(7_010_000);
  await asViewer({ t: "lounge-set", key: "watch", value: { url: "https://example.com/a.mp4", title: "Film A", position: 10, paused: true } });
  expect(watches()).toHaveLength(1);

  vi.setSystemTime(7_020_000);
  await asViewer({ t: "lounge-set", key: "watch", value: { url: "https://example.com/b.mp4", title: "Film B", position: 0, paused: false } });
  expect(watches().at(-1).watch).toEqual({ title: "Film B", startedAt: 7_020_000, viewers: [] });

  vi.setSystemTime(7_030_000);
  await asViewer({ t: "lounge-set", key: "watch", value: null });
  expect(watches().at(-1).watch).toBeNull();
});

it("counts who is watching a screen share, and stops counting when they stop", async () => {
  const { asStreamer, asViewer, sent, streamer } = room();
  await asStreamer({ t: "voice-state", screenStreamId: "screen-1" });
  const seat = () => sent(streamer).filter((e) => e.t === "voice").at(-1).participants.find((p: { connectionId: string }) => p.connectionId === "streamer");
  expect(seat().screenViewers).toEqual([]);
  await asViewer({ t: "watching", screens: ["streamer"], party: false });
  expect(seat().screenViewers).toEqual(["viewer"]);
  await asViewer({ t: "watching", screens: [], party: false });
  expect(seat().screenViewers).toEqual([]);
  // Leaving the room stops it too.
  await asViewer({ t: "watching", screens: ["streamer"], party: false });
  await asViewer({ t: "voice-leave" });
  expect(seat().screenViewers).toEqual([]);
});

it("counts the watch party's viewers for the channel list", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(9_000_000);
  const { asStreamer, asViewer, sent, viewer } = room();
  await asViewer({ t: "lounge-set", key: "watch", value: { url: "https://example.com/a.mp4", title: "Film A", position: 0, paused: false } });
  vi.setSystemTime(9_001_000);
  await asStreamer({ t: "watching", screens: [], party: true });
  expect(sent(viewer).filter((e) => e.t === "room-watch").at(-1).watch.viewers).toEqual(["streamer"]);
});

it("names one shared conversion per film and keeps it through a pause", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000_000);
  const { asViewer, sent, streamer } = room();
  const url = "https://example.com/a.mp4";
  await asViewer({ t: "lounge-set", key: "watch", value: { url, title: "A", position: 0, paused: false, quality: "4", session: "chosen-by-me" } });
  const watch = () => sent(streamer).filter((e) => e.t === "lounge-shared" && e.key === "watch").at(-1).value;
  const first = watch().session;
  expect(first).toMatch(/^[a-z0-9]{8,32}$/);
  expect(first).not.toBe("chosen-by-me");
  vi.setSystemTime(10_005_000);
  await asViewer({ t: "lounge-set", key: "watch", value: { url, title: "A", position: 5, paused: true } });
  expect(watch()).toMatchObject({ session: first, quality: "4", paused: true });
});
