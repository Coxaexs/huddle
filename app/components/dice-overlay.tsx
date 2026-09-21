"use client";

import { useEffect, useRef, useState } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { basePath } from "../lib/client";

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
    const validSides = [4, 6, 8, 10, 12, 20, 100];
    const sides = validSides.includes(term.sides) ? term.sides : 20;
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

      // @ts-expect-error - dynamic module
      const mod = (await import("@3d-dice/dice-box-threejs")) as { default: any };
      if (disposed) return;
      const DiceBox = (mod as { default: any }).default;

      // Theme configuration
      const theme = roll.theme || "default";
      const themeColor = roll.themeColor || "#2563eb";

      let customColorset: any = null;
      if (theme === "pride") {
        customColorset = {
          name: "pride",
          foreground: "#ffffff",
          background: ["#E40303", "#FF8C00", "#FFED00", "#008026", "#24408E", "#732982"],
          texture: "none",
          material: "plastic",
        };
      } else if (theme === "trans") {
        customColorset = {
          name: "trans",
          foreground: "#ffffff",
          background: ["#5BCEFA", "#F5A9B8", "#FFFFFF", "#F5A9B8", "#5BCEFA"],
          texture: "none",
          material: "plastic",
        };
      } else if (theme === "nonbinary") {
        customColorset = {
          name: "nonbinary",
          foreground: "#ffffff",
          background: ["#FFF433", "#FFFFFF", "#9B59D0", "#2C2C2C"],
          texture: "none",
          material: "plastic",
        };
      } else {
        customColorset = {
          name: `custom-${themeColor}`,
          foreground: "#ffffff",
          background: themeColor,
          texture: "none",
          material: "plastic",
        };
      }

      const box = new DiceBox(`#${host.id}`, {
        assetPath: `${basePath}/assets/dice-box-threejs/`,
        sounds: false,
        shadows: true,
        theme_surface: "green-felt",
        theme_customColorset: customColorset,
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
          className="dice-result-overlay"
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