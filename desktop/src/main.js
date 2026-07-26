"use strict";

const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** Global hotkey that toggles your mic even when Huddle isn't focused. */
const MUTE_HOTKEY = "CommandOrControl+Shift+M";

/**
 * Huddle desktop shell.
 *
 * A thin Electron wrapper around the hosted app at deeppixel.online/hangout.
 * Chromium gives us identical WebRTC behaviour on macOS and Windows, plus a
 * proper screen-share source picker (below). The remote site runs sandboxed:
 * no preload is injected into it and node integration is off.
 */

const APP_URL = process.env.HUDDLE_URL || "https://deeppixel.online/hangout";
const boundsFile = path.join(app.getPath("userData"), "window-bounds.json");

let mainWindow = null;

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile, "utf8"));
  } catch {
    return {};
  }
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(boundsFile, JSON.stringify(mainWindow.getBounds()));
  } catch {
    // Bounds are a nicety; ignore a failed write.
  }
}

function createWindow() {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#1b1b21",
    title: "Huddle",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, "notify-preload.js"),
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on("close", saveBounds);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Target=_blank and external links open in the system browser, not in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

/** Grant the media + display-capture permissions a call app needs. */
function configureSession() {
  const ses = session.defaultSession;
  const allowed = new Set([
    "media",
    "display-capture",
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "fullscreen",
    "pointerLock",
  ]);
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Intercept getDisplayMedia() and show our own source picker.
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const source = await pickSource();
        if (!source) {
          callback({}); // user cancelled -> renderer gets NotAllowedError
          return;
        }
        callback({
          video: source,
          // System audio capture only works on Windows via the loopback device.
          audio: process.platform === "win32" ? "loopback" : undefined,
        });
      } catch {
        callback({});
      }
    },
    // We render our own picker rather than the OS one so it looks the same
    // on both platforms.
    { useSystemPicker: false },
  );
}

/** Opens a modal picker listing screens and windows; resolves the chosen source. */
function pickSource() {
  return new Promise((resolve) => {
    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 320, height: 200 },
        fetchWindowIcons: true,
      })
      .then((sources) => {
        const picker = new BrowserWindow({
          width: 760,
          height: 580,
          parent: mainWindow || undefined,
          modal: Boolean(mainWindow),
          show: false,
          resizable: true,
          minimizable: false,
          maximizable: false,
          title: "Choose what to share",
          backgroundColor: "#1b1b21",
          webPreferences: {
            preload: path.join(__dirname, "picker-preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        picker.setMenuBarVisibility(false);
        picker.loadFile(path.join(__dirname, "picker.html"));

        const payload = sources.map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
          appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
          isScreen: s.id.startsWith("screen:"),
        }));

        let settled = false;
        const finish = (id) => {
          if (settled) return;
          settled = true;
          ipcMain.removeListener("picker:choose", onChoose);
          resolve(id ? sources.find((s) => s.id === id) || null : null);
          if (!picker.isDestroyed()) picker.close();
        };
        const onChoose = (_event, id) => finish(id);

        picker.webContents.once("did-finish-load", () => {
          picker.webContents.send("sources", payload);
          picker.show();
        });
        ipcMain.on("picker:choose", onChoose);
        picker.on("closed", () => finish(null));
      })
      .catch(() => resolve(null));
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One running instance; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    configureSession();
    buildMenu();
    createWindow();

    // Unread count → dock/taskbar badge.
    ipcMain.on("set-badge", (_event, count) => {
      const n = Number(count) || 0;
      if (typeof app.setBadgeCount === "function") app.setBadgeCount(n);
    });

    // Global mute toggle, relayed to the web app.
    globalShortcut.register(MUTE_HOTKEY, () => {
      mainWindow?.webContents.send("hotkey", "toggle-mute");
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
