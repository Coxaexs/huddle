import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

// The Electron app's CommonJS module, loaded the way Electron loads it.
const { createUpdater, APPLY_AT_LAUNCH_MS } = createRequire(import.meta.url)("../desktop/src/updater.js") as {
  createUpdater: (deps: Record<string, unknown>) => {
    check(): void;
    install(): void;
    state(): { status: string; version?: string; percent?: number };
  };
  APPLY_AT_LAUNCH_MS: number;
};

function setup({ canInstall = true, busy = false } = {}) {
  const autoUpdater = Object.assign(new EventEmitter(), {
    autoDownload: undefined as boolean | undefined,
    autoInstallOnAppQuit: undefined as boolean | undefined,
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn(),
  });
  let clock = 1_000;
  const states: string[] = [];
  const beforeInstall = vi.fn();
  const updater = createUpdater({
    autoUpdater,
    canInstall,
    isBusy: () => busy,
    onChange: (state: { status: string }) => states.push(state.status),
    beforeInstall,
    now: () => clock,
  });
  const later = (ms: number) => { clock += ms; };
  return { autoUpdater, updater, states, beforeInstall, later };
}

describe("desktop updater", () => {
  it("downloads in the background where the app can replace itself", () => {
    const { autoUpdater } = setup();
    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it("installs at once when the update is ready right after launch", () => {
    const { autoUpdater, updater, beforeInstall } = setup();
    updater.check();
    autoUpdater.emit("update-available", { version: "2.1.0" });
    autoUpdater.emit("update-downloaded", { version: "2.1.0" });
    expect(beforeInstall).toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("never restarts in the middle of a call", () => {
    const { autoUpdater, updater } = setup({ busy: true });
    autoUpdater.emit("update-downloaded", { version: "2.1.0" });
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.state()).toEqual({ status: "ready", version: "2.1.0" });
  });

  it("waits to be asked once the app has been open a while", () => {
    const { autoUpdater, updater, later } = setup();
    later(APPLY_AT_LAUNCH_MS + 1);
    autoUpdater.emit("update-available", { version: "2.1.0" });
    autoUpdater.emit("download-progress", { percent: 41.6 });
    expect(updater.state()).toEqual({ status: "downloading", version: "2.1.0", percent: 42 });
    autoUpdater.emit("update-downloaded", { version: "2.1.0" });
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    updater.install();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("only reports a newer version where it cannot install one (unsigned Mac)", () => {
    const { autoUpdater, updater } = setup({ canInstall: false });
    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    autoUpdater.emit("update-available", { version: "2.1.0" });
    expect(updater.state()).toEqual({ status: "manual", version: "2.1.0" });
    updater.install();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    // A later failed check does not hide that a newer version is out.
    autoUpdater.emit("error", new Error("offline"));
    expect(updater.state().status).toBe("manual");
  });

  it("does not check again while a download is under way or waiting", async () => {
    const { autoUpdater, updater, later } = setup();
    later(APPLY_AT_LAUNCH_MS + 1);
    autoUpdater.emit("update-available", { version: "2.1.0" });
    updater.check();
    autoUpdater.emit("update-downloaded", { version: "2.1.0" });
    updater.check();
    await Promise.resolve();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("recovers from a failed check at the next one", async () => {
    const { autoUpdater, updater, states } = setup();
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdater.emit("checking-for-update");
      throw new Error("offline");
    });
    updater.check();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updater.state().status).toBe("error");
    updater.check();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(states[0]).toBe("checking");
  });
});
