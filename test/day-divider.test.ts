import { describe, expect, it } from "vitest";
import { dayDividerLabel } from "@/app/lib/chat/format";

const now = new Date(2026, 9, 8, 15, 0);
const at = (d: number, h: number) => ({ createdAt: new Date(2026, 9, d, h, 0).toISOString() });

describe("dayDividerLabel", () => {
  it("marks the first message of each day only", () => {
    expect(dayDividerLabel(at(8, 9), at(8, 8), now)).toBeNull();
    expect(dayDividerLabel(at(8, 0), at(7, 23), now)).toBe("Today");
    expect(dayDividerLabel(at(7, 1), at(6, 23), now)).toBe("Yesterday");
    expect(dayDividerLabel(at(5, 1), at(4, 23), now)).toMatch(/5/);
  });

  it("skips the line above the first loaded message from today, but not an older one", () => {
    expect(dayDividerLabel(at(8, 9), undefined, now)).toBeNull();
    expect(dayDividerLabel(at(6, 9), undefined, now)).not.toBeNull();
  });

  it("adds the year for other years, and ignores missing times", () => {
    expect(dayDividerLabel({ createdAt: new Date(2025, 0, 2).toISOString() }, undefined, now)).toMatch(/2025/);
    expect(dayDividerLabel({}, at(8, 1), now)).toBeNull();
  });
});
