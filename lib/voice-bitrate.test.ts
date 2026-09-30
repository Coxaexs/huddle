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

  it("keeps screen-share audio rich until the room fills", () => {
    expect(screenAudioBitrate(2)).toBe(256_000);
    expect(screenAudioBitrate(3)).toBe(128_000);
  });
});
