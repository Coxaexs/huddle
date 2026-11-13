import { describe, expect, it } from "vitest";
import { screenAudioBitrate, voiceBitrate } from "../app/hooks/use-voice";
import { SFU_MIC_REDUNDANT_MAX, sfuMicPlan } from "../app/lib/voice-bitrate";
import { HIFI_MAX_LOSS, HifiLossWatch } from "../app/lib/voice-hifi";
import type { QosSample } from "../app/lib/voice-qos";
import { VOICE_BITRATE_MAX, clampVoiceBitrate, roomVoiceBitrate } from "./voice-quality";

describe("voice bitrate", () => {
  it("accepts settings up to 320 kbps", () => {
    expect(VOICE_BITRATE_MAX).toBe(320_000);
    expect(clampVoiceBitrate(320_000)).toBe(320_000);
    expect(clampVoiceBitrate(999_000)).toBe(320_000);
    expect(clampVoiceBitrate("nonsense")).toBe(64_000);
  });

  it("keeps the top rates for rooms of up to ten people", () => {
    expect(roomVoiceBitrate(320_000, 2)).toBe(320_000);
    expect(roomVoiceBitrate(320_000, 10)).toBe(320_000);
    expect(roomVoiceBitrate(320_000, 11)).toBe(192_000);
    expect(roomVoiceBitrate(256_000, 30)).toBe(192_000);
    expect(roomVoiceBitrate(96_000, 30)).toBe(96_000);
  });

  it("sends the media server's microphone with redundancy up to 192 kbps", () => {
    expect(sfuMicPlan(64_000, 3, false)).toEqual({ bitrate: 64_000, redundant: true });
    expect(sfuMicPlan(128_000, 3, false)).toEqual({ bitrate: 128_000, redundant: true });
    expect(sfuMicPlan(192_000, 3, false)).toEqual({ bitrate: 192_000, redundant: true });
  });

  it("sends a higher setting whole, without redundancy, in a small room", () => {
    expect(sfuMicPlan(256_000, 3, false)).toEqual({ bitrate: 256_000, redundant: false });
    expect(sfuMicPlan(320_000, 10, false)).toEqual({ bitrate: 320_000, redundant: false });
  });

  it("falls back to 192 kbps with redundancy in a big room or on a barred seat", () => {
    const safe = { bitrate: SFU_MIC_REDUNDANT_MAX, redundant: true };
    expect(sfuMicPlan(320_000, 11, false)).toEqual(safe);
    expect(sfuMicPlan(320_000, 4, true)).toEqual(safe);
    expect(sfuMicPlan(256_000, 40, true)).toEqual(safe);
    // Being barred costs a seat nothing below the line.
    expect(sfuMicPlan(96_000, 4, true)).toEqual({ bitrate: 96_000, redundant: true });
  });

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
    expect(voiceBitrate(1, false, 320_000)).toBe(320_000);
  });

  it("keeps a high ceiling from swamping the uplink as the room fills", () => {
    // Never much past 600 kbps of voice across all copies.
    for (const listeners of [2, 3, 4, 5, 8, 12]) {
      expect(voiceBitrate(listeners, false, 320_000) * listeners).toBeLessThanOrEqual(600_000);
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

describe("the watch on a microphone sent without redundancy", () => {
  /** A stats sample after `sent` packets, of which the server says it lost `lost`. */
  const sample = (sent: number, lost: number | null): QosSample => ({
    packetsSent: sent,
    remoteLost: lost,
    packetsReceived: 0,
    packetsLost: 0,
    jitterMs: null,
    rttMs: null,
    availableOutgoingBitrate: null,
  });

  it("stays quiet on a clean link", () => {
    const watch = new HifiLossWatch();
    for (let poll = 0; poll < 30; poll += 1) expect(watch.absorb(sample(poll * 100, 0))).toBe(false);
  });

  it("shrugs off one stray lost packet", () => {
    const watch = new HifiLossWatch();
    watch.absorb(sample(0, 0));
    expect(watch.absorb(sample(100, 0))).toBe(false);
    expect(watch.absorb(sample(200, 1))).toBe(false);
    expect(watch.absorb(sample(300, 1))).toBe(false);
  });

  it("gives up the top rates at once when a burst is lost", () => {
    const watch = new HifiLossWatch();
    watch.absorb(sample(0, 0));
    watch.absorb(sample(100, 0));
    expect(watch.absorb(sample(200, 10))).toBe(true);
  });

  it("gives them up when one packet in a hundred keeps going missing", () => {
    const watch = new HifiLossWatch();
    watch.absorb(sample(0, 0));
    watch.absorb(sample(100, 0));
    const verdicts = [1, 2, 3].map((poll) => watch.absorb(sample(100 + poll * 100, poll)));
    expect(verdicts).toEqual([false, true, true]);
    expect(HIFI_MAX_LOSS).toBe(0.005);
  });

  it("learns nothing from a muted microphone, or before the server has reported", () => {
    const watch = new HifiLossWatch();
    watch.absorb(sample(0, null));
    expect(watch.absorb(sample(100, null))).toBe(false);
    watch.absorb(sample(200, 0));
    // Muted: nothing sent between samples.
    expect(watch.absorb(sample(200, 0))).toBe(false);
  });

  it("starts over for a new sender", () => {
    const watch = new HifiLossWatch();
    watch.absorb(sample(0, 0));
    expect(watch.absorb(sample(100, 30))).toBe(true);
    watch.reset();
    expect(watch.absorb(sample(0, 0))).toBe(false);
    expect(watch.absorb(sample(100, 0))).toBe(false);
  });
});
