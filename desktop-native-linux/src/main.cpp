#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <jsc/jsc.h>
#include <libayatana-appindicator/app-indicator.h>
#include <keybinder.h>
#include <libnotify/notify.h>

#include <iostream>
#include <string>
#include <sstream>
#include <fstream>

#include "ConfigManager.h"
#include "ActivityScanner.h"

static GtkWidget* g_window = nullptr;
static WebKitWebView* g_webView = nullptr;
static AppIndicator* g_indicator = nullptr;
static std::string g_iconPath = "";
static std::string g_trayIconPath = "";

// Embedded fallback of web-bridge.js to ensure standalone portability
static const char* kEmbeddedBridgeJs = R"JS(
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

  console.log("[Hoffle] Linux native bridge active.");
})();
)JS";

static void execute_javascript(const std::string& script) {
    if (g_webView) {
        webkit_web_view_evaluate_javascript(g_webView, script.c_str(), -1, nullptr, nullptr, nullptr, nullptr, nullptr);
    }
}

// Global Hotkey Callbacks
static void on_mute_hotkey(const char* keystring, void* user_data) {
    execute_javascript("if (window.__hoffleToggleMute) window.__hoffleToggleMute();");
}

static void on_deafen_hotkey(const char* keystring, void* user_data) {
    execute_javascript("if (window.__hoffleToggleDeafen) window.__hoffleToggleDeafen();");
}

// Permission request handler (Microphone, Camera, Screen share, Notifications)
static gboolean on_permission_request(WebKitWebView* web_view, WebKitPermissionRequest* request, gpointer user_data) {
    if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request)) {
        webkit_permission_request_allow(request);
        return TRUE;
    }
    if (WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(request)) {
        webkit_permission_request_allow(request);
        return TRUE;
    }
    if (WEBKIT_IS_DEVICE_INFO_PERMISSION_REQUEST(request)) {
        webkit_permission_request_allow(request);
        return TRUE;
    }
    return FALSE;
}

// JS Message Handler
static void on_script_message_received(WebKitUserContentManager* manager,
                                       WebKitJavascriptResult* js_result,
                                       gpointer user_data) {
    JSCValue* value = webkit_javascript_result_get_js_value(js_result);
    if (!value || !jsc_value_is_object(value)) return;

    JSCValue* typeVal = jsc_value_object_get_property(value, "type");
    if (!typeVal || !jsc_value_is_string(typeVal)) {
        if (typeVal) g_object_unref(typeVal);
        return;
    }

    char* typeStr = jsc_value_to_string(typeVal);
    g_object_unref(typeVal);

    if (!typeStr) return;
    std::string type = typeStr;
    g_free(typeStr);

    if (type == "notify") {
        JSCValue* titleVal = jsc_value_object_get_property(value, "title");
        JSCValue* bodyVal = jsc_value_object_get_property(value, "body");

        char* title = titleVal ? jsc_value_to_string(titleVal) : nullptr;
        char* body = bodyVal ? jsc_value_to_string(bodyVal) : nullptr;

        NotifyNotification* notif = notify_notification_new(
            title ? title : "Hoffle",
            body ? body : "",
            g_iconPath.empty() ? "dialog-information" : g_iconPath.c_str()
        );
        notify_notification_show(notif, nullptr);
        g_object_unref(G_OBJECT(notif));

        if (title) g_free(title);
        if (body) g_free(body);
        if (titleVal) g_object_unref(titleVal);
        if (bodyVal) g_object_unref(bodyVal);
    }
    else if (type == "scanActivity") {
        JSCValue* cbVal = jsc_value_object_get_property(value, "callbackId");
        int cbId = cbVal ? jsc_value_to_int32(cbVal) : 0;
        if (cbVal) g_object_unref(cbVal);

        std::string actJson = ActivityScanner::Instance().ScanRunningActivitiesJson();
        std::ostringstream ss;
        ss << "if (window.__hoffleNativeReply) window.__hoffleNativeReply(" << cbId << ", " << actJson << ");";
        execute_javascript(ss.str());
    }
    else if (type == "setBadge") {
        JSCValue* countVal = jsc_value_object_get_property(value, "count");
        int count = countVal ? jsc_value_to_int32(countVal) : 0;
        if (countVal) g_object_unref(countVal);

        if (g_window) {
            if (count > 0) {
                std::string title = "(" + std::to_string(count) + ") Hoffle";
                gtk_window_set_title(GTK_WINDOW(g_window), title.c_str());
            } else {
                gtk_window_set_title(GTK_WINDOW(g_window), "Hoffle");
            }
        }
    }
    else if (type == "startWindowDrag") {
        if (g_window) {
            GdkEvent* event = gtk_get_current_event();
            if (event) {
                if (event->type == GDK_BUTTON_PRESS) {
                    GdkEventButton* btnEvent = (GdkEventButton*)event;
                    gtk_window_begin_move_drag(
                        GTK_WINDOW(g_window),
                        btnEvent->button,
                        (gint)btnEvent->x_root,
                        (gint)btnEvent->y_root,
                        btnEvent->time
                    );
                }
                gdk_event_free(event);
            }
        }
    }
    else if (type == "windowZoom") {
        if (g_window) {
            if (gtk_window_is_maximized(GTK_WINDOW(g_window))) {
                gtk_window_unmaximize(GTK_WINDOW(g_window));
            } else {
                gtk_window_maximize(GTK_WINDOW(g_window));
            }
        }
    }
}

// Dialog to change server URL
static void show_server_dialog(GtkWindow* parent) {
    GtkWidget* dialog = gtk_dialog_new_with_buttons(
        "Switch Server",
        parent,
        (GtkDialogFlags)(GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT),
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Connect", GTK_RESPONSE_ACCEPT,
        NULL
    );

    GtkWidget* contentArea = gtk_dialog_get_content_area(GTK_DIALOG(dialog));
    gtk_container_set_border_width(GTK_CONTAINER(contentArea), 14);

    GtkWidget* label = gtk_label_new("Enter Hoffle server URL:");
    gtk_widget_set_halign(label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(contentArea), label, FALSE, FALSE, 4);

    GtkWidget* entry = gtk_entry_new();
    std::string currentUrl = ConfigManager::Instance().GetServerURL();
    gtk_entry_set_text(GTK_ENTRY(entry), currentUrl.c_str());
    gtk_entry_set_width_chars(GTK_ENTRY(entry), 40);
    gtk_box_pack_start(GTK_BOX(contentArea), entry, FALSE, FALSE, 6);

    gtk_widget_show_all(dialog);

    gint result = gtk_dialog_run(GTK_DIALOG(dialog));
    if (result == GTK_RESPONSE_ACCEPT) {
        const char* text = gtk_entry_get_text(GTK_ENTRY(entry));
        if (text && strlen(text) > 0) {
            std::string newUrl = text;
            ConfigManager::Instance().SetServerURL(newUrl);
            if (g_webView) {
                webkit_web_view_load_uri(g_webView, newUrl.c_str());
            }
        }
    }

    gtk_widget_destroy(dialog);
}

// Window delete event (hide to tray instead of quitting)
static gboolean on_window_delete_event(GtkWidget* widget, GdkEvent* event, gpointer user_data) {
    gtk_widget_hide(widget);
    return TRUE; // Suppress default destroy
}

// Tray menu actions
static void on_tray_show(GtkMenuItem* item, gpointer user_data) {
    if (g_window) {
        gtk_widget_show_all(g_window);
        gtk_window_present(GTK_WINDOW(g_window));
    }
}

static void on_tray_mute(GtkMenuItem* item, gpointer user_data) {
    execute_javascript("if (window.__hoffleToggleMute) window.__hoffleToggleMute();");
}

static void on_tray_deafen(GtkMenuItem* item, gpointer user_data) {
    execute_javascript("if (window.__hoffleToggleDeafen) window.__hoffleToggleDeafen();");
}

static void on_tray_server(GtkMenuItem* item, gpointer user_data) {
    if (g_window) {
        gtk_widget_show_all(g_window);
        gtk_window_present(GTK_WINDOW(g_window));
        show_server_dialog(GTK_WINDOW(g_window));
    }
}

static void on_tray_quit(GtkMenuItem* item, gpointer user_data) {
    if (g_window) {
        gint w, h;
        gtk_window_get_size(GTK_WINDOW(g_window), &w, &h);
        gboolean max = gtk_window_is_maximized(GTK_WINDOW(g_window));
        ConfigManager::Instance().SaveWindowPlacement(w, h, max);
    }
    gtk_main_quit();
}

// Setup System Tray
static void setup_tray(GtkWindow* window) {
    g_indicator = app_indicator_new_with_path("hoffle", "hoffle", APP_INDICATOR_CATEGORY_APPLICATION_STATUS, g_trayIconPath.c_str());
    app_indicator_set_status(g_indicator, APP_INDICATOR_STATUS_ACTIVE);

    if (!g_trayIconPath.empty() && g_file_test(g_trayIconPath.c_str(), G_FILE_TEST_EXISTS)) {
        app_indicator_set_icon_full(g_indicator, g_trayIconPath.c_str(), "Hoffle");
    } else if (!g_iconPath.empty() && g_file_test(g_iconPath.c_str(), G_FILE_TEST_EXISTS)) {
        app_indicator_set_icon_full(g_indicator, g_iconPath.c_str(), "Hoffle");
    } else {
        app_indicator_set_icon_full(g_indicator, "applications-chat", "Hoffle");
    }

    GtkWidget* menu = gtk_menu_new();
    GtkWidget* itemShow = gtk_menu_item_new_with_label("Show Hoffle");
    GtkWidget* itemMute = gtk_menu_item_new_with_label("Toggle Mute (Ctrl+Shift+M)");
    GtkWidget* itemDeafen = gtk_menu_item_new_with_label("Toggle Deafen (Ctrl+Shift+D)");
    GtkWidget* itemServer = gtk_menu_item_new_with_label("Switch Server...");
    GtkWidget* itemQuit = gtk_menu_item_new_with_label("Quit Hoffle");

    g_signal_connect(itemShow, "activate", G_CALLBACK(on_tray_show), window);
    g_signal_connect(itemMute, "activate", G_CALLBACK(on_tray_mute), window);
    g_signal_connect(itemDeafen, "activate", G_CALLBACK(on_tray_deafen), window);
    g_signal_connect(itemServer, "activate", G_CALLBACK(on_tray_server), window);
    g_signal_connect(itemQuit, "activate", G_CALLBACK(on_tray_quit), window);

    gtk_menu_shell_append(GTK_MENU_SHELL(menu), itemShow);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), itemMute);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), itemDeafen);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), itemServer);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), itemQuit);

    gtk_widget_show_all(menu);
    app_indicator_set_menu(g_indicator, GTK_MENU(menu));
}

// Find resource paths relative to executable
static void resolve_resource_paths() {
    char exePath[PATH_MAX];
    ssize_t len = readlink("/proc/self/exe", exePath, sizeof(exePath) - 1);
    if (len > 0) {
        exePath[len] = '\0';
        std::string dir = exePath;
        size_t lastSlash = dir.find_last_of('/');
        if (lastSlash != std::string::npos) {
            dir = dir.substr(0, lastSlash);
            std::string candidateIcon = dir + "/../resources/icon.png";
            if (g_file_test(candidateIcon.c_str(), G_FILE_TEST_EXISTS)) {
                g_iconPath = candidateIcon;
            }
            std::string candidateTray = dir + "/../resources/tray-icon.png";
            if (g_file_test(candidateTray.c_str(), G_FILE_TEST_EXISTS)) {
                g_trayIconPath = candidateTray;
            }
        }
    }
}

int main(int argc, char* argv[]) {
    gtk_init(&argc, &argv);
    notify_init("Hoffle");
    keybinder_init();

    resolve_resource_paths();

    // Create Main Window
    g_window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(g_window), "Hoffle");
    gtk_window_set_role(GTK_WINDOW(g_window), "hoffle");

    if (!g_iconPath.empty() && g_file_test(g_iconPath.c_str(), G_FILE_TEST_EXISTS)) {
        gtk_window_set_icon_from_file(GTK_WINDOW(g_window), g_iconPath.c_str(), nullptr);
    }

    int winW = 1280, winH = 820;
    bool maximized = false;
    ConfigManager::Instance().LoadWindowPlacement(winW, winH, maximized);
    gtk_window_set_default_size(GTK_WINDOW(g_window), winW, winH);
    gtk_widget_set_size_request(g_window, 940, 600);

    // Apply Deep Dark CSS Styling
    GtkCssProvider* cssProvider = gtk_css_provider_new();
    const char* cssData = R"CSS(
        window {
            background-color: #14070a;
        }
        headerbar {
            background: #14070a;
            border-bottom: 1px solid #231218;
            color: #e5e5ea;
            box-shadow: none;
            min-height: 38px;
            padding: 0 6px;
        }
        headerbar button {
            background: rgba(255, 255, 255, 0.08);
            color: #e5e5ea;
            border: none;
            border-radius: 6px;
            padding: 4px 8px;
            margin: 2px;
            transition: all 150ms ease-in-out;
        }
        headerbar button:hover {
            background: rgba(255, 255, 255, 0.18);
            color: #ffffff;
        }
        headerbar .title {
            font-weight: 700;
            color: #ffffff;
            font-size: 13px;
        }
    )CSS";
    gtk_css_provider_load_from_data(cssProvider, cssData, -1, nullptr);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(cssProvider),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION
    );
    g_object_unref(cssProvider);

    // Modern HeaderBar
    GtkWidget* header = gtk_header_bar_new();
    gtk_header_bar_set_title(GTK_HEADER_BAR(header), "Hoffle");
    gtk_header_bar_set_show_close_button(GTK_HEADER_BAR(header), TRUE);

    // WebKit Persistent Context & Settings
    std::string dataDir = std::string(g_get_user_data_dir()) + "/hoffle/data";
    std::string cacheDir = std::string(g_get_user_cache_dir()) + "/hoffle/cache";
    g_mkdir_with_parents(dataDir.c_str(), 0755);
    g_mkdir_with_parents(cacheDir.c_str(), 0755);

    WebKitWebsiteDataManager* dataManager = webkit_website_data_manager_new(
        "base-data-directory", dataDir.c_str(),
        "base-cache-directory", cacheDir.c_str(),
        nullptr
    );

    std::string cookiePath = dataDir + "/cookies.sqlite";
    WebKitCookieManager* cookieManager = webkit_website_data_manager_get_cookie_manager(dataManager);
    webkit_cookie_manager_set_persistent_storage(
        cookieManager,
        cookiePath.c_str(),
        WEBKIT_COOKIE_PERSISTENT_STORAGE_SQLITE
    );
    webkit_cookie_manager_set_accept_policy(cookieManager, WEBKIT_COOKIE_POLICY_ACCEPT_ALWAYS);

    WebKitWebContext* webContext = webkit_web_context_new_with_website_data_manager(dataManager);
    g_object_unref(dataManager);

    // WebKit User Content & Bridge Script
    WebKitUserContentManager* contentManager = webkit_user_content_manager_new();
    g_signal_connect(contentManager, "script-message-received::hoffleNative", G_CALLBACK(on_script_message_received), nullptr);
    webkit_user_content_manager_register_script_message_handler(contentManager, "hoffleNative");

    WebKitUserScript* bridgeScript = webkit_user_script_new(
        kEmbeddedBridgeJs,
        WEBKIT_USER_CONTENT_INJECT_ALL_FRAMES,
        WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START,
        nullptr,
        nullptr
    );
    webkit_user_content_manager_add_script(contentManager, bridgeScript);
    webkit_user_script_unref(bridgeScript);

    // Create WebKitWebView
    g_webView = WEBKIT_WEB_VIEW(g_object_new(
        WEBKIT_TYPE_WEB_VIEW,
        "web-context", webContext,
        "user-content-manager", contentManager,
        nullptr
    ));
    g_object_unref(webContext);
    g_object_unref(contentManager);

    WebKitSettings* settings = webkit_web_view_get_settings(g_webView);
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_enable_webrtc(settings, TRUE);
    webkit_settings_set_enable_media_stream(settings, TRUE);
    webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE);
    webkit_settings_set_enable_developer_extras(settings, TRUE);
    webkit_settings_set_hardware_acceleration_policy(settings, WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);

    // Connect Permission Requests (WebRTC Mic / Cam)
    g_signal_connect(g_webView, "permission-request", G_CALLBACK(on_permission_request), nullptr);

    // HeaderBar Navigation Controls
    GtkWidget* btnBack = gtk_button_new_from_icon_name("go-previous-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_widget_set_tooltip_text(btnBack, "Back (Alt+Left)");
    g_signal_connect_swapped(btnBack, "clicked", G_CALLBACK(webkit_web_view_go_back), g_webView);
    gtk_header_bar_pack_start(GTK_HEADER_BAR(header), btnBack);

    GtkWidget* btnFwd = gtk_button_new_from_icon_name("go-next-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_widget_set_tooltip_text(btnFwd, "Forward (Alt+Right)");
    g_signal_connect_swapped(btnFwd, "clicked", G_CALLBACK(webkit_web_view_go_forward), g_webView);
    gtk_header_bar_pack_start(GTK_HEADER_BAR(header), btnFwd);

    GtkWidget* btnReload = gtk_button_new_from_icon_name("view-refresh-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_widget_set_tooltip_text(btnReload, "Reload (Ctrl+R)");
    g_signal_connect_swapped(btnReload, "clicked", G_CALLBACK(webkit_web_view_reload), g_webView);
    gtk_header_bar_pack_start(GTK_HEADER_BAR(header), btnReload);

    GtkWidget* btnServer = gtk_button_new_from_icon_name("network-server-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_widget_set_tooltip_text(btnServer, "Switch Server URL...");
    g_signal_connect_swapped(btnServer, "clicked", G_CALLBACK(show_server_dialog), g_window);
    gtk_header_bar_pack_end(GTK_HEADER_BAR(header), btnServer);

    gtk_window_set_titlebar(GTK_WINDOW(g_window), header);

    // Pack Web View into Window
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_box_pack_start(GTK_BOX(box), GTK_WIDGET(g_webView), TRUE, TRUE, 0);
    gtk_container_add(GTK_CONTAINER(g_window), box);

    // Register Global OS Hotkeys
    keybinder_bind("<Ctrl><Shift>m", on_mute_hotkey, g_webView);
    keybinder_bind("<Ctrl><Shift>d", on_deafen_hotkey, g_webView);

    // Setup Tray
    setup_tray(GTK_WINDOW(g_window));

    // Handle Window Close (Hide to tray)
    g_signal_connect(g_window, "delete-event", G_CALLBACK(on_window_delete_event), nullptr);

    // Load initial server URL
    std::string serverUrl = ConfigManager::Instance().GetServerURL();
    webkit_web_view_load_uri(g_webView, serverUrl.c_str());

    if (maximized) {
        gtk_window_maximize(GTK_WINDOW(g_window));
    }

    gtk_widget_show_all(g_window);

    gtk_main();

    keybinder_unbind_all("<Ctrl><Shift>m");
    keybinder_unbind_all("<Ctrl><Shift>d");
    notify_uninit();

    return 0;
}
