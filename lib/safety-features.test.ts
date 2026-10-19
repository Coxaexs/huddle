import { describe, expect, it } from "vitest";
import { clampVerificationLevel, verificationShortfall } from "./verification-level";
import { dmPolicyAllows, normalizeDmPolicy } from "./dm-policy";
import { normalizeVanityCode, VANITY_MAX } from "./vanity";
import { slowmodeRemaining } from "./slowmode";
import { normalizeRoleIcon, roleIconIsImage } from "./role-icon";
import { Permission, ALL_PERMISSIONS, hasPermission } from "./permissions";
import { talkingPriorityKey } from "../app/lib/priority-speaker";
import type { VoiceParticipant } from "./protocol";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("verificationShortfall", () => {
  const settled = { emailVerified: true, createdAt: minutesAgo(60), joinedAt: minutesAgo(60) };

  it("lets everyone post at level 0", () => {
    expect(verificationShortfall(0, { emailVerified: false, createdAt: minutesAgo(0), joinedAt: minutesAgo(0) }, NOW)).toBeNull();
  });

  it("asks for a verified email from Low up", () => {
    expect(verificationShortfall(1, { ...settled, emailVerified: false }, NOW)).toBe("email");
    expect(verificationShortfall(1, settled, NOW)).toBeNull();
  });

  it("asks for a 5-minute-old account from Medium up", () => {
    expect(verificationShortfall(2, { ...settled, createdAt: minutesAgo(4) }, NOW)).toBe("account-age");
    expect(verificationShortfall(2, { ...settled, createdAt: minutesAgo(5) }, NOW)).toBeNull();
    expect(verificationShortfall(1, { ...settled, createdAt: minutesAgo(1) }, NOW)).toBeNull();
  });

  it("asks for 10 minutes of membership at High", () => {
    expect(verificationShortfall(3, { ...settled, joinedAt: minutesAgo(9) }, NOW)).toBe("membership-age");
    expect(verificationShortfall(3, { ...settled, joinedAt: minutesAgo(10) }, NOW)).toBeNull();
  });

  it("reports the email first when several are missing", () => {
    expect(verificationShortfall(3, { emailVerified: false, createdAt: minutesAgo(0), joinedAt: minutesAgo(0) }, NOW)).toBe("email");
  });

  it("treats an unknown date as old (it predates the column)", () => {
    expect(verificationShortfall(3, { emailVerified: true, createdAt: null, joinedAt: null }, NOW)).toBeNull();
  });

  it("clamps stored levels into 0..3", () => {
    expect(clampVerificationLevel(2)).toBe(2);
    expect(clampVerificationLevel(4)).toBe(0);
    expect(clampVerificationLevel(-1)).toBe(0);
    expect(clampVerificationLevel("3")).toBe(3);
    expect(clampVerificationLevel(undefined)).toBe(0);
  });
});

describe("dm policy", () => {
  it("lets anyone in on everyone", () => {
    expect(dmPolicyAllows("everyone", { friends: false, shareServer: false })).toBe(true);
  });

  it("lets friends and server-mates in on servers", () => {
    expect(dmPolicyAllows("servers", { friends: false, shareServer: true })).toBe(true);
    expect(dmPolicyAllows("servers", { friends: true, shareServer: false })).toBe(true);
    expect(dmPolicyAllows("servers", { friends: false, shareServer: false })).toBe(false);
  });

  it("lets only friends in on friends", () => {
    expect(dmPolicyAllows("friends", { friends: true, shareServer: false })).toBe(true);
    expect(dmPolicyAllows("friends", { friends: false, shareServer: true })).toBe(false);
  });

  it("falls back to everyone for unknown values", () => {
    expect(normalizeDmPolicy("strangers")).toBe("everyone");
    expect(normalizeDmPolicy(null)).toBe("everyone");
    expect(normalizeDmPolicy("friends")).toBe("friends");
  });
});

describe("normalizeVanityCode", () => {
  it("uppercases, like every code lookup", () => {
    expect(normalizeVanityCode(" hoffle-fans ")).toEqual({ ok: true, code: "HOFFLE-FANS" });
  });

  it("clears on empty or null", () => {
    expect(normalizeVanityCode("")).toEqual({ ok: true, code: null });
    expect(normalizeVanityCode(null)).toEqual({ ok: true, code: null });
  });

  it("refuses codes chat links would not recognise", () => {
    expect(normalizeVanityCode("abc").ok).toBe(false);
    expect(normalizeVanityCode("x".repeat(VANITY_MAX + 1)).ok).toBe(false);
    expect(normalizeVanityCode("my server").ok).toBe(false);
    expect(normalizeVanityCode("double--dash").ok).toBe(false);
    expect(normalizeVanityCode("-edge").ok).toBe(false);
    expect(normalizeVanityCode("ünicode").ok).toBe(false);
  });
});

describe("normalizeRoleIcon", () => {
  it("accepts a single emoji, including multi-code-point ones", () => {
    expect(normalizeRoleIcon("🛡️")).toEqual({ ok: true, icon: "🛡️" });
    expect(normalizeRoleIcon("👩‍🚀")).toEqual({ ok: true, icon: "👩‍🚀" });
  });

  it("accepts an uploaded image and nothing from outside", () => {
    expect(normalizeRoleIcon("/hangout/api/uploads/abc.png").ok).toBe(true);
    expect(normalizeRoleIcon("/etc/passwd").ok).toBe(false);
    expect(normalizeRoleIcon("https://example.com/x.png").ok).toBe(false);
  });

  it("refuses text and markup", () => {
    expect(normalizeRoleIcon("MOD").ok).toBe(false);
    expect(normalizeRoleIcon("<b>").ok).toBe(false);
  });

  it("clears on empty", () => {
    expect(normalizeRoleIcon("  ")).toEqual({ ok: true, icon: null });
  });

  it("tells images from emoji", () => {
    expect(roleIconIsImage("/hangout/api/uploads/a.png")).toBe(true);
    expect(roleIconIsImage("⭐")).toBe(false);
    expect(roleIconIsImage(null)).toBe(false);
  });
});

describe("priority speaker", () => {
  it("is part of ALL_PERMISSIONS, so owners hold it", () => {
    expect(hasPermission(ALL_PERMISSIONS, Permission.PRIORITY_SPEAKER)).toBe(true);
  });

  const seat = (connectionId: string, extra: Partial<VoiceParticipant> = {}): VoiceParticipant =>
    ({ id: connectionId, connectionId, username: connectionId, displayName: connectionId, avatar: "", color: "", joinedAt: 0, muted: false, deafened: false, ...extra }) as VoiceParticipant;

  it("lists only priority speakers who are talking and unmuted", () => {
    const seats = [
      seat("a", { prioritySpeaker: true }),
      seat("b", { prioritySpeaker: true }),
      seat("c"),
      seat("d", { prioritySpeaker: true, muted: true }),
    ];
    expect(talkingPriorityKey(seats, new Set(["a", "c", "d"]))).toBe("a");
    expect(talkingPriorityKey(seats, new Set(["c"]))).toBe("");
    expect(talkingPriorityKey(seats, new Set(["b", "a"]))).toBe("a,b");
  });
});

describe("slowmodeRemaining", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();

  it("is free with slowmode off or no earlier post", () => {
    expect(slowmodeRemaining(ago(1), 0, now)).toBe(0);
    expect(slowmodeRemaining(null, 30, now)).toBe(0);
  });

  it("counts down whole seconds from the last post", () => {
    expect(slowmodeRemaining(ago(0), 10, now)).toBe(10);
    expect(slowmodeRemaining(ago(3.5), 10, now)).toBe(7);
    expect(slowmodeRemaining(ago(10), 10, now)).toBe(0);
    expect(slowmodeRemaining(ago(60), 10, now)).toBe(0);
  });

  it("ignores an unreadable date", () => {
    expect(slowmodeRemaining("not a date", 10, now)).toBe(0);
  });
});
