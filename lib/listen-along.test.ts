import { describe, expect, it } from "vitest";
import { expectedPositionMs, jamLink, nextListenStep, shortLinkIsJam, spotifyTrackId, type HostTrack } from "./listen-along";

const ID = "4uLU6hMCjMI75M1A2tKUQC";
const OTHER = "7GhIk7Il098yCjg4BQjzvb";
const NOW = 1_800_000_000_000;

describe("spotifyTrackId", () => {
  it("reads every form a source gives", () => {
    expect(spotifyTrackId(`spotify:track:${ID}`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/track/${ID}?si=abc`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/intl-tr/track/${ID}`)).toBe(ID);
    expect(spotifyTrackId(`/com/spotify/track/${ID}`)).toBe(ID);
    expect(spotifyTrackId(ID)).toBe(ID);
  });

  it("refuses anything else", () => {
    expect(spotifyTrackId("spotify:episode:4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(spotifyTrackId("spotify:track:short")).toBeNull();
    expect(spotifyTrackId(`https://evil.example/track/${ID}`)).toBeNull();
    expect(spotifyTrackId(42)).toBeNull();
  });
});

describe("expectedPositionMs", () => {
  it("adds the time since, up to the song's end", () => {
    expect(expectedPositionMs({ positionMs: 30_000, positionAt: NOW - 5_000 }, NOW)).toBe(35_000);
    expect(expectedPositionMs({ positionMs: 170_000, positionAt: NOW - 60_000, durationMs: 180_000 }, NOW)).toBe(180_000);
    expect(expectedPositionMs({ positionMs: 30_000, positionAt: NOW - 5_000, isPlaying: false }, NOW)).toBe(30_000);
    expect(expectedPositionMs({}, NOW)).toBe(0);
  });
});

describe("nextListenStep", () => {
  const host: HostTrack = { trackId: ID, positionMs: 60_000, positionAt: NOW, isPlaying: true };
  const fresh = { applied: null, pausedByUs: false };
  const following = { applied: ID, pausedByUs: false };

  it("starts the host's song where they are", () => {
    expect(nextListenStep(host, null, fresh, NOW + 2_000)).toEqual({ do: "play", trackId: ID, positionMs: 62_000 });
  });

  it("follows a song change", () => {
    const local = { trackId: ID, positionMs: 60_000, playing: true };
    expect(nextListenStep({ ...host, trackId: OTHER, positionMs: 0 }, local, following, NOW)).toEqual({
      do: "play",
      trackId: OTHER,
      positionMs: 0,
    });
  });

  it("only seeks when too far apart", () => {
    expect(nextListenStep(host, { trackId: ID, positionMs: 61_000, playing: true }, following, NOW)).toEqual({ do: "none" });
    expect(nextListenStep(host, { trackId: ID, positionMs: 20_000, playing: true }, following, NOW)).toEqual({
      do: "seek",
      positionMs: 60_000,
    });
  });

  it("pauses with the host, and resumes with them", () => {
    const local = { trackId: ID, positionMs: 60_000, playing: true };
    expect(nextListenStep(null, local, following, NOW)).toEqual({ do: "pause" });
    expect(nextListenStep({ ...host, isPlaying: false }, local, following, NOW)).toEqual({ do: "pause" });
    expect(nextListenStep(null, { ...local, playing: false }, following, NOW)).toEqual({ do: "none" });
    expect(nextListenStep(host, { ...local, playing: false }, { applied: ID, pausedByUs: true }, NOW)).toEqual({
      do: "play",
      trackId: ID,
      positionMs: 60_000,
    });
  });

  it("stops when you take over", () => {
    expect(nextListenStep(host, { trackId: OTHER, positionMs: 1_000, playing: true }, following, NOW)).toEqual({
      do: "stop",
      reason: "took-over",
    });
    expect(nextListenStep(host, { trackId: ID, positionMs: 60_000, playing: false }, following, NOW)).toEqual({
      do: "stop",
      reason: "took-over",
    });
  });

  it("does nothing it can't check when Spotify can't report (Windows)", () => {
    expect(nextListenStep(host, null, following, NOW)).toEqual({ do: "none" });
    expect(nextListenStep(null, null, following, NOW)).toEqual({ do: "none" });
  });

  it("ignores a host song with no id", () => {
    expect(nextListenStep({ isPlaying: true }, null, fresh, NOW)).toEqual({ do: "none" });
  });
});

describe("Jam links", () => {
  it("accepts Jam invite links", () => {
    expect(jamLink("https://open.spotify.com/socialsession/AbC123xyz?si=1")).toEqual({
      url: "https://open.spotify.com/socialsession/AbC123xyz",
      kind: "session",
    });
    expect(jamLink(" https://spotify.link/q9ZkLm2 ")).toEqual({ url: "https://spotify.link/q9ZkLm2", kind: "short" });
  });

  it("refuses everything else", () => {
    expect(jamLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(jamLink("https://evil.example/socialsession/AbC123xyz")).toBeNull();
    expect(jamLink("http://open.spotify.com/socialsession/AbC123xyz")).toBeNull();
    expect(jamLink("https://spotify.link/a/b")).toBeNull();
    expect(jamLink(42)).toBeNull();
  });

  it("tells a Jam short link from any other", () => {
    expect(shortLinkIsJam('<a href="https://open.spotify.com/socialsession/AbC123xyz">')).toBe(true);
    expect(shortLinkIsJam("$full_url=https%3A%2F%2Fopen.spotify.com%2Fsocialsession%2FAbC123xyz")).toBe(true);
    expect(shortLinkIsJam('<a href="https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC">')).toBe(false);
  });
});
