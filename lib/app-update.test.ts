import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopUpdates, noticeKey, pickNotice, serverHasNewBuild } from "../app/lib/app-update";

afterEach(() => vi.unstubAllGlobals());

describe("serverHasNewBuild", () => {
  it("compares the server's build with this page's", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ build: "dev" }));
    expect(await serverHasNewBuild()).toBe(false);
    vi.stubGlobal("fetch", async () => Response.json({ build: "abc123" }));
    expect(await serverHasNewBuild()).toBe(true);
  });

  it("knows nothing when the server cannot be asked", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    expect(await serverHasNewBuild()).toBeNull();
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    expect(await serverHasNewBuild()).toBeNull();
  });
});

describe("pickNotice", () => {
  it("prefers a waiting app update, which reloads the page too", () => {
    expect(pickNotice(true, { status: "ready", version: "2.1.0" })).toEqual({ kind: "desktop", version: "2.1.0" });
    expect(pickNotice(false, { status: "manual", version: "2.1.0" })).toEqual({ kind: "manual", version: "2.1.0" });
    expect(pickNotice(true, { status: "downloading" })).toEqual({ kind: "web" });
    expect(pickNotice(false, { status: "idle" })).toBeNull();
    expect(pickNotice(false, null)).toBeNull();
  });

  it("keeps one version's Later from hiding the next", () => {
    expect(noticeKey({ kind: "desktop", version: "2.1.0" })).not.toBe(noticeKey({ kind: "desktop", version: "2.2.0" }));
  });
});

describe("desktopUpdates", () => {
  it("is null in a browser", () => {
    vi.stubGlobal("huddle", undefined);
    vi.stubGlobal("__TAURI__", undefined);
    expect(desktopUpdates()).toBeNull();
  });

  it("wraps the Electron bridge and drops malformed states", async () => {
    let push: (state: unknown) => void = () => undefined;
    const install = vi.fn();
    vi.stubGlobal("huddle", {
      updates: {
        state: async () => ({ status: "ready", version: "2.1.0" }),
        onChange: (callback: (state: unknown) => void) => { push = callback; return () => undefined; },
        install,
      },
    });
    const bridge = desktopUpdates()!;
    expect(await bridge.state()).toEqual({ status: "ready", version: "2.1.0" });
    const seen: unknown[] = [];
    bridge.onChange((state) => seen.push(state));
    push({ status: "downloading" });
    push("nonsense");
    expect(seen).toEqual([{ status: "downloading", version: undefined }]);
    bridge.install();
    expect(install).toHaveBeenCalled();
  });

  it("talks to Hoffle Lite over commands and events", async () => {
    vi.stubGlobal("huddle", undefined);
    const invoke = vi.fn(async (command: string) => (command === "update_state" ? { status: "ready", version: "2.1.0" } : null));
    let fire: (event: { payload: unknown }) => void = () => undefined;
    const off = vi.fn();
    vi.stubGlobal("__TAURI__", {
      core: { invoke },
      event: { listen: async (_name: string, handler: (event: { payload: unknown }) => void) => { fire = handler; return off; } },
    });
    const bridge = desktopUpdates()!;
    expect(await bridge.state()).toEqual({ status: "ready", version: "2.1.0" });
    const seen: unknown[] = [];
    const stop = bridge.onChange((state) => seen.push(state));
    await Promise.resolve();
    fire({ payload: { status: "ready", version: "2.2.0" } });
    expect(seen).toEqual([{ status: "ready", version: "2.2.0" }]);
    stop();
    expect(off).toHaveBeenCalled();
    bridge.install();
    expect(invoke).toHaveBeenCalledWith("update_install");
  });

  it("says nothing from a Lite build that has no update commands", async () => {
    vi.stubGlobal("huddle", undefined);
    vi.stubGlobal("__TAURI__", {
      core: { invoke: async () => { throw new Error("command update_state not found"); } },
      event: { listen: async () => () => undefined },
    });
    expect(await desktopUpdates()!.state()).toBeNull();
  });
});
