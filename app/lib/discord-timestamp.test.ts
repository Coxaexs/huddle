import { describe, expect, it } from "vitest";
import { formatTimestamp, relativeTime, timestampDate } from "./discord-timestamp";

const MOMENT = timestampDate(1_762_372_800)!; // 2025-11-05 20:00:00 UTC

describe("Discord timestamps", () => {
  it("formats every absolute style", () => {
    const at = (style: Parameters<typeof formatTimestamp>[1]) => formatTimestamp(MOMENT, style, 0, "en-US", "UTC");
    expect(at("t")).toBe("8:00 PM");
    expect(at("T")).toBe("8:00:00 PM");
    expect(at("d")).toBe("11/5/25");
    expect(at("D")).toBe("November 5, 2025");
    expect(at("f")).toMatch(/^November 5, 2025(,| at) 8:00 PM$/);
    expect(at("F")).toMatch(/^Wednesday, November 5, 2025(,| at) 8:00 PM$/);
  });

  it("says how far away a time is, in the largest whole unit", () => {
    const now = MOMENT.getTime();
    expect(relativeTime(new Date(now + 2 * 3600_000), now, "en-US")).toBe("in 2 hours");
    expect(relativeTime(new Date(now - 3 * 86400_000), now, "en-US")).toBe("3 days ago");
    expect(relativeTime(new Date(now - 20_000), now, "en-US")).toBe("20 seconds ago");
    expect(formatTimestamp(new Date(now + 86400_000), "R", now, "tr-TR")).toBe("yarın");
  });

  it("rejects numbers that are not a time", () => {
    expect(timestampDate(Number.NaN)).toBeNull();
    expect(timestampDate(9e15)).toBeNull();
    expect(timestampDate(0)?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });
});
