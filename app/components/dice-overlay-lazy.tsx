"use client";

import { useRef } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { deferred } from "./chat/shell/deferred";

const Dice = deferred(() => import("./dice-overlay").then((m) => m.DiceOverlay));

/**
 * The 3D dice, fetched the first time a roll comes in rather than with the
 * page: plenty of people never roll. Once loaded it stays mounted, so later
 * rolls start at once.
 */
export function DiceOverlay(props: { roll: DiceRollEvent | null; onDone: () => void; className?: string }) {
  const seen = useRef(false);
  if (props.roll) seen.current = true;
  if (!seen.current) return null;
  return <Dice {...props} />;
}
