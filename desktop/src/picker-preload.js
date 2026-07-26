"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the screen-share picker window only (not the remote app).
contextBridge.exposeInMainWorld("picker", {
  onSources: (callback) =>
    ipcRenderer.on("sources", (_event, sources) => callback(sources)),
  choose: (id) => ipcRenderer.send("picker:choose", id),
});
