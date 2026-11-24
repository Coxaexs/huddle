"use client";

import type { DiceRollEvent } from "@/lib/protocol";
import { DICE_STYLE_MENU, inheritDiceStyle } from "@/lib/dice-styles";
import { useI18n } from "../../lib/i18n-context";
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
  const { t } = useI18n();
  return (
    <>
      {tab === "dice" && (
            <div className="space-y-6">
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "4px" }}>{t("settings.dice.title")}</h3>
                <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>
                  {t("settings.dice.desc")}
                </p>
              </div>

              <div>
                <span className="field-label">{t("settings.dice.style")}</span>
                <div className="dice-theme-row">
                  {DICE_STYLE_MENU.map(([option, label]) => (
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
                    <span className="field-label" style={{ marginTop: "12px" }}>{t("settings.dice.baseColor")}</span>
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
                          aria-label={t("settings.dice.useColor", { color: col })}
                          className={diceColor === col ? "active" : ""}
                          style={{ background: col }}
                          onClick={() => setDiceColor(col)}
                        />
                      ))}
                      <input
                        type="color"
                        value={diceColor}
                        aria-label={t("settings.dice.customColor")}
                        onChange={(event) => setDiceColor(event.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <span className="field-label">{t("settings.dice.material")}</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  {t("settings.dice.materialDesc")}
                </small>
                <div className="dice-material-row">
                  {([
                    ["auto", t("settings.dice.mat.auto")],
                    ["plastic", t("settings.dice.mat.plastic")],
                    ["metal", t("settings.dice.mat.metal")],
                    ["wood", t("settings.dice.mat.wood")],
                    ["glass", t("settings.dice.mat.glass")],
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
                <span className="field-label">{t("settings.dice.texture")}</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  {t("settings.dice.textureDesc")}
                </small>
                <div className="dice-texture-row">
                  {([
                    ["auto", t("settings.dice.tex.auto")],
                    ["none", t("settings.dice.tex.none")],
                    ["marble", t("settings.dice.tex.marble")],
                    ["wood", t("settings.dice.tex.wood")],
                    ["metal", t("settings.dice.tex.metal")],
                    ["skulls", t("settings.dice.tex.skulls")],
                    ["dragon", t("settings.dice.tex.dragon")],
                    ["fire", t("settings.dice.tex.fire")],
                    ["ice", t("settings.dice.tex.ice")],
                    ["water", t("settings.dice.tex.water")],
                    ["stars", t("settings.dice.tex.stars")],
                    ["astral", t("settings.dice.tex.astral")],
                    ["stainedglass", t("settings.dice.tex.stainedglass")],
                    ["glitter", t("settings.dice.tex.glitter")],
                    ["paper", t("settings.dice.tex.paper")],
                    ["speckles", t("settings.dice.tex.speckles")],
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
                <span className="field-label">{t("settings.dice.soundPhysics")}</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  {t("settings.dice.soundPhysicsDesc")}
                </small>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 14, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 14,
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.roll1d20")}
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
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
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "advantage",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.roll2d20")}
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
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
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.roll4d6")}
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
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
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.roll10d6")}
                  </button>
                </div>
              </div>

              <div>
                <span className="field-label">{t("settings.dice.critsTitle")}</span>
                <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginBottom: "8px" }}>
                  {t("settings.dice.critsDesc")}
                </small>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    className="dice-test-btn"
                    style={{ borderColor: "rgba(255, 68, 68, 0.4)", color: "#ff8888" }}
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 1, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 1,
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.testNat1")}
                  </button>
                  <button
                    type="button"
                    className="dice-test-btn"
                    style={{ borderColor: "rgba(255, 215, 0, 0.5)", color: "#ffd700" }}
                    onClick={() => {
                      const resolvedTheme = inheritDiceStyle(diceTheme, activeThemeId);
                      setTestRoll({
                        expression: "1d20",
                        dice: [{ sides: 20, rolls: [{ value: 20, kept: true }], sign: 1 }],
                        modifier: 0,
                        total: 20,
                        roller: { id: "preview", displayName: t("settings.dice.you") },
                        rollType: "normal",
                        animationSeed: String(Date.now()),
                        theme: resolvedTheme,
                        themeColor: diceColor,
                        material: diceMaterial !== "auto" ? diceMaterial : undefined,
                        texture: diceTexture !== "auto" ? diceTexture : undefined,
                      });
                    }}
                  >
                    {t("settings.dice.testNat20")}
                  </button>
                </div>
              </div>

              <div style={{ padding: "12px 14px", borderRadius: "10px", background: "var(--panel-hover, rgba(255,255,255,0.04))", border: "1px solid var(--line, rgba(255,255,255,0.08))", fontSize: "12px", color: "var(--muted, #999)" }}>
                💡 <strong>{t("settings.dice.shortcutsLead")}</strong> {t("settings.dice.shortcutsBody")} <code>/roll 2d20 metal skulls</code>, <code>/roll 4d6 wood</code>, {t("settings.dice.shortcutsOr")} <code>/roll 1d20 ruby glass</code>.
              </div>
            </div>
          )}
    </>
  );
}
