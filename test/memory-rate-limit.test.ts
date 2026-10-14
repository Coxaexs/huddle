import { beforeEach, describe, expect, it } from "vitest";
import { checkMemoryRateLimit, getMemoryRateLimitStats, resetMemoryRateLimits } from "@/lib/rate-limit";

const rule = { action: "recap", limit: 2, windowSeconds: 600 };

beforeEach(() => resetMemoryRateLimits());

describe("in-memory rate limits", () => {
  it("refuses past the limit until the window ends", () => {
    const t = 1_800_000_000_000;
    expect(checkMemoryRateLimit(rule, "u1", t).allowed).toBe(true);
    expect(checkMemoryRateLimit(rule, "u1", t + 1).allowed).toBe(true);
    const refused = checkMemoryRateLimit(rule, "u1", t + 2);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
    // Someone else has their own budget.
    expect(checkMemoryRateLimit(rule, "u2", t + 2).allowed).toBe(true);
  });

  it("keeps a long window's count through the minute sweeps", () => {
    const start = Math.floor(1_800_000_000_000 / 600_000) * 600_000;
    checkMemoryRateLimit(rule, "u1", start);
    checkMemoryRateLimit(rule, "u1", start + 1);
    // Six minutes on, still the same ten-minute window: a sweep must not reset it.
    expect(checkMemoryRateLimit(rule, "u1", start + 360_000).allowed).toBe(false);
    expect(checkMemoryRateLimit(rule, "u1", start + 600_000).allowed).toBe(true);
    expect(getMemoryRateLimitStats().totalBuckets).toBe(1);
  });
});
