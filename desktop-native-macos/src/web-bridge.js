/**
 * Hoffle macOS Native WebKit Bridge
 * Injected into WKWebView at document start.
 */
(function () {
  "use strict";

  let nextCallbackId = 1;
  const pendingCallbacks = new Map();

  window.__hoffleNativeReply = function (id, data) {
    const cb = pendingCallbacks.get(id);
    if (cb) {
      pendingCallbacks.delete(id);
      cb(data);
    }
  };

  // Post message helper to native macOS handler
  function postNative(msg) {
    try {
      if (
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.hoffleNative
      ) {
        window.webkit.messageHandlers.hoffleNative.postMessage(msg);
      }
    } catch (e) {
      console.warn("[HoffleNativeBridge] postMessage error:", e);
    }
  }

  // The app's own update (see "Self-update" in WebViewController.m). The
  // page's banner offers "Restart" once one is ready (app/lib/app-update.ts).
  var updateState = null;
  var updateListeners = new Set();
  window.__hoffleUpdate = function (state) {
    updateState = state;
    updateListeners.forEach(function (cb) { try { cb(state); } catch (e) {} });
  };

  // Define window.huddle API expected by the Hoffle frontend
  const huddleApi = {
    desktop: true,
    titlebarInset: true,
    native: true,
    platform: "darwin",
    arch: "arm64",
    updates: {
      state: function () { return Promise.resolve(updateState); },
      onChange: function (cb) {
        updateListeners.add(cb);
        return function () { updateListeners.delete(cb); };
      },
      install: function () { postNative({ type: "updateInstall" }); },
      download: function () { postNative({ type: "updateDownload" }); },
    },
    setBadge: function (count) {
      postNative({ type: "setBadge", count: Number(count) || 0 });
    },
    notify: function (title, body) {
      postNative({
        type: "notify",
        title: String(title || "Hoffle"),
        body: String(body || ""),
      });
    },
    setInCall: function (on) {
      postNative({ type: "setInCall", inCall: Boolean(on) });
    },
    setMuteHotkey: function (accelerator) {
      postNative({
        type: "setMuteHotkey",
        accelerator: String(accelerator || ""),
      });
    },
    setPushToTalkKey: function (code) {
      postNative({ type: "setPushToTalkKey", code: String(code || "") });
      return Promise.resolve(true);
    },
    openGameLink: function (url) {
      // Play together: a steam:// join link; the app checks it against its list.
      postNative({ type: "openGameLink", url: String(url || "") });
      return Promise.resolve(true);
    },
    scanActivity: function () {
      return new Promise(function (resolve) {
        const id = nextCallbackId++;
        pendingCallbacks.set(id, resolve);
        postNative({ type: "scanActivity", callbackId: id });
        setTimeout(function () {
          if (pendingCallbacks.has(id)) {
            pendingCallbacks.delete(id);
            resolve(null);
          }
        }, 3000);
      });
    },
  };

  try {
    Object.defineProperty(window, "huddle", {
      value: huddleApi,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    window.huddle = huddleApi;
  }

  // Intercept standard Notification constructor for full web notification fidelity
  function NativeNotification(title, options) {
    options = options || {};
    postNative({
      type: "notify",
      title: String(title || "Hoffle"),
      body: String(options.body || ""),
      tag: options.tag || "",
    });
    this.title = title;
    this.body = options.body || "";
    this.tag = options.tag || "";
    this.close = function () {};
    this.onclick = null;
  }

  NativeNotification.permission = "granted";
  NativeNotification.requestPermission = function (callback) {
    const p = Promise.resolve("granted");
    if (typeof callback === "function") {
      p.then(callback);
    }
    return p;
  };

  try {
    window.Notification = NativeNotification;
  } catch (e) {
    // If Notification cannot be overridden, window.huddle.notify is still available
  }

  // 1. Prevent macOS unhandled key sound (beep) when pressing navigation keys (WASD) in living room
  window.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
    // Don't intercept shortcuts with modifier keys (Cmd/Ctrl)
    if (e.metaKey || e.ctrlKey) return;
    var key = (e.key || "").toLowerCase();
    var navKeys = ["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "x", "h", " ", "f", "shift"];
    if (navKeys.indexOf(key) !== -1 || key.length === 1) {
      // Mark as handled so WebKit doesn't bubble unhandled keystrokes to AppKit's NSBeep()
      e.preventDefault();
    }
  }, { capture: false, passive: false });

  // 2. Seamless Native Window Dragging from top header areas
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    var target = e.target;
    if (!target) return;
    if (target.closest("button, input, textarea, a, select, [role='button'], .channel, .message, .rail-item, .space-mark")) {
      return;
    }
    if (e.detail === 2 && (e.clientY <= 50 || target.closest(".app-topbar"))) {
      postNative({ type: "windowZoom" });
      return;
    }
    if (e.clientY <= 34 || target.closest(".app-topbar, .chat-header, .space-header, header")) {
      postNative({ type: "startWindowDrag" });
    }
  });

  // Topbar spacing and back/forward buttons are rendered natively by AppTopbar.

  console.log("[Hoffle] Full native macOS (arm64 Apple Silicon) bridge initialized.");
  postNative({ type: "updateState" });
})();
