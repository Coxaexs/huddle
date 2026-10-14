import { afterEach, describe, expect, it, vi } from "vitest";
import { HuddleHub } from "./hub";
import { parseWhisper, whisperPermissions } from "./whisper";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(public ctx: unknown) {} },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("whisperPermissions", () => {
  const permissions = whisperPermissions(["a|1", "b|2", "c|3"], ["b|2"], ["mic", "cam", "screen"], "mic");

  it("gives the target everything", () => {
    expect(permissions.find((p) => p.participantIdentity === "b|2")).toEqual({
      participantIdentity: "b|2",
      allowAll: true,
    });
  });

  it("keeps the microphone from everyone else but leaves their video", () => {
    for (const other of ["a|1", "c|3"]) {
      const entry = permissions.find((p) => p.participantIdentity === other);
      expect(entry?.allowAll).toBe(false);
      expect(entry?.allowedTrackSids).toEqual(["cam", "screen"]);
    }
  });

  it("names every participant, so a stranger is not left with the default", () => {
    expect(permissions.map((p) => p.participantIdentity)).toEqual(["a|1", "b|2", "c|3"]);
  });

  it("gives several targets the microphone and still keeps it from the rest", () => {
    const several = whisperPermissions(["a|1", "b|2", "c|3", "d|4"], ["b|2", "d|4"], ["mic", "cam"], "mic");
    expect(several.filter((p) => p.allowAll).map((p) => p.participantIdentity)).toEqual(["b|2", "d|4"]);
    expect(several.find((p) => p.participantIdentity === "c|3")?.allowedTrackSids).toEqual(["cam"]);
  });
});

describe("parseWhisper", () => {
  const people = [
    { id: "u1", username: "sam", displayName: "Sam Rivers" },
    { id: "u2", username: "samira", displayName: "Samira" },
    { id: "u3", username: "kit", displayName: "Kit" },
    { id: "me", username: "me", displayName: "Me" },
  ];

  it("takes the first word as the person and the rest as the message", () => {
    expect(parseWhisper("kit meet me at the door", people, "me")).toEqual({
      ok: true,
      people: [people[2]],
      text: "meet me at the door",
    });
  });

  it("prefers an exact name over a longer one that starts the same", () => {
    expect(parseWhisper("@sam hi", people, "me")).toMatchObject({ ok: true, people: [{ id: "u1" }] });
  });

  it("matches a display name with the spaces dropped", () => {
    expect(parseWhisper("samrivers hi", people, "me")).toMatchObject({ ok: true, people: [{ id: "u1" }] });
  });

  it("takes a few people at once, however they are written", () => {
    const ids = (args: string) => {
      const result = parseWhisper(args, people, "me");
      return result.ok ? [result.people.map((p) => p.id), result.text] : result.error;
    };
    expect(ids("sam,kit the door is trapped")).toEqual([["u1", "u3"], "the door is trapped"]);
    expect(ids("sam, kit the door is trapped")).toEqual([["u1", "u3"], "the door is trapped"]);
    expect(ids("@sam @kit the door")).toEqual([["u1", "u3"], "the door"]);
    expect(ids("sam,sam hi")).toEqual([["u1"], "hi"]);
    expect(ids("sam,nobody hi")).toBe('Nobody called "nobody" here.');
    expect(ids("sam,kit")).toMatch(/^Use/);
  });

  it("refuses an ambiguous prefix, an unknown name, yourself and a missing message", () => {
    expect(parseWhisper("sa hi", people, "me")).toMatchObject({ ok: false });
    expect(parseWhisper("nobody hi", people, "me")).toMatchObject({ ok: false });
    expect(parseWhisper("me hi", people, "me")).toMatchObject({ ok: false });
    expect(parseWhisper("kit", people, "me")).toMatchObject({ ok: false });
    expect(parseWhisper("kit   ", people, "me")).toMatchObject({ ok: false });
  });
});

function room() {
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const seat = (connectionId: string, userId: string, voiceChannelId: string | null) => {
    let attachment = { connectionId, userId, displayName: userId, voiceChannelId, muted: false, deafened: false, important: false };
    return {
      readyState: 1,
      deserializeAttachment: () => ({ ...attachment }),
      serializeAttachment: (value: typeof attachment) => { attachment = value; },
      send: vi.fn(),
    };
  };
  const sender = seat("c-sender", "u-sender", "room");
  const sender2 = seat("c-sender2", "u-sender", null);
  const target = seat("c-target", "u-target", "room");
  const bystander = seat("c-bystander", "u-bystander", "room");
  const elsewhere = seat("c-elsewhere", "u-elsewhere", "other");
  const all = [sender, sender2, target, bystander, elsewhere];
  const ctx = {
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: () => all,
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  };
  const hub = new HuddleHub(ctx as unknown as DurableObjectState, {});
  const say = (socket: (typeof all)[number], event: object) => hub.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(event));
  const got = (socket: (typeof all)[number], t: string) =>
    socket.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter((event) => event.t === t);
  return { hub, say, got, sender, sender2, target, bystander, elsewhere };
}

describe("voice-whisper notice", () => {
  it("reaches the target only", async () => {
    const { say, got, sender, target, bystander } = room();
    await say(sender, { t: "voice-whisper", to: "c-target", active: true });
    expect(got(target, "voice-whisper")).toMatchObject([{ from: "c-sender", active: true }]);
    expect(got(bystander, "voice-whisper")).toEqual([]);
    expect(got(sender, "voice-whisper")).toEqual([]);
  });

  it("is dropped across rooms, to yourself and to nobody", async () => {
    const { say, got, sender, elsewhere, target } = room();
    await say(sender, { t: "voice-whisper", to: "c-elsewhere", active: true });
    await say(sender, { t: "voice-whisper", to: "c-sender", active: true });
    await say(sender, { t: "voice-whisper", to: "c-nobody", active: true });
    await say(sender, { t: "voice-whisper", to: 7, active: true });
    expect(got(elsewhere, "voice-whisper")).toEqual([]);
    expect(got(target, "voice-whisper")).toEqual([]);
  });
});

describe("voice-whisper to a few seats", () => {
  it("tells each target, and nobody else", async () => {
    const { say, got, sender, target, bystander, elsewhere } = room();
    await say(sender, { t: "voice-whisper", to: ["c-target", "c-bystander", "c-elsewhere"], active: true });
    expect(got(target, "voice-whisper")).toMatchObject([{ from: "c-sender", active: true }]);
    expect(got(bystander, "voice-whisper")).toMatchObject([{ from: "c-sender", active: true }]);
    expect(got(elsewhere, "voice-whisper")).toEqual([]);
    expect(got(sender, "voice-whisper")).toEqual([]);
  });
});

describe("text-whisper", () => {
  function open() {
    const r = room();
    // Everyone but u-elsewhere can see the channel.
    (r.hub as unknown as { channelAudience: unknown }).channelAudience = async () =>
      (seat: { userId: string }) => seat.userId !== "u-elsewhere";
    return r;
  }
  const whisper = { t: "text-whisper", channelId: "text1", toUserId: "u-target", text: "  psst  ", id: "w1" };

  it("goes to the target and the sender's tabs, and to nobody else", async () => {
    const { say, got, sender, sender2, target, bystander } = open();
    await say(sender, whisper);
    expect(got(target, "text-whisper")).toMatchObject([{ fromUserId: "u-sender", toUserId: "u-target", text: "psst" }]);
    expect(got(sender, "text-whisper")).toHaveLength(1);
    expect(got(sender2, "text-whisper")).toHaveLength(1);
    expect(got(bystander, "text-whisper")).toEqual([]);
  });

  it("reaches a few people at once, each told who else heard it", async () => {
    const { say, got, sender, target, bystander, elsewhere } = open();
    await say(sender, { ...whisper, toUserId: undefined, toUserIds: ["u-target", "u-bystander"] });
    expect(got(target, "text-whisper")).toMatchObject([{ toUserIds: ["u-target", "u-bystander"], text: "psst" }]);
    expect(got(bystander, "text-whisper")).toHaveLength(1);
    expect(got(elsewhere, "text-whisper")).toEqual([]);
    expect(got(sender, "text-whisper")).toMatchObject([{ toUserIds: ["u-target", "u-bystander"] }]);
  });

  it("names whoever a group whisper missed", async () => {
    const { say, got, sender, target } = open();
    await say(sender, { ...whisper, toUserId: undefined, toUserIds: ["u-target", "u-elsewhere"] });
    expect(got(target, "text-whisper")).toMatchObject([{ toUserIds: ["u-target"] }]);
    expect(got(sender, "text-whisper")).toMatchObject([{ toUserIds: ["u-target"], missed: ["u-elsewhere"] }]);
  });

  it("tells only the sender when the person cannot see the channel", async () => {
    const { say, got, sender, elsewhere, target } = open();
    await say(sender, { ...whisper, toUserId: "u-elsewhere" });
    expect(got(elsewhere, "text-whisper")).toEqual([]);
    expect(got(target, "text-whisper")).toEqual([]);
    expect(got(sender, "text-whisper")).toMatchObject([{ undelivered: true }]);
  });

  it("ignores empty text, a whisper to yourself and junk", async () => {
    const { say, got, sender, target } = open();
    await say(sender, { ...whisper, text: "   " });
    await say(sender, { ...whisper, toUserId: "u-sender" });
    await say(sender, { ...whisper, id: "x".repeat(65) });
    await say(sender, { ...whisper, toUserId: 5 });
    expect(got(target, "text-whisper")).toEqual([]);
    expect(got(sender, "text-whisper")).toEqual([]);
  });

  it("limits how fast one connection can whisper", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(9_000_000);
    const { say, got, sender, target } = open();
    for (let i = 0; i < 8; i += 1) await say(sender, { ...whisper, id: `w${i}` });
    expect(got(target, "text-whisper")).toHaveLength(3);
    vi.setSystemTime(9_001_000);
    await say(sender, { ...whisper, id: "later" });
    expect(got(target, "text-whisper")).toHaveLength(4);
  });
});
