// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePlayer } from "@/app/hooks/use-player";
import type { PlayerState } from "@/lib/protocol";

const state: PlayerState = {
  channelId: "room",
  track: {
    id: "t1",
    title: "Song",
    artist: "",
    thumbnail: null,
    duration: 200,
    audioUrl: "https://media.example/song.webm",
    pageUrl: null,
    requestedBy: "me",
  },
  queue: [],
  history: [],
  paused: false,
  positionMs: 0,
  updatedAt: 0,
  volume: 100,
  loop: "off",
};

/** The source of every play() call, as it was at the time. */
let played: string[];
beforeEach(() => {
  vi.useFakeTimers();
  played = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    played.push(this.src);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const songPlays = () => played.filter((src) => src === state.track!.audioUrl).length;

function setup(streamed: boolean) {
  return renderHook((props: { streamed: boolean }) =>
    usePlayer({ state, serverNow: () => 0, deafened: false, onEnded: () => undefined, streamed: props.streamed }),
  { initialProps: { streamed } });
}

describe("usePlayer local fallback", () => {
  it("leaves the song to the music bot when it joins within the grace period", () => {
    const hook = setup(false);
    act(() => { vi.advanceTimersByTime(3000); });
    hook.rerender({ streamed: true });
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(songPlays()).toBe(0);
  });

  it("plays the song itself once no bot has turned up", () => {
    setup(false);
    act(() => { vi.advanceTimersByTime(7000); });
    expect(songPlays()).toBe(0);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(songPlays()).toBeGreaterThan(0);
  });
});
