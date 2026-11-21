import { describe, expect, it } from "vitest";
import { resolveCheckCommand } from "./dnd-skills";
import type { TableCharacter } from "./lounge-shared";

const rogue: TableCharacter = {
  name: "Lyra",
  portraitUrl: null,
  abilities: [8, 18, 12, 14, 13, 16], // DEX +4, CHA +3
  initiativeBonus: 6,
  skills: { stealth: 10, persuasion: 7 },
  saves: { dex_save: 8 },
};

describe("resolveCheckCommand", () => {
  it("resolves character-aware skill checks with explicit skill bonus", () => {
    expect(resolveCheckCommand("stealth", rogue)).toEqual({ expression: "1d20+10", label: "Stealth" });
    expect(resolveCheckCommand("perc adv", rogue)).toEqual({ expression: "1d20+1 adv", label: "Perception" });
  });

  it("resolves saving throws and initiative with advantage/disadvantage", () => {
    expect(resolveCheckCommand("dex save", rogue)).toEqual({ expression: "1d20+8", label: "Dexterity Save" });
    expect(resolveCheckCommand("con saving throw", rogue)).toEqual({ expression: "1d20+1", label: "Constitution Save" });
    expect(resolveCheckCommand("init dis", rogue)).toEqual({ expression: "1d20+6 dis", label: "Initiative", isInitiative: true });
  });

  it("falls back to +0 gracefully without a character and ignores dice expressions", () => {
    expect(resolveCheckCommand("stealth", null)).toEqual({ expression: "1d20", label: "Stealth" });
    expect(resolveCheckCommand("charisma", rogue)).toEqual({ expression: "1d20+3", label: "Charisma Check" });
    expect(resolveCheckCommand("1d20+5 stealth", rogue)).toBeNull();
    expect(resolveCheckCommand("notaskill", rogue)).toBeNull();
  });
});
