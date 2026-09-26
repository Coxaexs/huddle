import { describe, expect, it } from "vitest";
import { formatVoiceDuration, voiceElapsedMs } from "./voice-duration";

describe("formatVoiceDuration", () => {
  it("counts up in minutes and seconds under an hour", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(1_000)).toBe("0:01");
    expect(formatVoiceDuration(65_000)).toBe("1:05");
    expect(formatVoiceDuration(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("adds the hour only once it is needed", () => {
    expect(formatVoiceDuration(3_600_000)).toBe("1:00:00");
    expect(formatVoiceDuration(3_600_000 + 7 * 60_000 + 4_000)).toBe("1:07:04");
    expect(formatVoiceDuration(25 * 3_600_000 + 60_000)).toBe("25:01:00");
  });

  it("never shows a negative or broken clock", () => {
    expect(formatVoiceDuration(-5_000)).toBe("0:00");
    expect(formatVoiceDuration(Number.NaN)).toBe("0:00");
    expect(formatVoiceDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("voiceElapsedMs", () => {
  it("measures from the hub's join time to now", () => {
    expect(voiceElapsedMs(1_000_000, 1_000_000 + 90_000)).toBe(90_000);
  });

  it("treats a missing seat time as unknown", () => {
    expect(voiceElapsedMs(null, 1_000_000)).toBe(0);
    expect(voiceElapsedMs(undefined, 1_000_000)).toBe(0);
    expect(voiceElapsedMs(0, 1_000_000)).toBe(0);
  });

  it("clamps a clock that looks stale to zero", () => {
    expect(voiceElapsedMs(2_000_000, 1_000_000)).toBe(0);
  });
});
