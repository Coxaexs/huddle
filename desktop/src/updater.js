"use strict";

const { createMacBundleUpdater, isPathWritable } = require("./mac-updater");

/** How often a running app looks for a newer version. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
/** An update ready this soon after launch is installed at once unless skipped. */
const APPLY_AT_LAUNCH_MS = 60 * 1000;

/**
 * The update logic, given its autoUpdater and surroundings so tests can drive
 * it without Electron.
 *
 * @param {object} deps
 * @param {object} deps.autoUpdater electron-updater's autoUpdater (or mac-updater)
 * @param {boolean} deps.canInstall whether this copy can replace itself
 * @param {() => boolean} deps.isBusy true while a call is live
 * @param {() => boolean} [deps.isSplashOpen] true while the startup splash is still shown
 * @param {(state: {status: string, version?: string, percent?: number}) => void} deps.onChange
 * @param {() => void} deps.beforeInstall lets the windows close instead of hiding to the tray
 * @param {() => number} [deps.now]
 * @param {(error: Error) => void} [deps.log]
 */
function createUpdater({
  autoUpdater,
  canInstall,
  isBusy,
  isSplashOpen = () => false,
  onChange,
  beforeInstall,
  now = Date.now,
  log = () => {},
}) {
  const startedAt = now();
  let state = { status: "idle" };
  let skipped = false;
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
    const autoAtLaunch = isSplashOpen() || (!skipped && now() - startedAt < APPLY_AT_LAUNCH_MS);
    if (autoAtLaunch && !isBusy()) install();
  });
  autoUpdater.on("error", (error) => {
    log(error);
    if (state.status !== "ready" && state.status !== "manual") set({ status: "error" });
  });

  function check() {
    if (state.status === "ready" || state.status === "downloading" || state.status === "checking") return;
    Promise.resolve()
      .then(() => autoUpdater.checkForUpdates())
      .catch(() => {
        if (state.status === "checking") set({ status: "error" });
      });
  }

  function install() {
    if (state.status !== "ready") return;
    beforeInstall();
    autoUpdater.quitAndInstall(true, true);
  }

  function markSkipped() {
    skipped = true;
  }

  return { check, install, markSkipped, state: () => state };
}

/** macOS Squirrel.Mac self-updates only work with a Developer ID signature. */
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
 * nothing to update (a development run, or non-AppImage Linux).
 */
async function startUpdater({ isBusy, isSplashOpen, onChange, beforeInstall }) {
  const { app } = require("electron");
  const path = require("node:path");
  if (!app.isPackaged) return null;
  if (process.platform === "linux" && !process.env.APPIMAGE) return null;

  let autoUpdater;
  let canInstall = true;

  if (process.platform === "darwin") {
    const appBundle = path.resolve(path.dirname(process.execPath), "..", "..");
    if (await hasDeveloperIdSignature(appBundle)) {
      try {
        ({ autoUpdater } = require("electron-updater"));
      } catch {
        return null;
      }
    } else {
      canInstall = isPathWritable(appBundle);
      autoUpdater = createMacBundleUpdater({
        app,
        currentVersion: app.getVersion(),
        appBundle,
        stageDir: path.join(app.getPath("userData"), "pending-update"),
      });
    }
  } else {
    try {
      ({ autoUpdater } = require("electron-updater"));
    } catch {
      return null;
    }
    if (process.platform === "linux") {
      canInstall = isPathWritable(process.env.APPIMAGE);
    }
  }

  const updater = createUpdater({
    autoUpdater,
    canInstall,
    isBusy,
    isSplashOpen,
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
