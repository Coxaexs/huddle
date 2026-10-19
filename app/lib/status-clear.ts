"use client";

/** "Clear after" choices for a custom status, picked in the status menu. */
export const STATUS_CLEAR_CHOICES = [
  { id: "30m", labelKey: "status.clear.30m" },
  { id: "1h", labelKey: "status.clear.1h" },
  { id: "4h", labelKey: "status.clear.4h" },
  { id: "today", labelKey: "status.clear.today" },
  { id: "never", labelKey: "status.clear.never" },
] as const;
export type StatusClearChoice = (typeof STATUS_CLEAR_CHOICES)[number]["id"];

const CHOICE_KEY = "hoffle-status-clear-after";
const EXPIRES_KEY = "hoffle-status-expires-at";

/** How long from now; "today" runs to local midnight. Null keeps the status. */
export function statusClearAfterMs(choice: StatusClearChoice, now = new Date()): number | null {
  if (choice === "30m") return 30 * 60_000;
  if (choice === "1h") return 60 * 60_000;
  if (choice === "4h") return 4 * 60 * 60_000;
  if (choice === "today") {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }
  return null;
}

export function readStatusClearChoice(): StatusClearChoice {
  try {
    const stored = localStorage.getItem(CHOICE_KEY);
    if (STATUS_CLEAR_CHOICES.some((choice) => choice.id === stored)) return stored as StatusClearChoice;
  } catch {
    // Storage blocked: never clear, as before.
  }
  return "never";
}

export function writeStatusClearChoice(choice: StatusClearChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // Storage blocked: applies to this status only.
  }
}

/** When this tab's own status clears, so a reload keeps the timer. */
export function readStatusExpiresAt(): number | null {
  try {
    const value = Number(localStorage.getItem(EXPIRES_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStatusExpiresAt(at: number | null): void {
  try {
    if (at) localStorage.setItem(EXPIRES_KEY, String(at));
    else localStorage.removeItem(EXPIRES_KEY);
  } catch {
    // Storage blocked: the server still clears it.
  }
}
