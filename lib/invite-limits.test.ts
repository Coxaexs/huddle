import { describe, expect, it } from "vitest";
import { clampInviteUses, INVITE_USE_CHOICES, MAX_INVITE_USES } from "./invite-limits";

describe("clampInviteUses", () => {
  it("keeps a 200-use event code", () => {
    expect(clampInviteUses(200)).toBe(200);
  });

  it("never mints an unlimited code: 0 and negatives become one use", () => {
    expect(clampInviteUses(0)).toBe(1);
    expect(clampInviteUses(-5)).toBe(1);
  });

  it("caps at the maximum", () => {
    expect(clampInviteUses(10_000)).toBe(MAX_INVITE_USES);
    expect(clampInviteUses(1000)).toBe(1000);
  });

  it("drops fractions", () => {
    expect(clampInviteUses(12.9)).toBe(12);
  });

  it("defaults a missing or non-numeric value to one use", () => {
    expect(clampInviteUses(undefined)).toBe(1);
    expect(clampInviteUses("200")).toBe(1);
    expect(clampInviteUses(Number.NaN)).toBe(1);
  });

  it("offers only choices the server accepts unchanged", () => {
    for (const choice of INVITE_USE_CHOICES) expect(clampInviteUses(choice)).toBe(choice);
  });
});
