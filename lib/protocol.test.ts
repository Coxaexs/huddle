import { describe, expect, it } from "vitest";
import { emptyPlayer, playbackPosition, type PlayerState } from "./protocol";

function trackState(overrides: Partial<PlayerState>): PlayerState {
  return {
    channelId: "voice-1",
    track: {
      id: "t1",
      title: "Bir Derdim Var",
      artist: "mor ve ötesi",
      thumbnail: null,
      duration: 240000,
      audioUrl: "https://example.com/a.mp3",
      pageUrl: null,
      requestedBy: "u1",
    },
    queue: [],
    history: [],
    paused: false,
    positionMs: 10000,
    updatedAt: 100000,
    volume: 100,
    loop: "off",
    ...overrides,
  };
}

describe("emptyPlayer", () => {
  it("builds a fresh idle player", () => {
    const player = emptyPlayer("voice-1");
    expect(player.channelId).toBe("voice-1");
    expect(player.track).toBeNull();
    expect(player.queue).toEqual([]);
    expect(player.history).toEqual([]);
    expect(player.paused).toBe(false);
    expect(player.positionMs).toBe(0);
    expect(player.loop).toBe("off");
  });
});

describe("playbackPosition", () => {
  it("returns 0 when there is no track", () => {
    const player = emptyPlayer("voice-1");
    expect(playbackPosition(player, 200000)).toBe(0);
  });

  it("returns the stored position while paused", () => {
    const player = trackState({ paused: true, positionMs: 5000 });
    expect(playbackPosition(player, 200000)).toBe(5000);
  });

  it("advances by elapsed time while playing", () => {
    const player = trackState({ positionMs: 10000, updatedAt: 100000 });
    expect(playbackPosition(player, 115000)).toBe(25000);
  });

  it("never goes backwards, even if the clock looks stale", () => {
    const player = trackState({ positionMs: 10000, updatedAt: 100000 });
    // 'now' before updatedAt shouldn't produce a negative position.
    expect(playbackPosition(player, 50000)).toBe(10000);
  });
});