// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SOUND_EVENTS,
  SOUND_PRESETS,
  getMsnVolume,
  isRetroSoundThemeEnabled,
  playSound,
  presetsFor,
  previewSound,
  setMsnVolume,
  setRetroSoundThemeEnabled,
  setSoundChoice,
  soundChoice,
} from "../app/lib/msn-sounds";

describe("MSN & Windows 2000 Retro Sound Engine", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("includes all requested retro sound events and presets", () => {
    const eventIds = SOUND_EVENTS.map((e) => e.id);
    expect(eventIds).toContain("message");
    expect(eventIds).toContain("send");
    expect(eventIds).toContain("signin");
    expect(eventIds).toContain("nudge");
    expect(eventIds).toContain("error");
    expect(eventIds).toContain("game");
    expect(eventIds).toContain("wink");

    const presetIds = SOUND_PRESETS.map((p) => p.id);
    expect(presetIds).toContain("classic");
    expect(presetIds).toContain("win_error");
    expect(presetIds).toContain("win_ding");
    expect(presetIds).toContain("win_tada");
    expect(presetIds).toContain("win_hardware");
    expect(presetIds).toContain("chime");
    expect(presetIds).toContain("none");
  });

  it("provides sensible defaults for classic and error events", () => {
    expect(soundChoice("message")).toBe("classic");
    expect(soundChoice("send")).toBe("classic");
    expect(soundChoice("signin")).toBe("classic");
    expect(soundChoice("nudge")).toBe("classic");
    expect(soundChoice("error")).toBe("win_error");
  });

  it("persists and reads user sound choices", () => {
    setSoundChoice("message", "win_ding");
    expect(soundChoice("message")).toBe("win_ding");

    setSoundChoice("nudge", "win_error");
    expect(soundChoice("nudge")).toBe("win_error");
  });

  it("manages master volume with clamping", () => {
    expect(getMsnVolume()).toBe(0.7);

    setMsnVolume(0.5);
    expect(getMsnVolume()).toBe(0.5);

    setMsnVolume(1.5);
    expect(getMsnVolume()).toBe(1.0);

    setMsnVolume(-0.2);
    expect(getMsnVolume()).toBe(0.0);
  });

  it("manages global retro sound theme preference", () => {
    expect(isRetroSoundThemeEnabled()).toBe(false);

    setRetroSoundThemeEnabled(true);
    expect(isRetroSoundThemeEnabled()).toBe(true);

    setRetroSoundThemeEnabled(false);
    expect(isRetroSoundThemeEnabled()).toBe(false);
  });

  it("handles sound preview and playback safely in test/headless environments", () => {
    // Should not throw even without full WebAudio in JSDOM
    expect(() => playSound("message")).not.toThrow();
    expect(() => playSound("send")).not.toThrow();
    expect(() => playSound("signin")).not.toThrow();
    expect(() => playSound("nudge")).not.toThrow();
    expect(() => playSound("error")).not.toThrow();
    expect(() => playSound("game", "win")).not.toThrow();
    expect(() => playSound("game", "mine")).not.toThrow();
    expect(() => previewSound("error", "win_error")).not.toThrow();
    expect(() => previewSound("message", "win_ding")).not.toThrow();
    expect(() => previewSound("game", "win_tada")).not.toThrow();
  });

  it("filters presets for winks (only classic and none allowed)", () => {
    const winkPresets = presetsFor("wink").map((p) => p.id);
    expect(winkPresets).toEqual(["classic", "none"]);

    const messagePresets = presetsFor("message").map((p) => p.id);
    expect(messagePresets).toContain("classic");
    expect(messagePresets).toContain("win_error");
  });
});
