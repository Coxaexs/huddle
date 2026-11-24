"use client";

import { useEffect, useRef } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { useEcoMode } from "../lib/eco-mode";
import { deferred } from "./chat/shell/deferred";

const Dice = deferred(() => import("./dice-overlay").then((m) => m.DiceOverlay));

function EcoDiceToast({
  roll,
  onDone,
}: {
  roll: DiceRollEvent | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!roll) return;
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [roll, onDone]);

  if (!roll) return null;
  return (
    <div className="eco-dice-toast" role="status" aria-live="polite">
      <span className="eco-dice-expr">{roll.expression}</span>
      <strong className="eco-dice-total">{roll.total}</strong>
    </div>
  );
}

/**
 * The 3D dice, fetched the first time a roll comes in rather than with the
 * page: plenty of people never roll. In Eco Mode, skips 3D WebGL entirely and
 * shows a lightweight result badge instead.
 */
export function DiceOverlay(props: { roll: DiceRollEvent | null; onDone: () => void; className?: string }) {
  const eco = useEcoMode();
  const seen = useRef(false);

  if (eco) {
    return <EcoDiceToast roll={props.roll} onDone={props.onDone} />;
  }

  if (props.roll) seen.current = true;
  if (!seen.current) return null;
  return <Dice {...props} />;
}
