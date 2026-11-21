"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * The bridge for the overlay page (desktop/src/overlay.js). It only carries
 * what the overlay shows (the call, the channel list, pop-ups) in, and its
 * button presses out; the main window does the actual work.
 */
const listen = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("hoffleOverlay", {
  /** { state, voice, shell } as they are now. */
  hello: () => ipcRenderer.invoke("overlay:hello"),
  /** { open, game, shortcut, platform } */
  onState: listen("overlay:state"),
  onVoice: listen("overlay:voice"),
  onShell: listen("overlay:shell"),
  /** { kind, title, body, at } */
  onToast: listen("overlay:toast"),
  /** New, edited and deleted messages, relayed from the main window's connection. */
  onMessage: listen("overlay:message"),
  /** { type: "close" | "mute" | "deafen" | "leave" | "join" | "open-main" | "settings", channelId? } */
  action: (action) => ipcRenderer.send("overlay:action", action),
});
