import { describe, expect, it } from "vitest";
import { checkProfileCss, checkThemeCss } from "./themes";

const errorOf = (check: { ok: boolean; error?: string }) => (check.ok ? undefined : check.error);

describe("checkThemeCss", () => {
  it("accepts ordinary theme styling", () => {
    expect(checkThemeCss(".sidebar { backdrop-filter: blur(8px); position: fixed; }").ok).toBe(true);
  });
  it("refuses outside URLs and imports", () => {
    expect(checkThemeCss(".a { background: url(https://evil.example/x.png) }").ok).toBe(false);
    expect(checkThemeCss('@import "https://evil.example/x.css";').ok).toBe(false);
  });
  it("refuses selectors on typed input values", () => {
    expect(checkThemeCss('input[value^="a"] { color: red }').ok).toBe(false);
  });
});

describe("checkProfileCss", () => {
  it("refuses fixed positioning that would cover the app", () => {
    expect(checkProfileCss(".profile-card { position: fixed; inset: 0 }").ok).toBe(false);
    expect(checkProfileCss(".profile-card { position: relative }").ok).toBe(true);
  });
});

import { BUILTIN_THEMES, THEME_CSS_PRESETS } from "./themes";

describe("shipped themes", () => {
  it("all pass the theme CSS rules", () => {
    for (const theme of BUILTIN_THEMES) {
      if (theme.customCss) expect([theme.id, errorOf(checkThemeCss(theme.customCss))]).toEqual([theme.id, undefined]);
    }
    for (const preset of THEME_CSS_PRESETS) {
      expect([preset.name, errorOf(checkThemeCss(preset.css))]).toEqual([preset.name, undefined]);
    }
  });
});

import { PROFILE_CSS_PRESETS } from "./themes";

describe("shipped profile presets", () => {
  it("all pass the profile CSS rules", () => {
    for (const preset of PROFILE_CSS_PRESETS) {
      expect([preset.name, errorOf(checkProfileCss(preset.css))]).toEqual([preset.name, undefined]);
    }
  });
});
