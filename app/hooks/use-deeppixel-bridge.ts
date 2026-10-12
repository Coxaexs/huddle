"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEEPPIXEL_FROM_GAME, DEEPPIXEL_TO_GAME } from "@/lib/activities";
import type { BridgeCommand, BridgeState } from "../lib/board-game";

export interface BridgeToast { id: number; message: string; tone: string }

/**
 * The board hall's line to the room's DeepPixel game page (kept loaded, out of
 * sight, by the activities panel). While `active`, the page leaves dice to the
 * hall and reports what can be done; `send` presses its buttons.
 */
export function useDeepPixelBridge(active: boolean) {
  const [state, setState] = useState<BridgeState | null>(null);
  const [toasts, setToasts] = useState<BridgeToast[]>([]);
  const toastId = useRef(0);

  const send = useCallback((command: BridgeCommand) => {
    window.dispatchEvent(new CustomEvent(DEEPPIXEL_TO_GAME, { detail: command }));
  }, []);

  useEffect(() => {
    if (!active) { setState(null); return; }
    const onMessage = (event: Event) => {
      const data = (event as CustomEvent<{ type?: string } & Record<string, unknown>>).detail;
      if (!data) return;
      if (data.type === "state") setState(data as unknown as BridgeState);
      else if (data.type === "hello") send({ type: "hall", on: true });
      else if (data.type === "toast" && typeof data.message === "string" && data.message) {
        const id = ++toastId.current;
        setToasts((list) => [...list.slice(-3), { id, message: data.message as string, tone: String(data.tone || "info") }]);
        setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 5000);
      }
    };
    window.addEventListener(DEEPPIXEL_FROM_GAME, onMessage);
    send({ type: "hall", on: true });
    // The page may (re)load at any time; keep reminding it the hall is watching.
    const again = setInterval(() => send({ type: "hall", on: true }), 4000);
    return () => {
      clearInterval(again);
      window.removeEventListener(DEEPPIXEL_FROM_GAME, onMessage);
      send({ type: "hall", on: false });
    };
  }, [active, send]);

  return { state, toasts, send };
}
