/**
 * Hoffle Windows Native WebView2 Bridge
 * Injected into WebView2 at document creation.
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

  // Post message helper to native Win32 handler
  function postNative(msg) {
    try {
      if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
        window.chrome.webview.postMessage(msg);
      }
    } catch (e) {
      console.warn("[HoffleNativeBridge] postMessage error:", e);
    }
  }

  // Listen for native messages from Win32
  if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
    window.chrome.webview.addEventListener("message", function (event) {
      try {
        const data = event.data;
        if (data && data.type === "reply" && data.callbackId) {
          window.__hoffleNativeReply(data.callbackId, data.result);
        }
      } catch (e) {}
    });
  }

  // Define window.huddle API expected by the Hoffle frontend
  const huddleApi = {
    desktop: true,
    native: true,
    platform: "win32",
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
  } catch (e) {}

  // Prevent Windows error beep when pressing keys outside inputs
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

  // Seamless Native Window Dragging for borderless or custom header
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    var target = e.target;
    if (!target) return;
    if (target.closest("button, input, textarea, a, select, [role='button'], .channel, .message, .rail-item, .space-mark")) {
      return;
    }
    if (e.clientY <= 34 || target.closest(".chat-header, .space-header, header")) {
      postNative({ type: "startWindowDrag" });
    }
  });

  console.log("[Hoffle] Windows native bridge initialized.");
})();
