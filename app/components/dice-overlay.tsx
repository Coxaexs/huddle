"use client";

import { useEffect, useRef, useState } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { basePath } from "../lib/client";
import {
  playDiceRollSound,
  stopDiceRollSound,
  playCriticalFumbleSound,
  playCriticalSuccessSound,
} from "../lib/dice-sounds";
import { getDiceStyle, inheritDiceStyle } from "@/lib/dice-styles";
import { installHuddleDiceTextures } from "../lib/dice-textures";
import { runCritFx, type CritFxHandle } from "./dice-crit-fx";
import { isAchievementUser, markAchievement } from "../lib/achievement-client";
import { fumbleSkinFor, THEME_FUMBLES } from "./dice-theme-fumbles";
import { HUNGER_DIE_COLOR, HUNGER_DIE_INK } from "@/lib/v5-dice";

type ShownDie = { sides: number; value: number; kept: boolean; hunger: boolean };

/** Flatten the server's authoritative die values in roll order. */
function flattenDice(roll: DiceRollEvent): ShownDie[] {
  const out: ShownDie[] = [];
  for (const term of roll.dice) {
    for (const entry of term.rolls) {
      out.push({ sides: term.sides, value: entry.value, kept: entry.kept !== false, hunger: term.hunger === true });
    }
  }
  return out;
}

/**
 * dice-box-threejs paints every die with the box's one colour set. V5 Hunger
 * dice are red: while the dice are made, those positions get a red set of the
 * same material and texture. Each die is made just before it joins diceList,
 * so its index there is its place in the roll.
 */
async function paintHungerDice(box: any, roll: DiceRollEvent, colorset: Record<string, unknown>) {
  const hunger = new Set(flattenDice(roll).flatMap((die, index) => (die.hunger ? [index] : [])));
  if (!hunger.size || !box.DiceFactory || !box.DiceColors) return;
  const red = await box.DiceColors.makeColorSet({
    ...colorset,
    name: `hunger-${String(colorset.name)}`,
    // A secret roll keeps its blank faces.
    ...(roll.masked ? {} : { foreground: HUNGER_DIE_INK, outline: "none" }),
    background: HUNGER_DIE_COLOR,
    edge: HUNGER_DIE_COLOR,
    texture: "none",
  });
  const factory = box.DiceFactory;
  const create = factory.create.bind(factory);
  factory.create = (type: string) => {
    if (!hunger.has(box.diceList.length)) return create(type);
    const own = factory.colordata;
    factory.applyColorSet(red);
    try {
      return create(type);
    } finally {
      factory.applyColorSet(own);
    }
  };
}

/**
 * Builds predetermined notation for @3d-dice/dice-box-threejs, e.g. "1d20@14"
 * or "2d6@3,5". A masked (secret) roll has no faces, so its dice just tumble.
 */
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
  if (!baseNotation) return roll.masked ? "1d20" : "1d20@20";
  if (roll.masked) return baseNotation;
  return `${baseNotation}@${results.join(",")}`;
}

/**
 * dice-box-threejs looks down through a wide 20° lens from close by, so dice
 * away from the middle are seen from the side and never look like they lie
 * flat. Same framing through a long lens from far above: they read flat.
 */
export function flattenDiceCamera(box: { setDimensions: (dimensions?: unknown) => unknown; camera?: any; cameraHeight: { max: number } }) {
  const placeCamera = box.setDimensions.bind(box);
  box.setDimensions = (dimensions?: unknown) => {
    const result = placeCamera(dimensions);
    const camera = box.camera;
    if (camera) {
      const distance = (box.cameraHeight.max * Math.tan((10 * Math.PI) / 180)) / Math.tan((2.5 * Math.PI) / 180);
      camera.fov = 5;
      camera.position.z = distance;
      camera.near = distance * 0.5;
      camera.far = distance * 1.5;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
    }
    return result;
  };
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

  const [values, setValues] = useState<ShownDie[]>([]);
  const [total, setTotal] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState<string>("default");

  useEffect(() => {
    setValues([]);
    setTotal("");
  }, [roll?.animationSeed, roll?.masked]);

  useEffect(() => {
    if (!roll) return;
    let disposed = false;
    let dismissTimer: number | null = null;
    let failsafeTimer: number | null = null;
    let critFx: CritFxHandle | null = null;

    // Hard failsafe: unconditionally dismiss after 7.0s if 3D hangs
    failsafeTimer = window.setTimeout(() => {
      if (disposed) return;
      onDoneRef.current();
    }, 7000);

    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      host.innerHTML = "";

      const mod = (await import("@3d-dice/dice-box-threejs")) as { default: any };
      if (disposed) return;
      const DiceBox = (mod as { default: any }).default;

      // The roll's style, or the app theme's dice while the roller left dice on Solid Colour.
      const activeCustomTheme =
        typeof document !== "undefined"
          ? document.documentElement.dataset.customThemeId
          : undefined;
      const theme = inheritDiceStyle(roll.theme, activeCustomTheme);
      const style = getDiceStyle(theme);
      setCurrentTheme(theme);

      // Texture resolution: roll.texture > localStorage > style default
      const savedTexture =
        typeof window !== "undefined"
          ? window.localStorage.getItem("huddle_dice_texture")
          : null;

      const effectiveTexture: string | string[] =
        roll.texture ||
        (savedTexture && savedTexture !== "auto" ? savedTexture : "") ||
        style?.texture ||
        "none";

      // Material resolution: roll.material > localStorage > texture/style default
      const savedMaterial =
        typeof window !== "undefined"
          ? (window.localStorage.getItem("huddle_dice_material") as "plastic" | "metal" | "wood" | "glass" | null)
          : null;

      const textureMaterials: Record<string, "metal" | "wood" | "glass"> = {
        metal: "metal",
        wood: "wood",
        marble: "glass",
        stainedglass: "glass",
        ice: "glass",
      };
      const defaultMaterialForTexture: "plastic" | "metal" | "wood" | "glass" =
        (typeof effectiveTexture === "string" ? textureMaterials[effectiveTexture] : undefined) ??
        style?.material ??
        "plastic";

      const effectiveMaterial: "plastic" | "metal" | "wood" | "glass" =
        roll.material ||
        (savedMaterial && (savedMaterial as string) !== "auto" ? savedMaterial : null) ||
        defaultMaterialForTexture;

      const themeColor = roll.themeColor || "#2563eb";

      let customColorset: any = style
        ? {
            name: style.id,
            foreground: style.ink,
            background: style.body,
            ...(style.outline ? { outline: style.outline } : {}),
            texture: effectiveTexture,
            material: effectiveMaterial,
          }
        : {
            name: `custom-${themeColor}`,
            foreground: "#ffffff",
            background: themeColor,
            texture: effectiveTexture,
            material: effectiveMaterial,
          };
      const themeSurface = style?.surface ?? "green-felt";

      // A secret roll: blank faces, so the tumbling dice give nothing away.
      if (roll.masked) {
        customColorset = { ...customColorset, name: `${customColorset.name}-secret`, foreground: "rgba(0,0,0,0)", outline: "none" };
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
      installHuddleDiceTextures(box);
      flattenDiceCamera(box);

      let initOk = false;
      try {
        await box.initialize();
        await paintHungerDice(box, roll, customColorset);
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
        const f = flattenDice(roll);
        setValues(f);
        setTotal(roll.masked ? "SECRET ROLL" : roll.summary || `TOTAL ${roll.total}`);
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

      // Kept natural 1s / 20s get the material's critical effect.
      // Dropped dice (advantage / disadvantage) don't count.
      const natIndexes = (value: number) =>
        faces.flatMap((f, i) => (f.sides === 20 && f.value === value && f.kept ? [i] : []));
      const nat20 = natIndexes(20);
      const nat1 = natIndexes(1);
      // Your own natural 20 / 1 counts toward the dice achievements.
      if (!roll.masked && isAchievementUser(roll.roller?.id)) {
        if (nat20.length) markAchievement("dice", "nat20");
        if (nat1.length) markAchievement("dice", "nat1");
      }

      if (!roll.masked && (nat20.length || nat1.length)) {
        const skin = fumbleSkinFor(theme, activeCustomTheme);
        critFx = runCritFx(
          box,
          {
            dice: [
              ...nat1.map((index) => ({ index, kind: "nat1" as const })),
              ...nat20.map((index) => ({ index, kind: "nat20" as const })),
            ],
            material: effectiveMaterial,
            color: themeColor,
            fumble: skin ? THEME_FUMBLES[skin] : undefined,
          },
          { onFumbleHit: () => void playCriticalFumbleSound({ material: effectiveMaterial, theme: skin ?? theme }) },
        );
        if (nat20.length) void playCriticalSuccessSound({ theme });
        // The room's music dips under the crit sound (use-player listens).
        window.dispatchEvent(new CustomEvent("huddle-audio-duck", { detail: { durationMs: 1500, db: -6 } }));
      }

      const mode =
        roll.rollType === "advantage"
          ? "ADV · "
          : roll.rollType === "disadvantage"
            ? "DIS · "
            : roll.rollType === "critical-damage"
              ? "CRITICAL · "
              : "";
      setTotal(roll.masked ? "SECRET ROLL" : roll.summary || `${mode}TOTAL ${roll.total}`);

      const dismissDelay = Math.max(1600, critFx?.durationMs ?? 0);
      dismissTimer = window.setTimeout(() => {
        onDoneRef.current();
      }, dismissDelay);
    })();

    return () => {
      disposed = true;
      if (dismissTimer) clearTimeout(dismissTimer);
      if (failsafeTimer) clearTimeout(failsafeTimer);
      stopDiceRollSound();
      critFx?.cancel();
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
    // The roller first hears the masked copy from the room, then their reply
    // with the faces arrives under the same seed: that has to replay.
  }, [roll?.animationSeed, roll?.masked]);

  if (!roll) return null;

  return (
    <div
      className={`${className} dice-box-host`}
      aria-hidden="true"
    >
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
                className={`dice-result-value sides-${die.sides}${die.hunger ? " hunger" : ""} ${
                  die.sides === 20 && die.value === 20
                    ? "crit-20"
                    : die.sides === 20 && die.value === 1
                      ? "crit-1"
                      : ""
                }`}
              >
                {roll.masked ? "?" : die.value}
              </span>
            ))}
          </div>
          {total && <strong className="dice-result-total">{total}</strong>}
        </div>
      )}
    </div>
  );
}