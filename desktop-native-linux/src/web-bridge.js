/**
 * Hoffle Linux Native WebKit Bridge
 * Injected into WebKitGTK at document creation.
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

  // Post message to WebKitGTK script message handler
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
      console.warn("[HoffleNativeLinux] postMessage error:", e);
    }
  }

  // Define window.huddle API expected by the Hoffle frontend
  const huddleApi = {
    desktop: true,
    native: true,
    platform: "linux",
    arch: "x64",
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

  // Intercept standard Notification constructor for full native desktop fidelity
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
  } catch (e) {}

  // Prevent accidental back navigation or sound on WASD / navigation keys outside inputs
  window.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey) return;
    var key = (e.key || "").toLowerCase();
    var navKeys = ["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "x", "h", " ", "f", "shift"];
    if (navKeys.indexOf(key) !== -1 || key.length === 1) {
      e.preventDefault();
    }
  }, { capture: false, passive: false });

  // Seamless Native Window Dragging from header areas
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

  // Inject sleek Linux dark desktop styling tweaks
  function injectNativeStyles() {
    if (document.getElementById("hoffle-native-linux-style")) return;
    var style = document.createElement("style");
    style.id = "hoffle-native-linux-style";
    style.textContent = [
      "/* Native Linux WebKit sleek scrollbars */",
      "::-webkit-scrollbar { width: 8px; height: 8px; }",
      "::-webkit-scrollbar-track { background: transparent; }",
      "::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 4px; }",
      "::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.35); }",
      "#hoffle-native-nav {",
      "  position: fixed;",
      "  top: 7px;",
      "  left: 72px;",
      "  z-index: 999999;",
      "  display: flex;",
      "  gap: 3px;",
      "  user-select: none;",
      "}",
      "#hoffle-native-nav button {",
      "  background: rgba(255, 255, 255, 0.08);",
      "  border: 0;",
      "  color: rgba(255, 255, 255, 0.7);",
      "  font-size: 13px;",
      "  width: 20px;",
      "  height: 20px;",
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

    // Navigation back / forward buttons
    if (!document.getElementById("hoffle-native-nav")) {
      var nav = document.createElement("div");
      nav.id = "hoffle-native-nav";
      nav.innerHTML = '<button id="hoffle-nav-back" title="Back (Alt+Left)">‹</button><button id="hoffle-nav-fwd" title="Forward (Alt+Right)">›</button>';
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

  console.log("[Hoffle] Linux native bridge initialized.");
})();
