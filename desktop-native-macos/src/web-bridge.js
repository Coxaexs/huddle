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
    if (e.detail === 2 && e.clientY <= 50) {
      postNative({ type: "windowZoom" });
      return;
    }
    if (e.clientY <= 34 || target.closest(".chat-header, .space-header, header")) {
      postNative({ type: "startWindowDrag" });
    }
  });

  // 3. Inject CSS for Traffic Lights clearance & Sleek Navigation Controls
  function injectNativeStyles() {
    if (document.getElementById("hoffle-native-injected-style")) return;
    var style = document.createElement("style");
    style.id = "hoffle-native-injected-style";
    style.textContent = [
      "/* Top spacing for native macOS traffic lights */",
      ".rail { padding-top: 36px !important; }",
      "#hoffle-native-nav {",
      "  position: fixed;",
      "  top: 7px;",
      "  left: 72px;",
      "  z-index: 999999;",
      "  display: flex;",
      "  gap: 3px;",
      "  -webkit-user-select: none;",
      "}",
      "#hoffle-native-nav button {",
      "  background: rgba(255, 255, 255, 0.08);",
      "  border: 0;",
      "  color: rgba(255, 255, 255, 0.7);",
      "  font-size: 13px;",
      "  width: 18px;",
      "  height: 18px;",
      "  border-radius: 4px;",
      "  cursor: pointer;",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  padding: 0;",
      "  line-height: 1;",
      "  transition: background 0.15s, color 0.15s;",
      "}",
      "#hoffle-native-nav button:hover {",
      "  background: rgba(255, 255, 255, 0.20);",
      "  color: #fff;",
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);

    // Create Back / Forward navigation buttons beside traffic lights
    if (!document.getElementById("hoffle-native-nav")) {
      var nav = document.createElement("div");
      nav.id = "hoffle-native-nav";
      nav.innerHTML = '<button id="hoffle-nav-back" title="Back (⌘[)">‹</button><button id="hoffle-nav-fwd" title="Forward (⌘])">›</button>';
      (document.body || document.documentElement).appendChild(nav);

      document.getElementById("hoffle-nav-back").addEventListener("click", function () {
        window.history.back();
      });
      document.getElementById("hoffle-nav-fwd").addEventListener("click", function () {
        window.history.forward();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectNativeStyles);
  } else {
    injectNativeStyles();
  }

  console.log("[Hoffle] Full native macOS (arm64 Apple Silicon) bridge initialized.");
  postNative({ type: "updateState" });
})();
