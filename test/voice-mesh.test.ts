import { describe, expect, it } from "vitest";
import type { VoiceParticipant } from "@/lib/protocol";
import {
  gainedPublish,
  MESH_FALLBACK_MAX_PEERS,
  mayPublish,
  meshFallbackBlocked,
  meshPeers,
  meshPlan,
  rejoinKind,
  splitEarlySignals,
  watchdogVerdict,
  weCall,
} from "@/app/lib/voice-mesh";
import { tuneOpusSdp } from "@/app/lib/opus-tuning";
import { nextScreenQuality, screenConstraints } from "@/app/lib/screen-quality";

function seat(connectionId: string, extra: Partial<VoiceParticipant> = {}): VoiceParticipant {
  return { connectionId, id: `user-${connectionId}`, name: connectionId, ...extra } as VoiceParticipant;
}

describe("joining: who meets whom, and who dials", () => {
  it("dials seats whose id sorts at or above ours and waits for the rest", () => {
    const room = [seat("b"), seat("a"), seat("c")];
    expect(meshPlan(room, "b", false, [])).toEqual({ call: ["c"], wait: ["a"], close: [] });
    // Both sides agree: a dials b, c waits for b.
    expect(weCall("a", seat("b"))).toBe(true);
    expect(weCall("c", seat("b"))).toBe(false);
  });

  it("always dials the music bot, which only answers", () => {
    expect(meshPlan([seat("a", { bot: true }), seat("b")], "m", false, [])).toEqual({ call: ["a"], wait: ["b"], close: [] });
  });

  it("leaves connections that are already open alone", () => {
    expect(meshPlan([seat("c"), seat("d")], "b", false, ["c"])).toEqual({ call: ["d"], wait: [], close: [] });
  });

  it("on LiveKit, meshes only with the bot and seats that are not on LiveKit", () => {
    const room = [seat("me", { sfu: true }), seat("x", { sfu: true }), seat("y"), seat("bot", { bot: true, sfu: true })];
    expect(meshPeers(room, "me", true).map((person) => person.connectionId)).toEqual(["y", "bot"]);
    expect(meshPeers(room, "me", false).map((person) => person.connectionId)).toEqual(["x", "y", "bot"]);
  });
});

describe("leaving", () => {
  it("closes connections to people who left the room", () => {
    expect(meshPlan([seat("c")], "b", false, ["c", "gone"])).toEqual({ call: [], wait: [], close: ["gone"] });
  });

  it("closes a direct connection once both seats meet on LiveKit", () => {
    const room = [seat("b", { sfu: true }), seat("c", { sfu: true })];
    expect(meshPlan(room, "b", true, ["c"]).close).toEqual(["c"]);
  });
});

describe("the watchdog", () => {
  const now = 100_000;
  it("dials a missing pair only after its grace, the caller first", () => {
    expect(watchdogVerdict({ callsFirst: true, state: null, since: now - 7000, now })).toBe("wait");
    expect(watchdogVerdict({ callsFirst: true, state: null, since: now - 9000, now })).toBe("call");
    expect(watchdogVerdict({ callsFirst: false, state: null, since: now - 9000, now })).toBe("wait");
    expect(watchdogVerdict({ callsFirst: false, state: null, since: now - 15000, now })).toBe("call");
    // A pair with no clock (since 0) is long overdue.
    expect(watchdogVerdict({ callsFirst: false, state: null, since: 0, now })).toBe("call");
  });

  it("closes failed pairs and ones stuck connecting, keeps healthy ones", () => {
    expect(watchdogVerdict({ callsFirst: true, state: "connected", since: 0, now })).toBe("healthy");
    expect(watchdogVerdict({ callsFirst: true, state: "failed", since: now, now })).toBe("close");
    expect(watchdogVerdict({ callsFirst: true, state: "closed", since: now, now })).toBe("close");
    expect(watchdogVerdict({ callsFirst: true, state: "connecting", since: now - 10_000, now })).toBe("wait");
    expect(watchdogVerdict({ callsFirst: true, state: "connecting", since: now - 17_000, now })).toBe("close");
  });
});

describe("reconnecting to the hub", () => {
  it("tells a first join, a resumed seat and a new connection apart", () => {
    expect(rejoinKind({ connectionId: null, session: null }, "c1", "s1")).toBe("first");
    expect(rejoinKind({ connectionId: "c1", session: "s1" }, "c1", "s1")).toBe("none");
    expect(rejoinKind({ connectionId: "c1", session: "s1" }, "c1", "s2")).toBe("resume");
    expect(rejoinKind({ connectionId: "c1", session: "s1" }, "c2", "s2")).toBe("reconnect");
  });

  it("re-meshes after a reconnect with the same caller rule", () => {
    // After a reconnect nothing is open: dial up, wait for down.
    expect(meshPlan([seat("a"), seat("z")], "m", false, [])).toEqual({ call: ["z"], wait: ["a"], close: [] });
  });

  it("replays early signals once their sender shows up, and drops stale ones", () => {
    const pending = [
      { from: "a", at: 10_000, raw: 1 },
      { from: "b", at: 10_000, raw: 2 },
      { from: "a", at: 0, raw: 3 },
    ];
    const { ready, keep } = splitEarlySignals(pending, new Set(["a"]), 20_000);
    expect(ready.map((entry) => entry.raw)).toEqual([1]);
    expect(keep.map((entry) => entry.raw)).toEqual([2]);
  });
});

describe("switching between LiveKit and the mesh", () => {
  const crowd = (count: number, sfu: boolean) => Array.from({ length: count }, (_, index) => seat(`p${index}`, { sfu }));

  it("falls back to the mesh in a small room", () => {
    expect(meshFallbackBlocked([seat("me"), ...crowd(MESH_FALLBACK_MAX_PEERS, true)], "me")).toBe(false);
  });

  it("keeps retrying LiveKit when the room is too big to mesh", () => {
    expect(meshFallbackBlocked([seat("me"), ...crowd(MESH_FALLBACK_MAX_PEERS + 1, true)], "me")).toBe(true);
    // Bots do not count, and a room with nobody on LiveKit is a mesh anyway.
    expect(meshFallbackBlocked([...crowd(MESH_FALLBACK_MAX_PEERS, true), seat("bot", { bot: true, sfu: true })], "me")).toBe(false);
    expect(meshFallbackBlocked(crowd(MESH_FALLBACK_MAX_PEERS + 5, false), "me")).toBe(false);
  });

  it("renews the LiveKit token only when a seat gains the floor", () => {
    expect(mayPublish(undefined)).toBe(null);
    expect(mayPublish(seat("a"))).toBe(true);
    expect(mayPublish(seat("a", { serverMuted: true }))).toBe(false);
    expect(mayPublish(seat("a", { speakAllowed: false }))).toBe(false);
    expect(gainedPublish(false, true)).toBe(true);
    expect(gainedPublish(null, true)).toBe(false);
    expect(gainedPublish(true, true)).toBe(false);
    expect(gainedPublish(true, false)).toBe(false);
  });
});

describe("media helpers moved out of the hook", () => {
  it("turns on FEC, turns off DTX and allows 10 ms packets for every Opus payload", () => {
    const sdp = [
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=20;usedtx=1",
      "a=rtpmap:63 red/48000/2",
      "a=rtpmap:109 OPUS/48000/2",
      "a=fmtp:109 stereo=1",
      "",
    ].join("\r\n");
    const tuned = tuneOpusSdp({ type: "offer", sdp }).sdp!;
    expect(tuned).toContain("a=fmtp:111 minptime=10;usedtx=0;useinbandfec=1");
    expect(tuned).toContain("a=fmtp:109 stereo=1;useinbandfec=1;usedtx=0;minptime=10");
  });

  it("sizes screen captures at 16:9 and steps resolution up, wrapping round", () => {
    expect(screenConstraints("1080p30")).toEqual({ width: 1920, height: 1080, frameRate: 30 });
    expect(nextScreenQuality("720p60")).toBe("900p60");
    expect(nextScreenQuality("1080p15")).toBe("480p15");
  });
});
