import { describe, expect, it } from "vitest";
import {
  ACTIVITY_STALE_MS,
  MANUAL_ACTIVITY_STALE_MS,
  SPOTIFY_STALE_MS,
  activityElapsed,
  activityLabel,
  liveActivity,
  liveSpotify,
  memberActivityLine,
  normalizeLastfmUsername,
  normalizeProfileActivity,
} from "./users";

const NOW = 1_800_000_000_000;

describe("liveSpotify", () => {
  it("hides songs nobody has re-confirmed", () => {
    const song = { song: "A", artist: "B", updatedAt: NOW - SPOTIFY_STALE_MS - 1 };
    expect(liveSpotify(song, NOW)).toBeNull();
    expect(liveSpotify({ ...song, updatedAt: NOW - 1000 }, NOW)).not.toBeNull();
  });
  it("hides paused songs and keeps legacy rows without a timestamp", () => {
    expect(liveSpotify({ song: "A", artist: "B", isPlaying: false }, NOW)).toBeNull();
    expect(liveSpotify({ song: "A", artist: "B" }, NOW)).not.toBeNull();
    expect(liveSpotify(null, NOW)).toBeNull();
  });
});

describe("profile activity", () => {
  it("rejects junk and clamps fields", () => {
    expect(normalizeProfileActivity({ name: "  " })).toBeNull();
    expect(normalizeProfileActivity("x")).toBeNull();
    const a = normalizeProfileActivity({ name: "x".repeat(200), kind: "bogus", startedAt: NOW * 2 })!;
    expect(a.name).toHaveLength(80);
    expect(a.kind).toBe("playing");
    expect(a.startedAt).toBeLessThanOrEqual(Date.now());
  });
  it("expires detected activities sooner than manual ones", () => {
    const base = { kind: "playing" as const, name: "Minecraft", startedAt: NOW - 1e7, updatedAt: NOW - ACTIVITY_STALE_MS - 1 };
    expect(liveActivity(base, NOW)).toBeNull();
    expect(liveActivity({ ...base, manual: true }, NOW)).not.toBeNull();
    expect(liveActivity({ ...base, manual: true, updatedAt: NOW - MANUAL_ACTIVITY_STALE_MS - 1 }, NOW)).toBeNull();
  });
  it("labels and times", () => {
    const a = { kind: "coding" as const, name: "Zed", startedAt: NOW - 125 * 60_000, updatedAt: NOW };
    expect(activityLabel(a)).toBe("Coding in Zed");
    expect(activityElapsed(a, NOW)).toBe("for 2h 5m");
    expect(activityElapsed({ ...a, startedAt: NOW - 1000 }, NOW)).toBe("");
  });
  it("prefers the game over the song in the member list", () => {
    const now = Date.now();
    const activity = { kind: "playing" as const, name: "Factorio", startedAt: now, updatedAt: now };
    const spotifyActivity = { song: "S", artist: "A", updatedAt: now };
    expect(memberActivityLine({ activity, spotifyActivity })).toBe("Playing Factorio");
    expect(memberActivityLine({ spotifyActivity })).toContain("S");
    expect(memberActivityLine({})).toBe("");
  });
});

describe("normalizeLastfmUsername", () => {
  it("accepts real names and rejects the rest", () => {
    expect(normalizeLastfmUsername("  rj_ ")).toBe("rj_");
    expect(normalizeLastfmUsername("a")).toBeNull();
    expect(normalizeLastfmUsername("1abc")).toBeNull();
    expect(normalizeLastfmUsername("has space")).toBeNull();
    expect(normalizeLastfmUsername("x".repeat(16))).toBeNull();
    expect(normalizeLastfmUsername(null)).toBeNull();
  });
});
