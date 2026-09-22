import { describe, it, expect } from "vitest";
import {
  BUILTIN_THEMES,
  exportThemeCode,
  importThemeCode,
  scopeProfileCss,
  type Theme,
} from "../lib/themes";

describe("Theme System & Serialization", () => {
  it("includes all expected builtin themes", () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(ids).toContain("cozy");
    expect(ids).toContain("legacy");
    expect(ids).toContain("light");
    expect(ids).toContain("cyberpunk");
    expect(ids).toContain("midnight");
    expect(ids).toContain("forest");
    expect(ids).toContain("sunset");
    expect(ids).toContain("catppuccin");
  });

  it("exports and imports a theme without loss of parameters", () => {
    const original: Theme = {
      id: "theme_custom_test",
      name: "Nebula Dreams",
      description: "A gorgeous cosmic violet theme",
      baseTheme: "cozy",
      colors: {
        ink: "#ffffff",
        muted: "#888888",
        paper: "#0a0814",
        panel: "#120e24",
        chatBg: "#17122e",
        lavender: "#c084fc",
        coral: "#f43f5e",
        mint: "#2dd4bf",
      },
      corners: 22,
      backdrop: "stars" as const,
      customCss: ".message { border-radius: 8px; }",
      author: {
        displayName: "StarGazer",
        username: "stargazer",
      },
    };

    const code = exportThemeCode(original);
    expect(code.startsWith("huddle-theme:v1:")).toBe(true);

    const imported = importThemeCode(code);
    expect(imported).not.toBeNull();
    expect(imported?.name).toBe("Nebula Dreams");
    expect(imported?.description).toBe("A gorgeous cosmic violet theme");
    expect(imported?.baseTheme).toBe("cozy");
    expect(imported?.colors.lavender).toBe("#c084fc");
    expect(imported?.colors.paper).toBe("#0a0814");
    expect(imported?.corners).toBe(22);
    expect(imported?.backdrop).toBe("stars");
    expect(imported?.customCss).toBe(".message { border-radius: 8px; }");
    expect(imported?.author?.displayName).toBe("StarGazer");
  });

  it("safely handles malformed theme strings", () => {
    expect(importThemeCode("")).toBeNull();
    expect(importThemeCode("invalid-code")).toBeNull();
    expect(importThemeCode("huddle-theme:v1:not-valid-base64???")).toBeNull();
    expect(importThemeCode("{}")).toBeNull();
  });

  it("scopes profile CSS to prevent styling leakage", () => {
    const rawCss = `
      .profile-card { border: 2px solid cyan; }
      .profile-banner { background: red; }
    `;
    const scoped = scopeProfileCss(rawCss, "user_123");
    expect(scoped).toContain(".user-profile-scoped-user_123");
  });
});
