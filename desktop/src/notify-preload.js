"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * A deliberately tiny bridge injected into the Huddle web app. It exposes only:
 *  - `window.huddle.desktop` so the app can tell it's running in the shell,
 *  - `window.huddle.setBadge(n)` to reflect the unread count on the dock/taskbar.
 * The global hotkey arrives as an IPC message and is re-dispatched as a plain
 * DOM event the web app can listen for, so no privileged API is handed over.
 */
contextBridge.exposeInMainWorld("huddle", {
  desktop: true,
  setBadge: (count) => ipcRenderer.send("set-badge", Number(count) || 0),
  /** Re-binds the global mute shortcut to the accelerator chosen in Settings. */
  setMuteHotkey: (accelerator) =>
    ipcRenderer.send("set-mute-hotkey", String(accelerator || "")),
  /**
   * Global push-to-talk key (a KeyboardEvent.code, or "" to turn it off).
   * Resolves true when the key is held globally, false if only in-window.
   */
  setPushToTalkKey: (code) =>
    new Promise((resolve) => {
      ipcRenderer.once("ptt-global", (_event, ok) => resolve(Boolean(ok)));
      ipcRenderer.send("set-ptt-key", String(code || ""));
    }),
  /** Tells the shell whether a call is live, so it throttles the window only when idle. */
  setInCall: (on) => ipcRenderer.send("set-in-call", Boolean(on)),
  /** What is running here: { activity: {name, kind}|null, music: {song, artist, albumArt}|null }. */
  scanActivity: () => ipcRenderer.invoke("activity:scan"),
  /**
   * Windows and macOS: the screen share's audio, captured per app by the
   * shell instead of the whole output device (so not the room's own voices).
   */
  appAudio: {
    /** Whether the share just started gets its audio from here. */
    active: () => ipcRenderer.invoke("app-audio:active"),
    /** Interleaved stereo float32 at 48 kHz, as bytes. Returns the unsubscribe. */
    onData: (callback) => {
      const listener = (_event, chunk) => callback(chunk);
      ipcRenderer.on("app-audio:pcm", listener);
      return () => ipcRenderer.removeListener("app-audio:pcm", listener);
    },
    stop: () => ipcRenderer.send("app-audio:stop"),
  },
  /** Trigger native OS push notification */
  notify: (title, body) =>
    ipcRenderer.send("desktop-notification", { title, body }),
});

ipcRenderer.on("hotkey", (_event, action) => {
  window.dispatchEvent(new CustomEvent("huddle-hotkey", { detail: action }));
});
