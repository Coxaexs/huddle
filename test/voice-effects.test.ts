import { afterEach, beforeEach, describe, expect, it } from "vitest";

// mic-chain reads and writes window.localStorage; the suite runs in node.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("voice effects setting", () => {
  it("defaults to no effect", async () => {
    const { readMicSettings } = await import("../app/lib/mic-chain");
    expect(readMicSettings().voiceEffect).toBe("none");
  });

  it("saves and reads back an effect", async () => {
    const { readMicSettings, writeMicSettings } = await import("../app/lib/mic-chain");
    writeMicSettings({ voiceEffect: "vampire" });
    expect(readMicSettings().voiceEffect).toBe("vampire");
    writeMicSettings({ voiceEffect: "gramophone" });
    expect(readMicSettings().voiceEffect).toBe("gramophone");
  });

  it("ignores an unknown saved value", async () => {
    const { readMicSettings } = await import("../app/lib/mic-chain");
    store.set("huddle-voice-effect", "chipmunk");
    expect(readMicSettings().voiceEffect).toBe("none");
  });

  it("lists every effect with a label", async () => {
    const { VOICE_EFFECTS } = await import("../app/lib/voice-effects");
    expect(VOICE_EFFECTS.map((effect) => effect.id)).toEqual(["none", "vampire", "gramophone"]);
  });
});
