import { afterEach, describe, expect, it, vi } from "vitest";
import { installTauriHotkeys } from "../app/lib/tauri-shell";

afterEach(() => vi.unstubAllGlobals());

describe("installTauriHotkeys", () => {
  it("does nothing outside the Tauri shell", () => {
    vi.stubGlobal("__TAURI__", undefined);
    expect(() => installTauriHotkeys()()).not.toThrow();
  });

  it("turns Tauri's mute event into the DOM event the app already handles", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("CustomEvent", class extends Event { detail: unknown; constructor(type: string, init?: { detail?: unknown }) { super(type); this.detail = init?.detail; } });
    let fire: () => void = () => undefined;
    const off = vi.fn();
    vi.stubGlobal("__TAURI__", { event: { listen: async (_name: string, handler: () => void) => { fire = handler; return off; } } });
    const seen: unknown[] = [];
    target.addEventListener("huddle-hotkey", (event) => seen.push((event as CustomEvent).detail));
    const stop = installTauriHotkeys();
    await Promise.resolve();
    fire();
    expect(seen).toEqual(["toggle-mute"]);
    stop();
    expect(off).toHaveBeenCalled();
  });
});
