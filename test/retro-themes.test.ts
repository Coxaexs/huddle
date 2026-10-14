import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES, exportThemeCode, importThemeCode } from "@/lib/themes";

describe("Retro Theme Expansion (Winamp & TeamSpeak 2)", () => {
  describe("Theme Registry & Tokens", () => {
    it("contains classic Winamp theme with titanium and lime-green tokens", () => {
      const winamp = BUILTIN_THEMES.find((t) => t.id === "winamp");
      expect(winamp).toBeDefined();
      expect(winamp!.name).toBe("Classic Winamp");
      expect(winamp!.colors.ink).toBe("#00ff00");
      expect(winamp!.colors.lavender).toBe("#00ff00"); // Primary lime accent
      expect(winamp!.baseTheme).toBe("legacy");
    });

    it("contains TeamSpeak 2 theme with Luna gray and navy blue tokens", () => {
      const ts2 = BUILTIN_THEMES.find((t) => t.id === "teamspeak");
      expect(ts2).toBeDefined();
      expect(ts2!.name).toBe("TeamSpeak 2");
      expect(ts2!.colors.paper).toBe("#e0ded6");
      expect(ts2!.colors.lavender).toBe("#0a246a"); // Classic TS2 navy
      expect(ts2!.baseTheme).toBe("light");
    });

    it("exports and imports Winamp and TeamSpeak themes cleanly", () => {
      const winamp = BUILTIN_THEMES.find((t) => t.id === "winamp")!;
      const exported = exportThemeCode(winamp);
      expect(exported).toContain("huddle-theme:v1:");

      const imported = importThemeCode(exported);
      expect(imported!.name).toBe("Classic Winamp");
      expect(imported!.colors.ink).toBe("#00ff00");

      const ts2 = BUILTIN_THEMES.find((t) => t.id === "teamspeak")!;
      const exportedTs = exportThemeCode(ts2);
      const importedTs = importThemeCode(exportedTs);
      expect(importedTs!.name).toBe("TeamSpeak 2");
      expect(importedTs!.colors.lavender).toBe("#0a246a");
    });
  });
});
