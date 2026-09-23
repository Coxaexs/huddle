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
  Tray,
  Notification,
  nativeImage,
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

const DEFAULT_URL = "https://deeppixel.online/hangout";
const boundsFile = path.join(app.getPath("userData"), "window-bounds.json");
const configFile = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8")) || {};
  } catch {
    return {};
  }
}

function saveConfig(next) {
  try {
    fs.writeFileSync(configFile, JSON.stringify({ ...loadConfig(), ...next }, null, 2));
  } catch {
    // Unwritable profile: the choice lasts for this session only.
  }
}

/** Accepts "chat.example.com" or a full URL; returns a clean http(s) URL or "". */
function normalizeServerUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * Which instance to open, most specific first:
 *   huddle --server=https://chat.example.com   (one launch)
 *   HUDDLE_URL=https://chat.example.com huddle (one launch)
 *   Server → Change server… in the menu        (remembered)
 */
function resolveAppUrl() {
  const flag = process.argv.find((arg) => arg.startsWith("--server="));
  return (
    normalizeServerUrl(flag && flag.slice("--server=".length)) ||
    normalizeServerUrl(process.env.HUDDLE_URL) ||
    normalizeServerUrl(loadConfig().serverUrl) ||
    DEFAULT_URL
  );
}

let APP_URL = resolveAppUrl();

let mainWindow = null;
let tray = null;
let isQuitting = false;

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

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, "../build/icon.png");
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip("Huddle");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Huddle",
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Toggle Mute",
      click: () => {
        mainWindow?.webContents.send("hotkey", "toggle-mute");
      },
    },
    { type: "separator" },
    {
      label: "Quit Huddle",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (!mainWindow) {
      createWindow();
    } else if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
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
  mainWindow.on("close", (event) => {
    saveBounds();
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Target=_blank and external links open in the system browser, not in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

// Linux: capture through PipeWire and the xdg-desktop-portal, which is how
// screen sharing works on Wayland (and is fine on X11 too). Must be set before
// the app is ready.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

function supportsLoopbackAudio() {
  // Linux loopback goes through PulseAudio / pipewire-pulse's monitor source.
  if (process.platform === "win32" || process.platform === "linux") return true;
  if (process.platform !== "darwin") return false;
  const electronMajor = Number(process.versions.electron.split(".")[0]);
  const darwinMajor = Number(require("node:os").release().split(".")[0]);
  return electronMajor >= 36 && darwinMajor >= 22; // Darwin 22 = macOS 13
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
        // On Linux the portal shows the system's own picker, so ours would
        // just be a second, emptier dialog in front of it.
        const source =
          process.platform === "linux" ? await portalSource() : await pickSource();
        if (!source) {
          callback({}); // user cancelled -> renderer gets NotAllowedError
          return;
        }
        callback({
          video: source,
          // Desktop audio alongside the video: Chromium's loopback capture on
          // Windows, PulseAudio/PipeWire on Linux, and ScreenCaptureKit on
          // macOS 13+ from Electron 36.
          audio: supportsLoopbackAudio() ? "loopback" : undefined,
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

/** A small dialog for pointing the app at a different Hoffle instance. */
function openServerDialog() {
  const dialog = new BrowserWindow({
    width: 460,
    height: 260,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Change server",
    backgroundColor: "#1b1b21",
    webPreferences: {
      preload: path.join(__dirname, "server-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dialog.setMenuBarVisibility(false);
  dialog.loadFile(path.join(__dirname, "server.html"));
  dialog.webContents.once("did-finish-load", () => {
    dialog.webContents.send("server:current", { current: APP_URL, fallback: DEFAULT_URL });
    dialog.show();
  });
}

function switchServer(url) {
  APP_URL = url;
  saveConfig({ serverUrl: url === DEFAULT_URL ? "" : url });
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(APP_URL);
  else createWindow();
}

/**
 * Linux: asking desktopCapturer for sources opens the xdg-desktop-portal
 * picker (GNOME, KDE, wlroots…), and the one thing chosen there comes back as
 * the only source. On X11 without a portal we get the full list instead, so
 * fall back to our own picker in that case.
 */
async function portalSource() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 0, height: 0 },
  });
  if (sources.length === 1) return sources[0];
  if (!sources.length) return null; // cancelled in the portal
  return pickSource();
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
      label: "Server",
      submenu: [
        { label: "Change server…", click: () => openServerDialog() },
        { label: "Use default server", click: () => switchServer(DEFAULT_URL) },
      ],
    },
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

/** Maps a DOM KeyboardEvent.code (what Settings stores) to a uiohook keycode. */
function keycodeFor(keys, code) {
  if (!code) return null;
  const aliases = {
    ControlLeft: "Ctrl",
    ControlRight: "CtrlRight",
    ShiftLeft: "Shift",
    ShiftRight: "ShiftRight",
    AltLeft: "Alt",
    AltRight: "AltRight",
    MetaLeft: "Meta",
    MetaRight: "MetaRight",
    Backquote: "Backquote",
    CapsLock: "CapsLock",
  };
  let name = aliases[code];
  if (!name && /^Key[A-Z]$/.test(code)) name = code.slice(3);
  if (!name && /^Digit[0-9]$/.test(code)) name = code.slice(5);
  if (!name && /^Numpad[0-9]$/.test(code)) name = code;
  if (!name) name = code; // Space, Tab, F1…F24, Insert, Pause, etc.
  return typeof keys[name] === "number" ? keys[name] : null;
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
    createTray();

    // Native OS push notification handler
    ipcMain.on("desktop-notification", (_event, { title, body }) => {
      if (Notification.isSupported()) {
        const iconPath = path.join(__dirname, "../build/icon.png");
        const notification = new Notification({
          title: String(title || "Huddle"),
          body: String(body || ""),
          icon: fs.existsSync(iconPath) ? iconPath : undefined,
        });
        notification.on("click", () => {
          if (!mainWindow) {
            createWindow();
          } else {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        });
        notification.show();
      }
    });

    // Unread count → dock/taskbar badge.
    ipcMain.on("set-badge", (_event, count) => {
      const n = Number(count) || 0;
      if (typeof app.setBadgeCount === "function") app.setBadgeCount(n);
    });

    // Global mute toggle, relayed to the web app. The accelerator follows
    // whatever is chosen in Settings; this is just the starting point.
    let muteHotkey = "";
    const bindMuteHotkey = (accelerator) => {
      if (accelerator === muteHotkey) return;
      if (muteHotkey) globalShortcut.unregister(muteHotkey);
      muteHotkey = "";
      if (!accelerator) return;
      try {
        const ok = globalShortcut.register(accelerator, () => {
          mainWindow?.webContents.send("hotkey", "toggle-mute");
        });
        if (ok) muteHotkey = accelerator;
      } catch {
        // An accelerator the OS refuses just leaves the shortcut unbound.
      }
    };
    bindMuteHotkey(MUTE_HOTKEY);
    ipcMain.on("set-mute-hotkey", (_event, accelerator) =>
      bindMuteHotkey(accelerator),
    );

    ipcMain.on("server:set", (event, input) => {
      const url = normalizeServerUrl(input);
      event.sender.send("server:result", url ? "" : "That doesn't look like a web address.");
      if (!url) return;
      BrowserWindow.fromWebContents(event.sender)?.close();
      switchServer(url);
    });

    // Global push-to-talk. Electron's globalShortcut only reports key *presses*,
    // and PTT needs the release too, so this uses a system keyboard hook when
    // the optional uiohook-napi module is installed. Without it, PTT still
    // works while the window is focused.
    let pttKeycode = null;
    let pttHeld = false;
    let hook = null;
    try {
      hook = require("uiohook-napi");
    } catch {
      hook = null;
    }
    if (hook) {
      const { uIOhook } = hook;
      uIOhook.on("keydown", (event) => {
        if (event.keycode !== pttKeycode || pttHeld) return;
        pttHeld = true;
        mainWindow?.webContents.send("hotkey", "ptt-down");
      });
      uIOhook.on("keyup", (event) => {
        if (event.keycode !== pttKeycode || !pttHeld) return;
        pttHeld = false;
        mainWindow?.webContents.send("hotkey", "ptt-up");
      });
    }
    let hookRunning = false;
    ipcMain.on("set-ptt-key", (event, code) => {
      if (!hook) {
        event.sender.send("ptt-global", false);
        return;
      }
      pttKeycode = keycodeFor(hook.UiohookKey, String(code || ""));
      pttHeld = false;
      try {
        if (pttKeycode !== null && !hookRunning) {
          hook.uIOhook.start();
          hookRunning = true;
        } else if (pttKeycode === null && hookRunning) {
          hook.uIOhook.stop();
          hookRunning = false;
        }
      } catch {
        // No accessibility permission (macOS) or no X server: focused-only PTT.
        pttKeycode = null;
      }
      event.sender.send("ptt-global", pttKeycode !== null);
    });
    app.on("will-quit", () => {
      if (hookRunning) hook.uIOhook.stop();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && (!tray || isQuitting)) {
      app.quit();
    }
  });
}
