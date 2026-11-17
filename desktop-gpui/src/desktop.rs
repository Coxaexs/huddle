//! What the Electron shell (desktop/src/main.js) adds around the web app, done natively on macOS:
//! the dock badge (`app.setBadgeCount`), notifications (`desktop-notification`), and the menu-bar
//! item with Open Hoffle, Toggle Mute and Quit Hoffle (`createTray`).

use smol::channel::{Receiver, Sender, unbounded};

/// What the menu-bar item asks the app to do.
#[derive(Clone, Copy, Debug)]
pub enum TrayAction {
    Open,
    ToggleMute,
    Quit,
    /// The push-to-talk key went down or up while another app was in front.
    Ptt(bool),
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
mod mac {
    use super::TrayAction;
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSSize, NSString};
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::OnceLock;

    static SENDER: OnceLock<smol::channel::Sender<TrayAction>> = OnceLock::new();

    fn ns(text: &str) -> id {
        unsafe { NSString::alloc(nil).init_str(text) }
    }

    /// `app.setBadgeCount(n)`: the number on the dock icon, nothing at 0.
    pub fn set_badge(count: u32) {
        unsafe {
            let app: id = msg_send![class!(NSApplication), sharedApplication];
            let tile: id = msg_send![app, dockTile];
            if tile == nil {
                return;
            }
            let label = if count == 0 { nil } else { ns(&count.to_string()) };
            let _: () = msg_send![tile, setBadgeLabel: label];
        }
    }

    /// Whether this app is the one in front (document.hasFocus()).
    pub fn app_active() -> bool {
        unsafe {
            let app: id = msg_send![class!(NSApplication), sharedApplication];
            let active: bool = msg_send![app, isActive];
            active
        }
    }

    /// A notification from Hoffle; clicking it brings the app forward. Only a bundled app
    /// (Hoffle GPUI.app) has a notification centre: a bare binary shows none.
    pub fn notify(title: &str, body: &str) {
        unsafe {
            let bundle: id = msg_send![class!(NSBundle), mainBundle];
            let identifier: id = msg_send![bundle, bundleIdentifier];
            if identifier == nil {
                return;
            }
            // Looked up rather than assumed: NSUserNotification is deprecated and may go away.
            let (Some(center_class), Some(note_class)) = (Class::get("NSUserNotificationCenter"), Class::get("NSUserNotification")) else { return };
            let center: id = msg_send![center_class, defaultUserNotificationCenter];
            if center == nil {
                return;
            }
            let note: id = msg_send![note_class, alloc];
            let note: id = msg_send![note, init];
            let _: () = msg_send![note, setTitle: ns(title)];
            let _: () = msg_send![note, setInformativeText: ns(body)];
            let _: () = msg_send![center, deliverNotification: note];
        }
    }

    extern "C" fn open(_: &Object, _: Sel, _: id) {
        if let Some(s) = SENDER.get() {
            let _ = s.try_send(TrayAction::Open);
        }
    }
    extern "C" fn mute(_: &Object, _: Sel, _: id) {
        if let Some(s) = SENDER.get() {
            let _ = s.try_send(TrayAction::ToggleMute);
        }
    }
    extern "C" fn quit(_: &Object, _: Sel, _: id) {
        if let Some(s) = SENDER.get() {
            let _ = s.try_send(TrayAction::Quit);
        }
    }

    fn target_class() -> &'static Class {
        static CLASS: OnceLock<usize> = OnceLock::new();
        let ptr = *CLASS.get_or_init(|| {
            let mut decl = ClassDecl::new("HoffleTrayTarget", class!(NSObject)).expect("HoffleTrayTarget");
            unsafe {
                decl.add_method(sel!(openHoffle:), open as extern "C" fn(&Object, Sel, id));
                decl.add_method(sel!(toggleMute:), mute as extern "C" fn(&Object, Sel, id));
                decl.add_method(sel!(quitHoffle:), quit as extern "C" fn(&Object, Sel, id));
            }
            decl.register() as *const Class as usize
        });
        unsafe { &*(ptr as *const Class) }
    }

    /// The status item: the app icon at 18pt and its menu.
    pub fn install_tray(sender: smol::channel::Sender<TrayAction>, icon_png: &[u8]) {
        if SENDER.set(sender).is_err() {
            return;
        }
        unsafe {
            let target: id = msg_send![target_class(), new];
            let bar: id = msg_send![class!(NSStatusBar), systemStatusBar];
            // NSVariableStatusItemLength
            let item: id = msg_send![bar, statusItemWithLength: -1.0f64];
            if item == nil {
                return;
            }
            let _: id = msg_send![item, retain];
            let button: id = msg_send![item, button];
            if button == nil {
                return;
            }
            let data: id = msg_send![class!(NSData), dataWithBytes: icon_png.as_ptr() length: icon_png.len()];
            let image: id = msg_send![class!(NSImage), alloc];
            let image: id = msg_send![image, initWithData: data];
            if image != nil {
                let _: () = msg_send![image, setSize: NSSize::new(18., 18.)];
                let _: () = msg_send![button, setImage: image];
            } else {
                let _: () = msg_send![button, setTitle: ns("Hoffle")];
            }
            let _: () = msg_send![button, setToolTip: ns("Hoffle")];

            let menu: id = msg_send![class!(NSMenu), alloc];
            let menu: id = msg_send![menu, initWithTitle: ns("Hoffle")];
            let add = |title: &str, action: Sel| {
                let entry: id = msg_send![class!(NSMenuItem), alloc];
                let entry: id = msg_send![entry, initWithTitle: ns(title) action: action keyEquivalent: ns("")];
                let _: () = msg_send![entry, setTarget: target];
                let _: () = msg_send![menu, addItem: entry];
            };
            add("Open Hoffle", sel!(openHoffle:));
            add("Toggle Mute", sel!(toggleMute:));
            let separator: id = msg_send![class!(NSMenuItem), separatorItem];
            let _: () = msg_send![menu, addItem: separator];
            add("Quit Hoffle", sel!(quitHoffle:));
            let _: () = msg_send![item, setMenu: menu];
        }
    }

    // --- The global mute hotkey (main.js bindMuteHotkey / Electron's globalShortcut) ----------
    // Carbon's RegisterEventHotKey, as Electron uses: system-wide, and no permission needed.
    #[repr(C)]
    struct EventTypeSpec {
        class: u32,
        kind: u32,
    }
    #[repr(C)]
    struct EventHotKeyId {
        signature: u32,
        id: u32,
    }
    #[link(name = "Carbon", kind = "framework")]
    unsafe extern "C" {
        fn GetApplicationEventTarget() -> *mut std::ffi::c_void;
        fn InstallEventHandler(
            target: *mut std::ffi::c_void,
            handler: extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, *mut std::ffi::c_void) -> i32,
            count: usize,
            list: *const EventTypeSpec,
            user: *mut std::ffi::c_void,
            out: *mut *mut std::ffi::c_void,
        ) -> i32;
        fn RegisterEventHotKey(code: u32, modifiers: u32, id: EventHotKeyId, target: *mut std::ffi::c_void, options: u32, out: *mut *mut std::ffi::c_void) -> i32;
        fn UnregisterEventHotKey(hotkey: *mut std::ffi::c_void) -> i32;
    }

    extern "C" fn hotkey_pressed(_: *mut std::ffi::c_void, _: *mut std::ffi::c_void, _: *mut std::ffi::c_void) -> i32 {
        if let Some(s) = SENDER.get() {
            let _ = s.try_send(TrayAction::ToggleMute);
        }
        0
    }

    /// Binds `combo` (the voice settings' "ctrl-shift-m" form; Ctrl is Cmd here, as the web's
    /// CommandOrControl) as the system-wide mute toggle, replacing the last one; "" unbinds.
    pub fn set_mute_hotkey(combo: &str) {
        static HANDLER: OnceLock<()> = OnceLock::new();
        static CURRENT: std::sync::Mutex<usize> = std::sync::Mutex::new(0);
        let Some((code, modifiers)) = carbon_combo(combo) else {
            let mut current = CURRENT.lock().unwrap();
            if *current != 0 {
                unsafe { UnregisterEventHotKey(*current as *mut _) };
                *current = 0;
            }
            return;
        };
        unsafe {
            HANDLER.get_or_init(|| {
                // kEventClassKeyboard 'keyb', kEventHotKeyPressed 5
                let spec = EventTypeSpec { class: u32::from_be_bytes(*b"keyb"), kind: 5 };
                let mut out = std::ptr::null_mut();
                InstallEventHandler(GetApplicationEventTarget(), hotkey_pressed, 1, &spec, std::ptr::null_mut(), &mut out);
            });
            let mut current = CURRENT.lock().unwrap();
            if *current != 0 {
                UnregisterEventHotKey(*current as *mut _);
                *current = 0;
            }
            let mut out = std::ptr::null_mut();
            let id = EventHotKeyId { signature: u32::from_be_bytes(*b"HOFM"), id: 1 };
            let status = RegisterEventHotKey(code, modifiers, id, GetApplicationEventTarget(), 0, &mut out);
            crate::trace(format!("mute hotkey {combo}: key {code:#x}, modifiers {modifiers:#x}, status {status}"));
            if status == 0 {
                *current = out as usize;
            }
        }
    }

    // --- Global push-to-talk (main.js's uiohook keyboard hook) ---------------------------------
    // While another app is in front, an NSEvent global monitor hears the key go down and up. macOS
    // only lets it hear keys with Accessibility permission; without it, push to talk works while
    // Hoffle is in front, as in the desktop app without its hook.
    static PTT_CODE: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(-1);
    static PTT_HELD: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    /// Listens for `key` (the voice settings' "space", "f", "f5"…) system-wide; None stops.
    pub fn set_ptt_key(key: Option<&str>) {
        use std::sync::atomic::Ordering;
        let code = key.and_then(|k| carbon_combo(&format!("shift-{k}")).map(|(c, _)| c as i32)).unwrap_or(-1);
        PTT_CODE.store(code, Ordering::Relaxed);
        PTT_HELD.store(false, Ordering::Relaxed);
        if code < 0 {
            return;
        }
        static MONITOR: OnceLock<()> = OnceLock::new();
        MONITOR.get_or_init(|| unsafe {
            let handler = block::ConcreteBlock::new(|event: id| {
                let code = PTT_CODE.load(Ordering::Relaxed);
                if code < 0 {
                    return;
                }
                let key: u16 = msg_send![event, keyCode];
                if key as i32 != code {
                    return;
                }
                let kind: u64 = msg_send![event, type];
                // NSEventTypeKeyDown 10, NSEventTypeKeyUp 11
                let down = kind == 10;
                if PTT_HELD.swap(down, Ordering::Relaxed) == down {
                    return;
                }
                if let Some(s) = SENDER.get() {
                    let _ = s.try_send(TrayAction::Ptt(down));
                }
            })
            .copy();
            let mask: u64 = (1 << 10) | (1 << 11);
            let monitor: id = msg_send![class!(NSEvent), addGlobalMonitorForEventsMatchingMask: mask handler: &*handler];
            if monitor != nil {
                let _: id = msg_send![monitor, retain];
            }
            std::mem::forget(handler);
        });
    }

    /// "ctrl-shift-m" → (virtual key code, Carbon modifiers), refusing what main.js refuses: no
    /// modifier, only modifiers, or plain Cmd+C / V / X / A / Z.
    fn carbon_combo(combo: &str) -> Option<(u32, u32)> {
        let parts: Vec<String> = combo.split(['-', '+']).map(|p| p.trim().to_lowercase()).filter(|p| !p.is_empty()).collect();
        let (key, mods) = parts.split_last()?;
        let mut modifiers = 0u32;
        for m in mods {
            modifiers |= match m.as_str() {
                "ctrl" | "control" | "cmd" | "command" | "meta" | "super" | "platform" => 1 << 8,
                "shift" => 1 << 9,
                "alt" | "option" => 1 << 11,
                _ => return None,
            };
        }
        if modifiers == 0 {
            return None;
        }
        if modifiers == 1 << 8 && ["c", "v", "x", "a", "z"].contains(&key.as_str()) {
            return None;
        }
        const LETTERS: [(char, u32); 26] = [
            ('a', 0x00), ('s', 0x01), ('d', 0x02), ('f', 0x03), ('h', 0x04), ('g', 0x05), ('z', 0x06), ('x', 0x07), ('c', 0x08), ('v', 0x09), ('b', 0x0B), ('q', 0x0C), ('w', 0x0D),
            ('e', 0x0E), ('r', 0x0F), ('y', 0x10), ('t', 0x11), ('o', 0x1F), ('u', 0x20), ('i', 0x22), ('p', 0x23), ('l', 0x25), ('j', 0x26), ('k', 0x28), ('n', 0x2D), ('m', 0x2E),
        ];
        const DIGITS: [u32; 10] = [0x1D, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19];
        const FKEYS: [u32; 12] = [0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F];
        let code = match key.as_str() {
            "space" => 0x31,
            "enter" | "return" => 0x24,
            "`" | "backquote" => 0x32,
            k if k.len() == 1 && k.chars().next().is_some_and(|c| c.is_ascii_lowercase()) => LETTERS.iter().find(|(c, _)| k.starts_with(*c))?.1,
            k if k.len() == 1 && k.chars().next().is_some_and(|c| c.is_ascii_digit()) => DIGITS[k.parse::<usize>().ok()?],
            k if k.starts_with('f') => *FKEYS.get(k[1..].parse::<usize>().ok()?.checked_sub(1)?)?,
            _ => return None,
        };
        Some((code, modifiers))
    }
}

#[cfg(target_os = "macos")]
pub use mac::{app_active, notify, set_badge, set_mute_hotkey, set_ptt_key};
#[cfg(not(target_os = "macos"))]
pub fn set_mute_hotkey(_: &str) {}
#[cfg(not(target_os = "macos"))]
pub fn set_ptt_key(_: Option<&str>) {}

/// Development: HOFFLE_DEV_DESKTOP_PROBE=1 exercises the calls that change nothing on screen.
#[cfg(target_os = "macos")]
pub fn probe() {
    set_badge(0);
    let active = app_active();
    let classes = ["NSUserNotificationCenter", "NSUserNotification", "NSStatusBar", "NSMenuItem"].map(|c| (c, objc::runtime::Class::get(c).is_some()));
    crate::trace(format!("desktop probe: badge cleared, active={active}, classes={classes:?}"));
}
#[cfg(not(target_os = "macos"))]
pub fn probe() {}

#[cfg(not(target_os = "macos"))]
pub fn set_badge(_: u32) {}
#[cfg(not(target_os = "macos"))]
pub fn app_active() -> bool {
    true
}
#[cfg(not(target_os = "macos"))]
pub fn notify(_: &str, _: &str) {}

/// Puts the menu-bar item up (once) and returns where its picks arrive.
pub fn tray() -> Receiver<TrayAction> {
    let (tx, rx): (Sender<TrayAction>, Receiver<TrayAction>) = unbounded();
    #[cfg(target_os = "macos")]
    {
        let png = crate::assets::ASSETS.iter().find(|(p, _)| *p == "images/tray-icon.png").map(|(_, b)| *b).unwrap_or(&[]);
        mac::install_tray(tx, png);
    }
    #[cfg(not(target_os = "macos"))]
    drop(tx);
    rx
}
