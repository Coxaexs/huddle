/**
 * /gmroll: a roll only the roller sees. The server sends everyone else a
 * masked copy (the dice tumble, but carry no faces and no total), and the
 * roller's browser keeps the real card it was sent, keyed by the roll's seed,
 * so their own copy of the "Secret roll" card can show it.
 */
import type { DiceRollEvent } from "./protocol";

/** A secret roll as everyone but the roller sees it. */
export function maskRoll(roll: DiceRollEvent): DiceRollEvent {
  return {
    ...roll,
    expression: "",
    modifier: 0,
    total: 0,
    summary: undefined,
    dice: roll.dice.map((term) => ({
      ...term,
      rolls: term.rolls.map(() => ({ value: 0, kept: true })),
    })),
    masked: true,
  };
}

const STORAGE_KEY = "huddle_secret_rolls";
const EVENT = "huddle-secret-roll";
/** Enough for a long session; the oldest are dropped first. */
const KEEP = 200;

type Store = Record<string, Record<string, unknown>>;

function load(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

/** The roller's browser remembers what it rolled. */
export function rememberSecretRoll(seed: string, card: Record<string, unknown>): void {
  if (typeof window === "undefined" || !seed) return;
  const store = load();
  store[seed] = card;
  const seeds = Object.keys(store);
  for (const old of seeds.slice(0, Math.max(0, seeds.length - KEEP))) delete store[old];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: the card just stays hidden on reload.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { seed, card } }));
}

/** Calls back when this browser learns the real card for `seed`; returns an unsubscribe. */
export function onSecretRoll(seed: string, callback: (card: Record<string, unknown>) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ seed: string; card: Record<string, unknown> }>).detail;
    if (detail?.seed === seed) callback(detail.card);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** The real card behind a secret roll, if this browser rolled it. */
export function recallSecretRoll(seed: string | undefined): Record<string, unknown> | null {
  if (typeof window === "undefined" || !seed) return null;
  return load()[seed] ?? null;
}
