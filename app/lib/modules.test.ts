import { beforeEach, describe, expect, it } from "vitest";
import { moduleOn, resetModuleSwitches, setUserModuleSwitches, syncModuleSwitches, userModulesOff } from "./modules";

describe("module switches", () => {
  beforeEach(() => resetModuleSwitches());

  it("has everything on until told otherwise", () => {
    expect(moduleOn("games")).toBe(true);
    expect(moduleOn("cosmetics")).toBe(true);
  });

  it("switches a module off when either the person or the server says so", () => {
    syncModuleSwitches(["games"], ["dnd"]);
    expect(moduleOn("games")).toBe(false);
    expect(moduleOn("dnd")).toBe(false);
    expect(moduleOn("music")).toBe(true);
    expect(userModulesOff()).toEqual(["games"]);
  });

  it("ignores names it does not know", () => {
    syncModuleSwitches(["music-bot", "nonsense", "music"], undefined);
    expect(userModulesOff()).toEqual(["music"]);
  });

  it("keeps a switch flipped in Settings until the session brings a new list", () => {
    const fromSession = ["games"];
    syncModuleSwitches(fromSession, undefined);
    setUserModuleSwitches([]);
    expect(moduleOn("games")).toBe(true);
    // The shell renders again with the same, now stale, session list.
    syncModuleSwitches(fromSession, undefined);
    expect(moduleOn("games")).toBe(true);
    // The session catches up.
    syncModuleSwitches(["living_room"], undefined);
    expect(moduleOn("games")).toBe(true);
    expect(moduleOn("living_room")).toBe(false);
  });

  it("a server change does not undo the person's own switches", () => {
    const mine = ["games"];
    syncModuleSwitches(mine, ["dnd"]);
    syncModuleSwitches(mine, []);
    expect(moduleOn("games")).toBe(false);
    expect(moduleOn("dnd")).toBe(true);
  });
});
