"use client";

import { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DiceBoxResultGroup } from "@3d-dice/dice-box";
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

/**
 * Pretty 3D dice roll overlay powered by the `3d-dice` (DiceBox) library.
 *
 * Two modes:
 * - Default (viewer): plays the server's authoritative values as an animation.
 * - `onSettle` provided (roller): the dice animation IS the source of truth —
 *   we roll the real dice, read the actual settled values, and report them via
 *   `onSettle` so the caller can broadcast them to everyone.
 */
export function DiceOverlay({
  roll,
  onDone,
  onSettle,
  className = "dice-overlay",
}: {
  roll: DiceRollEvent | null;
  onDone: () => void;
  /** Roller-only: called with the actual settled dice values (per term). */
  onSettle?: (roll: DiceRollEvent, actualRolls: number[][]) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const [values, setValues] = useState<Array<{ sides: number; value: number }>>(
    [],
  );
  const [total, setTotal] = useState<string>("");

  useEffect(() => {
    if (!roll) {
      setValues([]);
      setTotal("");
      return;
    }
    // For viewers, show the server's authoritative values immediately (they
    // match what everyone sees). For the roller, the values are determined by
    // the actual dice, so we leave the overlay empty until they settle.
    if (onSettle) {
      setValues([]);
      setTotal("");
      return;
    }
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
  }, [roll, onSettle]);

  useEffect(() => {
    if (!roll) return;
    let disposed = false;
    let box: DiceBox | null = null;

    void import("@3d-dice/dice-box").then(async (mod) => {
      if (disposed) return;
      const host = hostRef.current;
      if (!host) return;
      const DiceBox = (mod as { default: typeof import("@3d-dice/dice-box").default }).default;
      boxRef.current = new DiceBox(`#${host.id}`, {
        assetPath: `${basePath}/assets/`,
        theme: "default",
        themeColor: "#7b63e6",
      });
      box = boxRef.current;
      await box.init().catch(() => undefined);
      if (disposed) return;

      // Build the notation for the animation (correct count + sides).
      const groups: Array<{ qty: number; sides: number }> = [];
      for (const term of roll.dice) {
        groups.push({ qty: term.rolls.length, sides: term.sides });
      }
      box.roll(groups).catch(() => undefined);

      // Capture the actual settled values (roller mode) or just clear.
      box.onRollComplete = (results: DiceBoxResultGroup[]) => {
        if (onSettle) {
          try {
            // Show the roller the ACTUAL settled values.
            const actualRolls = results.map(
              (group) => group.rolls?.map((die) => die.value) || [],
            );
            const faces: Array<{ sides: number; value: number }> = [];
            for (const term of roll.dice) {
              for (const entry of term.rolls) {
                faces.push({ sides: term.sides, value: entry.value });
              }
            }
            // Replace with the actual rolled values (in order).
            const flattenedActual = actualRolls.flat();
            const settled = faces.map((face, index) => ({
              ...face,
              value: flattenedActual[index] ?? face.value,
            }));
            setValues(settled);
            const nat20 = settled.some(
              (f) => f.sides === 20 && f.value === 20,
            );
            const nat1 = settled.some((f) => f.sides === 20 && f.value === 1);
            setTotal(
              `${nat20 ? "NAT 20 · " : nat1 ? "NAT 1 · " : ""}TOTAL ${settled.reduce(
                (sum, f) => sum + f.value,
                0,
              )}`,
            );
            onSettle(roll, actualRolls);
          } catch {
            // If we can't read the animation's values, fall back to the
            // server-rolled ones already in `roll`.
          }
        }
        window.setTimeout(() => {
          if (!disposed) onDone();
        }, 1600);
      };
    });

    return () => {
      disposed = true;
      boxRef.current?.clear();
      boxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll]);

  useEffect(() => {
    return () => {
      boxRef.current?.clear();
    };
  }, []);

  if (!roll) return null;

  return (
    <div className={`${className} dice-box-host`} aria-hidden="true">
      <div ref={hostRef} id="huddle-dice-box" className="dice-box-canvas" />
      {values.length > 0 && (
        <div className="dice-result-overlay">
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