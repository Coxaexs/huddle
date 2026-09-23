"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the "Change server" dialog only (not the remote app).
contextBridge.exposeInMainWorld("server", {
  onCurrent: (callback) =>
    ipcRenderer.on("server:current", (_event, info) => callback(info)),
  onResult: (callback) =>
    ipcRenderer.on("server:result", (_event, error) => callback(error)),
  set: (url) => ipcRenderer.send("server:set", String(url || "")),
});
