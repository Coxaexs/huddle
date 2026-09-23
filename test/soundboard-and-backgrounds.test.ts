import { describe, expect, it } from "vitest";
import { SOUNDBOARD_PRESETS, playPresetSound } from "@/lib/soundboard-presets";
import { VIRTUAL_BACKGROUND_PRESETS, type BackgroundMode } from "@/app/lib/virtual-background";

describe("Soundboard Presets System", () => {
  it("provides all essential instant presets with unique ids", () => {
    expect(SOUNDBOARD_PRESETS.length).toBeGreaterThanOrEqual(7);
    const ids = SOUNDBOARD_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    expect(ids).toContain("airhorn");
    expect(ids).toContain("rimshot");
    expect(ids).toContain("bruh");
    expect(ids).toContain("quack");
    expect(ids).toContain("gg");
    expect(ids).toContain("ding");
    expect(ids).toContain("applause");
  });

  it("safely handles playPresetSound when AudioContext is unavailable in node/headless", () => {
    expect(() => {
      playPresetSound("airhorn", 0.5);
      playPresetSound("unknown-id", 0.5);
    }).not.toThrow();
  });
});

describe("Virtual Background Presets", () => {
  it("defines standard background modes including off, blur, and artistic backdrops", () => {
    expect(VIRTUAL_BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(5);
    const ids = VIRTUAL_BACKGROUND_PRESETS.map((p) => p.id as BackgroundMode);
    expect(ids).toContain("none");
    expect(ids).toContain("blur");
    expect(ids).toContain("studio");
    expect(ids).toContain("cyberpunk");
    expect(ids).toContain("sunset");
    expect(ids).toContain("matrix");
    expect(ids).toContain("cosmos");

    VIRTUAL_BACKGROUND_PRESETS.forEach((preset) => {
      expect(preset.name).toBeTruthy();
      expect(preset.emoji).toBeTruthy();
      expect(preset.badge).toBeTruthy();
    });
  });

  it("provides 7 high-quality offline built-in virtual background images", async () => {
    const { BUILTIN_BACKGROUND_IMAGES } = await import("@/app/lib/virtual-background");
    expect(BUILTIN_BACKGROUND_IMAGES.length).toBe(7);

    const ids = BUILTIN_BACKGROUND_IMAGES.map((img) => img.id);
    expect(ids).toContain("preset:cyberpunk");
    expect(ids).toContain("preset:office");
    expect(ids).toContain("preset:cafe");
    expect(ids).toContain("preset:sunset");
    expect(ids).toContain("preset:lofi");
    expect(ids).toContain("preset:scifi");
    expect(ids).toContain("preset:studio");

    for (const img of BUILTIN_BACKGROUND_IMAGES) {
      expect(img.name).toBeTruthy();
      expect(img.svgDataUri).toMatch(/^data:image\/svg\+xml;/);
    }
  });

  it("handles custom background storage gracefully in headless/mock environment", async () => {
    // Setup mock localStorage if not present in test runner
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    };
    const originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    try {
      const { loadCustomBackgrounds, saveCustomBackground, deleteCustomBackground } = await import(
        "@/app/lib/virtual-background"
      );

      // Initial empty state
      const initial = loadCustomBackgrounds();
      expect(Array.isArray(initial)).toBe(true);

      // Save item
      const saved = saveCustomBackground("My Room", "data:image/png;base64,mockdata");
      expect(saved.id).toContain("custom:");
      expect(saved.name).toBe("My Room");

      // Load items
      const loaded = loadCustomBackgrounds();
      expect(loaded.some((item) => item.id === saved.id)).toBe(true);

      // Delete item
      deleteCustomBackground(saved.id);
      const afterDelete = loadCustomBackgrounds();
      expect(afterDelete.some((item) => item.id === saved.id)).toBe(false);
    } finally {
      if (originalStorage === undefined) {
        // @ts-expect-error cleanup mock
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(globalThis, "localStorage", {
          value: originalStorage,
          writable: true,
          configurable: true,
        });
      }
    }
  });
});
