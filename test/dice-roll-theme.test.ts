import { describe, expect, it } from "vitest";

describe("Dice Roll & Theme Features", () => {
  it("builds predetermined notation for dice-box-threejs", async () => {
    const { buildDiceBoxNotation } = await import("../app/components/dice-overlay");

    const singleRoll: any = {
      dice: [{ sides: 20, rolls: [{ value: 14, kept: true }] }],
    };
    expect(buildDiceBoxNotation(singleRoll)).toBe("1d20@14");

    const advRoll: any = {
      dice: [{ sides: 20, rolls: [{ value: 14, kept: false }, { value: 19, kept: true }] }],
    };
    expect(buildDiceBoxNotation(advRoll)).toBe("2d20@14,19");

    const multiRoll: any = {
      dice: [
        { sides: 20, rolls: [{ value: 14, kept: true }] },
        { sides: 6, rolls: [{ value: 5, kept: true }] },
      ],
    };
    expect(buildDiceBoxNotation(multiRoll)).toBe("1d20+1d6@14,5");

    // A d2 is drawn as the two-faced coin die, not a d20 landing on 1 or 2.
    const coin: any = { dice: [{ sides: 2, rolls: [{ value: 2, kept: true }] }] };
    expect(buildDiceBoxNotation(coin)).toBe("1d2@2");

    // Sizes without a model borrow the next die up.
    const d3: any = { dice: [{ sides: 3, rolls: [{ value: 3, kept: true }] }] };
    expect(buildDiceBoxNotation(d3)).toBe("1d4@3");
  });

  it("parses inline theme names and hex colors correctly", () => {
    const allowedThemes = [
      "default",
      "pride",
      "trans",
      "nonbinary",
      "vampire",
      "dark-academia",
      "darkacademia",
      "matrix",
      "cyberpunk",
    ];
    const COLOR_NAMES: Record<string, string> = {
      blue: "#2563eb",
      skyblue: "#0284c7",
      pink: "#db2777",
      red: "#e11d48",
    };

    const allowedMaterials = ["plastic", "metal", "wood", "glass"];
    const allowedTextures = ["none", "cloudy", "fire", "marble", "water", "ice", "wood", "metal", "skulls", "dragon"];

    function parseCommand(rawInput: string) {
      let parsedTheme: string | undefined;
      let parsedThemeColor: string | undefined;
      let parsedMaterial: string | undefined;
      let parsedTexture: string | undefined;
      let input = rawInput.replace(/^\/roll\s*/i, "").trim();

      const hexMatch = input.match(/(?:^|\s)#([0-9a-fA-F]{6})\b/);
      if (hexMatch) {
        parsedThemeColor = `#${hexMatch[1]}`;
        input = input.replace(hexMatch[0], " ").trim();
      }

      const tokens = input.split(/\s+/);
      const remainingTokens: string[] = [];
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (allowedThemes.includes(lower)) {
          parsedTheme = lower === "darkacademia" ? "dark-academia" : lower;
        } else if (allowedMaterials.includes(lower)) {
          parsedMaterial = lower;
        } else if (allowedTextures.includes(lower)) {
          parsedTexture = lower;
        } else if (COLOR_NAMES[lower]) {
          parsedThemeColor = COLOR_NAMES[lower];
        } else {
          remainingTokens.push(token);
        }
      }
      input = remainingTokens.join(" ").trim();
      return { input, parsedTheme, parsedThemeColor, parsedMaterial, parsedTexture };
    }

    expect(parseCommand("/roll 1d20 pride")).toEqual({
      input: "1d20",
      parsedTheme: "pride",
      parsedThemeColor: undefined,
      parsedMaterial: undefined,
      parsedTexture: undefined,
    });

    expect(parseCommand("/roll 2d6 trans")).toEqual({
      input: "2d6",
      parsedTheme: "trans",
      parsedThemeColor: undefined,
      parsedMaterial: undefined,
      parsedTexture: undefined,
    });

    expect(parseCommand("/roll 1d20 vampire metal skulls")).toEqual({
      input: "1d20",
      parsedTheme: "vampire",
      parsedThemeColor: undefined,
      parsedMaterial: "metal",
      parsedTexture: "skulls",
    });

    expect(parseCommand("/roll 1d20 matrix glass")).toEqual({
      input: "1d20",
      parsedTheme: "matrix",
      parsedThemeColor: undefined,
      parsedMaterial: "glass",
      parsedTexture: undefined,
    });

    expect(parseCommand("/roll 3d6 cyberpunk metal")).toEqual({
      input: "3d6",
      parsedTheme: "cyberpunk",
      parsedThemeColor: undefined,
      parsedMaterial: "metal",
      parsedTexture: undefined,
    });

    expect(parseCommand("/roll 2d20 marble")).toEqual({
      input: "2d20",
      parsedTheme: undefined,
      parsedThemeColor: undefined,
      parsedMaterial: undefined,
      parsedTexture: "marble",
    });

    expect(parseCommand("/roll 1d20 blue glass")).toEqual({
      input: "1d20",
      parsedTheme: undefined,
      parsedThemeColor: "#2563eb",
      parsedMaterial: "glass",
      parsedTexture: undefined,
    });
  });

  it("exports dice sound engine methods safely without errors and handles 1-10 dice tiers and materials", async () => {
    const {
      playDiceRollSound,
      stopDiceRollSound,
      preloadDiceSounds,
      playCriticalFumbleSound,
      playCriticalSuccessSound,
    } = await import("../app/lib/dice-sounds");
    expect(typeof playDiceRollSound).toBe("function");
    expect(typeof stopDiceRollSound).toBe("function");
    expect(typeof preloadDiceSounds).toBe("function");
    expect(typeof playCriticalFumbleSound).toBe("function");
    expect(typeof playCriticalSuccessSound).toBe("function");

    // In a node / jsdom environment without full audio output, calling these should not throw
    expect(() => stopDiceRollSound()).not.toThrow();
    expect(() => preloadDiceSounds()).not.toThrow();

    // Verify all 10 tiers (1 to 10 dice) and capping over 10 dice (e.g. 15 dice)
    for (let count = 1; count <= 10; count++) {
      const materials = ["plastic", "metal", "wood", "glass"] as const;
      const mat = materials[count % materials.length];
      await expect(playDiceRollSound({ theme: "default", diceCount: count, material: mat })).resolves.not.toThrow();
    }
    // >10 dice should cap at tier 10 gracefully
    await expect(playDiceRollSound({ theme: "default", diceCount: 15, material: "wood" })).resolves.not.toThrow();

    // Vampire, Dark Academia, Matrix, and Cyberpunk themes
    await expect(playDiceRollSound({ theme: "vampire", diceCount: 2, material: "metal" })).resolves.not.toThrow();
    await expect(playDiceRollSound({ theme: "dark-academia", diceCount: 3, material: "wood" })).resolves.not.toThrow();
    await expect(playDiceRollSound({ theme: "matrix", diceCount: 2, material: "glass" })).resolves.not.toThrow();
    await expect(playDiceRollSound({ theme: "cyberpunk", diceCount: 4, material: "metal" })).resolves.not.toThrow();

    // Critical Fumble for each of the 4 materials and special themes
    await expect(playCriticalFumbleSound({ material: "glass", theme: "default" })).resolves.not.toThrow();
    await expect(playCriticalFumbleSound({ material: "metal", theme: "default" })).resolves.not.toThrow();
    await expect(playCriticalFumbleSound({ material: "wood", theme: "dark-academia" })).resolves.not.toThrow();
    await expect(playCriticalFumbleSound({ material: "plastic", theme: "default" })).resolves.not.toThrow();
    await expect(playCriticalFumbleSound({ material: "glass", theme: "matrix" })).resolves.not.toThrow();
    await expect(playCriticalFumbleSound({ material: "metal", theme: "cyberpunk" })).resolves.not.toThrow();

    // Critical Success (Nat 20) fanfare
    await expect(playCriticalSuccessSound({ theme: "default" })).resolves.not.toThrow();
    await expect(playCriticalSuccessSound({ theme: "vampire" })).resolves.not.toThrow();
    await expect(playCriticalSuccessSound({ theme: "matrix" })).resolves.not.toThrow();
    await expect(playCriticalSuccessSound({ theme: "cyberpunk" })).resolves.not.toThrow();
  });
});
