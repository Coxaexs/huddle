"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a popup the two ways people expect: Escape, and a press anywhere
 * outside it.
 *
 * Escape is taken in the capture phase and stopped there, so the popup on top
 * closes alone and whatever is under it (a dialog, the composer) stays as it
 * is. Pass `inside` to get the outside-press half; without it only Escape closes.
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  inside?: RefObject<HTMLElement | null>,
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close.current();
    };
    const onPress = (event: PointerEvent) => {
      const box = inside?.current;
      if (box && !box.contains(event.target as Node)) close.current();
    };
    document.addEventListener("keydown", onKey, true);
    if (inside) document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (inside) document.removeEventListener("pointerdown", onPress);
    };
  }, [open, inside]);
}
