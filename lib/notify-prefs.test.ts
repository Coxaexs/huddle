import { describe, expect, it } from "vitest";
import {
  MAX_KEYWORDS,
  cleanKeywords,
  defaultNotifyPrefs,
  inQuietHours,
  isDefaultNotifyPrefs,
  keywordHit,
  normalizeNotifyPrefs,
} from "./notify-prefs";

const quiet = (from: string, to: string, tz = "UTC") => ({
  ...defaultNotifyPrefs(),
  quiet: { on: true, from, to, tz },
});
const at = (iso: string) => new Date(iso);

describe("normalizeNotifyPrefs", () => {
  it("falls back to the default for anything unreadable", () => {
    for (const raw of [null, undefined, "", "not json", 7, "[]"]) {
      expect(isDefaultNotifyPrefs(normalizeNotifyPrefs(raw))).toBe(true);
    }
  });

  it("keeps valid values and drops invalid ones field by field", () => {
    const prefs = normalizeNotifyPrefs(
      JSON.stringify({ quiet: { on: true, from: "22:30", to: "25:00", tz: "Not/AZone" }, keywords: [" Pizza ", "pizza", "a", 5] }),
    );
    expect(prefs.quiet).toEqual({ on: true, from: "22:30", to: "08:00", tz: "UTC" });
    expect(prefs.keywords).toEqual(["pizza"]);
  });

  it("caps the keyword list", () => {
    const many = Array.from({ length: 50 }, (_, index) => `word${index}`);
    expect(cleanKeywords(many)).toHaveLength(MAX_KEYWORDS);
  });
});

describe("inQuietHours", () => {
  it("is never quiet when switched off", () => {
    expect(inQuietHours(defaultNotifyPrefs(), at("2026-01-01T02:00:00Z"))).toBe(false);
  });

  it("handles a period that crosses midnight", () => {
    const prefs = quiet("23:00", "08:00");
    expect(inQuietHours(prefs, at("2026-01-01T23:00:00Z"))).toBe(true);
    expect(inQuietHours(prefs, at("2026-01-01T03:00:00Z"))).toBe(true);
    expect(inQuietHours(prefs, at("2026-01-01T08:00:00Z"))).toBe(false);
    expect(inQuietHours(prefs, at("2026-01-01T15:00:00Z"))).toBe(false);
  });

  it("handles a period inside one day", () => {
    const prefs = quiet("13:00", "14:00");
    expect(inQuietHours(prefs, at("2026-01-01T13:30:00Z"))).toBe(true);
    expect(inQuietHours(prefs, at("2026-01-01T14:00:00Z"))).toBe(false);
    expect(inQuietHours(prefs, at("2026-01-01T12:59:00Z"))).toBe(false);
  });

  it("uses the saved time zone, not the server's", () => {
    // 22:30 UTC is 23:30 in Amsterdam in winter.
    const prefs = quiet("23:00", "08:00", "Europe/Amsterdam");
    expect(inQuietHours(prefs, at("2026-01-01T22:30:00Z"))).toBe(true);
    expect(inQuietHours(quiet("23:00", "08:00"), at("2026-01-01T22:30:00Z"))).toBe(false);
  });

  it("treats equal times as the whole day", () => {
    expect(inQuietHours(quiet("09:00", "09:00"), at("2026-01-01T17:00:00Z"))).toBe(true);
  });
});

describe("keywordHit", () => {
  const prefs = { ...defaultNotifyPrefs(), keywords: ["cat", "game night", "ünlü"] };

  it("matches whole words, ignoring case", () => {
    expect(keywordHit(prefs, "My CAT!")).toBe("cat");
    expect(keywordHit(prefs, "cat")).toBe("cat");
    expect(keywordHit(prefs, "that category")).toBeNull();
    expect(keywordHit(prefs, "concat cat")).toBe("cat");
  });

  it("matches phrases and non-ASCII words", () => {
    expect(keywordHit(prefs, "Is Game Night on?")).toBe("game night");
    expect(keywordHit(prefs, "çok ünlü biri")).toBe("ünlü");
    expect(keywordHit(prefs, "ünlüler")).toBeNull();
  });

  it("is null with no keywords or no text", () => {
    expect(keywordHit(defaultNotifyPrefs(), "cat")).toBeNull();
    expect(keywordHit(prefs, "")).toBeNull();
  });
});
