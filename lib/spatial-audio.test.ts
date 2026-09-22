import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SpatialAudioPlayback, TABLE_RADIUS, listenerOrientation, tableLayout, tableSeat,
  personalTableLayout, IMPORTANT_VOLUME_BOOST,
} from "../app/lib/spatial-audio";

vi.mock("../app/lib/devices", () => ({
  registerMedia: vi.fn(), unregisterMedia: vi.fn(), savedDevice: () => "",
}));
afterEach(() => vi.unstubAllGlobals());

describe("table seats", () => {
  it("keeps every voice distinct, in front, and audible in both ears for 1–30 remotes", () => {
    for (let count = 1; count <= 30; count++) {
      const seats = Array.from({ length: count }, (_, i) => tableSeat(i, count));
      expect(new Set(seats.map((s) => s.pan)).size).toBe(count);
      expect(seats.reduce((sum, s) => sum + s.pan, 0)).toBeCloseTo(0);
      for (const seat of seats) {
        expect(Math.abs(seat.pan)).toBeLessThan(0.6);
        expect(seat.z).toBeLessThan(0);
        expect(Math.hypot(seat.x, seat.z)).toBeCloseTo(1.5);
      }
    }
  });
  it("reserves the centre for the designated host without duplicate pans", () => {
    for (let count = 2; count <= 15; count++) {
      const ids = Array.from({ length: count }, (_, i) => String(i));
      const seats = tableLayout(ids, "1");
      expect(seats.get("1")?.pan).toBe(0);
      expect(new Set([...seats.values()].map((s) => s.pan)).size).toBe(count);
    }
    expect(tableLayout([], "gone").size).toBe(0);
    expect(tableLayout(["a", "b"], "gone")).toEqual(tableLayout(["a", "b"]));
  });
});

function environment() {
  const elements: FakeAudio[] = [];
  const gains: ReturnType<typeof node>[] = [];
  const sources: ReturnType<typeof node>[] = [];
  const panners: ReturnType<typeof node>[] = [];
  const param = () => ({ value: 0, cancelAndHoldAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() });
  function node() { return { connect: vi.fn(function(this: unknown, next: unknown) { return next; }), disconnect: vi.fn(), channelCount: 2, channelCountMode: "clamped-max", gain: param(), pan: param(), positionX: param(), positionY: param(), positionZ: param(), panningModel: "equalpower", distanceModel: "inverse", refDistance: 1, maxDistance: 10000, rolloffFactor: 1 }; }
  const listener = { forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() };
  const hrtf: ReturnType<typeof node>[] = [];
  class FakeAudio {
    autoplay = false; muted = false; volume = 1; srcObject: unknown;
    play = vi.fn(async () => {}); pause = vi.fn();
    constructor() { elements.push(this); }
  }
  class FakeContext {
    state = "running"; currentTime = 0; destination = {}; onstatechange: (() => void) | null = null;
    resume = vi.fn(async () => {}); close = vi.fn(async () => {});
    createMediaStreamSource() { const n = node(); sources.push(n); return n; }
    createStereoPanner() { const n = node(); panners.push(n); return n; }
    createPanner() { const n = node(); hrtf.push(n); return n; }
    listener = listener;
    createGain() { const n = node(); gains.push(n); return n; }
  }
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", FakeContext);
  return { elements, gains, sources, panners, hrtf, listener };
}

it("has a single audible path, immediate bypass, deafen and clean teardown", async () => {
  const { elements, gains, sources } = environment();
  const playback = new SpatialAudioPlayback();
  const stream = { stop: vi.fn() } as unknown as MediaStream;
  const input = { key: "a", stream, volume: 0.7, muted: false, pan: -0.4 };
  playback.update([input], true);
  await Promise.resolve();
  expect(elements[0].muted).toBe(true);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.7, 0, 0.025);
  playback.update([{ ...input, muted: true }], true);
  expect(gains[0].gain.value).toBe(0);
  expect(elements[0].muted).toBe(true);
  playback.update([input], false);
  expect(gains[0].gain.value).toBe(0);
  expect(elements[0].muted).toBe(false);
  expect(elements[0].volume).toBe(0.7);
  playback.update([], false);
  expect(sources[0].disconnect).toHaveBeenCalled();
  expect(elements[0].srcObject).toBeNull();
  playback.dispose();
});

it("plays normally when Web Audio construction fails, and bypasses non-voice streams", () => {
  const { elements, sources } = environment();
  vi.stubGlobal("AudioContext", class { constructor() { throw new Error("unavailable"); } });
  const playback = new SpatialAudioPlayback();
  playback.update([{ key: "music", stream: {} as MediaStream, volume: 1, muted: false, pan: null }], true);
  expect(elements[0].muted).toBe(false);
  expect(sources).toHaveLength(0);
  playback.dispose();
});

it("applies personal positions and width while keeping the DM centred", () => {
  const seats = personalTableLayout(["a", "b", "dm"], "dm", { a: -0.5, b: 0.3, dm: 0.6 }, 0.5);
  expect(seats.get("a")?.pan).toBe(-0.25);
  expect(seats.get("b")?.pan).toBe(0.15);
  expect(seats.get("dm")?.pan).toBe(0);
  const bounded = personalTableLayout(["a", "b"], "", { a: -20, b: NaN }, 2);
  expect(bounded.get("a")?.pan).toBe(-0.65);
  expect(Number.isFinite(bounded.get("b")?.pan)).toBe(true);
  expect(personalTableLayout(["a"], "", { a: 0.5 }, 0).get("a")?.pan).toBe(0);
});

it("centres and boosts important voices even with table mode off, then restores their seat", () => {
  const { elements, gains, panners } = environment();
  const playback = new SpatialAudioPlayback();
  const input = { key: "a", stream: {} as MediaStream, volume: 1, muted: false, pan: -0.4, important: true };
  playback.update([input], false);
  expect(elements[0].muted).toBe(true);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(IMPORTANT_VOLUME_BOOST, 0, 0.025);
  expect(panners[0].pan.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06);
  expect(panners[0].channelCount).toBe(1);
  expect(panners[0].channelCountMode).toBe("explicit");
  playback.update([{ ...input, muted: true }], false);
  expect(gains[0].gain.value).toBe(0);
  expect(elements[0].muted).toBe(true);
  playback.update([{ ...input, important: false }], true);
  expect(panners[0].pan.setTargetAtTime).toHaveBeenLastCalledWith(-0.4, 0, 0.06);
  expect(panners[0].channelCount).toBe(2);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.025);
  playback.update([{ ...input, important: false }], false);
  expect(gains[0].gain.value).toBe(0);
  expect(elements[0].muted).toBe(false);
  playback.dispose();
});

it("turns the listener rather than the table, keeping the seats orthonormal", () => {
  const ahead = listenerOrientation({ yaw: 0, pitch: 0, roll: 0 });
  expect(ahead.forward.z).toBeCloseTo(-1);
  expect(ahead.up.y).toBeCloseTo(1);
  // Looking a quarter turn left points the listener at whoever sits on their left.
  const left = listenerOrientation({ yaw: Math.PI / 2, pitch: 0, roll: 0 });
  expect(left.forward.x).toBeCloseTo(-1);
  expect(left.forward.z).toBeCloseTo(0);
  const up = listenerOrientation({ yaw: 0, pitch: Math.PI / 2, roll: 0 });
  expect(up.forward.y).toBeCloseTo(1);
  for (const pose of [{ yaw: 0.7, pitch: -0.4, roll: 0.9 }, { yaw: -2.6, pitch: 1.1, roll: -0.3 }]) {
    const { forward, up: upward } = listenerOrientation(pose);
    expect(Math.hypot(forward.x, forward.y, forward.z)).toBeCloseTo(1);
    expect(Math.hypot(upward.x, upward.y, upward.z)).toBeCloseTo(1);
    expect(forward.x * upward.x + forward.y * upward.y + forward.z * upward.z).toBeCloseTo(0);
  }
});

it("swaps stereo panning for head-tracked HRTF and back again", () => {
  const { panners, hrtf, listener, sources, gains } = environment();
  const playback = new SpatialAudioPlayback();
  const seat = { x: -1.06, y: 0, z: -1.06 };
  const input = { key: "a", stream: {} as MediaStream, volume: 1, muted: false, pan: -0.45, seat };
  playback.update([input], true);
  expect(panners).toHaveLength(1);
  expect(hrtf).toHaveLength(0);

  playback.setHeadPose({ yaw: 0, pitch: 0, roll: 0 });
  // The stereo panner is replaced, but the stream's source node is reused.
  expect(hrtf).toHaveLength(1);
  expect(sources).toHaveLength(1);
  expect(panners[0].disconnect).toHaveBeenCalled();
  expect(hrtf[0].panningModel).toBe("HRTF");
  expect(hrtf[0].refDistance).toBe(TABLE_RADIUS);
  expect(hrtf[0].positionX.setTargetAtTime).toHaveBeenLastCalledWith(seat.x, 0, expect.any(Number));
  expect(listener.forwardZ.setTargetAtTime).toHaveBeenLastCalledWith(-1, 0, expect.any(Number));
  expect(gains.at(-1)?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.025);

  // Looking left leaves the seat alone and turns the listener towards it instead.
  playback.setHeadPose({ yaw: Math.PI / 2, pitch: 0, roll: 0 });
  expect(hrtf).toHaveLength(1);
  expect(hrtf[0].positionX.setTargetAtTime).toHaveBeenLastCalledWith(seat.x, 0, expect.any(Number));
  expect(listener.forwardX.setTargetAtTime.mock.lastCall?.[0]).toBeCloseTo(-1);

  playback.setHeadPose(null);
  expect(panners).toHaveLength(2);
  expect(hrtf[0].disconnect).toHaveBeenCalled();
  expect(panners[1].pan.setTargetAtTime).toHaveBeenLastCalledWith(-0.45, 0, 0.06);
  playback.dispose();
});

it("keeps an important voice in front of the listener's face as they turn", () => {
  const { hrtf } = environment();
  const playback = new SpatialAudioPlayback();
  const input = { key: "a", stream: {} as MediaStream, volume: 1, muted: false, pan: -0.5, seat: { x: -1.06, y: 0, z: -1.06 }, important: true };
  playback.update([input], true);
  playback.setHeadPose({ yaw: Math.PI / 2, pitch: 0, roll: 0 });
  expect(hrtf[0].positionX.setTargetAtTime.mock.lastCall?.[0]).toBeCloseTo(-TABLE_RADIUS);
  expect(hrtf[0].positionZ.setTargetAtTime.mock.lastCall?.[0]).toBeCloseTo(0);
  playback.dispose();
});
