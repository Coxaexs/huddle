import { describe, expect, it } from "vitest";
import { parseSfuIdentity, screenEncoding } from "@/app/lib/sfu-voice";
import { nextScreenQuality, SCREEN_SHARE_QUALITIES, screenQualityLabel, screenQualityParts } from "@/app/hooks/use-voice";

describe("parseSfuIdentity", () => {
  it("splits the user the server set from the hub connection", () => {
    expect(parseSfuIdentity("u1|3f2a-b9")).toEqual({ userId: "u1", connectionId: "3f2a-b9" });
    expect(parseSfuIdentity("recorder|c1")).toEqual({ userId: "recorder", connectionId: "c1" });
  });

  it("refuses identities that name no connection", () => {
    expect(parseSfuIdentity("u1")).toBeNull();
    expect(parseSfuIdentity("u1|")).toBeNull();
    expect(parseSfuIdentity("|c1")).toBeNull();
  });
});

describe("screenEncoding", () => {
  it("keeps the frame rate the sharer picked, which LiveKit would cap at 15", () => {
    expect(screenEncoding("720p30", false).maxFramerate).toBe(30);
    expect(screenEncoding("1080p30", false).maxFramerate).toBe(30);
    expect(screenEncoding("1080p60", false).maxFramerate).toBe(60);
    expect(screenEncoding("480p15", false).maxFramerate).toBe(15);
  });

  it("keeps film mode's frame rate even on the small layer", () => {
    expect(screenEncoding("1080p24", true).low.encoding.maxFramerate).toBe(24);
    expect(screenEncoding("900p30", true).low.encoding.maxFramerate).toBe(30);
    expect(screenEncoding("900p30", false).low.encoding.maxFramerate).toBe(15);
  });

  it("never asks more of the small layer than the full one", () => {
    for (const quality of SCREEN_SHARE_QUALITIES) {
      const encoding = screenEncoding(quality, false);
      expect(encoding.maxBitrate).toBeGreaterThan(0);
      expect(encoding.low.encoding.maxBitrate).toBeLessThanOrEqual(encoding.maxBitrate);
    }
  });
});

describe("screen share qualities", () => {
  it("offers every resolution at every frame rate", () => {
    expect(SCREEN_SHARE_QUALITIES).toContain("480p15");
    expect(SCREEN_SHARE_QUALITIES).toContain("1080p60");
    expect(SCREEN_SHARE_QUALITIES).toHaveLength(16);
  });

  it("cycles resolutions at the same frame rate and labels them for the badge", () => {
    expect(nextScreenQuality("480p24")).toBe("720p24");
    expect(nextScreenQuality("1080p24")).toBe("480p24");
    expect(screenQualityLabel("900p24")).toBe("900p 24FPS");
    expect(screenQualityParts("480p15")).toEqual({ height: 480, fps: 15 });
  });
});
