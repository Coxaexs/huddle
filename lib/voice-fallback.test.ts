import { describe, expect, it } from "vitest";
import {
  MESH_FALLBACK_MAX_PEERS,
  meshFallbackBlocked,
  videoAllowedFrom,
} from "@/app/hooks/use-voice";
import { meshIcePolicy, meshPeers } from "@/app/lib/voice-mesh";
import type { VoiceParticipant } from "@/lib/protocol";

function seat(connectionId: string, extra: Partial<VoiceParticipant> = {}): VoiceParticipant {
  return {
    id: `user-${connectionId}`,
    connectionId,
    joinedAt: 0,
    muted: false,
    deafened: false,
    ...extra,
  } as VoiceParticipant;
}

/** `count` other people on LiveKit, plus this seat. */
function room(count: number, extra: Partial<VoiceParticipant> = {}): VoiceParticipant[] {
  return [
    seat("me", { sfu: true }),
    ...Array.from({ length: count }, (_, i) => seat(`c${i}`, { sfu: true, ...extra })),
  ];
}

describe("meshFallbackBlocked", () => {
  it("lets a small room fall back to direct connections", () => {
    expect(meshFallbackBlocked(room(MESH_FALLBACK_MAX_PEERS), "me")).toBe(false);
  });

  it("keeps a seat on LiveKit once the room is bigger than the limit", () => {
    expect(meshFallbackBlocked(room(MESH_FALLBACK_MAX_PEERS + 1), "me")).toBe(true);
    expect(meshFallbackBlocked(room(99), "me")).toBe(true);
  });

  it("does not count this seat or bots", () => {
    const people = [...room(MESH_FALLBACK_MAX_PEERS), seat("bot", { bot: true, sfu: true })];
    expect(meshFallbackBlocked(people, "me")).toBe(false);
  });

  it("allows the mesh when nobody in the room is on LiveKit", () => {
    expect(meshFallbackBlocked(room(40, { sfu: false }), "me")).toBe(false);
  });
});

describe("meshPeers", () => {
  const ids = (people: VoiceParticipant[]) => people.map((person) => person.connectionId);

  it("meshes a LiveKit seat with one that lost LiveKit in a small room", () => {
    const people = [...room(MESH_FALLBACK_MAX_PEERS - 1), seat("lost", { sfu: false })];
    expect(ids(meshPeers(people, "me", true))).toEqual(["lost"]);
  });

  it("refuses a seat claiming no LiveKit once the room is too big to mesh", () => {
    const people = [...room(MESH_FALLBACK_MAX_PEERS), seat("liar", { sfu: false })];
    expect(meshPeers(people, "me", true)).toEqual([]);
  });

  it("still meets the bots directly in a big room", () => {
    const people = [...room(40), seat("liar", { sfu: false }), seat("bot", { bot: true })];
    expect(ids(meshPeers(people, "me", true))).toEqual(["bot"]);
  });

  it("leaves a room with no LiveKit fully meshed", () => {
    expect(meshPeers(room(12, { sfu: false }), "me", false)).toHaveLength(12);
  });
});

describe("meshIcePolicy", () => {
  it("sends people through the relay so they never see each other's address", () => {
    expect(meshIcePolicy(seat("a"), true)).toBe("relay");
    expect(meshIcePolicy(undefined, true)).toBe("relay");
  });

  it("connects straight to our own bots", () => {
    expect(meshIcePolicy(seat("bot", { bot: true }), true)).toBe("all");
  });

  it("connects directly when the instance has no relay at all", () => {
    expect(meshIcePolicy(seat("a"), false)).toBe("all");
  });
});

describe("videoAllowedFrom", () => {
  it("drops video from a stage audience seat", () => {
    expect(videoAllowedFrom(seat("a", { speakAllowed: false }))).toBe(false);
  });

  it("shows video from someone on stage or in an ordinary room", () => {
    expect(videoAllowedFrom(seat("a", { speakAllowed: true }))).toBe(true);
    expect(videoAllowedFrom(seat("a"))).toBe(true);
  });
});
