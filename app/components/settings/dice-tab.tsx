"use client";

import type { DiceRollEvent } from "@/lib/protocol";
import { Tab } from "./types";

export function DiceTab({
  tab,
  diceTheme,
  setDiceTheme,
  diceColor,
  setDiceColor,
  diceMaterial,
  setDiceMaterial,
  diceTexture,
  setDiceTexture,
  activeThemeId,
  setTestRoll,
}: {
  tab: Tab;
  diceTheme: string;
  setDiceTheme: React.Dispatch<React.SetStateAction<string>>;
  diceColor: string;
  setDiceColor: React.Dispatch<React.SetStateAction<string>>;
  diceMaterial: "auto" | "plastic" | "metal" | "wood" | "glass";
  setDiceMaterial: React.Dispatch<React.SetStateAction<"auto" | "plastic" | "metal" | "wood" | "glass">>;
  diceTexture: string;
  setDiceTexture: React.Dispatch<React.SetStateAction<string>>;
  activeThemeId: string;
  setTestRoll: React.Dispatch<React.SetStateAction<DiceRollEvent | null>>;
}) {
  return (
    <>
      {tab === "dice" && (
            <div className="space-y-6">
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "4px" }}>3D Dice & Sound Physics</h3>
                <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>
                  Customize your personal 3D polyhedral dice visual style, physical materials, tactile bump textures, and multi-dice collision audio.
                </p>
              </div>

              <div>
                <span className="field-label">3D Dice Style</span>
                <div className="dice-theme-row">
                  {([
                    ["default", "Solid Colour"],
                    ["matrix", "Matrix 📟"],
                    ["cyberpunk", "Cyberpunk ⚡"],
                    ["vampire", "Vampire 🧛"],
                    ["dark-academia", "Dark Academia 📜"],
                    ["pride", "Pride 🏳️‍🌈"],
                    ["trans", "Trans 🏳️‍⚧️"],
                    ["nonbinary", "Nonbinary 💛"],
                  ] as const).map(([option, label]) => (
                    <button
                      type="button"
                      key={option}
                      className={`${option} ${diceTheme === option ? "active" : ""}`}
                      onClick={() => setDiceTheme(option)}
                    >
                      <span className="dice-theme-swatch" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>

                {diceTheme === "default" && (
                  <>
                    <span className="field-label" style={{ marginTop: "12px" }}>Dice Base Colour</span>
                    <div className="accent-picker-row">
                      {[
                        "#2563eb", // Classic Blue
                        "#0284c7", // Sky Blue
                        "#6366f1", // Indigo
                        "#7c3aed", // Violet
                        "#db2777", // Pink
                        "#e11d48", // Crimson Red
                        "#059669", // Emerald Green
                        "#d97706", // Amber Gold
                        "#1e293b", // Slate Dark
                      ].map((col) => (
                        <button
                          type="button"
                          key={col}
                          aria-label={`Use dice colour ${col}`}
                          className={diceColor === col ? "active" : ""}
                          style={{ background: col }}
                          onClick={() => setDiceColor(col)}
                        />
                      ))}
                      <input
                        type="color"
                        value={diceColor}
                        aria-label="Custom dice colour"
                        onChange={(event) => setDiceColor(event.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <span className="field-label">Dice Material</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  Controls 3D specular shine, physical reflectivity, and realistic collision acoustic timbre.
                </small>
                <div className="dice-material-row">
                  {([
                    ["auto", "Theme Default"],
                    ["plastic", "Plastic / Resin 🎲"],
                    ["metal", "Heavy Metal ⚔️"],
                    ["wood", "Carved Wood 🪵"],
                    ["glass", "Ruby Glass 💎"],
                  ] as const).map(([option, label]) => (
                    <button
                      type="button"
                      key={option}
                      className={`${option} ${diceMaterial === option ? "active" : ""}`}
                      onClick={() => setDiceMaterial(option)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="field-label">Dice Surface Texture</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  Binds tactile bump maps and procedural surface details onto the 3D dice.
                </small>
                <div className="dice-texture-row">
                  {([
                    ["auto", "Theme Default"],
                    ["none", "Smooth ✨"],
                    ["marble", "Marble 🏛️"],
                    ["wood", "Wood Grain 🪵"],
                    ["metal", "Steel ⚙️"],
                    ["skulls", "Skulls 💀"],
                    ["dragon", "Dragon Scales 🐉"],
                    ["fire", "Inferno 🔥"],
                    ["ice", "Glacial ❄️"],
                    ["water", "Water Ripple 🌊"],
                    ["stars", "Starlight ⭐"],
                    ["astral", "Astral Sea 🌌"],
                    ["stainedglass", "Stained Glass 🪟"],
                    ["glitter", "Glitter ✨"],
                    ["paper", "Parchment 📜"],
                    ["speckles", "Speckled 🪄"],
                  ] as const).map(([option, label]) => (
                    <button
                      type="button"
                      key={option}
                      className={`${option} ${diceTexture === option ? "active" : ""}`}
                      onClick={() => setDiceTexture(option)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="field-label">Sound Physics & Multi-Dice Voices</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  Acoustics dynamically choreograph 1 through 10 individual dice collisions, bounces, and cascading chorus impacts matched to material acoustics.
                </small>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 14, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 14,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    🎲 Roll 1d20 (Solo Die)
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "2d20",
                        dice: [{
                          sides: 20,
                          rolls: [
                            { value: 18, kept: true },
                            { value: 12, kept: false },
                          ],
                          sign: 1,
                        }],
                        modifier: 0,
                        total: 18,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "advantage",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    🎲 Roll 2d20 (Pair Clatter)
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "4d6",
                        dice: [{
                          sides: 6,
                          rolls: [
                            { value: 6, kept: true },
                            { value: 5, kept: true },
                            { value: 4, kept: true },
                            { value: 6, kept: true },
                          ],
                          sign: 1,
                        }],
                        modifier: 0,
                        total: 21,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    🎲 Roll 4d6 (Cascade)
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "10d6",
                        dice: [{
                          sides: 6,
                          rolls: [
                            { value: 6, kept: true },
                            { value: 5, kept: true },
                            { value: 4, kept: true },
                            { value: 3, kept: true },
                            { value: 6, kept: true },
                            { value: 2, kept: true },
                            { value: 5, kept: true },
                            { value: 4, kept: true },
                            { value: 6, kept: true },
                            { value: 3, kept: true },
                          ],
                          sign: 1,
                        }],
                        modifier: 0,
                        total: 44,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    🎲 Roll 10d6 (10-Dice Chorus)
                  </button>
                </div>
              </div>

              <div>
                <span className="field-label">Critical Rolls: Nat 1 Disasters & Nat 20 Triumphs</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  Nat 1: glass shatters, metal breaks the screen, plastic melts, wood splits in half. Nat 20: glass throws prism light, metal slams down in sparks, plastic pops like a firework, wood grows into bloom. Pick a material above to test each one.
                </small>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    className="dice-test-btn"
                    style={{ borderColor: "rgba(255, 68, 68, 0.4)", color: "#ff8888" }}
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 1, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 1,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    💥 Test Nat 1 (Critical Fumble)
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    style={{ borderColor: "rgba(255, 215, 0, 0.5)", color: "#ffd700" }}
                    onClick={() => {
                      const resolvedTheme =
                        diceTheme === "default" && (activeThemeId === "vampire" || activeThemeId === "dark-academia")
                          ? activeThemeId
                          : diceTheme;
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 20, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 20,
                        roller: { id: "preview", displayName: "You" },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    ✨ Test Nat 20 (Critical Triumph)
                  </button>
                </div>
              </div>

              <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--panel-hover, rgba(255,255,255,0.04))", border: "1px solid var(--line, rgba(255,255,255,0.08))", fontSize: "12px", color: "var(--muted, #999)" }}>
                💡 <strong>Channel Shortcuts:</strong> You can override your dice style anytime directly in chat rolls: <code>/roll 2d20 metal skulls</code>, <code>/roll 4d6 wood</code>, or <code>/roll 1d20 ruby glass</code>.
              </div>
            </div>
          )}
    </>
  );
}
