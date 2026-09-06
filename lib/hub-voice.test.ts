import { afterEach, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";

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
