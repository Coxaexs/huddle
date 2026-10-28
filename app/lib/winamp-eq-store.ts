"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FLAT_EQ, cleanEq, eqGains, type WinampEqSettings } from "@/lib/winamp-eq";

/**
 * This browser's Winamp equalizer: the sliders' setting, kept in localStorage,
 * and whether it applies right now (only while the Winamp theme is on, so a
 * curve set there never follows you into another theme unseen).
 */

const KEY = "huddle-winamp-eq-settings";
const listeners = new Set<() => void>();
let state: WinampEqSettings | null = null;

function read(): WinampEqSettings {
  if (state) return state;
  try {
    const saved = window.localStorage.getItem(KEY);
    state = cleanEq(saved ? JSON.parse(saved) : null);
  } catch {
    state = cleanEq(null);
  }
  return state;
}

export function getWinampEq(): WinampEqSettings {
  return typeof window === "undefined" ? FLAT_EQ : read();
}

export function setWinampEq(change: Partial<WinampEqSettings>) {
  state = cleanEq({ ...read(), ...change });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Not remembered past this tab; it still applies.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useWinampEq(): WinampEqSettings {
  return useSyncExternalStore(subscribe, getWinampEq, () => FLAT_EQ);
}

/** Whether the app wears the Winamp theme right now. */
export function useWinampTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const check = () => setOn(root.dataset.customThemeId === "winamp");
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return on;
}

/** The filters for the music bot as heard here (preamp first, then the ten bands, dB), or null: leave it alone. */
export function useMusicEq(): number[] | null {
  const eq = useWinampEq();
  const winamp = useWinampTheme();
  const gains = winamp ? eqGains(eq) : null;
  const key = gains ? [gains.preamp, ...gains.bands].join(",") : "";
  // One array per setting, so the playback only re-plans when a slider actually moves.
  return useMemo(() => (key ? key.split(",").map(Number) : null), [key]);
}
