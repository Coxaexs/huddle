"use client";

import { useRef } from "react";

/**
 * Gives each function in `props` an identity that never changes, forwarding
 * calls to the newest version. That lets a memoised child skip renders caused
 * by handlers that are re-created every parent render. Functions named in
 * `live` are passed through untouched: those are called while rendering, so
 * the child has to see them change.
 */
export function useStableFns<T extends Record<string, unknown>>(
  props: T,
  live: ReadonlyArray<keyof T> = [],
): T {
  const latest = useRef(props);
  latest.current = props;
  const wrappers = useRef<Record<string, unknown>>({});
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (typeof value !== "function" || live.includes(key)) {
      out[key] = value;
      continue;
    }
    wrappers.current[key] ??= (...args: unknown[]) =>
      (latest.current[key] as (...a: unknown[]) => unknown)(...args);
    out[key] = wrappers.current[key];
  }
  return out as T;
}
