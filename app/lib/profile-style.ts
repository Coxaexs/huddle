"use client";

import { useEffect, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import type { ProfileStyle } from "@/lib/users";

/*
 * Profile style follows a member around the app: their name in chat and the
 * member list, their card, their voice tile. Styles live in
 * app/profile-style.css; this file turns a ProfileStyle into props.
 *
 * Voice tiles only get PresenceUser data, so chat-shell feeds every loaded
 * member into a small registry that anything can read by user id.
 */

const registry = new Map<string, ProfileStyle>();
const listeners = new Set<() => void>();
let version = 0;

export function registerProfileStyles(people: Array<{ id: string; profileStyle?: ProfileStyle }>) {
  let changed = false;
  for (const person of people) {
    const next = person.profileStyle || {};
    const prev = registry.get(person.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
      registry.set(person.id, next);
      changed = true;
    }
  }
  if (!changed) return;
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when any registered style changes; returns a lookup by user id. */
export function useProfileStyles(): (id: string | undefined) => ProfileStyle | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return (id) => (id ? registry.get(id) : undefined);
}

type Props = { className: string; style?: CSSProperties; "data-text"?: string };

/**
 * Props for an element showing someone's display name. A gradient or effect
 * wins over the role color, the way a gradient role would.
 */
export function nameStyleProps(style: ProfileStyle | undefined, text?: string, fallbackColor?: string | null, extraClass = ""): Props {
  const colors = style?.nameColors;
  const classes = ["pname"];
  const css: Record<string, string> = {};
  if (colors?.length) {
    classes.push(colors.length > 1 ? "pname-grad" : "pname-solid");
    css["--n1"] = colors[0];
    css["--n2"] = colors[1] || colors[0];
    css["--n3"] = colors[2] || colors[0];
  } else if (fallbackColor) {
    css.color = fallbackColor;
    css["--n1"] = fallbackColor;
    css["--n2"] = fallbackColor;
    css["--n3"] = fallbackColor;
  }
  if (style?.nameFx) classes.push(`pname-fx-${style.nameFx}`);
  if (style?.nameFont) classes.push(`pname-font-${style.nameFont}`);
  if (classes.length === 1) return { className: extraClass, style: fallbackColor ? { color: fallbackColor } : undefined };
  if (extraClass) classes.push(extraClass);
  return {
    className: classes.join(" "),
    style: css as CSSProperties,
    ...(style?.nameFx === "glitch" && text ? { "data-text": text } : {}),
  };
}

/** Class and CSS variables that tint a profile card with the member's theme. */
export function cardThemeProps(style: ProfileStyle | undefined): { className: string; style: CSSProperties } {
  const theme = style?.themeColors;
  const motion = style?.cardMotion || "tilt";
  return {
    className: `pcard-motion-${motion}${theme ? " pcard-themed" : ""}`,
    style: (theme ? { "--pt-a": theme[0], "--pt-b": theme[1] } : {}) as CSSProperties,
  };
}

/** Classes for a voice tile: the speaking ring and the join flourish. */
export function voiceTileClasses(style: ProfileStyle | undefined): string {
  const out: string[] = [];
  if (style?.voiceRing) out.push(`vring vring-${style.voiceRing}`);
  if (style?.entrance) out.push(`ventr ventr-${style.entrance}`);
  return out.join(" ");
}

/**
 * Tilts a card toward the pointer and moves a glare across it. Off for
 * reduced motion and for "still"/"float" cards.
 */
export function useCardTilt(ref: RefObject<HTMLElement | null>, motion: ProfileStyle["cardMotion"]) {
  useEffect(() => {
    const el = ref.current;
    if (!el || (motion && motion !== "tilt")) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        el.style.setProperty("--tilt-x", `${((0.5 - y) * 7).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
        el.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
        el.classList.add("is-tilting");
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      el.classList.remove("is-tilting");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [ref, motion]);
}
