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
}

#[cfg(target_os = "macos")]
pub use mac::{app_active, notify, set_badge};

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
