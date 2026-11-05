import { describe, expect, it } from "vitest";
import { createRoomFollower, roomMoment, type PlayerReading } from "@/app/lib/watch-sync";

const reading = (over: Partial<PlayerReading> = {}): PlayerReading => ({
  current: 10, expected: 10, paused: false, loading: false, seeking: false, moment: "a", now: 0, ...over,
});

describe("following the room's clock", () => {
  it("leaves a player that is in step alone", () => {
    expect(createRoomFollower().next(reading({ expected: 10.1 }))).toEqual({ seekTo: null, rate: 1 });
  });

  it("eases out a small drift with the speed, in the right direction", () => {
    const follower = createRoomFollower();
    expect(follower.next(reading({ expected: 10.5 })).rate).toBeGreaterThan(1);
    expect(follower.next(reading({ expected: 9.5 })).rate).toBeLessThan(1);
    expect(follower.next(reading({ expected: 12 })).seekTo).toBeNull();
  });

  it("never seeks a player that is still loading, however far behind", () => {
    const follower = createRoomFollower();
    for (let second = 0; second < 120; second++) {
      const step = follower.next(reading({ current: 0, expected: second + 7, loading: true, now: second * 1000 }));
      expect(step).toEqual({ seekTo: null, rate: 1 });
    }
  });

  it("does not seek again while a seek is landing", () => {
    expect(createRoomFollower().next(reading({ expected: 40, seeking: true })).seekTo).toBeNull();
  });

  it("seeks a big drift, then waits longer each time it does not stick", () => {
    const follower = createRoomFollower();
    const seeks: number[] = [];
    for (let second = 0; second < 120; second++) {
      const now = second * 1000;
      if (follower.next(reading({ current: 0, expected: 60, now })).seekTo !== null) seeks.push(second);
    }
    expect(seeks).toEqual([0, 5, 15, 35, 75]);
  });

  it("forgives the old seeks once the viewer has kept up for a while", () => {
    const follower = createRoomFollower();
    follower.next(reading({ expected: 60, now: 0 }));
    follower.next(reading({ expected: 60, now: 5_000 }));
    follower.next(reading({ now: 20_000 }));
    follower.next(reading({ now: 36_000 }));
    expect(follower.next(reading({ expected: 60, now: 37_000 })).seekTo).toBe(60);
    expect(follower.next(reading({ expected: 60, now: 41_000 })).seekTo).toBeNull();
    expect(follower.next(reading({ expected: 60, now: 42_000 })).seekTo).toBe(60);
  });

  it("goes straight to where someone moved the film, even mid-load and mid-wait", () => {
    const follower = createRoomFollower();
    follower.next(reading({ expected: 60 }));
    const step = follower.next(reading({ current: 60, expected: 900, moment: "b", loading: true, now: 1000 }));
    expect(step).toEqual({ seekTo: 900, rate: 1 });
  });

  it("does not take the first reading for someone moving the film", () => {
    const step = createRoomFollower().next(reading({ current: 0, expected: 60, loading: true }));
    expect(step.seekTo).toBeNull();
  });

  it("holds a paused player on the room's frame at normal speed", () => {
    const follower = createRoomFollower();
    expect(follower.next(reading({ paused: true, expected: 12 }))).toEqual({ seekTo: 12, rate: 1 });
    expect(follower.next(reading({ paused: true, expected: 10.2 }))).toEqual({ seekTo: null, rate: 1 });
  });

  it("names a moment by what the room did", () => {
    const base = { position: 5, at: 100, paused: false };
    expect(roomMoment(base)).toBe(roomMoment({ ...base }));
    expect(roomMoment(base)).not.toBe(roomMoment({ ...base, paused: true }));
    expect(roomMoment(base)).not.toBe(roomMoment({ ...base, position: 6 }));
  });
});
