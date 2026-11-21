import { describe, expect, it } from "vitest";
import {
  fixtureTokenSvg,
  MONSTER_PALETTE,
  tokenImageUrl,
} from "./battlemap-tokens";

describe("battlemap-tokens", () => {
  it("builds stable encoded token URLs", () => {
    expect(tokenImageUrl("Goblin")).toBe(
      "/hangout/api/integrations/dnd/token?name=Goblin",
    );
    expect(tokenImageUrl("Giant Spider")).toBe(
      "/hangout/api/integrations/dnd/token?name=Giant%20Spider",
    );
  });

  it("provides 2D SVG icons for tabletop fixtures case-insensitively", () => {
    for (const fixture of ["Chest", "door", "BARREL", "Torch", "Campfire", "Pillar", "Trap"]) {
      const svg = fixtureTokenSvg(fixture);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
    expect(fixtureTokenSvg("Goblin")).toBeNull();
  });

  it("attaches avatarUrl to every palette monster and fixture", () => {
    expect(MONSTER_PALETTE.some((m) => m.label === "Goblin")).toBe(true);
    expect(MONSTER_PALETTE.some((m) => m.label === "Chest")).toBe(true);
    for (const entry of MONSTER_PALETTE) {
      expect(entry.avatarUrl).toBe(tokenImageUrl(entry.label));
    }
  });
});
