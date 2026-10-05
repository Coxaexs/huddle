import { describe, expect, it } from "vitest";
import { parseSfuIdentity, SCREEN_ENCODINGS } from "@/app/lib/sfu-voice";
import { nextScreenQuality, SCREEN_SHARE_QUALITIES, screenQualityLabel } from "@/app/hooks/use-voice";

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

describe("SCREEN_ENCODINGS", () => {
  it("keeps the frame rate the sharer picked, which LiveKit would cap at 15", () => {
    expect(SCREEN_ENCODINGS["720p30"].maxFramerate).toBe(30);
    expect(SCREEN_ENCODINGS["1080p30"].maxFramerate).toBe(30);
    expect(SCREEN_ENCODINGS["1080p60"].maxFramerate).toBe(60);
  });

  it("keeps film settings at 24 fps even on the small layer", () => {
    for (const quality of ["900p24", "1080p24"] as const) {
      expect(SCREEN_ENCODINGS[quality].maxFramerate).toBe(24);
      expect(SCREEN_ENCODINGS[quality].low.encoding.maxFramerate).toBe(24);
    }
  });
});

describe("screen share qualities", () => {
  it("cycles through every quality and labels them for the badge", () => {
    let quality = SCREEN_SHARE_QUALITIES[0];
    const seen = new Set([quality]);
    for (let i = 1; i < SCREEN_SHARE_QUALITIES.length; i++) seen.add((quality = nextScreenQuality(quality)));
    expect(seen.size).toBe(SCREEN_SHARE_QUALITIES.length);
    expect(nextScreenQuality(quality)).toBe(SCREEN_SHARE_QUALITIES[0]);
    expect(screenQualityLabel("900p24")).toBe("900p 24FPS");
  });

  it("has an encoding for every quality the picker offers", () => {
    for (const quality of SCREEN_SHARE_QUALITIES) expect(SCREEN_ENCODINGS[quality]).toBeDefined();
  });
});
