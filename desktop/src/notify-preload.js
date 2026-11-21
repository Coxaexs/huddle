"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * A deliberately tiny bridge injected into the Huddle web app. It exposes only:
 *  - `window.huddle.desktop` so the app can tell it's running in the shell,
 *  - `window.huddle.setBadge(n)` to reflect the unread count on the dock/taskbar,
 *  - `window.huddle.updates` to offer a restart once the app has updated itself,
 *  - `window.huddle.overlay` to feed the game overlay and take its buttons back.
 * The global hotkey arrives as an IPC message and is re-dispatched as a plain
 * DOM event the web app can listen for, so no privileged API is handed over.
 */
contextBridge.exposeInMainWorld("huddle", {
  desktop: true,
  titlebarInset: true,
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
  /** Play together: opens a steam:// join link (the shell checks it against its list). */
  openGameLink: (url) => ipcRenderer.invoke("game-link:open", String(url || "")),
  /**
   * Listen along: { action: "play", trackId, positionMs } | { action: "seek", positionMs }
   * | { action: "pause" } | { action: "state" }. Resolves to { trackId, positionMs, playing }
   * where Spotify can say (macOS, Linux), else null.
   */
  spotifyControl: (command) => ipcRenderer.invoke("spotify:control", command),
  /** Play together: asks the game's Hoffle mod to join with this invite code. */
  queueGameJoin: (game, data) => ipcRenderer.invoke("game-join:queue", String(game || ""), data),
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
  /**
   * The app's own update (updater.js). state(): { status, version } where
   * status "ready" means a restart installs it, and "manual" that a newer
   * version is out which this copy cannot install itself.
   */
  updates: {
    state: () => ipcRenderer.invoke("update:state"),
    /** Returns the unsubscribe. */
    onChange: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("update:state", listener);
      return () => ipcRenderer.removeListener("update:state", listener);
    },
    install: () => ipcRenderer.send("update:install"),
    /** Looks for a newer version now (it also looks every 30 minutes). */
    check: () => ipcRenderer.send("update:check"),
    download: () => ipcRenderer.send("update:download"),
  },
  /**
   * The game overlay (overlay.js). The page describes the call and the channel
   * list when `want` asks for them, and carries out the overlay's buttons.
   */
  overlay: {
    /** { enabled, combo, defaultCombo, shortcut, hotkeyOk, game } */
    settings: () => ipcRenderer.invoke("overlay:settings"),
    /** { enabled?, combo?, accelerator? }; resolves to the new settings. */
    setSettings: (patch) => ipcRenderer.invoke("overlay:set-settings", patch),
    /** { voice, shell }: what the overlay can use right now. */
    want: () => ipcRenderer.invoke("overlay:want"),
    onWant: (callback) => {
      const listener = (_event, want) => callback(want);
      ipcRenderer.on("overlay:want", listener);
      return () => ipcRenderer.removeListener("overlay:want", listener);
    },
    publishVoice: (voice) => ipcRenderer.send("overlay:voice", voice),
    publishShell: (shell) => ipcRenderer.send("overlay:shell", shell),
    publishMessage: (event) => ipcRenderer.send("overlay:message", event),
    /** { type: "mute" | "deafen" | "leave" | "join" | "open-main" | "settings", channelId? } */
    onAction: (callback) => {
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("overlay:action", listener);
      return () => ipcRenderer.removeListener("overlay:action", listener);
    },
  },
  /** Trigger native OS push notification */
  notify: (title, body) =>
    ipcRenderer.send("desktop-notification", { title, body }),
});

ipcRenderer.on("hotkey", (_event, action) => {
  window.dispatchEvent(new CustomEvent("huddle-hotkey", { detail: action }));
});
