use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

mod head_tracking;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            head_tracking::head_tracking_available,
            head_tracking::head_tracking_start,
            head_tracking::head_tracking_stop,
        ])
        .setup(|app| {
            // System tray menu setup
            let quit_i = MenuItem::with_id(app, "quit", "Quit Huddle", true, None::<&str>)?;
            let toggle_i = MenuItem::with_id(app, "toggle", "Toggle Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Custom instance: `huddle --server=https://chat.example.com` or
            // HUDDLE_URL=... overrides the bundled default for this launch.
            let custom = std::env::args()
                .find_map(|arg| arg.strip_prefix("--server=").map(str::to_owned))
                .or_else(|| std::env::var("HUDDLE_URL").ok())
                .map(|raw| {
                    let raw = raw.trim().to_owned();
                    if raw.contains("://") { raw } else { format!("https://{raw}") }
                })
                .and_then(|raw| tauri::Url::parse(&raw).ok())
                .filter(|url| matches!(url.scheme(), "http" | "https"));
            if let (Some(url), Some(window)) = (custom, app.get_webview_window("main")) {
                let _ = window.navigate(url);
            }

            // Register global shortcut for microphone toggle (CommandOrControl+Shift+M)
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
                let shortcut: Shortcut = "CommandOrControl+Shift+M".parse().unwrap();
                let handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.emit("huddle:toggle-mute", ());
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
            // Headphone motion keeps a sensor awake; never outlive the window that asked for it.
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                head_tracking::head_tracking_stop();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running huddle desktop");
}
