import { describe, expect, it } from "vitest";
import { botMenuKind } from "./bot-menu-kind";

describe("botMenuKind", () => {
  it("gives the music bot its menu", () => {
    expect(botMenuKind("Music + Watch")).toBe("music");
  });
  it("gives the D&D bot its menu", () => {
    expect(botMenuKind("D&D Bot")).toBe("dnd");
  });
  it("leaves every other bot with the ordinary message menu", () => {
    for (const name of ["Weekly digest", "Hoffle Bot", "Some Third Party Bot", ""]) {
      expect(botMenuKind(name)).toBeNull();
    }
  });
});
