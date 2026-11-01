import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SNOOZES, mayOfferNotifications, snoozeNotifyPrompt } from "./notify-moment";

const NOW = Date.UTC(2026, 10, 1, 12);

function browser(permission: NotificationPermission, extra: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { ...extra });
  vi.stubGlobal("navigator", { serviceWorker: {} });
  vi.stubGlobal("Notification", { permission });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  });
  return store;
}

describe("when to offer notifications", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("offers once the browser hasn't asked yet", () => {
    browser("default");
    expect(mayOfferNotifications(NOW)).toBe(true);
  });

  it("never offers after the browser's question was answered", () => {
    browser("granted");
    expect(mayOfferNotifications(NOW)).toBe(false);
    browser("denied");
    expect(mayOfferNotifications(NOW)).toBe(false);
  });

  it("leaves the desktop and phone apps alone", () => {
    browser("default", { huddle: { desktop: true } });
    expect(mayOfferNotifications(NOW)).toBe(false);
    browser("default", { __TAURI__: {} });
    expect(mayOfferNotifications(NOW)).toBe(false);
    browser("default", { Capacitor: { isNativePlatform: () => true } });
    expect(mayOfferNotifications(NOW)).toBe(false);
  });

  it("respects notifications turned off in Settings", () => {
    browser("default").set("huddle-notify", "off");
    expect(mayOfferNotifications(NOW)).toBe(false);
  });

  it("waits a week after Not now, and stops after the second", () => {
    browser("default");
    snoozeNotifyPrompt(NOW);
    expect(mayOfferNotifications(NOW + 60_000)).toBe(false);
    expect(mayOfferNotifications(NOW + 8 * 86_400_000)).toBe(true);
    for (let i = 1; i < MAX_SNOOZES; i += 1) snoozeNotifyPrompt(NOW + 8 * 86_400_000);
    expect(mayOfferNotifications(NOW + 30 * 86_400_000)).toBe(false);
  });
});
