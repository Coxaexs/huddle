import { describe, it, expect } from "vitest";
import {
  BUILTIN_THEMES,
  exportThemeCode,
  importThemeCode,
  scopeProfileCss,
  checkProfileCss,
  PROFILE_CSS_PRESETS,
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
    expect(scoped).toContain(".user-profile-scoped-user_123{ border: 2px solid cyan; }");
    expect(scoped).toContain(".user-profile-scoped-user_123 .profile-banner{");
  });

  it("refuses profile CSS that could escape the card", () => {
    const escapes = [
      "} body { display: none } .x {",
      ".a { color: red; }}",
      ".a { color: red;",
      ".a { content: '</style><script>alert(1)</script>'; }",
      ".a { content: '\\3c/style>'; }",
      "@import url(/x.css);",
      "@font-face { font-family: x; src: url(/f.woff); }",
      ".a { background: url(https://evil.example/p.png); }",
      ".a { background: url('//evil.example/p.png'); }",
      ".a { background: url(\"h\\74tps://evil.example\"); }",
      ".a { background: u\\72l(https://evil.example); }",
      ".a { background: image-set('https://evil.example' 1x); }",
      ".a { background: url(/x}); }",
      ".a { color: red; /* never closed",
    ];
    for (const css of escapes) {
      expect(checkProfileCss(css).ok, css).toBe(false);
      expect(scopeProfileCss(css, "u1"), css).toBe("");
    }
  });

  it("keeps safe profile CSS working", () => {
    const css = `@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
@media (max-width: 500px) { .profile-banner { height: 40px } }
.profile-card:hover, :is(.a, .b) > .c { background: url("/hangout/api/uploads/x.png"), url(data:image/png;base64,AAAA); }
.bio::before { content: "\\2605 {not a brace}"; }`;
    const checked = checkProfileCss(css);
    expect(checked.ok).toBe(true);
    const scoped = scopeProfileCss(css, "u1");
    expect(scoped).toContain("@keyframes spin { from {");
    expect(scoped).toContain("@media (max-width: 500px){.user-profile-scoped-u1 .profile-banner{");
    expect(scoped).toContain(".user-profile-scoped-u1:hover, .user-profile-scoped-u1 :is(.a, .b) > .c{");
  });

  it("accepts every built-in profile CSS preset", () => {
    for (const preset of PROFILE_CSS_PRESETS) {
      expect(checkProfileCss(preset.css), preset.name).toEqual({ ok: true, css: expect.any(String) });
    }
  });
});
