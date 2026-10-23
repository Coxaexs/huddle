"use strict";

/**
 * The app keeps itself current, the way Discord does.
 *
 * The chat itself is the hosted site, so a deploy already reaches everyone at
 * their next reload. This is for the shell around it (Electron, the tray,
 * global push-to-talk, per-app share audio), which used to need a download
 * from hoffle.online for every change.
 *
 * electron-updater asks GitHub for the latest desktop-v* release (the
 * latest*.yml files that electron-builder writes next to the installers, see
 * the publish block in package.json), downloads a newer version in the
 * background and checks its sha512. It installs:
 *   - straight away, when it turns up within a minute of launch and no call
 *     is live: the window has hardly opened, so nobody loses anything;
 *   - when the person picks "Restart" (the page's update banner, or the tray);
 *   - otherwise when the app quits.
 *
 * Where the app cannot replace itself it only says that a newer one is out
 * ("manual"), and the page links to the download: macOS refuses a self-update
 * unless the app has a Developer ID signature, and a Linux build that is not
 * the AppImage has no file to swap.
 */

/** How often a running app looks for a newer version. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
/** An update ready this soon after launch is installed at once, as described above. */
const APPLY_AT_LAUNCH_MS = 60 * 1000;

/**
 * The update logic, given its electron-updater and its surroundings, so the
 * tests can drive it without Electron.
 *
 * @param {object} deps
 * @param {object} deps.autoUpdater electron-updater's autoUpdater (an EventEmitter)
 * @param {boolean} deps.canInstall whether this copy can replace itself
 * @param {() => boolean} deps.isBusy true while a call is live
 * @param {(state: {status: string, version?: string, percent?: number}) => void} deps.onChange
 * @param {() => void} deps.beforeInstall lets the windows close instead of hiding to the tray
 * @param {() => number} [deps.now]
 * @param {(error: Error) => void} [deps.log]
 */
function createUpdater({ autoUpdater, canInstall, isBusy, onChange, beforeInstall, now = Date.now, log = () => {} }) {
  const startedAt = now();
  let state = { status: "idle" };
  const set = (next) => {
    state = next;
    onChange(state);
  };

  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;

  autoUpdater.on("checking-for-update", () => {
    if (state.status === "idle" || state.status === "error") set({ status: "checking" });
  });
  autoUpdater.on("update-not-available", () => {
    if (state.status === "checking") set({ status: "idle" });
  });
  autoUpdater.on("update-available", (info) => {
    set({ status: canInstall ? "downloading" : "manual", version: info && info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    if (state.status !== "downloading") return;
    const percent = Math.round((progress && progress.percent) || 0);
    if (percent !== state.percent) set({ ...state, percent });
  });
  autoUpdater.on("update-downloaded", (info) => {
    set({ status: "ready", version: info && info.version });
    if (now() - startedAt < APPLY_AT_LAUNCH_MS && !isBusy()) install();
  });
  autoUpdater.on("error", (error) => {
    log(error);
    // A failed check or download is tried again at the next one; a finished
    // download stays ready.
    if (state.status !== "ready" && state.status !== "manual") set({ status: "error" });
  });

  function check() {
    if (state.status === "ready" || state.status === "downloading" || state.status === "checking") return;
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch(() => {
        // Usually reported through the "error" event too; never stay "checking".
        if (state.status === "checking") set({ status: "error" });
      });
  }

  function install() {
    if (state.status !== "ready") return;
    beforeInstall();
    // Silent installer, then start the new version.
    autoUpdater.quitAndInstall(true, true);
  }

  return { check, install, state: () => state };
}

/** macOS self-updates only work for a Developer ID signature (not the ad-hoc one CI uses without a certificate). */
function hasDeveloperIdSignature(appBundle) {
  const { execFile } = require("node:child_process");
  return new Promise((resolve) => {
    execFile("codesign", ["-dv", "--verbose=2", appBundle], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve(!error && /Authority=Developer ID Application/.test(`${stdout}${stderr}`));
    });
  });
}

/**
 * Starts checking, now and every few hours. Resolves null where there is
 * nothing to update (a development run, or electron-updater missing).
 */
async function startUpdater({ isBusy, onChange, beforeInstall }) {
  const { app } = require("electron");
  const path = require("node:path");
  if (!app.isPackaged) return null;
  if (process.platform === "linux" && !process.env.APPIMAGE) return null;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return null;
  }
  // …/Hoffle.app/Contents/MacOS/Hoffle → …/Hoffle.app
  const canInstall =
    process.platform !== "darwin" ||
    (await hasDeveloperIdSignature(path.resolve(path.dirname(process.execPath), "..", "..")));
  const updater = createUpdater({
    autoUpdater,
    canInstall,
    isBusy,
    onChange,
    beforeInstall,
    log: (error) => console.warn("update:", error && error.message),
  });
  updater.check();
  setInterval(() => updater.check(), CHECK_EVERY_MS).unref();
  return updater;
}

/** Where a person gets the new version by hand ("manual"). */
function downloadPage() {
  const platform =
    process.platform === "darwin"
      ? process.arch === "arm64" ? "mac-arm64" : "mac-intel"
      : process.platform === "win32" ? "windows" : "linux";
  return `https://hoffle.online/download/${platform}`;
}

module.exports = { createUpdater, startUpdater, downloadPage, CHECK_EVERY_MS, APPLY_AT_LAUNCH_MS };
