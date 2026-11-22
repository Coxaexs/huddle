"use strict";

const { BrowserWindow, globalShortcut, ipcMain, screen, shell } = require("electron");
const path = require("node:path");

/**
 * The game overlay: a see-through window on top of everything else.
 *
 * - While a game is running it shows who is in your call (and who is talking)
 *   and pops up new messages. It never takes a click or the focus from the game.
 * - The shortcut (Alt+` unless changed in Settings) opens a small Hoffle over
 *   whatever is on screen: servers, channels, chat and the call buttons. The
 *   same shortcut, Esc or a click outside closes it again.
 *
 * It draws over games in borderless or windowed mode. A game in exclusive
 * fullscreen keeps the screen to itself, as with any overlay that does not
 * inject into the game. The page is the server's /overlay route; the call
 * itself stays in the main window, which tells the overlay what to show and
 * gets its button presses back (main window ⇄ this file ⇄ overlay page).
 */

const DEFAULT_COMBO = "Alt+Backquote";
const DEFAULT_ACCELERATOR = "Alt+`";
const GAME_CHECK_MS = 15_000;
const TOAST_MS = 7_000;
/** A closed overlay with no game running is unloaded after this long. */
const UNLOAD_MS = 3 * 60_000;
/** Some window managers report a blur while a window is being shown. */
const BLUR_GRACE_MS = 400;
/**
 * On Linux a window made unfocusable becomes override-redirect: the window
 * manager never manages it, so it could not take the keyboard later when the
 * small Hoffle opens. There it stays focusable and is only shown inactive.
 */
const TOGGLE_FOCUSABLE = process.platform !== "linux";

/**
 * @param {object} deps
 * @param {() => string} deps.appUrl          the Hoffle server the main window shows
 * @param {(url: string) => boolean} deps.isAppUrl
 * @param {() => Electron.BrowserWindow | null} deps.mainWindow
 * @param {() => void} deps.showMain          brings the main window forward
 * @param {() => object} deps.loadConfig
 * @param {(next: object) => void} deps.saveConfig
 * @param {(accelerator: string) => boolean} deps.isSafeAccelerator
 * @param {() => Promise<string | null>} deps.runningGame
 * @param {() => void} deps.onChange          settings changed (the tray menu shows the shortcut)
 */
function createOverlay(deps) {
  const stored = deps.loadConfig().overlay || {};
  let settings = {
    enabled: stored.enabled !== false,
    combo: typeof stored.combo === "string" ? stored.combo : DEFAULT_COMBO,
    accelerator: typeof stored.accelerator === "string" ? stored.accelerator : DEFAULT_ACCELERATOR,
    hintShown: Boolean(stored.hintShown),
  };

  let win = null;
  let loaded = false;
  /** The small Hoffle is showing and takes clicks and keys. */
  let open = false;
  let openedAt = 0;
  /** Name of the game running on this computer, or null. */
  let game = null;
  /** The call as the main window last described it (null when not in one). */
  let voice = null;
  /** Servers, channels, unread and voice rooms, sent while the overlay is open. */
  let shellState = null;
  let toastUntil = 0;
  let pendingToasts = [];
  let boundAccelerator = "";
  let hotkeyOk = true;
  let lastWant = "";
  let gameTimer = null;
  let unloadTimer = null;
  let toastTimer = null;

  const mainContents = () => {
    const main = deps.mainWindow();
    return main && !main.isDestroyed() ? main.webContents : null;
  };
  const fromMain = (event) => Boolean(mainContents() && event.sender === mainContents());
  const fromOverlay = (event) => Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  const send = (channel, payload) => {
    if (win && !win.isDestroyed() && loaded) win.webContents.send(channel, payload);
  };

  function overlayUrl() {
    const base = deps.appUrl().replace(/\/?$/, "/");
    return new URL("overlay", base).toString();
  }

  function isOverlayUrl(url) {
    try {
      const target = new URL(url);
      const own = new URL(overlayUrl());
      return target.origin === own.origin && target.pathname.replace(/\/$/, "") === own.pathname.replace(/\/$/, "");
    } catch {
      return false;
    }
  }

  /** The whole screen the person is looking at (the cursor's display). */
  function displayBounds() {
    try {
      return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    } catch {
      return screen.getPrimaryDisplay().bounds;
    }
  }

  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    const mac = process.platform === "darwin";
    const bounds = displayBounds();
    win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Not focusable until the small Hoffle opens, so showing it never takes
      // the keyboard away from the game.
      focusable: !TOGGLE_FOCUSABLE,
      alwaysOnTop: true,
      title: "Hoffle overlay",
      // A panel floats over other apps' fullscreen spaces on macOS and does
      // not activate Hoffle, so the game stays the active app underneath.
      ...(mac ? { type: "panel" } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, "overlay-preload.js"),
      },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true);
    win.setMenuBarVisibility(false);
    loaded = false;

    const contents = win.webContents;
    // Links open in the browser; the overlay itself never leaves its page
    // (a sign-in redirect would otherwise load the whole app in here).
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (isOverlayUrl(url)) return;
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    });
    contents.on("did-finish-load", () => {
      loaded = true;
      const toasts = pendingToasts;
      pendingToasts = [];
      for (const note of toasts) send("overlay:toast", note);
      apply();
    });
    contents.on("render-process-gone", () => {
      const gone = win;
      win = null;
      loaded = false;
      open = false;
      if (gone && !gone.isDestroyed()) gone.destroy();
      refresh();
    });
    win.on("blur", () => {
      if (open && Date.now() - openedAt > BLUR_GRACE_MS) setOpen(false);
    });
    win.on("closed", () => {
      win = null;
      loaded = false;
      open = false;
    });
    win.loadURL(overlayUrl());
    return win;
  }

  function destroyWindow() {
    clearTimeout(unloadTimer);
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    loaded = false;
    open = false;
  }

  /** Passive overlay: a game is running and there is something to show. */
  function passiveWanted() {
    return settings.enabled && Boolean(game) && (Boolean(voice && voice.channelId) || Date.now() < toastUntil);
  }

  /** Shows, hides or switches the window to match the current state. */
  function apply() {
    if (!win || win.isDestroyed() || !loaded) return;
    const passive = !open && passiveWanted();
    if (open) {
      win.setBounds(displayBounds());
      win.setIgnoreMouseEvents(false);
      if (TOGGLE_FOCUSABLE) win.setFocusable(true);
      win.show();
      win.focus();
      win.webContents.focus();
    } else {
      if (win.isFocused()) {
        // Hiding hands the keyboard back to whatever was in front before (the game).
        win.hide();
      }
      win.setIgnoreMouseEvents(true);
      if (TOGGLE_FOCUSABLE) win.setFocusable(false);
      if (passive && !win.isVisible()) {
        win.setBounds(displayBounds());
        win.showInactive();
      } else if (!passive && win.isVisible()) {
        win.hide();
      }
    }
    send("overlay:state", publicState());
  }

  /** Decides whether a window is needed at all, then applies. */
  function refresh() {
    clearTimeout(unloadTimer);
    const needed = settings.enabled && (open || Boolean(game));
    if (!needed) {
      if (win && !win.isDestroyed()) {
        open = false;
        apply();
        unloadTimer = setTimeout(destroyWindow, UNLOAD_MS);
      }
    } else {
      ensureWindow();
      apply();
    }
    tellMain();
  }

  /** Lets the main window send only what the overlay can use right now. */
  function tellMain() {
    const want = {
      voice: settings.enabled && Boolean(win),
      shell: settings.enabled && open,
    };
    const key = JSON.stringify(want);
    if (key === lastWant) return;
    lastWant = key;
    mainContents()?.send("overlay:want", want);
  }

  function currentWant() {
    return { voice: settings.enabled && Boolean(win), shell: settings.enabled && open };
  }

  function setOpen(next) {
    next = Boolean(next) && settings.enabled;
    if (next === open) return;
    open = next;
    if (open) openedAt = Date.now();
    refresh();
  }

  function toggle() {
    setOpen(!open);
  }

  /** Human label for the shortcut, the way this computer's keyboard shows it. */
  function shortcutLabel() {
    const mac = process.platform === "darwin";
    const names = mac
      ? { CommandOrControl: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" }
      : { CommandOrControl: "Ctrl", Control: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win" };
    return settings.accelerator
      .split("+")
      .map((part) => names[part] || part)
      .join(mac ? "" : " + ");
  }

  function publicState() {
    return {
      open,
      game,
      shortcut: boundAccelerator ? shortcutLabel() : "",
      platform: process.platform,
    };
  }

  function bindHotkey() {
    const wanted = settings.enabled && deps.isSafeAccelerator(settings.accelerator) ? settings.accelerator : "";
    if (wanted === boundAccelerator) return;
    if (boundAccelerator) globalShortcut.unregister(boundAccelerator);
    boundAccelerator = "";
    hotkeyOk = true;
    if (!wanted) return;
    try {
      if (globalShortcut.register(wanted, toggle)) boundAccelerator = wanted;
      else hotkeyOk = false;
    } catch {
      hotkeyOk = false;
    }
  }

  async function checkGame() {
    let next = null;
    try {
      next = await deps.runningGame();
    } catch {
      next = null;
    }
    if (next === game) return;
    const started = !game && next;
    game = next;
    if (started && !settings.hintShown && settings.enabled) {
      settings = { ...settings, hintShown: true };
      saveSettings();
      const label = shortcutLabel();
      toast({
        kind: "hint",
        title: "Hoffle overlay is on",
        body: boundAccelerator
          ? `Press ${label} to open Hoffle over your game. Turn it off in Settings → Activities.`
          : "Turn it off in Settings → Activities.",
      });
      return;
    }
    refresh();
  }

  function startGameWatch() {
    clearInterval(gameTimer);
    gameTimer = null;
    if (!settings.enabled) {
      game = null;
      return;
    }
    void checkGame();
    gameTimer = setInterval(() => void checkGame(), GAME_CHECK_MS);
  }

  function saveSettings() {
    deps.saveConfig({ overlay: { ...settings } });
  }

  function settingsView() {
    return {
      enabled: settings.enabled,
      combo: settings.combo,
      defaultCombo: DEFAULT_COMBO,
      shortcut: shortcutLabel(),
      hotkeyOk: !settings.enabled || hotkeyOk,
      game,
    };
  }

  /**
   * A message pop-up over the game. Returns true when the overlay showed it,
   * so the system notification can be skipped.
   */
  function toast(note) {
    if (!settings.enabled || !game || open) return false;
    const clean = {
      kind: note.kind === "hint" ? "hint" : "message",
      title: String(note.title || "Hoffle").slice(0, 120),
      body: String(note.body || "").slice(0, 400),
      at: Date.now(),
    };
    toastUntil = Date.now() + TOAST_MS;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(refresh, TOAST_MS + 100);
    ensureWindow();
    if (loaded) send("overlay:toast", clean);
    else pendingToasts.push(clean);
    refresh();
    return true;
  }

  // Main window → overlay.
  ipcMain.handle("overlay:settings", (event) => (fromMain(event) ? settingsView() : null));
  ipcMain.handle("overlay:set-settings", (event, patch) => {
    if (!fromMain(event) || !patch || typeof patch !== "object") return null;
    const next = { ...settings };
    if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
    if (typeof patch.combo === "string" && typeof patch.accelerator === "string") {
      // An empty accelerator is "no shortcut"; anything else must be safe to grab.
      if (!patch.accelerator || deps.isSafeAccelerator(patch.accelerator)) {
        next.combo = patch.combo.slice(0, 64);
        next.accelerator = patch.accelerator.slice(0, 64);
      }
    }
    settings = next;
    saveSettings();
    bindHotkey();
    if (!settings.enabled) open = false;
    startGameWatch();
    refresh();
    deps.onChange();
    send("overlay:state", publicState());
    return settingsView();
  });
  ipcMain.handle("overlay:want", (event) => (fromMain(event) ? currentWant() : null));
  ipcMain.on("overlay:voice", (event, data) => {
    if (!fromMain(event)) return;
    voice = data && typeof data === "object" && data.channelId ? data : null;
    send("overlay:voice", voice);
    if (!open) refresh();
  });
  ipcMain.on("overlay:shell", (event, data) => {
    if (!fromMain(event)) return;
    shellState = data && typeof data === "object" ? data : null;
    send("overlay:shell", shellState);
  });
  ipcMain.on("overlay:message", (event, data) => {
    if (!fromMain(event) || !open) return;
    send("overlay:message", data);
  });

  // Overlay page → main window.
  ipcMain.handle("overlay:hello", (event) =>
    fromOverlay(event) ? { state: publicState(), voice, shell: open ? shellState : null } : null,
  );
  ipcMain.on("overlay:action", (event, action) => {
    if (!fromOverlay(event) || !action || typeof action !== "object") return;
    const type = String(action.type || "");
    const channelId = typeof action.channelId === "string" ? action.channelId.slice(0, 64) : undefined;
    if (type === "close") {
      setOpen(false);
      return;
    }
    if (type === "open-main" || type === "settings") {
      setOpen(false);
      deps.showMain();
      mainContents()?.send("overlay:action", { type, channelId });
      return;
    }
    if (["mute", "deafen", "leave", "join"].includes(type)) {
      mainContents()?.send("overlay:action", { type, channelId });
    }
  });

  bindHotkey();
  startGameWatch();

  return {
    /** Opens or closes the small Hoffle (tray menu, shortcut). */
    toggle,
    show: () => setOpen(true),
    toast,
    /** The tray menu line, or null while the overlay is off. */
    menuLabel: () => (settings.enabled ? `Open Hoffle overlay${boundAccelerator ? `  (${shortcutLabel()})` : ""}` : null),
    /** The main window now shows another server: start the overlay over. */
    reset: () => {
      voice = null;
      shellState = null;
      destroyWindow();
      lastWant = "";
      refresh();
    },
    /** The main window (re)loaded: it asks for `want` itself, but voice starts empty. */
    mainReloaded: () => {
      voice = null;
      lastWant = "";
      send("overlay:voice", null);
      refresh();
    },
    stop: () => {
      clearInterval(gameTimer);
      clearTimeout(unloadTimer);
      clearTimeout(toastTimer);
      if (boundAccelerator) globalShortcut.unregister(boundAccelerator);
      boundAccelerator = "";
      destroyWindow();
    },
  };
}

module.exports = { createOverlay, DEFAULT_COMBO, DEFAULT_ACCELERATOR };
