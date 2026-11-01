import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VOICE_SOUNDS, previewVoiceSound, setVoiceSoundOn, voiceSoundOn } from "../app/lib/audio-cues";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice sound switches", () => {
  it("start on, and only the switched-off ones are stored", () => {
    for (const { id } of VOICE_SOUNDS) expect(voiceSoundOn(id)).toBe(true);
    setVoiceSoundOn("userJoin", false);
    expect(voiceSoundOn("userJoin")).toBe(false);
    expect(voiceSoundOn("userLeave")).toBe(true);
    expect(JSON.parse(store.get("huddle:voice-sounds") || "{}")).toEqual({ userJoin: false });
    setVoiceSoundOn("userJoin", true);
    expect(JSON.parse(store.get("huddle:voice-sounds") || "{}")).toEqual({});
  });

  it("survive a broken stored value", () => {
    store.set("huddle:voice-sounds", "not json");
    expect(voiceSoundOn("mute")).toBe(true);
  });

  it("previewing a switched-off sound leaves it off", () => {
    setVoiceSoundOn("userLeave", false);
    previewVoiceSound("userLeave");
    expect(voiceSoundOn("userLeave")).toBe(false);
  });
});
