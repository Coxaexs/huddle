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
});

ipcRenderer.on("hotkey", (_event, action) => {
  window.dispatchEvent(new CustomEvent("huddle-hotkey", { detail: action }));
});
