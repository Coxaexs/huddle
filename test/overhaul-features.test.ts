import { describe, expect, it } from "vitest";
import { FEATURE_MODULES, normalizeDisabledModules } from "@/lib/features";
import { matchCommands } from "../app/lib/commands";
import { scopeProfileCss } from "@/lib/themes";

describe("Overhaul features: modules, commands, and CSS isolation", () => {
  it("parses and validates server/user disabled feature modules", () => {
    expect(Object.keys(FEATURE_MODULES)).toEqual([
      "dnd",
      "games",
      "music",
      "living_room",
      "cosmetics",
    ]);
    expect(normalizeDisabledModules(null)).toEqual([]);
    expect(normalizeDisabledModules("not-json")).toEqual([]);
    expect(normalizeDisabledModules(["dnd", "unknown", "games"])).toEqual([
      "dnd",
      "games",
    ]);
    expect(normalizeDisabledModules(["music", "cosmetics", "invalid"])).toEqual([
      "music",
      "cosmetics",
    ]);
  });

  it("declutters default '/' command list and filters commands by disabled modules", () => {
    const defaultList = matchCommands("/");
    const names = defaultList.map((c) => c.name);
    expect(names).toContain("purge");
    expect(names).toContain("roll");
    expect(names).toContain("play");
    expect(names).toContain("game");
    // Secondary companion link stubs are hidden until typed
    expect(names).not.toContain("inventory");
    expect(matchCommands("/inv").map((c) => c.name)).toContain("inventory");

    // Disabling dnd, games, and music removes their commands from autocomplete
    const filtered = matchCommands("/", [], ["dnd", "games", "music"]).map((c) => c.name);
    expect(filtered).not.toContain("roll");
    expect(filtered).not.toContain("game");
    expect(filtered).not.toContain("play");
    expect(filtered).toContain("purge");
    expect(filtered).toContain("poll");
  });

  it("keeps flo's profile CSS visually intact inside the card while preventing page-wide layout breakage", () => {
    const floCss = `
      html, body, #root, main {
        background-color: #0b0c10 !important;
        color: #c5c6c7 !important;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      body::before {
        content: "";
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        z-index: 9999;
      }
    `;
    const scoped = scopeProfileCss(floCss, "flo_id");
    expect(scoped).toContain(".user-profile-scoped-flo_id");
    expect(scoped).toContain("background-color: #0b0c10 !important");
    expect(scoped).toContain("position: absolute");
    expect(scoped).not.toContain("position: fixed");
    expect(scoped).not.toMatch(/html\s*,/);
  });
});
