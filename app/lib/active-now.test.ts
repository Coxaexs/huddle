import { describe, expect, it } from "vitest";
import type { FriendUser } from "@/lib/friends";
import type { VoiceParticipant } from "@/lib/protocol";
import type { PublicServer } from "@/lib/servers";
import { activeNow } from "./active-now";

const NOW = Date.parse("2026-11-05T20:00:00Z");

function friend(id: string, extra: Partial<FriendUser> = {}): FriendUser {
  return { id, username: id, displayName: id[0].toUpperCase() + id.slice(1), avatar: "", avatarUrl: null, color: "#000", ...extra };
}

function seat(id: string, extra: Partial<VoiceParticipant> = {}): VoiceParticipant {
  return {
    id, username: id, displayName: id, avatar: "", color: "#000",
    connectionId: `${id}-tab`, joinedAt: 0, muted: false, deafened: false, ...extra,
  } as VoiceParticipant;
}

const server = {
  id: "s1",
  name: "The Writer's Journey",
  channels: [
    { id: "fireball", serverId: "s1", name: "FIREBALL", kind: "voice" },
    { id: "genel", serverId: "s1", name: "genel", kind: "text" },
  ],
} as unknown as PublicServer;

describe("activeNow", () => {
  it("puts friends in a room you can see first, with everyone in that room", () => {
    const entries = activeNow(
      [friend("valholl"), friend("flo")],
      new Set(["flo", "valholl"]),
      { fireball: [seat("flo"), seat("flo", { connectionId: "flo-phone" }), seat("kiwi"), seat("music", { bot: true })] },
      [server],
      NOW,
    );
    expect(entries.map((entry) => entry.friend.id)).toEqual(["flo"]);
    expect(entries[0].room?.channel.name).toBe("FIREBALL");
    expect(entries[0].room?.server.name).toBe("The Writer's Journey");
    // One flo despite two tabs, and no bots.
    expect(entries[0].room?.people.map((person) => person.id)).toEqual(["flo", "kiwi"]);
  });

  it("shows games and songs only while they are live and the friend is online", () => {
    const game = { kind: "playing" as const, name: "Valorant", startedAt: NOW - 3_600_000, updatedAt: NOW - 60_000 };
    const staleGame = { ...game, name: "Old", updatedAt: NOW - 3_600_000 };
    const song = { song: "What Love Is", artist: "Zimmer90", isPlaying: true, updatedAt: NOW - 30_000 };
    const entries = activeNow(
      [
        friend("scanor", { spotifyActivity: song }),
        friend("anil", { activity: game }),
        friend("sude", { activity: staleGame }),
        friend("offline", { activity: game }),
      ],
      new Set(["scanor", "anil", "sude"]),
      {},
      [server],
      NOW,
    );
    expect(entries.map((entry) => entry.friend.id)).toEqual(["anil", "scanor"]);
    expect(entries[0].activity?.name).toBe("Valorant");
    expect(entries[1].song?.song).toBe("What Love Is");
  });

  it("ignores rooms in servers you are not in", () => {
    const entries = activeNow([friend("flo")], new Set(["flo"]), { elsewhere: [seat("flo")] }, [server], NOW);
    expect(entries).toEqual([]);
  });
});
