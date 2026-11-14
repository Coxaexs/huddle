"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splash", {
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("splash:state", listener);
    return () => ipcRenderer.removeListener("splash:state", listener);
  },
  skip: () => ipcRenderer.send("splash:skip"),
});
