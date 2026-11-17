//! A WKWebView laid over part of the window, for what the web draws with the browser itself and
//! GPUI cannot: profile effects (canvas and WebGL scenes, CSS particles) run the web's own code in
//! it (resources/web/profile-effect.html, from tools/export-effects.sh). It sits above GPUI's
//! drawing, transparent, and lets clicks through to the window under it.

#[cfg(target_os = "macos")]
mod mac {
    use std::sync::Once;

    use cocoa::base::{BOOL, NO, YES, id, nil};
    use cocoa::foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use objc::{class, msg_send, sel, sel_impl};

    #[link(name = "WebKit", kind = "framework")]
    unsafe extern "C" {}

    /// WKWebView that is never hit: clicks and scrolls go to the view under it.
    fn passthrough_class() -> &'static Class {
        static REGISTER: Once = Once::new();
        REGISTER.call_once(|| {
            let mut decl = ClassDecl::new("HoffleOverlayWebView", class!(WKWebView)).expect("class");
            extern "C" fn hit_test(_: &Object, _: Sel, _: NSPoint) -> id {
                nil
            }
            extern "C" fn accepts_first_responder(_: &Object, _: Sel) -> BOOL {
                NO
            }
            unsafe {
                decl.add_method(sel!(hitTest:), hit_test as extern "C" fn(&Object, Sel, NSPoint) -> id);
                decl.add_method(sel!(acceptsFirstResponder), accepts_first_responder as extern "C" fn(&Object, Sel) -> BOOL);
            }
            decl.register();
        });
        Class::get("HoffleOverlayWebView").expect("registered")
    }

    /// WKWebView that takes clicks only inside a region (window points from the top left) and lets
    /// the rest through: for a page that covers the window but shows one box.
    fn region_class() -> &'static Class {
        static REGISTER: Once = Once::new();
        REGISTER.call_once(|| {
            let mut decl = ClassDecl::new("HoffleRegionWebView", class!(WKWebView)).expect("class");
            for name in ["rx", "ry", "rw", "rh"] {
                decl.add_ivar::<f64>(name);
            }
            extern "C" fn hit_test(this: &Object, _: Sel, point: NSPoint) -> id {
                unsafe {
                    let (rx, ry, rw, rh): (f64, f64, f64, f64) = (*this.get_ivar("rx"), *this.get_ivar("ry"), *this.get_ivar("rw"), *this.get_ivar("rh"));
                    let parent: id = msg_send![this, superview];
                    let flipped: BOOL = if parent == nil { YES } else { msg_send![parent, isFlipped] };
                    let bounds: NSRect = if parent == nil { NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.)) } else { msg_send![parent, bounds] };
                    let y = if flipped == YES { point.y } else { bounds.size.height - point.y };
                    if point.x < rx || point.x > rx + rw || y < ry || y > ry + rh {
                        return nil;
                    }
                    msg_send![super(this, class!(WKWebView)), hitTest: point]
                }
            }
            unsafe {
                decl.add_method(sel!(hitTest:), hit_test as extern "C" fn(&Object, Sel, NSPoint) -> id);
            }
            decl.register();
        });
        Class::get("HoffleRegionWebView").expect("registered")
    }

    pub struct WebOverlay {
        view: id,
        parent: id,
        frame: (f32, f32, f32, f32),
        /// Set when the page can post to `webkit.messageHandlers.hoffle` (see `messages`).
        tag: Option<u64>,
    }

    /// What pages posted to `webkit.messageHandlers.hoffle`, by the overlay they came from.
    static MESSAGES: std::sync::Mutex<Vec<(u64, String)>> = std::sync::Mutex::new(Vec::new());

    /// WKScriptMessageHandler: keeps each posted string for the app to read on its next frame.
    fn handler_class() -> &'static Class {
        static REGISTER: Once = Once::new();
        REGISTER.call_once(|| {
            let mut decl = ClassDecl::new("HoffleScriptHandler", class!(NSObject)).expect("class");
            decl.add_ivar::<u64>("tag");
            extern "C" fn received(this: &Object, _: Sel, _controller: id, message: id) {
                unsafe {
                    let tag: u64 = *this.get_ivar("tag");
                    let body: id = msg_send![message, body];
                    if body == nil {
                        return;
                    }
                    let text: id = msg_send![body, description];
                    let bytes: *const std::os::raw::c_char = msg_send![text, UTF8String];
                    if bytes.is_null() {
                        return;
                    }
                    let text = std::ffi::CStr::from_ptr(bytes).to_string_lossy().into_owned();
                    if let Ok(mut list) = MESSAGES.lock() {
                        list.push((tag, text));
                    }
                }
            }
            unsafe {
                decl.add_method(sel!(userContentController:didReceiveScriptMessage:), received as extern "C" fn(&Object, Sel, id, id));
            }
            decl.register();
        });
        Class::get("HoffleScriptHandler").expect("registered")
    }

    impl WebOverlay {
        /// Over `parent` (the window's content view), showing `html` as if loaded from `base`;
        /// `interactive` takes clicks and scrolls itself (a player), otherwise they pass through.
        pub fn new(parent: id, html: &str, base: &str, interactive: bool) -> Self {
            Self::with_messages(parent, html, base, interactive, false)
        }

        /// The same, and `webkit.messageHandlers.hoffle.postMessage(text)` reaches `messages()`.
        pub fn with_messages(parent: id, html: &str, base: &str, interactive: bool, messages: bool) -> Self {
            Self::make(parent, html, base, if interactive { class!(WKWebView) } else { passthrough_class() }, messages)
        }

        /// Covering the window, taking clicks only inside `set_region`'s box.
        pub fn with_region(parent: id, html: &str, base: &str, messages: bool) -> Self {
            Self::make(parent, html, base, region_class(), messages)
        }

        fn make(parent: id, html: &str, base: &str, class: &Class, messages: bool) -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
            unsafe {
                let config: id = msg_send![class!(WKWebViewConfiguration), new];
                let tag = messages.then(|| NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
                if let Some(tag) = tag {
                    let handler: id = msg_send![handler_class(), new];
                    (*handler).set_ivar("tag", tag);
                    let content: id = msg_send![config, userContentController];
                    let _: () = msg_send![content, addScriptMessageHandler: handler name: NSString::alloc(nil).init_str("hoffle")];
                    let _: () = msg_send![handler, release];
                }
                // Media may start without a click (WKAudiovisualMediaTypeNone).
                let _: () = msg_send![config, setMediaTypesRequiringUserActionForPlayback: 0u64];
                let prefs: id = msg_send![config, preferences];
                let yes: id = msg_send![class!(NSNumber), numberWithBool: YES];
                if msg_send![prefs, respondsToSelector: sel!(setElementFullscreenEnabled:)] {
                    let _: () = msg_send![prefs, setElementFullscreenEnabled: YES];
                } else {
                    let _: () = msg_send![prefs, setValue: yes forKey: NSString::alloc(nil).init_str("fullScreenEnabled")];
                }
                let view: id = msg_send![class, alloc];
                let rect = NSRect::new(NSPoint::new(0., 0.), NSSize::new(1., 1.));
                let view: id = msg_send![view, initWithFrame: rect configuration: config];
                let _: () = msg_send![config, release];
                let no: id = msg_send![class!(NSNumber), numberWithBool: NO];
                let _: () = msg_send![view, setValue: no forKey: NSString::alloc(nil).init_str("drawsBackground")];
                let clear: id = msg_send![class!(NSColor), clearColor];
                if msg_send![view, respondsToSelector: sel!(setUnderPageBackgroundColor:)] {
                    let _: () = msg_send![view, setUnderPageBackgroundColor: clear];
                }
                let _: () = msg_send![view, setHidden: YES];
                // Test runs (HOFFLE_DEV_MUTED) make no sound: the page is muted (audio and capture).
                if std::env::var_os("HOFFLE_DEV_MUTED").is_some() && msg_send![view, respondsToSelector: sel!(_setPageMuted:)] {
                    let _: () = msg_send![view, _setPageMuted: 1u64];
                }
                let _: () = msg_send![parent, addSubview: view];
                let url: id = msg_send![class!(NSURL), URLWithString: NSString::alloc(nil).init_str(base)];
                let _: id = msg_send![view, loadHTMLString: NSString::alloc(nil).init_str(html) baseURL: url];
                Self { view, parent, frame: (0., 0., 0., 0.), tag }
            }
        }

        /// Where it sits, in window points from the top left.
        pub fn set_frame(&mut self, x: f32, y: f32, w: f32, h: f32) {
            if self.frame == (x, y, w, h) {
                return;
            }
            self.frame = (x, y, w, h);
            unsafe {
                let flipped: BOOL = msg_send![self.parent, isFlipped];
                let bounds: NSRect = msg_send![self.parent, bounds];
                let top = if flipped == YES { y as f64 } else { bounds.size.height - (y + h) as f64 };
                let rect = NSRect::new(NSPoint::new(x as f64, top), NSSize::new(w as f64, h as f64));
                let _: () = msg_send![self.view, setFrame: rect];
                let _: () = msg_send![self.view, setHidden: NO];
            }
        }

        /// Runs `js` and hands its result (as text) to `done`.
        pub fn eval_with(&self, js: &str, done: impl Fn(String) + 'static) {
            unsafe {
                let source = NSString::alloc(nil).init_str(js);
                let handler = block::ConcreteBlock::new(move |result: id, _error: id| {
                    let text = if result == nil {
                        String::new()
                    } else {
                        let description: id = msg_send![result, description];
                        let bytes: *const std::os::raw::c_char = msg_send![description, UTF8String];
                        if bytes.is_null() { String::new() } else { std::ffi::CStr::from_ptr(bytes).to_string_lossy().into_owned() }
                    };
                    done(text);
                })
                .copy();
                let _: () = msg_send![self.view, evaluateJavaScript: source completionHandler: &*handler];
            }
        }

        /// What the page posted since the last call.
        pub fn messages(&self) -> Vec<String> {
            let Some(tag) = self.tag else { return Vec::new() };
            let Ok(mut list) = MESSAGES.lock() else { return Vec::new() };
            let mine = list.iter().filter(|(t, _)| *t == tag).map(|(_, m)| m.clone()).collect();
            list.retain(|(t, _)| *t != tag);
            mine
        }

        /// The box that takes clicks (a region view's), in window points from the top left.
        pub fn set_region(&self, x: f32, y: f32, w: f32, h: f32) {
            unsafe {
                let view = &mut *self.view;
                view.set_ivar::<f64>("rx", x as f64);
                view.set_ivar::<f64>("ry", y as f64);
                view.set_ivar::<f64>("rw", w as f64);
                view.set_ivar::<f64>("rh", h as f64);
            }
        }

        /// The size of the view it sits in (the window's content), in points.
        pub fn parent_size(&self) -> (f32, f32) {
            unsafe {
                let bounds: NSRect = msg_send![self.parent, bounds];
                (bounds.size.width as f32, bounds.size.height as f32)
            }
        }

        pub fn set_hidden(&self, hidden: bool) {
            unsafe {
                let _: () = msg_send![self.view, setHidden: if hidden { YES } else { NO }];
            }
        }

        pub fn eval(&self, js: &str) {
            unsafe {
                let source = NSString::alloc(nil).init_str(js);
                let _: () = msg_send![self.view, evaluateJavaScript: source completionHandler: nil];
            }
        }

        /// The view's own picture, for tests (the window snapshot holds only GPUI's drawing).
        pub fn snapshot(&self, path: &str) {
            let path = path.to_string();
            unsafe {
                let handler = block::ConcreteBlock::new(move |image: id, _error: id| {
                    if image == nil {
                        return;
                    }
                    let tiff: id = msg_send![image, TIFFRepresentation];
                    let rep: id = msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff];
                    let empty: id = msg_send![class!(NSDictionary), dictionary];
                    // NSBitmapImageFileTypePNG
                    let png: id = msg_send![rep, representationUsingType: 4u64 properties: empty];
                    let _: BOOL = msg_send![png, writeToFile: NSString::alloc(nil).init_str(&path) atomically: YES];
                })
                .copy();
                let _: () = msg_send![self.view, takeSnapshotWithConfiguration: nil completionHandler: &*handler];
            }
        }
    }

    impl Drop for WebOverlay {
        fn drop(&mut self) {
            unsafe {
                if self.tag.is_some() {
                    // The controller holds the handler: let it go, so neither outlives the view.
                    let config: id = msg_send![self.view, configuration];
                    let content: id = msg_send![config, userContentController];
                    let _: () = msg_send![content, removeScriptMessageHandlerForName: NSString::alloc(nil).init_str("hoffle")];
                }
                let _: () = msg_send![self.view, removeFromSuperview];
                let _: () = msg_send![self.view, release];
            }
        }
    }

    /// A plain view that clips what is inside it to its frame (the message list's area), for
    /// players that scroll partly out of sight.
    pub struct ClipHost {
        pub view: id,
        frame: (f32, f32, f32, f32),
    }

    impl ClipHost {
        pub fn new(parent: id) -> Self {
            unsafe {
                let view: id = msg_send![class!(NSView), alloc];
                let view: id = msg_send![view, initWithFrame: NSRect::new(NSPoint::new(0., 0.), NSSize::new(1., 1.))];
                let _: () = msg_send![view, setWantsLayer: YES];
                let layer: id = msg_send![view, layer];
                let _: () = msg_send![layer, setMasksToBounds: YES];
                let _: () = msg_send![parent, addSubview: view];
                Self { view, frame: (0., 0., 1., 1.) }
            }
        }

        pub fn frame(&self) -> (f32, f32, f32, f32) {
            self.frame
        }

        /// In window points from the top left, like WebOverlay::set_frame.
        pub fn set_frame(&mut self, x: f32, y: f32, w: f32, h: f32) {
            if self.frame == (x, y, w, h) {
                return;
            }
            self.frame = (x, y, w, h);
            unsafe {
                let parent: id = msg_send![self.view, superview];
                let flipped: BOOL = msg_send![parent, isFlipped];
                let bounds: NSRect = msg_send![parent, bounds];
                let top = if flipped == YES { y as f64 } else { bounds.size.height - (y + h) as f64 };
                let _: () = msg_send![self.view, setFrame: NSRect::new(NSPoint::new(x as f64, top), NSSize::new(w as f64, h as f64))];
            }
        }

        pub fn set_hidden(&self, hidden: bool) {
            unsafe {
                let _: () = msg_send![self.view, setHidden: if hidden { YES } else { NO }];
            }
        }
    }

    impl Drop for ClipHost {
        fn drop(&mut self) {
            unsafe {
                let _: () = msg_send![self.view, removeFromSuperview];
                let _: () = msg_send![self.view, release];
            }
        }
    }

    /// Puts the app's session cookie in WebKit's cookie store (a session cookie: it is not kept
    /// once the app quits), so pages from `base` are signed in.
    pub fn set_session_cookie(base: &str, name: &str, value: &str) {
        let Ok(url) = url::Url::parse(base) else { return };
        let Some(host) = url.host_str() else { return };
        unsafe {
            let dict: id = msg_send![class!(NSMutableDictionary), dictionary];
            let put = |k: &str, v: &str| {
                let _: () = msg_send![dict, setObject: NSString::alloc(nil).init_str(v) forKey: NSString::alloc(nil).init_str(k)];
            };
            put("Name", name);
            put("Value", value);
            put("Domain", host);
            put("Path", "/");
            if url.scheme() == "https" {
                put("Secure", "TRUE");
            }
            let cookie: id = msg_send![class!(NSHTTPCookie), cookieWithProperties: dict];
            if cookie == nil {
                return;
            }
            let store: id = msg_send![class!(WKWebsiteDataStore), defaultDataStore];
            let cookies: id = msg_send![store, httpCookieStore];
            let _: () = msg_send![cookies, setCookie: cookie completionHandler: nil];
        }
    }

    /// The content view of the window GPUI draws into.
    pub fn content_view(window: &gpui::Window) -> Option<id> {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        match HasWindowHandle::window_handle(window).ok()?.as_raw() {
            RawWindowHandle::AppKit(handle) => Some(handle.ns_view.as_ptr() as id),
            _ => None,
        }
    }
}

#[cfg(target_os = "macos")]
pub use mac::{ClipHost, WebOverlay, content_view, set_session_cookie};

#[cfg(not(target_os = "macos"))]
pub struct WebOverlay;

#[cfg(not(target_os = "macos"))]
pub struct ClipHost;

#[cfg(not(target_os = "macos"))]
impl ClipHost {
    pub fn frame(&self) -> (f32, f32, f32, f32) {
        (0., 0., 0., 0.)
    }
    pub fn set_frame(&mut self, _: f32, _: f32, _: f32, _: f32) {}
    pub fn set_hidden(&self, _: bool) {}
}

#[cfg(not(target_os = "macos"))]
impl WebOverlay {
    pub fn set_region(&self, _: f32, _: f32, _: f32, _: f32) {}
    pub fn parent_size(&self) -> (f32, f32) {
        (0., 0.)
    }
    pub fn messages(&self) -> Vec<String> {
        Vec::new()
    }
    pub fn set_hidden(&self, _: bool) {}
    pub fn eval_with(&self, _: &str, _: impl Fn(String) + 'static) {}
    pub fn set_frame(&mut self, _: f32, _: f32, _: f32, _: f32) {}
    pub fn eval(&self, _: &str) {}
    pub fn snapshot(&self, _: &str) {}
}

/// The profile effect page with `id` playing (the web's own ProfileEffect).
pub fn effect_overlay(window: &gpui::Window, id: &str) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/profile-effect.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let id_json = serde_json::to_string(id).ok()?;
        // Started once the bundle has run (it is the page's last script).
        let html = html.replacen("</body>", &format!("<script>window.__showEffect({id_json});</script></body>"), 1);
        Some(WebOverlay::new(content_view(window)?, &html, "https://hoffle.online/", false))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, id);
        None
    }
}

/// A site's own player (an iframe of `src`, filling the view) inside `host`.
pub fn player_overlay(host: &ClipHost, src: &str, allow: &str) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let esc = |v: &str| v.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;");
        let html = format!(
            r#"<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}}iframe{{position:absolute;inset:0;width:100%;height:100%;border:0}}</style></head><body><iframe src="{}" allow="{}" allowfullscreen></iframe></body></html>"#,
            esc(src),
            esc(allow)
        );
        Some(WebOverlay::new(host.view, &html, "https://hoffle.online/", true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (host, src, allow);
        None
    }
}

/// The clip host for players, over the window GPUI draws into.
pub fn clip_host(window: &gpui::Window) -> Option<ClipHost> {
    #[cfg(target_os = "macos")]
    {
        Some(ClipHost::new(content_view(window)?))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        None
    }
}

/// The hidden page that reads /tts messages aloud (the web's lib/tts/client.ts), signed in to the
/// server at `base` (the app's own origin, so its worker, models and /api/tts/speak are there).
pub fn speech_view(window: &gpui::Window, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/tts.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::new(content_view(window)?, &html, &origin, false))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, base, session);
        None
    }
}

/// The web's Room Activities panel (resources/web/activities.html), signed in to `base`, taking
/// clicks, posting back through `webkit.messageHandlers.hoffle`.
pub fn activities_view(window: &gpui::Window, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/activities.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::with_region(content_view(window)?, &html, &origin, true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, base, session);
        None
    }
}

/// One of the bundled web pages (resources/web/<page>.html), signed in to `base`, covering the
/// window and taking clicks only in the region the app sets.
pub fn page_view(window: &gpui::Window, page: &str, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let path = format!("web/{page}.html");
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == path).map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::with_region(content_view(window)?, &html, &origin, true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, page, base, session);
        None
    }
}

/// The web's 3D Living Room (resources/web/livingroom.html), signed in to `base`, covering the window
/// and taking clicks only over the stage.
pub fn living_room_view(window: &gpui::Window, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/livingroom.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::with_region(content_view(window)?, &html, &origin, true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, base, session);
        None
    }
}

/// The web's battlemap (resources/web/battlemap.html), signed in to `base`, covering the window and
/// taking clicks only on the board.
pub fn battlemap_view(window: &gpui::Window, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/battlemap.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::with_region(content_view(window)?, &html, &origin, true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, base, session);
        None
    }
}

/// The web's 3D dice overlay (resources/web/dice.html), click-through, signed in to `base`.
pub fn dice_view(window: &gpui::Window, base: &str, session: Option<(String, String)>) -> Option<WebOverlay> {
    #[cfg(target_os = "macos")]
    {
        let html = crate::assets::ASSETS.iter().find(|(p, _)| *p == "web/dice.html").map(|(_, b)| String::from_utf8_lossy(b).into_owned())?;
        let origin = url::Url::parse(base).ok().map(|u| u.origin().ascii_serialization() + "/")?;
        if let Some((name, value)) = session {
            set_session_cookie(&origin, &name, &value);
        }
        Some(WebOverlay::with_messages(content_view(window)?, &html, &origin, false, true))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, base, session);
        None
    }
}
