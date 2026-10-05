import { describe, expect, it } from "vitest";
import { screenAudioBitrate, voiceBitrate } from "../app/hooks/use-voice";

describe("voice bitrate", () => {
  it("spends less per copy as the mesh grows", () => {
    expect(voiceBitrate(1, false)).toBe(64_000);
    expect(voiceBitrate(2, false)).toBe(64_000);
    expect(voiceBitrate(3, false)).toBe(48_000);
    expect(voiceBitrate(5, false)).toBe(32_000);
    expect(voiceBitrate(8, true)).toBe(32_000);
  });

  it("makes room for a camera or screen share in a small call", () => {
    expect(voiceBitrate(1, true)).toBe(48_000);
  });

  it("gives a small call the channel's whole ceiling", () => {
    expect(voiceBitrate(1, false, 256_000)).toBe(256_000);
    expect(voiceBitrate(2, false, 256_000)).toBe(256_000);
    expect(voiceBitrate(2, false, 96_000)).toBe(96_000);
  });

  it("keeps a high ceiling from swamping the uplink as the room fills", () => {
    // Never much past 600 kbps of voice across all copies.
    for (const listeners of [3, 4, 5, 8, 12]) {
      expect(voiceBitrate(listeners, false, 256_000) * listeners).toBeLessThanOrEqual(600_000);
    }
    expect(voiceBitrate(4, false, 256_000)).toBe(150_000);
  });

  it("never drops below a usable floor, nor above the ceiling", () => {
    expect(voiceBitrate(40, true, 256_000)).toBe(32_000);
    expect(voiceBitrate(10, false, 32_000)).toBe(32_000);
  });

  it("keeps screen-share audio rich until the room fills", () => {
    expect(screenAudioBitrate(2)).toBe(256_000);
    expect(screenAudioBitrate(3)).toBe(128_000);
  });
});
