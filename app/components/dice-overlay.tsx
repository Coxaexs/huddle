"use client";

import { useEffect, useRef, useState } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { basePath } from "../lib/client";
import { playDiceRollSound, stopDiceRollSound } from "../lib/dice-sounds";

/** Flatten the server's authoritative die values in roll order. */
function flattenDice(roll: DiceRollEvent): Array<{ sides: number; value: number }> {
  const out: Array<{ sides: number; value: number }> = [];
  for (const term of roll.dice) {
    for (const entry of term.rolls) {
      out.push({ sides: term.sides, value: entry.value });
    }
  }
  return out;
}

/** Builds predetermined notation for @3d-dice/dice-box-threejs, e.g. "1d20@14" or "2d6@3,5". */
export function buildDiceBoxNotation(roll: DiceRollEvent): string {
  const terms: string[] = [];
  const results: number[] = [];

  for (const term of roll.dice) {
    // Shapes dice-box-threejs can draw (d2 is its two-faced coin die). Other
    // sizes borrow the next die up so the forced face still exists on it.
    const validSides = [2, 4, 6, 8, 10, 12, 20, 100];
    const sides = validSides.find((n) => n >= term.sides) ?? 100;
    terms.push(`${term.rolls.length}d${sides}`);
    for (const r of term.rolls) {
      results.push(r.value);
    }
  }

  const baseNotation = terms.join("+");
  if (!baseNotation) return "1d20@20";
  return `${baseNotation}@${results.join(",")}`;
}

/**
 * 3D dice roll overlay powered by `@3d-dice/dice-box-threejs` (Three.js + Cannon-es).
 * Uses predetermined `@` notation so the physical tumble is mathematically guaranteed
 * to land on the server's authoritative value across all viewers.
 */
export function DiceOverlay({
  roll,
  onDone,
  className = "dice-overlay",
}: {
  roll: DiceRollEvent | null;
  onDone: () => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<any>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [values, setValues] = useState<Array<{ sides: number; value: number }>>([]);
  const [total, setTotal] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState<string>("default");

  useEffect(() => {
    setValues([]);
    setTotal("");
  }, [roll?.animationSeed]);

  useEffect(() => {
    if (!roll) return;
    let disposed = false;
    let dismissTimer: number | null = null;
    let failsafeTimer: number | null = null;

    // Hard failsafe: unconditionally dismiss after 4.5s
    failsafeTimer = window.setTimeout(() => {
      if (disposed) return;
      onDoneRef.current();
    }, 4500);

    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      host.innerHTML = "";

      const mod = (await import("@3d-dice/dice-box-threejs")) as { default: any };
      if (disposed) return;
      const DiceBox = (mod as { default: any }).default;

      // Theme configuration:
      // If roll has an explicit theme, use it.
      // If default or unset, automatically inherit active theme if on vampire or dark academia.
      const activeCustomTheme =
        typeof document !== "undefined"
          ? document.documentElement.dataset.customThemeId
          : undefined;

      let theme = roll.theme || "default";
      if (theme === "default") {
        if (activeCustomTheme === "vampire") theme = "vampire";
        else if (activeCustomTheme === "dark-academia") theme = "dark-academia";
      }
      if (theme === "darkacademia") theme = "dark-academia";
      setCurrentTheme(theme);

      // Texture resolution: roll.texture > localStorage > theme default
      const savedTexture =
        typeof window !== "undefined"
          ? window.localStorage.getItem("huddle_dice_texture")
          : null;

      const effectiveTexture: string =
        roll.texture ||
        (savedTexture && savedTexture !== "auto" ? savedTexture : "") ||
        (theme === "vampire" ? "skulls" : theme === "dark-academia" ? "wood" : "none");

      // Material resolution: roll.material > localStorage > texture/theme default
      const savedMaterial =
        typeof window !== "undefined"
          ? (window.localStorage.getItem("huddle_dice_material") as "plastic" | "metal" | "wood" | "glass" | null)
          : null;

      const defaultMaterialForTexture: "plastic" | "metal" | "wood" | "glass" =
        effectiveTexture === "metal"
          ? "metal"
          : effectiveTexture === "wood"
            ? "wood"
            : effectiveTexture === "marble" || effectiveTexture === "stainedglass" || effectiveTexture === "ice"
              ? "glass"
              : theme === "vampire"
                ? "metal"
                : theme === "dark-academia"
                  ? "wood"
                  : "plastic";

      const effectiveMaterial: "plastic" | "metal" | "wood" | "glass" =
        roll.material ||
        (savedMaterial && (savedMaterial as string) !== "auto" ? savedMaterial : null) ||
        defaultMaterialForTexture;

      const themeColor = roll.themeColor || "#2563eb";

      let customColorset: any = null;
      let themeSurface = "green-felt";

      if (theme === "vampire") {
        customColorset = {
          name: "vampire",
          foreground: "#f3e7e7",
          background: ["#140508", "#2c070d", "#5c0816", "#8a0e1e", "#c8102e"],
          outline: "#1a0206",
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
        themeSurface = "stainless";
      } else if (theme === "dark-academia") {
        customColorset = {
          name: "dark-academia",
          foreground: "#f5ecd5",
          background: ["#131a14", "#231810", "#3a2a1c", "#4d3826", "#c9a45c"],
          outline: "#0e130f",
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
        themeSurface = "mahogany";
      } else if (theme === "pride") {
        customColorset = {
          name: "pride",
          foreground: "#ffffff",
          background: ["#E40303", "#FF8C00", "#FFED00", "#008026", "#24408E", "#732982"],
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
      } else if (theme === "trans") {
        customColorset = {
          name: "trans",
          foreground: "#ffffff",
          background: ["#5BCEFA", "#F5A9B8", "#FFFFFF", "#F5A9B8", "#5BCEFA"],
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
      } else if (theme === "nonbinary") {
        customColorset = {
          name: "nonbinary",
          foreground: "#ffffff",
          background: ["#FFF433", "#FFFFFF", "#9B59D0", "#2C2C2C"],
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
      } else {
        customColorset = {
          name: `custom-${themeColor}`,
          foreground: "#ffffff",
          background: themeColor,
          texture: effectiveTexture,
          material: effectiveMaterial,
        };
      }

      const box = new DiceBox(`#${host.id}`, {
        assetPath: `${basePath}/assets/dice-box-threejs/`,
        sounds: false,
        shadows: true,
        theme_surface: themeSurface,
        theme_customColorset: customColorset,
        theme_texture: effectiveTexture,
        theme_material: effectiveMaterial,
        baseScale: 100,
        strength: 1.2,
      });
      boxRef.current = box;

      let initOk = false;
      try {
        await box.initialize();
        initOk = true;
      } catch (err) {
        console.warn("DiceBox initialization failed:", err);
      }
      if (disposed) return;

      // Realistic dice audio playback with tier-specific multi-dice choreography and material
      const totalDiceCount = roll.dice.reduce((sum, d) => sum + d.rolls.length, 0);
      void playDiceRollSound({
        theme,
        diceCount: totalDiceCount,
        material: effectiveMaterial,
      });

      if (!initOk) {
        if (failsafeTimer) clearTimeout(failsafeTimer);
        setValues(flattenDice(roll));
        setTotal(`TOTAL ${roll.total}`);
        dismissTimer = window.setTimeout(() => {
          onDoneRef.current();
        }, 1800);
        return;
      }

      const notation = buildDiceBoxNotation(roll);

      try {
        await box.roll(notation);
      } catch (err) {
        console.warn("DiceBox roll error:", err);
      }
      if (disposed) return;
      if (failsafeTimer) clearTimeout(failsafeTimer);

      const faces = flattenDice(roll);
      setValues(faces);
      const natural =
        faces.some((f) => f.sides === 20 && f.value === 20)
          ? "NAT 20 · "
          : faces.some((f) => f.sides === 20 && f.value === 1)
            ? "NAT 1 · "
            : "";
      const mode =
        roll.rollType === "advantage"
          ? "ADV · "
          : roll.rollType === "disadvantage"
            ? "DIS · "
            : roll.rollType === "critical-damage"
              ? "CRITICAL · "
              : "";
      setTotal(`${natural}${mode}TOTAL ${roll.total}`);

      dismissTimer = window.setTimeout(() => {
        onDoneRef.current();
      }, 1600);
    })();

    return () => {
      disposed = true;
      if (dismissTimer) clearTimeout(dismissTimer);
      if (failsafeTimer) clearTimeout(failsafeTimer);
      stopDiceRollSound();
      try {
        boxRef.current?.clearDice?.();
        boxRef.current?.renderer?.dispose?.();
      } catch {
        // ignore
      }
      boxRef.current = null;
      if (hostRef.current) {
        hostRef.current.innerHTML = "";
      }
    };
  }, [roll?.animationSeed]);

  if (!roll) return null;

  return (
    <div className={`${className} dice-box-host`} aria-hidden="true">
      <div
        ref={hostRef}
        id={`huddle-dice-box-${roll.animationSeed}`}
        className="dice-box-canvas"
      />
      {values.length > 0 && (
        <div
          className={`dice-result-overlay dice-theme-${currentTheme}`}
          onClick={() => onDoneRef.current()}
          title="Click to dismiss"
        >
          <div className="dice-result-values">
            {values.map((die, index) => (
              <span
                key={index}
                className={`dice-result-value sides-${die.sides}`}
              >
                {die.value}
              </span>
            ))}
          </div>
          {total && <strong className="dice-result-total">{total}</strong>}
        </div>
      )}
    </div>
  );
}