//! User Settings (settings-dialog.tsx): a dimmed backdrop, the dialog with its sidebar (you, search,
//! the pages by group, the open page's sections on a rail, Terms, Log Out) and the page itself under
//! its title and the ESC button. Password & Security is settings/password-tab.tsx plus
//! settings/security-section.tsx.

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, ScrollHandle, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum Tab {
    Password,
    Privacy,
    Activities,
    Voice,
    Appearance,
    Language,
    Notifications,
    Tts,
    Accessibility,
    Dice,
    CustomCss,
    Requests,
    Tutorial,
    Licenses,
}

struct NavItem {
    tab: Tab,
    label: String,
    icon: &'static str,
    desc: String,
}

fn nav() -> Vec<(String, Vec<NavItem>)> {
    let item = |tab, label: String, icon, desc: &str| NavItem { tab, label, icon, desc: desc.to_string() };
    vec![
        (
            t("userSettings.group.user"),
            vec![
                item(Tab::Password, t("userSettings.tab.password"), "shield-check", "Username, email, password and account security"),
                item(Tab::Privacy, t("privacy.tab"), "lock", &t("privacy.navDesc")),
                item(Tab::Activities, t("userSettings.tab.activities"), "activity", "Status sharing, games and Spotify"),
            ],
        ),
        (
            t("userSettings.group.app"),
            vec![
                item(Tab::Voice, t("userSettings.tab.voice"), "mic", "Mic, speakers, mic test, camera and sounds"),
                item(Tab::Appearance, t("userSettings.tab.appearance"), "palette", "Themes, colours and extras"),
                item(Tab::Language, t("settings.nav.language"), "languages", &t("settings.nav.language.desc")),
                item(Tab::Notifications, t("userSettings.tab.notifications"), "bell", "Desktop, phone and email digest"),
                item(Tab::Tts, t("userSettings.tab.tts"), "audio-lines", "Your /tts and /say voice, hearing /tts messages, and live captions"),
                item(Tab::Accessibility, t("userSettings.tab.accessibility"), "eye", "Font size, readability, preview and animation"),
                item(Tab::Dice, t("userSettings.tab.dice"), "dices", "3D dice styles, materials, textures, and roll sound physics"),
                item(Tab::CustomCss, t("userSettings.tab.customUiCss"), "sparkles", "Personal client-side UI styling"),
            ],
        ),
        (
            t("userSettings.group.community"),
            vec![
                item(Tab::Requests, t("userSettings.tab.requests"), "message-square-plus", "Ideas, bug reports and feature requests, sent straight to kiwi & flo"),
                item(Tab::Tutorial, t("userSettings.tab.tutorial"), "graduation-cap", "Replay the welcome tour and theme picker any time"),
                item(Tab::Licenses, t("userSettings.tab.licenses"), "globe", "Software licenses and legal notices"),
            ],
        ),
    ]
}

/// The sections of a page that the sidebar rail jumps to, by their place in the page.
fn anchors(tab: Tab) -> Vec<(String, usize)> {
    match tab {
        Tab::Password => vec![("Username".into(), 0), ("Email".into(), 1), ("Password".into(), 2), ("Delete account".into(), 7)],
        Tab::Privacy => vec![(t("privacy.dmTitle"), 0), (t("privacy.streamerTitle"), 1)],
        _ => Vec::new(),
    }
}

/// Accessibility choices, kept on this computer like the web's localStorage.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Access {
    pub chat_font_size: u32,
    pub underline_links: bool,
    pub display_name_styles: bool,
    /// "hover", "always" or "still".
    pub name_motion: String,
    pub motion: bool,
}

impl Default for Access {
    fn default() -> Self {
        Self { chat_font_size: 16, underline_links: false, display_name_styles: true, name_motion: "hover".into(), motion: true }
    }
}

fn access_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("accessibility.json"))
}

pub fn load_access() -> Access {
    let access: Access = access_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    crate::rich::UNDERLINE_LINKS.store(access.underline_links, std::sync::atomic::Ordering::Relaxed);
    access
}

fn save_access(access: &Access) {
    if let Some(path) = access_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(access).unwrap_or_default());
    }
}

/// Desktop notifications on or off (`huddle-notify`, kept on this computer; on unless turned off).
pub(super) fn notify_setting() -> bool {
    notify_path().and_then(|p| std::fs::read_to_string(p).ok()).is_none_or(|s| s.trim() != "off")
}

fn notify_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("notify"))
}

/// Streamer Mode: off, on while sharing the screen, or always (kept on this computer).
pub(super) fn streamer_setting() -> String {
    streamer_path().and_then(|p| std::fs::read_to_string(p).ok()).map(|s| s.trim().to_string()).filter(|s| ["off", "auto", "on"].contains(&s.as_str())).unwrap_or_else(|| "off".into())
}

fn streamer_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("streamer-mode"))
}

pub(super) struct Settings {
    pub tab: Tab,
    /// The dialog itself holds focus when no field does (the web opens with nothing focused).
    focus: gpui::FocusHandle,
    search: Entity<TextInput>,
    scroll: ScrollHandle,
    status: Option<String>,
    error: Option<String>,
    username: Entity<TextInput>,
    username_password: Entity<TextInput>,
    email: Entity<TextInput>,
    email_password: Entity<TextInput>,
    email_code: Entity<TextInput>,
    pending_email: Option<String>,
    current: Entity<TextInput>,
    next: Entity<TextInput>,
    delete_password: Entity<TextInput>,
    delete_messages: bool,
    deleting: bool,
    security: Security,
    /// Privacy: who may start a conversation (None until loaded), and the line under it.
    dm_policy: Option<String>,
    privacy_status: Option<String>,
    streamer: String,
    /// Language: whether the picker's list is open, and the row under the pointer.
    language_open: bool,
    language_active: usize,
    /// Notifications: desktop on/off (this computer), the ntfy topic and the weekly digest.
    notify: bool,
    ntfy: Entity<TextInput>,
    ntfy_token: Entity<TextInput>,
    ntfy_saved: Option<String>,
    ntfy_status: Option<String>,
    ntfy_busy: bool,
    digest: Option<Value>,
    digest_status: Option<String>,
    digest_busy: bool,
    /// Licenses: the full AGPL text shown, the package search and category.
    agpl_open: bool,
    license_search: Entity<TextInput>,
    license_category: &'static str,
    _subs: Vec<Subscription>,
}

#[derive(Default)]
struct Security {
    sessions: Option<Vec<Value>>,
    state: Option<Value>,
    error: Option<String>,
    notice: Option<String>,
    busy: bool,
    /// Which change is asking for the password: "setup", "recovery", "passkey" or a passkey id.
    ask: Option<String>,
    setup: Option<(String, String, Vec<Vec<bool>>)>,
    recovery: Option<Vec<String>>,
    disabling: bool,
    password: Option<Entity<TextInput>>,
    code: Option<Entity<TextInput>>,
}

fn field_look() -> Look {
    Look { size: 16., line_height: 24., height: 24., color: gpui::white(), placeholder: gpui::hsla(0., 0., 1., 0.45) }
}

impl Shell {
    pub(super) fn open_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let search = cx.new(|cx| {
            TextInput::new(t("userSettings.search"), cx).look(Look { size: 12., line_height: 18., height: 18., color: Theme::ink().into(), placeholder: gpui::hsla(0., 0., 1., 0.45) })
        });
        let search_sub = cx.subscribe_in(&search, window, |this, _, event, window, cx| match event {
            InputEvent::Escape => this.close_settings(window, cx),
            _ => cx.notify(),
        });
        let mut subs = vec![search_sub];
        let mut make = |placeholder: &str, masked: bool, value: &str, window: &mut Window, cx: &mut Context<Self>| {
            let input = cx.new(|cx| {
                let mut i = TextInput::new(placeholder.to_string(), cx).look(field_look());
                if masked {
                    i = i.masked();
                }
                i.set_text(value.to_string(), cx);
                i
            });
            subs.push(cx.subscribe_in(&input, window, |this, _, event, window, cx| match event {
                InputEvent::Escape => this.close_settings(window, cx),
                _ => cx.notify(),
            }));
            input
        };
        let username = make("", false, &self.me.username.clone(), window, cx);
        let username_password = make("", true, "", window, cx);
        if self.account_email.is_none() {
            self.account_email = self.me.email.clone().filter(|e| !e.is_empty());
        }
        let email_now = self.account_email.clone().unwrap_or_default();
        let email = make("you@example.com", false, &email_now, window, cx);
        let email_password = make("", true, "", window, cx);
        let email_code = make("123456", false, "", window, cx);
        let current = make("", true, "", window, cx);
        let next = make("", true, "", window, cx);
        let delete_password = make("", true, "", window, cx);
        let security = Security { password: Some(make("", true, "", window, cx)), code: Some(make("123456", false, "", window, cx)), ..Default::default() };
        let ntfy = make("https://ntfy.sh/your-secret-topic", false, "", window, cx);
        let ntfy_token = make("Access token (only for protected topics)", true, "", window, cx);
        let license_search = cx.new(|cx| {
            TextInput::new("Search dependencies...", cx).look(Look { size: 12., line_height: 16., height: 16., color: gpui::white(), placeholder: rgb(0x80848e).into() })
        });
        subs.push(cx.subscribe_in(&license_search, window, |this, _, event, window, cx| match event {
            InputEvent::Escape => this.close_settings(window, cx),
            _ => cx.notify(),
        }));
        let focus = cx.focus_handle();
        window.focus(&focus);
        self.settings = Some(Settings {
            tab: Tab::Password,
            focus,
            search,
            scroll: ScrollHandle::new(),
            status: None,
            error: None,
            username,
            username_password,
            email,
            email_password,
            email_code,
            pending_email: None,
            current,
            next,
            delete_password,
            delete_messages: false,
            deleting: false,
            security,
            dm_policy: None,
            privacy_status: None,
            streamer: streamer_setting(),
            language_open: false,
            language_active: 0,
            notify: notify_setting(),
            ntfy,
            ntfy_token,
            ntfy_saved: None,
            ntfy_status: None,
            ntfy_busy: false,
            digest: None,
            digest_status: None,
            digest_busy: false,
            agpl_open: false,
            license_search,
            license_category: "all",
            _subs: subs,
        });
        self.load_security(cx);
        self.settings_call(
            cx,
            |c| c.settings_get("/api/settings/privacy"),
            |this, result, _| {
                if let Some(s) = this.settings.as_mut() {
                    s.dm_policy = Some(result.ok().and_then(|v| v.get("dmPolicy").and_then(Value::as_str).map(str::to_string)).unwrap_or_else(|| "everyone".into()));
                }
            },
        );
        self.settings_call(
            cx,
            |c| c.settings_get("/api/push/ntfy"),
            |this, result, cx| {
                if let (Some(s), Ok(v)) = (this.settings.as_mut(), result) {
                    s.ntfy_saved = v.get("endpoint").and_then(Value::as_str).map(str::to_string);
                    if let Some(endpoint) = s.ntfy_saved.clone() {
                        s.ntfy.update(cx, |i, cx| i.set_text(endpoint, cx));
                    }
                }
            },
        );
        self.settings_call(
            cx,
            |c| c.settings_get("/api/digest"),
            |this, result, _| {
                if let (Some(s), Ok(v)) = (this.settings.as_mut(), result) {
                    s.digest = Some(v);
                }
            },
        );
        cx.notify();
    }

    pub(super) fn close_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.settings.take().is_some() {
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
        }
    }

    /// A line for the open settings page (the chat's notice bar is hidden behind the dialog).
    fn settings_note(&mut self, text: &str, cx: &mut Context<Self>) {
        match self.settings.as_mut() {
            Some(s) => {
                s.status = Some(text.to_string());
                cx.notify();
            }
            None => self.set_notice(text, cx),
        }
    }

    /// Development: the n-th page of the sidebar.
    pub(super) fn dev_settings_page(&mut self, n: usize, cx: &mut Context<Self>) {
        if let Some(tab) = nav().into_iter().flat_map(|(_, items)| items).nth(n).map(|i| i.tab) {
            self.settings_tab(tab, cx);
        }
        // HOFFLE_DEV_LANG_OPEN=1: the language list open.
        if std::env::var("HOFFLE_DEV_LANG_OPEN").is_ok()
            && let Some(s) = self.settings.as_mut()
        {
            s.language_open = true;
        }
    }

    pub(super) fn dev_settings_scroll(&mut self, y: f32) {
        if let Some(s) = self.settings.as_ref() {
            s.scroll.set_offset(gpui::point(px(0.), px(-y)));
        }
    }

    fn settings_tab(&mut self, tab: Tab, cx: &mut Context<Self>) {
        if let Some(s) = self.settings.as_mut() {
            s.tab = tab;
            s.status = None;
            s.error = None;
            s.scroll.set_offset(gpui::point(px(0.), px(0.)));
            cx.notify();
        }
    }

    /// A settings request off the main thread; its answer goes to `done`.
    fn settings_call(&self, cx: &mut Context<Self>, call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static, done: impl FnOnce(&mut Self, anyhow::Result<Value>, &mut Context<Self>) + 'static) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { call(&client) }).await;
            this.update(cx, |this, cx| {
                done(this, result, cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn load_security(&self, cx: &mut Context<Self>) {
        self.settings_call(
            cx,
            |c| Ok(json!({ "sessions": c.settings_get("/api/settings/sessions")?.get("sessions").cloned(), "state": c.settings_get("/api/settings/two-factor")? })),
            |this, result, _| {
                let Some(s) = this.settings.as_mut() else { return };
                match result {
                    Ok(v) => {
                        s.security.sessions = v.get("sessions").and_then(Value::as_array).cloned();
                        s.security.state = v.get("state").cloned();
                    }
                    Err(_) => s.security.error = Some(t("security.loadFailed")),
                }
            },
        );
        // Whether the account has an email, and a code waiting.
        self.settings_call(
            cx,
            |c| c.settings_get("/api/settings/email"),
            |this, result, cx| {
                if let (Some(s), Ok(v)) = (this.settings.as_mut(), result) {
                    s.pending_email = v.get("pending").and_then(Value::as_str).map(str::to_string);
                    if let Some(email) = v.get("email").and_then(Value::as_str) {
                        this.account_email = Some(email.to_string());
                        let input = s.email.clone();
                        input.update(cx, |i, cx| i.set_text(email.to_string(), cx));
                    }
                }
            },
        );
    }

    fn text_of(input: &Entity<TextInput>, cx: &Context<Self>) -> String {
        input.read(cx).text()
    }

    fn save_username(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.error = None;
        let (name, password) = (Self::text_of(&s.username, cx).trim().to_string(), Self::text_of(&s.username_password, cx));
        self.settings_call(
            cx,
            move |c| c.settings_post("/api/settings/username", json!({ "username": name, "password": password })),
            |this, result, cx| {
                let Some(s) = this.settings.as_mut() else { return };
                s.username_password.update(cx, |i, cx| i.set_text("", cx));
                match result {
                    Ok(v) => {
                        if let Some(name) = v.pointer("/user/username").and_then(Value::as_str) {
                            s.status = Some(format!("You are now @{name}. Sign in with this name from now on."));
                            this.me.username = name.to_string();
                        }
                    }
                    Err(e) => s.error = Some(if e.to_string().is_empty() { "Could not change your username.".into() } else { e.to_string() }),
                }
            },
        );
    }

    fn save_email(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.error = None;
        let (email, password) = (Self::text_of(&s.email, cx).trim().to_string(), Self::text_of(&s.email_password, cx));
        self.settings_call(
            cx,
            move |c| c.settings_post("/api/settings/email", json!({ "email": email, "password": password })),
            |this, result, cx| {
                let Some(s) = this.settings.as_mut() else { return };
                s.email_password.update(cx, |i, cx| i.set_text("", cx));
                match result {
                    Ok(v) => {
                        let pending = v.get("pending").and_then(Value::as_str).unwrap_or_default().to_string();
                        s.status = Some(format!("We mailed a code to {pending}. Enter it below to finish."));
                        s.pending_email = Some(pending);
                    }
                    Err(e) => s.error = Some(if e.to_string().is_empty() { "Could not send the code.".into() } else { e.to_string() }),
                }
            },
        );
    }

    fn verify_email(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.error = None;
        let code = Self::text_of(&s.email_code, cx);
        self.settings_call(
            cx,
            move |c| c.settings_post("/api/settings/email/verify", json!({ "code": code })),
            |this, result, cx| {
                let Some(s) = this.settings.as_mut() else { return };
                match result {
                    Ok(v) => {
                        s.pending_email = None;
                        s.email_code.update(cx, |i, cx| i.set_text("", cx));
                        s.status = Some("Email verified. Password reset links will go there.".into());
                        this.account_email = v.pointer("/user/email").and_then(Value::as_str).map(str::to_string);
                    }
                    Err(e) => s.error = Some(if e.to_string().is_empty() { "Could not save your email.".into() } else { e.to_string() }),
                }
            },
        );
    }

    fn save_password(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.error = None;
        let (current, next) = (Self::text_of(&s.current, cx), Self::text_of(&s.next, cx));
        self.settings_call(
            cx,
            move |c| c.settings_post("/api/settings/password", json!({ "current": current, "next": next })),
            |this, result, cx| {
                let Some(s) = this.settings.as_mut() else { return };
                match result {
                    Ok(_) => {
                        s.current.update(cx, |i, cx| i.set_text("", cx));
                        s.next.update(cx, |i, cx| i.set_text("", cx));
                        s.status = Some("Password changed. Other devices were signed out.".into());
                    }
                    Err(e) => s.error = Some(if e.to_string().is_empty() { "Could not save.".into() } else { e.to_string() }),
                }
            },
        );
    }

    fn delete_account(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        // window.confirm first, as the web does.
        let text = if s.delete_messages { "Delete your account and all your messages? This cannot be undone." } else { "Delete your account? This cannot be undone." };
        self.confirm = Some(super::context_menu::Confirm {
            title: "Delete my account".into(),
            text: text.into(),
            ok: "Delete my account".into(),
            cancel: t("common.cancel"),
            action: super::context_menu::ConfirmAction::DeleteAccount,
        });
        cx.notify();
    }

    pub(super) fn delete_account_confirmed(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.error = None;
        s.deleting = true;
        let (password, messages) = (Self::text_of(&s.delete_password, cx), s.delete_messages);
        self.settings_call(
            cx,
            move |c| c.settings_delete("/api/settings/account", json!({ "password": password, "deleteMessages": messages })),
            |this, result, cx| match result {
                Ok(_) => this.sign_out(cx),
                Err(e) => {
                    if let Some(s) = this.settings.as_mut() {
                        s.deleting = false;
                        s.delete_password.update(cx, |i, cx| i.set_text("", cx));
                        s.error = Some(if e.to_string().is_empty() { "Could not delete the account.".into() } else { e.to_string() });
                    }
                }
            },
        );
    }

    /// security-section.tsx `run`: busy while it goes, its error shown under the sections.
    fn security_run(&mut self, cx: &mut Context<Self>, call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static, done: impl FnOnce(&mut Self, Value, &mut Context<Self>) + 'static) {
        let Some(s) = self.settings.as_mut() else { return };
        s.security.error = None;
        s.security.notice = None;
        s.security.busy = true;
        self.settings_call(cx, call, move |this, result, cx| {
            if let Some(s) = this.settings.as_mut() {
                s.security.busy = false;
            }
            match result {
                Ok(v) => done(this, v, cx),
                Err(e) => {
                    if let Some(s) = this.settings.as_mut() {
                        s.security.error = Some(if e.to_string().is_empty() { t("security.failed") } else { e.to_string() });
                    }
                }
            }
        });
    }

    fn security_password(&self, cx: &Context<Self>) -> String {
        self.settings.as_ref().and_then(|s| s.security.password.as_ref()).map(|p| p.read(cx).text()).unwrap_or_default()
    }

    fn security_code(&self, cx: &Context<Self>) -> String {
        self.settings.as_ref().and_then(|s| s.security.code.as_ref()).map(|p| p.read(cx).text()).unwrap_or_default()
    }

    fn clear_security_inputs(&mut self, cx: &mut Context<Self>) {
        if let Some(s) = self.settings.as_mut() {
            for input in [s.security.password.clone(), s.security.code.clone()].into_iter().flatten() {
                input.update(cx, |i, cx| i.set_text("", cx));
            }
        }
    }

    fn sign_out_session(&mut self, id: Option<String>, cx: &mut Context<Self>) {
        let others = id.is_none();
        let body = match id {
            Some(id) => json!({ "id": id }),
            None => json!({ "others": true }),
        };
        self.security_run(
            cx,
            move |c| c.settings_delete("/api/settings/sessions", body),
            move |this, v, _| {
                if let Some(s) = this.settings.as_mut() {
                    s.security.sessions = v.get("sessions").and_then(Value::as_array).cloned();
                    if others {
                        s.security.notice = Some(t("security.signedOutOthers"));
                    }
                }
            },
        );
    }

    fn start_two_factor(&mut self, cx: &mut Context<Self>) {
        let password = self.security_password(cx);
        self.security_run(
            cx,
            move |c| c.settings_post("/api/settings/two-factor", json!({ "action": "setup", "password": password })),
            |this, v, cx| {
                let secret = v.get("secret").and_then(Value::as_str).unwrap_or_default().to_string();
                let uri = v.get("uri").and_then(Value::as_str).unwrap_or_default().to_string();
                let qr = qrcodegen::QrCode::encode_text(&uri, qrcodegen::QrCodeEcc::Medium)
                    .map(|q| (0..q.size()).map(|y| (0..q.size()).map(|x| q.get_module(x, y)).collect()).collect())
                    .unwrap_or_default();
                this.clear_security_inputs(cx);
                if let Some(s) = this.settings.as_mut() {
                    s.security.setup = Some((secret, uri, qr));
                    s.security.ask = None;
                }
            },
        );
    }

    fn confirm_two_factor(&mut self, cx: &mut Context<Self>) {
        let code = self.security_code(cx);
        self.security_run(
            cx,
            move |c| c.settings_post("/api/settings/two-factor", json!({ "action": "enable", "code": code })),
            |this, v, cx| {
                this.clear_security_inputs(cx);
                if let Some(s) = this.settings.as_mut() {
                    s.security.setup = None;
                    s.security.recovery = v.get("recoveryCodes").and_then(Value::as_array).map(|a| a.iter().filter_map(|c| c.as_str().map(str::to_string)).collect());
                }
                this.load_security(cx);
            },
        );
    }

    fn new_recovery_codes(&mut self, cx: &mut Context<Self>) {
        let password = self.security_password(cx);
        self.security_run(
            cx,
            move |c| c.settings_post("/api/settings/two-factor", json!({ "action": "recovery", "password": password })),
            |this, v, cx| {
                this.clear_security_inputs(cx);
                if let Some(s) = this.settings.as_mut() {
                    s.security.ask = None;
                    s.security.recovery = v.get("recoveryCodes").and_then(Value::as_array).map(|a| a.iter().filter_map(|c| c.as_str().map(str::to_string)).collect());
                }
                this.load_security(cx);
            },
        );
    }

    fn turn_off_two_factor(&mut self, cx: &mut Context<Self>) {
        let (password, code) = (self.security_password(cx), self.security_code(cx));
        self.security_run(
            cx,
            move |c| c.settings_post("/api/settings/two-factor", json!({ "action": "disable", "password": password, "code": code })),
            |this, _, cx| {
                this.clear_security_inputs(cx);
                if let Some(s) = this.settings.as_mut() {
                    s.security.disabling = false;
                    s.security.notice = Some(t("security.twoStepOff"));
                }
                this.load_security(cx);
            },
        );
    }

    fn remove_passkey(&mut self, id: String, cx: &mut Context<Self>) {
        let password = self.security_password(cx);
        self.security_run(
            cx,
            move |c| c.settings_delete("/api/settings/passkeys", json!({ "id": id, "password": password })),
            |this, _, cx| {
                this.clear_security_inputs(cx);
                if let Some(s) = this.settings.as_mut() {
                    s.security.ask = None;
                }
                this.load_security(cx);
            },
        );
    }

    /// "Download my data": the export, saved where the user picks.
    fn download_data(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        let dir = dirs::download_dir().unwrap_or_else(std::env::temp_dir);
        let chosen = cx.prompt_for_new_path(&dir, Some("hoffle-data.json"));
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(path))) = chosen.await else { return };
            let saved = cx.background_executor().spawn(async move { client.export_data().and_then(|bytes| Ok(std::fs::write(&path, bytes)?)) }).await;
            this.update(cx, |this, cx| {
                if let (Some(s), Err(e)) = (this.settings.as_mut(), saved) {
                    s.security.error = Some(e.to_string());
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    // -------------------------------------------------------------- rendering

    pub(super) fn render_settings(&self, window: &mut Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let s = self.settings.as_ref()?;
        // Development: HOFFLE_DEV_SETTINGS_SCROLL=<px>, kept while the page grows.
        if let Some(y) = std::env::var("HOFFLE_DEV_SETTINGS_SCROLL").ok().and_then(|v| v.parse::<f32>().ok()) {
            let max = f32::from(s.scroll.max_offset().height);
            s.scroll.set_offset(gpui::point(px(0.), px(-y.min(max))));
        }
        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        let w = 1180f32.min(vw * 0.95).min(vw - 48.);
        let h = 840f32.min(vh * 0.92).min(vh - 48.);
        Some(
            div()
                .id("settings-overlay")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000c7))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(
                    div()
                        .id("settings-modal")
                        .track_focus(&s.focus)
                        // `.modal`'s 10px top margin: centred, it sits 5px low.
                        .mt(px(10.))
                        .w(px(w))
                        .h(px(h))
                        .rounded(px(18.))
                        .bg(Theme::paper())
                        .border_1()
                        .border_color(rgba(0xffffff1a))
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.75), offset: gpui::point(px(0.), px(28.)), blur_radius: px(80.), spread_radius: px(0.) }])
                        .overflow_hidden()
                        .flex()
                        .child(self.render_settings_sidebar(s, window, cx))
                        .child(self.render_settings_main(s, window, cx)),
                )
                .into_any_element(),
        )
    }

    fn render_settings_sidebar(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let muted: Hsla = Theme::muted().into();
        let query = s.search.read(cx).text().trim().to_lowercase();
        let search_focused = gpui::Focusable::focus_handle(s.search.read(cx), cx).is_focused(window);
        let me = &self.me;
        let user = div()
            .flex_none()
            .px(px(12.))
            .py(px(10.))
            .rounded(px(12.))
            .bg(rgba(0xffffff0a))
            .border_1()
            .border_color(rgba(0xffffff0f))
            .flex()
            .items_center()
            .gap(px(10.))
            .child(ui::avatar_with(self.picture(&me.avatar_url), &me.avatar, &me.color, me.name(), 36., 16., FontWeight::NORMAL, Theme::ink().into()))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(ui::fit(window, me.name(), FontWeight::BOLD, 13., px(149.))))
                    .child(
                        div()
                            .id("settings-edit-profiles")
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .text_color(Theme::lavender())
                            .cursor_pointer()
                            .hover(|s| s.underline())
                            .child(t("userSettings.editProfiles"))
                            .child(ui::icon("pen-line", 11., Theme::lavender())),
                    ),
            );
        let search = div()
            .flex_none()
            .relative()
            .h(px(36.))
            .pl(px(32.))
            .pr(px(12.))
            .rounded(px(8.))
            .bg(rgba(0x0000004d))
            .border_1()
            .border_color(if search_focused { Hsla::from(Theme::lavender()) } else { rgba(0xffffff1a).into() })
            .flex()
            .items_center()
            .child(div().absolute().left(px(9.)).top(px(10.)).child(ui::icon("search", 14., muted)))
            .child(div().flex_1().child(s.search.clone()));
        let mut groups = div().flex().flex_col().gap(px(14.));
        for (title, items) in nav() {
            let shown: Vec<NavItem> = items
                .into_iter()
                .filter(|i| query.is_empty() || i.label.to_lowercase().contains(&query) || i.desc.to_lowercase().contains(&query))
                .collect();
            if shown.is_empty() {
                continue;
            }
            let mut section = div().flex().flex_col().gap(px(3.)).child(
                div().pt(px(6.)).px(px(12.)).pb(px(2.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(title.to_uppercase()),
            );
            for item in shown {
                let active = s.tab == item.tab;
                let tab = item.tab;
                section = section.child(
                    Self::settings_nav_button(SharedString::from(format!("sn-{:?}", item.tab)), item.icon, item.label.clone(), active)
                        .on_click(cx.listener(move |this, _, _, cx| this.settings_tab(tab, cx))),
                );
                if active {
                    if let Some(rail) = self.render_settings_rail(s, cx) {
                        section = section.child(rail);
                    }
                }
            }
            groups = groups.child(section);
        }
        div()
            .id("settings-sidebar")
            .w(px(250.))
            .flex_none()
            .h_full()
            .bg(Theme::panel())
            .border_r_1()
            .border_color(rgba(0xffffff14))
            .overflow_y_scroll()
            .px(px(14.))
            .py(px(20.))
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(user)
            .child(search)
            .child(groups.flex_1())
            .child(
                Self::settings_nav_button("settings-terms".into(), "file-text", "Terms & Privacy".into(), false)
                    .on_click(|_, _, cx| cx.open_url("https://hoffle.online/terms")),
            )
            .child(
                div()
                    .id("settings-logout")
                    .w_full()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .px(px(12.))
                    .pt(px(10.))
                    .pb(px(8.))
                    .rounded(px(8.))
                    .border_t_1()
                    .border_color(rgba(0xffffff14))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(rgb(0xf87171))
                    .cursor_pointer()
                    .hover(|s| s.bg(Hsla::from(rgb(0xef4444)).opacity(0.15)).text_color(rgb(0xfca5a5)))
                    .child(ui::icon("log-out", 16., rgb(0xf87171)))
                    .child(t("userSettings.logOut"))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.settings = None;
                        this.sign_out(cx);
                    })),
            )
            .into_any_element()
    }

    fn settings_nav_button(id: SharedString, icon: &'static str, label: String, active: bool) -> gpui::Stateful<gpui::Div> {
        let color: Hsla = if active { gpui::white() } else { rgb(0xb5bac1).into() };
        div()
            .id(id)
            .w_full()
            .flex_none()
            .flex()
            .items_center()
            .gap(px(10.))
            .px(px(12.))
            .py(px(8.))
            .rounded(px(8.))
            .text_size(px(13.))
            .line_height(px(19.5))
            .font_weight(if active { FontWeight::BOLD } else { FontWeight::MEDIUM })
            .text_color(color)
            .cursor_pointer()
            .when(active, |d| d.bg(rgba(0xffffff1f)))
            .when(!active, |d| d.hover(|s| s.bg(rgba(0xffffff0f)).text_color(rgb(0xf2f3f5))))
            .child(ui::icon(icon, 16., color))
            .child(label)
    }

    /// `.settings-subnav`: the open page's sections, the one in view marked.
    fn render_settings_rail(&self, s: &Settings, cx: &mut Context<Self>) -> Option<AnyElement> {
        let list = anchors(s.tab);
        if list.len() < 2 {
            return None;
        }
        let top = s.scroll.logical_scroll_top().0;
        // Scrolled to the end, the last section is the one being read.
        let at_end = s.scroll.max_offset().height > px(0.) && -s.scroll.offset().y >= s.scroll.max_offset().height - px(1.);
        let current = if at_end { list[list.len() - 1].1 } else { list.iter().rev().find(|(_, ix)| *ix <= top).map_or(0, |(_, ix)| *ix) };
        let rail_color: Hsla = Hsla::from(Theme::muted()).opacity(0.35);
        let mut rail = div().mt(px(2.)).mb(px(6.)).ml(px(20.)).border_l_1().border_color(rail_color).flex().flex_col();
        for (label, ix) in list {
            let active = ix == current;
            let scroll = s.scroll.clone();
            rail = rail.child(
                div()
                    .id(SharedString::from(format!("rail-{ix}")))
                    .ml(px(-1.))
                    .pl(px(14.))
                    .pr(px(12.))
                    .py(px(6.))
                    .border_l_2()
                    .border_color(if active { Theme::ink().into() } else { gpui::transparent_black() })
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                    .text_color(if active { Theme::ink() } else { Theme::muted() })
                    .cursor_pointer()
                    .hover(|s| s.text_color(Theme::ink()))
                    .child(label)
                    .on_click(cx.listener(move |_, _, _, cx| {
                        scroll.scroll_to_item(ix);
                        cx.notify();
                    })),
            );
        }
        Some(rail.into_any_element())
    }

    fn render_settings_main(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let title = nav().into_iter().flat_map(|(_, items)| items).find(|i| i.tab == s.tab).map(|i| i.label).unwrap_or_default();
        let topbar = div()
            .flex_none()
            .pt(px(24.))
            .px(px(36.))
            .pb(px(16.))
            .border_b_1()
            .border_color(rgba(0xffffff12))
            .flex()
            .items_center()
            .justify_between()
            .child(div().text_size(px(20.)).line_height(px(30.)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::ink()).child(title))
            .child(
                div()
                    .id("settings-esc")
                    .group("settings-esc")
                    .p(px(2.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(3.))
                    .cursor_pointer()
                    .child(
                        div()
                            .size(px(34.))
                            .rounded_full()
                            .border_2()
                            .border_color(rgba(0xffffff40))
                            .group_hover("settings-esc", |s| s.border_color(gpui::white()))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(ui::icon("x", 18., rgb(0xb5bac1))),
                    )
                    .child(div().text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0x949ba4)).child("ESC"))
                    .on_click(cx.listener(|this, _, window, cx| this.close_settings(window, cx))),
            );
        let mut content = div()
            .id("settings-content")
            .flex_1()
            .min_h_0()
            .max_w(px(860.))
            .overflow_y_scroll()
            .track_scroll(&s.scroll)
            .pt(px(28.))
            .px(px(44.))
            .pb(px(56.))
            .flex()
            .flex_col();
        let page = match s.tab {
            // `.account-settings`: 18px between its sections.
            Tab::Password => self.render_account_page(s, window, cx).into_iter().enumerate().map(|(n, e)| div().when(n > 0, |d| d.mt(px(18.))).child(e).into_any_element()).collect(),
            Tab::Privacy => self.render_privacy_page(s, cx),
            Tab::Language => self.render_language_page(s, window, cx),
            Tab::Notifications => self.render_notifications_page(s, window, cx),
            Tab::Accessibility => self.render_accessibility_page(cx),
            Tab::Licenses => self.render_licenses_page(s, window, cx),
            Tab::Tutorial => vec![
                div()
                    .flex_none()
                    .flex()
                    .flex_col()
                    .gap(px(16.))
                    .child(div().text_size(px(14.)).line_height(px(22.75)).text_color(rgb(0xd1d5dc)).child(
                        "The tutorial walks you through picking a theme, getting around, voice and screen sharing, chat and game night, with buttons that try each thing for real. It opened when you signed up, and you can open it again from here any time.",
                    ))
                    .child(div().flex().child(
                        div()
                            .id("tutorial-open")
                            .px(px(18.))
                            .py(px(9.))
                            .rounded(px(4.))
                            .bg(Theme::lavender())
                            .text_size(px(13.5))
                            .line_height(px(20.25))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(rgb(0x15121f))
                            .cursor_pointer()
                            .child("Open the tutorial")
                            // The welcome tour is not in this app yet.
                            .on_click(cx.listener(|this, _, _, cx| this.settings_note("The tutorial is not in this app yet. Open Hoffle in your browser to take it.", cx))),
                    ))
                    .into_any_element(),
            ],
            _ => Vec::new(),
        };
        for section in page {
            content = content.child(section);
        }
        if let Some(error) = &s.error {
            content = content.child(Self::auth_error(error.clone()).mt(px(12.)));
        }
        if let Some(status) = &s.status {
            content = content.child(div().mt(px(12.)).text_size(px(13.)).line_height(px(19.5)).text_color(Theme::mint()).child(status.clone()));
        }
        div().flex_1().min_w_0().h_full().bg(Theme::chat_bg()).flex().flex_col().child(topbar).child(content).into_any_element()
    }

    // ------------------------------------------------------- password & security

    fn section(id: &str) -> gpui::Stateful<gpui::Div> {
        div()
            .id(SharedString::from(id.to_string()))
            .flex_none()
            .w(px(480.))
            .p(px(18.))
            .rounded(px(12.))
            .bg(rgba(0x00000038))
            .border_1()
            .border_color(Theme::line())
            .flex()
            .flex_col()
    }

    fn section_title(label: &str, icon: Option<&'static str>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(6.))
            .text_size(px(14.))
            .line_height(px(21.))
            .font_weight(FontWeight::BOLD)
            .text_color(Theme::ink())
            .when_some(icon, |d, i| d.child(ui::icon(i, 16., Theme::ink())))
            .child(label.to_uppercase())
    }

    fn hint(text: impl Into<SharedString>) -> gpui::Div {
        div().text_size(px(13.)).line_height(px(19.5)).text_color(rgb(0xaaaeba)).child(text.into())
    }

    fn label(text: &str) -> gpui::Div {
        div().mb(px(6.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child(text.to_uppercase())
    }

    fn auth_error(text: String) -> gpui::Div {
        div().px(px(12.)).py(px(10.)).rounded(px(10.)).bg(rgba(0xef6b581a)).text_size(px(13.)).line_height(px(18.2)).text_color(rgb(0xef6b58)).child(text)
    }

    /// An input in settings: 42px, 10px corners, a lavender edge while focused.
    fn field(input: &Entity<TextInput>, window: &Window, cx: &Context<Self>) -> gpui::Div {
        let focused = gpui::Focusable::focus_handle(input.read(cx), cx).is_focused(window);
        div()
            .h(px(42.))
            .px(px(12.))
            .rounded(px(10.))
            .bg(rgb(0x17181e))
            .border_1()
            .border_color(if focused { Hsla::from(Theme::lavender()) } else { rgb(0x4b4d5b).into() })
            .flex()
            .items_center()
            .child(div().flex_1().child(input.clone()))
    }

    /// `button.primary` in settings: 42px, accent, dimmed while it cannot be used.
    fn primary(id: String, label: impl Into<SharedString>, enabled: bool) -> gpui::Stateful<gpui::Div> {
        div()
            .id(SharedString::from(id))
            .h(px(42.))
            .px(px(16.))
            .rounded(px(10.))
            .bg(Theme::lavender())
            .flex()
            .items_center()
            .text_size(px(16.))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(rgb(0x15121f))
            .when(!enabled, |d| d.opacity(0.45))
            .when(enabled, |d| d.cursor_pointer().hover(|s| s.bg(crate::theme::mix(Theme::lavender(), 0.9, gpui::white()))))
            .child(label.into())
    }

    /// A plain button (security-section's Cancel, Sign out…): the browser's own button look.
    fn plain(id: String, label: impl Into<SharedString>) -> gpui::Stateful<gpui::Div> {
        div()
            .id(SharedString::from(id))
            .px(px(10.))
            .py(px(4.))
            .rounded(px(6.))
            .bg(rgb(0x3b3b3b))
            .border_1()
            .border_color(rgb(0x767676))
            .text_size(px(13.))
            .line_height(px(17.))
            .text_color(Theme::ink())
            .cursor_pointer()
            .hover(|s| s.bg(rgb(0x4a4a4a)))
            .child(label.into())
    }

    fn render_account_page(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let mut out = Vec::new();
        let left = |row: gpui::Stateful<gpui::Div>| div().flex().child(row);
        // Username.
        let name = s.username.read(cx).text();
        let changed = name.trim() != self.me.username;
        let can = !name.trim().is_empty() && changed && !s.username_password.read(cx).text().is_empty();
        out.push(
            Self::section("acct-username")
                .child(Self::section_title("Username", None))
                .child(Self::field(&s.username, window, cx).mt(px(14.)))
                .child(Self::hint("2–24 letters, numbers, dots, dashes or underscores. You sign in with this.").mt(px(8.)))
                .when(changed, |d| d.child(Self::label("Password to confirm").mt(px(14.))).child(Self::field(&s.username_password, window, cx)))
                .child(left(Self::primary("acct-username-save".into(), "Change username", can).mt(px(16.)).when(can, |d| d.on_click(cx.listener(|this, _, _, cx| this.save_username(cx))))))
                .into_any_element(),
        );
        // Email.
        let email_now = self.account_email.clone().or_else(|| self.me.email.clone()).unwrap_or_default();
        let typed = s.email.read(cx).text();
        let changed = typed.trim().to_lowercase() != email_now;
        let can = !typed.trim().is_empty() && changed && !s.email_password.read(cx).text().is_empty();
        let code_ok = s.email_code.read(cx).text().chars().filter(|c| c.is_ascii_digit()).count() == 6;
        out.push(
            Self::section("acct-email")
                .child(Self::section_title("Email", None))
                .when(email_now.is_empty(), |d| d.child(Self::auth_error("You have no email yet. Add one so you can reset your password if you forget it.".into()).mt(px(12.))))
                .child(Self::field(&s.email, window, cx).mt(px(if email_now.is_empty() { 10. } else { 14. })))
                .child(Self::hint("Only used for password reset links. Nobody else sees it.").mt(px(8.)))
                .when(changed, |d| d.child(Self::label("Password to confirm").mt(px(14.))).child(Self::field(&s.email_password, window, cx)))
                .child(left(
                    Self::primary("acct-email-save".into(), if email_now.is_empty() { "Send code to add email" } else { "Send code to change email" }, can)
                        .mt(px(16.))
                        .when(can, |d| d.on_click(cx.listener(|this, _, _, cx| this.save_email(cx)))),
                ))
                .when_some(s.pending_email.clone(), |d, pending| {
                    d.child(Self::label(&format!("Code sent to {pending}")).mt(px(14.)))
                        .child(Self::field(&s.email_code, window, cx))
                        .child(left(Self::primary("acct-email-verify".into(), "Verify email", code_ok).mt(px(16.)).when(code_ok, |d| d.on_click(cx.listener(|this, _, _, cx| this.verify_email(cx))))))
                })
                .into_any_element(),
        );
        // Password.
        let can = !s.current.read(cx).text().is_empty() && !s.next.read(cx).text().is_empty();
        out.push(
            Self::section("acct-password")
                .child(Self::section_title("Password", None))
                .child(Self::hint("Changing it signs you out on every other device.").mt(px(4.)))
                .child(Self::label("Current password").mt(px(14.)))
                .child(Self::field(&s.current, window, cx))
                .child(Self::label("New password").mt(px(14.)))
                .child(Self::field(&s.next, window, cx))
                .child(left(Self::primary("acct-password-save".into(), "Change password", can).mt(px(16.)).when(can, |d| d.on_click(cx.listener(|this, _, _, cx| this.save_password(cx))))))
                .into_any_element(),
        );
        out.extend(self.render_security(s, window, cx));
        // Delete account (not for Hoffle admins).
        if !self.me.is_admin {
            let can = !s.delete_password.read(cx).text().is_empty() && !s.deleting;
            let checked = s.delete_messages;
            out.push(
                div()
                    .id("acct-delete")
                    .flex_none()
                    .w(px(480.))
                    .p(px(16.))
                    .rounded(px(12.))
                    .bg(rgba(0x00000038))
                    .border_1()
                    .border_color(rgba(0xf59e6e73))
                    .flex()
                    .flex_col()
                    .child(Self::section_title("Delete account", None))
                    .child(
                        Self::hint("This signs you out everywhere and removes your profile, friends and settings. Your messages stay in their conversations as “Deleted user” unless you remove them too. It cannot be undone.")
                            .mt(px(4.)),
                    )
                    .child(Self::label("Password").mt(px(14.)))
                    .child(Self::field(&s.delete_password, window, cx))
                    .child(
                        div()
                            .id("acct-delete-messages")
                            .px(px(12.))
                            .py(px(11.))
                            .rounded(px(12.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .justify_between()
                            .cursor_pointer()
                            .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Also delete my messages and files"))
                            .child(
                                div()
                                    .size(px(16.))
                                    .mr(px(1.5))
                                    .rounded(px(3.))
                                    .border_1()
                                    .border_color(if checked { Hsla::from(Theme::lavender()) } else { rgb(0x767676).into() })
                                    .bg(if checked { Hsla::from(Theme::lavender()) } else { rgb(0x3b3b3b).into() })
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .when(checked, |d| d.child(ui::icon("check-bold", 12., rgb(0x15121f)))),
                            )
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(s) = this.settings.as_mut() {
                                    s.delete_messages = !s.delete_messages;
                                    cx.notify();
                                }
                            })),
                    )
                    .child(left(
                        div()
                            .id("acct-delete-go")
                            .h(px(40.))
                            .px(px(16.))
                            .rounded(px(8.))
                            .bg(Theme::coral())
                            .flex()
                            .items_center()
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(gpui::white())
                            .when(!can, |d| d.opacity(0.5))
                            .when(can, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.delete_account(cx))))
                            .child(if s.deleting { "Deleting…" } else { "Delete my account" }),
                    ))
                    .into_any_element(),
            );
        }
        out
    }

    fn render_security(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let sec = &s.security;
        let mut out = Vec::new();
        let ink: Hsla = Theme::ink().into();
        let list_item = |icon: &'static str, title: String, sub: String| {
            div()
                .px(px(10.))
                .py(px(8.))
                .rounded(px(8.))
                .border_1()
                .border_color(ink.opacity(0.14))
                .flex()
                .items_center()
                .gap(px(10.))
                .child(ui::icon(icon, 18., ink))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(title))
                        .child(div().text_size(px(12.)).line_height(px(18.)).text_color(ink.opacity(0.7)).child(sub)),
                )
        };
        // Where you're signed in.
        let mut devices = Self::section("sec-devices").child(Self::section_title(&t("security.devices.title"), None)).child(Self::hint(t("security.devices.hint")).mt(px(4.)));
        match &sec.sessions {
            None if sec.error.is_none() => devices = devices.child(Self::hint(t("common.loading")).mt(px(12.))),
            Some(sessions) => {
                let mut list = div().mt(px(12.)).mb(px(10.)).flex().flex_col().gap(px(6.));
                for session in sessions {
                    let f = |k: &str| session.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
                    let current = session.get("current").and_then(Value::as_bool).unwrap_or(false);
                    let browser = match f("browser").as_str() {
                        "Unknown device" => t("device.unknown"),
                        "Hoffle desktop app" => t("device.hoffleDesktop"),
                        "Hoffle app" => t("device.hoffleApp"),
                        "A script or bot" => t("device.script"),
                        "A browser" => t("device.browser"),
                        other => other.to_string(),
                    };
                    let os = f("os");
                    let name = if os.is_empty() { browser.clone() } else { tv("security.device", &[("browser", &browser), ("os", &os)]) };
                    let phone = ["iPhone", "Android", "iPad"].iter().any(|p| os.contains(p)) || f("browser") == "Hoffle app";
                    let when = if current { t("security.devices.thisDevice") } else { tv("security.devices.lastActive", &[("when", &when(session.get("lastUsedAt").and_then(Value::as_str).or(session.get("createdAt").and_then(Value::as_str))))]) };
                    let ip = f("ip");
                    let sub = if !ip.is_empty() && ip != "unknown" { format!("{when} · {ip}") } else { when };
                    let id = f("id");
                    list = list.child(list_item(if phone { "smartphone" } else { "monitor" }, name, sub).when(!current, |d| {
                        d.child(Self::plain(format!("sec-out-{id}"), t("security.devices.signOut")).on_click(cx.listener(move |this, _, _, cx| this.sign_out_session(Some(id.clone()), cx))))
                    }));
                }
                devices = devices.child(list);
                if sessions.len() > 1 {
                    devices = devices.child(div().flex().child(
                        Self::plain("sec-out-others".into(), format!("{}", t("security.devices.signOutOthers"))).on_click(cx.listener(|this, _, _, cx| this.sign_out_session(None, cx))),
                    ));
                }
            }
            None => {}
        }
        out.push(devices.into_any_element());

        // Two-step sign-in.
        let enabled = sec.state.as_ref().and_then(|s| s.get("enabled")).and_then(Value::as_bool).unwrap_or(false);
        let mut two = Self::section("sec-two").child(Self::section_title(&t("security.twoStep.title"), Some("shield-check")));
        let password = sec.password.clone();
        let code = sec.code.clone();
        let prompt = |label: String, id: &str, action: Box<dyn Fn(&mut Self, &mut Context<Self>)>, window: &mut Window, cx: &mut Context<Self>| {
            let has = password.as_ref().is_some_and(|p| !p.read(cx).text().is_empty());
            let action = std::rc::Rc::new(action);
            div()
                .flex()
                .flex_col()
                .child(Self::label(&t("security.passwordToConfirm")).mt(px(14.)))
                .when_some(password.as_ref(), |d, p| d.child(Self::field(p, window, cx)))
                .child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(Self::primary(format!("{id}-go"), label, has && !sec.busy).mt(px(16.)).when(has, |d| {
                            let action = action.clone();
                            d.on_click(cx.listener(move |this, _, _, cx| action(this, cx)))
                        }))
                        .child(Self::plain(format!("{id}-cancel"), t("common.cancel")).mt(px(16.)).on_click(cx.listener(|this, _, _, cx| {
                            this.clear_security_inputs(cx);
                            if let Some(s) = this.settings.as_mut() {
                                s.security.ask = None;
                                cx.notify();
                            }
                        }))),
                )
        };
        if sec.state.is_some() && !enabled && sec.setup.is_none() {
            two = two.child(Self::hint(t("security.twoStep.about")).mt(px(4.)));
            if sec.ask.as_deref() == Some("setup") {
                two = two.child(prompt(t("gate.button.continue"), "sec-setup", Box::new(|this, cx| this.start_two_factor(cx)), window, cx));
            } else {
                two = two.child(div().flex().child(Self::primary("sec-two-on".into(), t("security.twoStep.turnOn"), true).mt(px(28.)).on_click(cx.listener(|this, _, _, cx| {
                    if let Some(s) = this.settings.as_mut() {
                        s.security.ask = Some("setup".into());
                        cx.notify();
                    }
                }))));
            }
        }
        if let Some((secret, uri, qr)) = &sec.setup {
            let n = qr.len().max(1) as f32;
            let side = 180.;
            let cell = side / (n + 4.);
            let mut grid = div().p(px(cell * 2.)).bg(gpui::white()).rounded(px(8.)).flex().flex_col();
            for row in qr {
                let mut line = div().flex();
                for &on in row {
                    line = line.child(div().size(px(cell)).when(on, |d| d.bg(gpui::black())));
                }
                grid = grid.child(line);
            }
            let grouped: String = secret.chars().collect::<Vec<_>>().chunks(4).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join(" ");
            let can = code.as_ref().is_some_and(|c| c.read(cx).text().chars().filter(|c| c.is_ascii_digit()).count() == 6) && !sec.busy;
            let uri = uri.clone();
            two = two
                .child(Self::hint(t("security.twoStep.scan")).mt(px(4.)))
                .child(div().mt(px(8.)).flex().child(grid))
                .child(
                    div()
                        .mt(px(12.))
                        .flex()
                        .flex_wrap()
                        .gap(px(4.))
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .text_color(rgb(0xaaaeba))
                        .child(t("security.twoStep.typeKey"))
                        .child(div().font_family(crate::theme::MONO_FONT).text_color(Theme::ink()).child(grouped)),
                )
                .child(div().id("sec-open-app").mt(px(8.)).text_size(px(13.)).text_color(Theme::lavender()).cursor_pointer().hover(|s| s.underline()).child(t("security.twoStep.openInApp")).on_click(move |_, _, cx| cx.open_url(&uri)))
                .child(Self::label(&t("security.twoStep.codeFromApp")).mt(px(14.)))
                .when_some(code.as_ref(), |d, c| d.child(Self::field(c, window, cx)))
                .child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(Self::primary("sec-confirm".into(), t("security.twoStep.confirm"), can).mt(px(16.)).when(can, |d| d.on_click(cx.listener(|this, _, _, cx| this.confirm_two_factor(cx)))))
                        .child(Self::plain("sec-setup-cancel".into(), t("common.cancel")).mt(px(16.)).on_click(cx.listener(|this, _, _, cx| {
                            if let Some(s) = this.settings.as_mut() {
                                s.security.setup = None;
                                cx.notify();
                            }
                        }))),
                );
        }
        if let Some(codes) = &sec.recovery {
            let joined = codes.join("\n");
            let mut list = div().mt(px(8.)).flex().flex_col().gap(px(2.));
            for (n, c) in codes.iter().enumerate() {
                list = list.child(div().flex().gap(px(6.)).text_size(px(14.)).child(format!("{}.", n + 1)).child(div().font_family(crate::theme::MONO_FONT).child(c.clone())));
            }
            two = two
                .child(div().mt(px(8.)).text_size(px(14.)).line_height(px(21.)).text_color(Theme::ink()).child(format!("{} {}", t("security.twoStep.saveCodes"), t("security.twoStep.codesAbout"))))
                .child(list)
                .child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(Self::plain("sec-copy".into(), t("common.copy")).on_click(cx.listener(move |this, _, _, cx| {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(joined.clone()));
                            if let Some(s) = this.settings.as_mut() {
                                s.security.notice = Some(t("security.codesCopied"));
                                cx.notify();
                            }
                        })))
                        .child(Self::primary("sec-saved".into(), t("security.twoStep.savedThem"), true).on_click(cx.listener(|this, _, _, cx| {
                            if let Some(s) = this.settings.as_mut() {
                                s.security.recovery = None;
                                cx.notify();
                            }
                        }))),
                );
        }
        if enabled && sec.recovery.is_none() {
            let state = sec.state.as_ref();
            let since = when(state.and_then(|s| s.get("enabledAt")).and_then(Value::as_str));
            let left = state.and_then(|s| s.get("recoveryCodesLeft")).and_then(Value::as_i64).unwrap_or(0);
            let codes = tv(if left == 1 { "security.twoStep.codesLeft.one" } else { "security.twoStep.codesLeft.other" }, &[("count", &left.to_string())]);
            two = two.child(Self::hint(format!("{} {codes}", tv("security.twoStep.onSince", &[("when", &since)]))).mt(px(4.)));
            if sec.ask.as_deref() == Some("recovery") {
                two = two.child(prompt(t("security.twoStep.makeNewCodes"), "sec-recovery", Box::new(|this, cx| this.new_recovery_codes(cx)), window, cx));
            } else if sec.disabling {
                let can = password.as_ref().is_some_and(|p| !p.read(cx).text().is_empty()) && code.as_ref().is_some_and(|c| !c.read(cx).text().is_empty()) && !sec.busy;
                two = two
                    .child(Self::label(&t("gate.label.password")).mt(px(14.)))
                    .when_some(password.as_ref(), |d, p| d.child(Self::field(p, window, cx)))
                    .child(Self::label(&t("security.twoStep.offCode")).mt(px(14.)))
                    .when_some(code.as_ref(), |d, c| d.child(Self::field(c, window, cx)))
                    .child(
                        div()
                            .mt(px(10.))
                            .flex()
                            .gap(px(8.))
                            .child(
                                Self::plain("sec-off-go".into(), t("security.twoStep.turnOff"))
                                    .text_color(Theme::coral())
                                    .when(!can, |d| d.opacity(0.5))
                                    .when(can, |d| d.on_click(cx.listener(|this, _, _, cx| this.turn_off_two_factor(cx)))),
                            )
                            .child(Self::plain("sec-off-cancel".into(), t("common.cancel")).on_click(cx.listener(|this, _, _, cx| {
                                this.clear_security_inputs(cx);
                                if let Some(s) = this.settings.as_mut() {
                                    s.security.disabling = false;
                                    cx.notify();
                                }
                            }))),
                    );
            } else {
                two = two.child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .gap(px(8.))
                        .child(Self::plain("sec-new-codes".into(), t("security.twoStep.newCodes")).on_click(cx.listener(|this, _, _, cx| {
                            if let Some(s) = this.settings.as_mut() {
                                s.security.ask = Some("recovery".into());
                                cx.notify();
                            }
                        })))
                        .child(Self::plain("sec-off".into(), t("security.twoStep.turnOff")).text_color(Theme::coral()).on_click(cx.listener(|this, _, _, cx| {
                            if let Some(s) = this.settings.as_mut() {
                                s.security.disabling = true;
                                cx.notify();
                            }
                        }))),
                );
            }
        }
        out.push(two.into_any_element());

        // Passkeys: listed and removable here; making one needs the browser (not in this app yet).
        let mut keys = Self::section("sec-keys").child(Self::section_title(&t("security.passkeys.title"), Some("key-round"))).child(Self::hint(t("security.passkeys.about")).mt(px(4.)));
        let passkeys: Vec<Value> = sec.state.as_ref().and_then(|s| s.get("passkeys")).and_then(Value::as_array).cloned().unwrap_or_default();
        if !passkeys.is_empty() {
            let mut list = div().mt(px(12.)).mb(px(10.)).flex().flex_col().gap(px(6.));
            for key in &passkeys {
                let f = |k: &str| key.get(k).and_then(Value::as_str).map(str::to_string);
                let id = f("id").unwrap_or_default();
                let sub = tv("security.passkeys.added", &[("when", &when(f("createdAt").as_deref())), ("used", &when(f("lastUsedAt").as_deref()))]);
                let asking = sec.ask.as_deref() == Some(id.as_str());
                list = list.child(list_item("key-round", f("name").unwrap_or_default(), sub).when(!asking, |d| {
                    let id = id.clone();
                    d.child(Self::plain(format!("sec-key-{id}"), t("common.remove")).on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.settings.as_mut() {
                            s.security.ask = Some(id.clone());
                            cx.notify();
                        }
                    })))
                }));
            }
            keys = keys.child(list);
            if let Some(id) = sec.ask.clone().filter(|a| passkeys.iter().any(|k| k.get("id").and_then(Value::as_str) == Some(a.as_str()))) {
                keys = keys.child(prompt(t("security.passkeys.remove"), "sec-key-remove", Box::new(move |this, cx| this.remove_passkey(id.clone(), cx)), window, cx));
            }
        }
        keys = keys.child(div().flex().child(Self::primary("sec-key-add".into(), t("security.passkeys.add"), true).mt(px(28.)).on_click(cx.listener(|this, _, _, cx| {
            this.settings_note("Adding a passkey is not in this app yet. Use Hoffle in your browser for that.", cx);
        }))));
        out.push(keys.into_any_element());

        // Your data.
        out.push(
            Self::section("sec-data")
                .child(Self::section_title(&t("security.data.title"), Some("download")))
                .child(Self::hint(t("security.data.about")).mt(px(4.)))
                .child(
                    div().flex().child(
                        div()
                            .id("sec-download")
                            .mt(px(20.))
                            .px(px(14.))
                            .py(px(8.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(ink.opacity(0.25))
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .text_size(px(16.))
                            .line_height(px(24.))
                            .text_color(ink)
                            .cursor_pointer()
                            .child(ui::icon("download", 14., ink))
                            .child(t("security.data.download"))
                            .on_click(cx.listener(|this, _, _, cx| this.download_data(cx))),
                    ),
                )
                .into_any_element(),
        );
        if let Some(error) = &sec.error {
            out.push(Self::auth_error(error.clone()).mt(px(-6.)).into_any_element());
        }
        if let Some(notice) = &sec.notice {
            out.push(Self::hint(notice.clone()).into_any_element());
        }
        out
    }
}

/// security-section.tsx `when`: just now, minutes or hours ago, else the date.
fn when(iso: Option<&str>) -> String {
    let Some(t0) = iso.and_then(crate::model::parse_time) else { return t("security.when.never") };
    let minutes = ((chrono::Utc::now() - t0.with_timezone(&chrono::Utc)).num_seconds() as f64 / 60.).round() as i64;
    if minutes < 15 {
        t("security.when.justNow")
    } else if minutes < 60 {
        tv("security.when.minutes", &[("count", &minutes.to_string())])
    } else if minutes < 24 * 60 {
        let hours = (minutes as f64 / 60.).round() as i64;
        tv(if hours == 1 { "security.when.hours.one" } else { "security.when.hours.other" }, &[("count", &hours.to_string())])
    } else {
        t0.with_timezone(&chrono::Local).format_localized("%-d %b %Y", chrono::Locale::en_US).to_string()
    }
}

impl Shell {
    fn choose_dm_policy(&mut self, next: &'static str, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        let previous = s.dm_policy.replace(next.to_string());
        s.privacy_status = None;
        self.settings_call(
            cx,
            move |c| c.settings_patch("/api/settings/privacy", json!({ "dmPolicy": next })),
            move |this, result, _| {
                let Some(s) = this.settings.as_mut() else { return };
                match result {
                    Ok(_) => s.privacy_status = Some(t("privacy.saved")),
                    Err(e) => {
                        s.dm_policy = previous;
                        s.privacy_status = Some(if e.to_string().is_empty() { t("privacy.failed") } else { e.to_string() });
                    }
                }
            },
        );
    }

    fn set_streamer(&mut self, value: &'static str, cx: &mut Context<Self>) {
        if let Some(path) = streamer_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
            let _ = std::fs::write(path, value);
        }
        if let Some(s) = self.settings.as_mut() {
            s.streamer = value.to_string();
        }
        cx.notify();
    }

    /// `label.appearance-switch` holding a radio: the choice in bold, the browser's radio on the right.
    fn radio_row(id: String, label: String, checked: bool, enabled: bool) -> gpui::Stateful<gpui::Div> {
        div()
            .id(SharedString::from(id))
            .h(px(48.))
            .px(px(12.))
            .rounded(px(12.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .flex()
            .items_center()
            .justify_between()
            .when(enabled, |d| d.cursor_pointer())
            .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(label))
            .child(
                // Chrome's dark radio, 19px with its margins: a grey ring, the accent dot when chosen.
                div()
                    .mr(px(1.))
                    .size(px(17.))
                    .rounded_full()
                    .border_1()
                    .border_color(rgb(0x9b9aa3))
                    .bg(if checked { rgb(0x2b2541) } else { rgb(0x3b3b3b) })
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(checked, |d| d.child(div().size(px(11.)).rounded_full().bg(rgb(0x9d8cfa))))
                    .when(!enabled, |d| d.opacity(0.5)),
            )
    }

    fn render_privacy_page(&self, s: &Settings, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let section = |id: &str| {
            div()
                .id(SharedString::from(id.to_string()))
                .flex_none()
                .p(px(18.))
                .rounded(px(12.))
                .bg(rgba(0x00000038))
                .border_1()
                .border_color(Theme::line())
                .flex()
                .flex_col()
        };
        let loaded = s.dm_policy.is_some();
        let mut dms = div().mt(px(12.)).flex().flex_col().gap(px(8.));
        for policy in ["everyone", "servers", "friends"] {
            let checked = s.dm_policy.as_deref() == Some(policy);
            dms = dms.child(Self::radio_row(format!("pv-dm-{policy}"), t(&format!("privacy.dm.{policy}")), checked, loaded).when(loaded && !checked, |d| {
                d.on_click(cx.listener(move |this, _, _, cx| this.choose_dm_policy(policy, cx)))
            }));
        }
        let mut streamer = div().mt(px(12.)).flex().flex_col().gap(px(8.));
        for value in ["off", "auto", "on"] {
            let checked = s.streamer == value;
            streamer = streamer.child(Self::radio_row(format!("pv-st-{value}"), t(&format!("privacy.streamer.{value}")), checked, true).when(!checked, |d| {
                d.on_click(cx.listener(move |this, _, _, cx| this.set_streamer(value, cx)))
            }));
        }
        vec![
            section("pv-dms")
                .child(Self::section_title(&t("privacy.dmTitle"), None))
                .child(Self::hint(t("privacy.dmDesc")).mt(px(4.)))
                .child(dms)
                .when_some(s.privacy_status.clone(), |d, status| d.child(Self::hint(status).mb(px(12.))))
                .into_any_element(),
            section("pv-streamer")
                .child(Self::section_title(&t("privacy.streamerTitle"), None))
                .child(Self::hint(t("privacy.streamerDesc")).mt(px(4.)))
                .child(streamer)
                .into_any_element(),
        ]
    }
}

impl Shell {
    fn choose_language(&mut self, code: &'static str, window: &mut Window, cx: &mut Context<Self>) {
        crate::i18n::set_locale(code);
        if let Some(s) = self.settings.as_mut() {
            s.language_open = false;
        }
        window.refresh();
        cx.notify();
    }

    fn render_language_page(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let muted: Hsla = Theme::muted().into();
        let ink: Hsla = Theme::ink().into();
        let current = crate::i18n::locale();
        let name = crate::i18n::NAMES.iter().find(|(c, _, _)| *c == current).map_or("English", |(_, n, _)| *n);
        let open = s.language_open;
        let trigger = div()
            .id("lang-trigger")
            .min_w(px(220.))
            .h(px(42.))
            .px(px(12.))
            .rounded(px(10.))
            .bg(ink.opacity(0.04))
            .border_1()
            .border_color(if open { Hsla::from(Theme::lavender()).opacity(0.6) } else { ink.opacity(0.22) })
            .hover(|s| s.border_color(Hsla::from(Theme::lavender()).opacity(0.6)))
            .flex()
            .items_center()
            .gap(px(8.))
            .text_size(px(14.))
            .line_height(px(21.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(ink)
            .cursor_pointer()
            .child(ui::icon("globe", 16., muted))
            .child(div().flex_1().child(name))
            .child(ui::icon(if open { "chevron-up" } else { "chevron-down" }, 14., muted))
            .on_click(cx.listener(|this, _, _, cx| {
                if let Some(s) = this.settings.as_mut() {
                    s.language_open = !s.language_open;
                    s.language_active = crate::i18n::NAMES.iter().position(|(c, _, _)| *c == crate::i18n::locale()).unwrap_or(0);
                    cx.notify();
                }
            }));
        // The hint's 12px and the picker's own 12px (an inline-block: they do not collapse).
        let mut picker = div().relative().mt(px(24.)).mb(px(6.)).flex().child(trigger);
        if open {
            let mut list = div()
                .id("lang-list")
                .absolute()
                .top(px(48.))
                .left_0()
                .p(px(6.))
                .rounded(px(12.))
                .bg(Theme::panel())
                .border_1()
                .border_color(ink.opacity(0.18))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(18.)), blur_radius: px(40.), spread_radius: px(-16.) }])
                .flex()
                .flex_col()
                .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                    if let Some(s) = this.settings.as_mut() {
                        s.language_open = false;
                        cx.notify();
                    }
                }));
            for (n, (code, label, complete)) in crate::i18n::NAMES.iter().enumerate() {
                let selected = *code == current;
                let active = n == s.language_active;
                let code: &'static str = code;
                list = list.child(
                    div()
                        .id(SharedString::from(format!("lang-{code}")))
                        .px(px(10.))
                        .py(px(8.))
                        .rounded(px(8.))
                        .when(active, |d| d.bg(Hsla::from(Theme::lavender()).opacity(0.16)))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .text_size(px(14.))
                        .line_height(px(21.))
                        .font_weight(if selected { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
                        .text_color(ink)
                        .cursor_pointer()
                        .when(selected, |d| d.child(ui::icon("check", 14., Theme::lavender())))
                        .child(
                            div()
                                .flex_1()
                                .flex()
                                .items_baseline()
                                .when(!selected, |d| d.pl(px(22.)))
                                .child(label.to_string())
                                .when(!complete, |d| d.child(div().text_size(px(12.)).font_weight(FontWeight::NORMAL).text_color(muted).child(format!(" · {}", t("settings.language.partialTag"))))),
                        )
                        .child(div().ml(px(18.)).font_family(crate::theme::MONO_FONT).text_size(px(11.5)).text_color(muted).child(code))
                        .on_mouse_move(cx.listener(move |this, _, _, cx| {
                            if let Some(s) = this.settings.as_mut()
                                && s.language_active != n
                            {
                                s.language_active = n;
                                cx.notify();
                            }
                        }))
                        .on_click(cx.listener(move |this, _, window, cx| this.choose_language(code, window, cx))),
                );
            }
            // Drawn after the page, so the hints under the picker do not cover it.
            picker = picker.child(gpui::deferred(list).with_priority(1));
        }
        let _ = window;
        vec![
            Self::section("lang")
                .child(Self::section_title(&t("settings.language"), None))
                .child(Self::hint(t("settings.language.description")).mt(px(4.)))
                .child(picker)
                .child(Self::hint(t("settings.language.detected")))
                .child(Self::hint(t("settings.language.partialNote")).mt(px(12.)))
                .into_any_element(),
        ]
    }

    /// `.appearance-switch` with a checkbox (the browser's, in the accent when on).
    fn checkbox(checked: bool) -> gpui::Div {
        div()
            .size(px(18.))
            .mr(px(0.5))
            .rounded(px(3.))
            .border_1()
            .border_color(if checked { Hsla::from(Theme::lavender()) } else { rgb(0x767676).into() })
            .bg(if checked { Hsla::from(Theme::lavender()) } else { rgb(0x3b3b3b).into() })
            .flex()
            .items_center()
            .justify_center()
            .when(checked, |d| d.child(ui::icon("check-bold", 12., rgb(0x15121f))))
    }

    /// `button.secondary` in settings: outlined, 42px.
    fn secondary(id: String, label: impl Into<SharedString>, enabled: bool) -> gpui::Stateful<gpui::Div> {
        let ink: Hsla = Theme::ink().into();
        div()
            .id(SharedString::from(id))
            .h(px(42.))
            .px(px(16.))
            .rounded(px(10.))
            .border_1()
            .border_color(ink.opacity(0.22))
            .flex()
            .items_center()
            .text_size(px(16.))
            .font_weight(FontWeight::BOLD)
            .text_color(ink)
            .when(!enabled, |d| d.opacity(0.45))
            .when(enabled, |d| d.cursor_pointer().hover(|s| s.bg(ink.opacity(0.07))))
            .child(label.into())
    }

    fn switch_box(id: &str) -> gpui::Stateful<gpui::Div> {
        div().id(SharedString::from(id.to_string())).px(px(12.)).py(px(11.)).rounded(px(12.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex()
    }

    fn ntfy_save(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.ntfy_busy = true;
        s.ntfy_status = None;
        let (endpoint, token) = (s.ntfy.read(cx).text(), s.ntfy_token.read(cx).text());
        let client = self.client.clone();
        self.settings_call(
            cx,
            move |_| client.settings_put("/api/push/ntfy", json!({ "endpoint": endpoint, "token": token })),
            |this, result, _| {
                let Some(s) = this.settings.as_mut() else { return };
                s.ntfy_busy = false;
                match result {
                    Ok(v) => {
                        s.ntfy_saved = v.get("endpoint").and_then(Value::as_str).map(str::to_string);
                        s.ntfy_status = Some("Sent a test notification — check your phone.".into());
                    }
                    Err(e) => s.ntfy_status = Some(e.to_string()),
                }
            },
        );
    }

    fn ntfy_remove(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.ntfy_busy = true;
        self.settings_call(
            cx,
            |c| c.settings_delete("/api/push/ntfy", json!({})),
            |this, result, cx| {
                let Some(s) = this.settings.as_mut() else { return };
                s.ntfy_busy = false;
                match result {
                    Ok(_) => {
                        s.ntfy_saved = None;
                        s.ntfy.update(cx, |i, cx| i.set_text("", cx));
                        s.ntfy_token.update(cx, |i, cx| i.set_text("", cx));
                        s.ntfy_status = Some("Phone notifications turned off.".into());
                    }
                    Err(e) => s.ntfy_status = Some(e.to_string()),
                }
            },
        );
    }

    fn choose_digest(&mut self, mode: &'static str, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        let previous = s.digest.clone();
        if let Some(d) = s.digest.as_mut() {
            d["mode"] = json!(mode);
        }
        s.digest_status = None;
        self.settings_call(
            cx,
            move |c| c.settings_post("/api/digest", json!({ "mode": mode })),
            move |this, result, _| {
                if let (Some(s), Err(e)) = (this.settings.as_mut(), result) {
                    s.digest = previous;
                    s.digest_status = Some(if e.to_string().is_empty() { "Could not save that.".into() } else { e.to_string() });
                }
            },
        );
    }

    fn digest_preview(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.settings.as_mut() else { return };
        s.digest_busy = true;
        s.digest_status = None;
        self.settings_call(
            cx,
            |c| c.settings_post("/api/digest", json!({ "preview": true })),
            |this, result, _| {
                let Some(s) = this.settings.as_mut() else { return };
                s.digest_busy = false;
                s.digest_status = Some(match result {
                    Ok(v) if v.get("sent").and_then(Value::as_bool) == Some(true) => "Sent. It's in your Notes.".into(),
                    Ok(v) => v.get("reason").and_then(Value::as_str).unwrap_or("Nothing to send.").to_string(),
                    Err(e) => if e.to_string().is_empty() { "Could not send it.".into() } else { e.to_string() },
                });
            },
        );
    }

    fn render_notifications_page(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let muted: Hsla = Theme::muted().into();
        let small = |text: String| div().text_size(px(12.8)).line_height(px(19.2)).text_color(muted).child(text);
        let strong = |text: &str| div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(text.to_string());
        let mut out = Vec::new();
        // Desktop notifications.
        let on = s.notify;
        out.push(
            Self::switch_box("nt-desktop")
                .items_center()
                .justify_between()
                .cursor_pointer()
                .child(div().flex().flex_col().gap(px(2.)).child(strong(&t("notificationSettings.enableDesktop"))).child(small(t("notificationSettings.desktopDesc"))))
                .child(Self::checkbox(on))
                .on_click(cx.listener(|this, _, _, cx| {
                    if let Some(s) = this.settings.as_mut() {
                        s.notify = !s.notify;
                        if let Some(path) = notify_path() {
                            let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
                            let _ = std::fs::write(path, if s.notify { "on" } else { "off" });
                        }
                        cx.notify();
                    }
                }))
                .into_any_element(),
        );
        // Phone notifications through ntfy.
        let endpoint = s.ntfy.read(cx).text();
        let can_save = !s.ntfy_busy && !endpoint.is_empty();
        let mut buttons = div().flex().flex_wrap().gap(px(8.)).child(
            Self::primary("nt-ntfy-save".into(), if s.ntfy_saved.is_some() { "Update & test" } else { "Save & test" }, can_save)
                .mt(px(16.))
                .when(can_save, |d| d.on_click(cx.listener(|this, _, _, cx| this.ntfy_save(cx)))),
        );
        if endpoint.is_empty() {
            buttons = buttons.child(Self::secondary("nt-ntfy-suggest".into(), "Make me a topic", true).mt(px(16.)).on_click(cx.listener(|this, _, _, cx| {
                // 12 random bytes in base 36, the first 20 characters.
                let mut topic = String::new();
                let mut seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(1) as u64 | 1;
                for _ in 0..12 {
                    seed ^= seed << 13;
                    seed ^= seed >> 7;
                    seed ^= seed << 17;
                    let b = (seed % 256) as u32;
                    topic.push_str(&format!("{:0>2}", radix36(b)));
                }
                topic.truncate(20);
                if let Some(s) = this.settings.as_mut() {
                    s.ntfy.update(cx, |i, cx| i.set_text(format!("https://ntfy.sh/hoffle-{topic}"), cx));
                }
            })));
        }
        if s.ntfy_saved.is_some() {
            buttons = buttons.child(Self::secondary("nt-ntfy-off".into(), "Turn off", !s.ntfy_busy).mt(px(16.)).when(!s.ntfy_busy, |d| d.on_click(cx.listener(|this, _, _, cx| this.ntfy_remove(cx)))));
        }
        out.push(
            Self::switch_box("nt-phone")
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(strong("Phone notifications (ntfy / UnifiedPush)"))
                        .child(small("Mentions, DMs and incoming calls, even when the app is closed. Install the ntfy app, subscribe to a secret topic, and paste its URL here. Works with ntfy.sh or your own ntfy server.".into())),
                )
                .child(Self::field(&s.ntfy, window, cx))
                .child(Self::field(&s.ntfy_token, window, cx).h(px(38.)))
                .child(buttons)
                .when_some(s.ntfy_status.clone(), |d, status| d.child(small(status)))
                .into_any_element(),
        );
        // The weekly digest.
        if let Some(digest) = &s.digest {
            let mode = digest.get("mode").and_then(Value::as_str).unwrap_or("off").to_string();
            let has_email = digest.get("hasEmail").and_then(Value::as_bool).unwrap_or(false);
            let next = digest.get("nextAt").and_then(Value::as_str).and_then(crate::model::parse_time).filter(|_| mode != "off").map(|t| {
                t.with_timezone(&chrono::Local).format_localized(" Next one: %A %-I:%M %p.", chrono::Locale::en_US).to_string()
            });
            let mut modes = div().flex().flex_wrap().gap(px(6.));
            for (value, label) in [("off", "Off"), ("notes", "In my Notes"), ("email", "Notes + email")] {
                let active = mode == value;
                let disabled = value == "email" && !has_email;
                modes = modes.child(
                    div()
                        .id(SharedString::from(format!("nt-digest-{value}")))
                        .px(px(12.))
                        .py(px(5.))
                        .rounded_full()
                        .border_1()
                        .border_color(if active { Hsla::from(Theme::lavender()) } else { Theme::line().into() })
                        .when(active, |d| d.bg(Hsla::from(Theme::lavender()).opacity(0.16)))
                        .when(disabled, |d| d.opacity(0.5))
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .text_color(Theme::ink())
                        .when(!disabled, |d| d.cursor_pointer())
                        .child(
                            div()
                                .size(px(17.))
                                .rounded_full()
                                .border_1()
                                .border_color(rgb(0x9b9aa3))
                                .bg(if active { rgb(0x2b2541) } else { rgb(0x3b3b3b) })
                                .flex()
                                .items_center()
                                .justify_center()
                                .when(active, |d| d.child(div().size(px(11.)).rounded_full().bg(rgb(0x9d8cfa)))),
                        )
                        .child(label)
                        .when(!disabled && !active, |d| d.on_click(cx.listener(move |this, _, _, cx| this.choose_digest(value, cx)))),
                );
            }
            out.push(
                Self::switch_box("nt-digest")
                    .flex_col()
                    .gap(px(8.))
                    .child(
                        div().flex().flex_col().gap(px(2.)).child(strong("Weekly digest")).child(small(format!(
                            "Every Sunday: the messages people reacted to most, events coming up and who joined, on each of your servers.{}",
                            next.unwrap_or_default()
                        ))),
                    )
                    .child(modes)
                    .when(!has_email, |d| d.child(small("Add an email address to your account to get it by email.".into())))
                    .child(div().flex().child(
                        Self::secondary("nt-digest-now".into(), "Send me this week's now", !s.digest_busy)
                            .mt(px(16.))
                            .when(!s.digest_busy, |d| d.on_click(cx.listener(|this, _, _, cx| this.digest_preview(cx)))),
                    ))
                    .when_some(s.digest_status.clone(), |d, status| d.child(small(status)))
                    .into_any_element(),
            );
        }
        out
    }
}

/// A byte in base 36, as JavaScript's `toString(36)`.
fn radix36(mut n: u32) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

impl Shell {
    fn change_access(&mut self, change: impl FnOnce(&mut Access), cx: &mut Context<Self>) {
        change(&mut self.access);
        save_access(&self.access);
        crate::rich::UNDERLINE_LINKS.store(self.access.underline_links, std::sync::atomic::Ordering::Relaxed);
        // Message rows were measured with the old look.
        if let Some(list) = self.channel_id.as_ref().and_then(|c| self.messages.get(c)) {
            self.list.splice(0..list.len(), list.len());
        }
        cx.notify();
    }

    /// `.toggle-switch`: 44×24, grey or accent, an 18px white knob.
    fn toggle(on: bool) -> gpui::Div {
        div()
            .relative()
            .flex_none()
            .w(px(44.))
            .h(px(24.))
            .rounded(px(24.))
            .bg(if on { Hsla::from(Theme::lavender()) } else { rgb(0x4e5058).into() })
            .child(
                div()
                    .absolute()
                    .top(px(3.))
                    .left(px(if on { 23. } else { 3. }))
                    .size(px(18.))
                    .rounded_full()
                    .bg(gpui::white())
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(2.)), blur_radius: px(4.), spread_radius: px(0.) }]),
            )
    }

    fn render_accessibility_page(&self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let a = self.access.clone();
        let size = a.chat_font_size as f32;
        // Tailwind's colours the web page uses.
        let gray400: Hsla = rgb(0x99a1af).into();
        let gray300: Hsla = rgb(0xd1d5dc).into();
        let indigo400: Hsla = rgb(0x7c86ff).into();
        let pink400: Hsla = rgb(0xfb64b6).into();
        let me = &self.me;
        let glyph = if me.avatar.is_empty() { "K".to_string() } else { me.avatar.clone() };
        let name = if me.name().is_empty() { "kivu".to_string() } else { me.name().to_string() };
        let header = || {
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .child(div().text_size(px(size)).line_height(px(size * 1.5)).font_weight(FontWeight::BOLD).text_color(pink400).child(name.clone()))
                .child(
                    div()
                        .px(px(6.))
                        .py(px(2.))
                        .rounded_full()
                        .bg(Hsla::from(rgb(0xf6339a)).opacity(0.2))
                        .border_1()
                        .border_color(Hsla::from(rgb(0xf6339a)).opacity(0.3))
                        .text_size(px(10.))
                        .line_height(px(15.))
                        .text_color(rgb(0xfda5d5))
                        .child("❤️ LGBT"),
                )
                .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(gray400).child("14:48"))
        };
        let avatar = || div().size(px(40.)).flex_none().rounded_full().bg(rgb(0x4f39f6)).flex().items_center().justify_center().font_weight(FontWeight::BOLD).text_color(gpui::white()).child(glyph.clone());
        let pill = |text: &str, bg: Hsla, border: Hsla, color: Hsla| {
            div().px(px(8.)).py(px(2.)).rounded(px(4.)).bg(bg).border_1().border_color(border).text_size(px(12.)).line_height(px(16.)).text_color(color).child(text.to_string())
        };
        let preview = div()
            .flex()
            .flex_col()
            .child(div().mb(px(8.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(gray400).child("PREVIEW"))
            .child(
                div()
                    .p(px(16.))
                    .rounded(px(12.))
                    .bg(rgb(0x1e1f22))
                    .border_1()
                    .border_color(rgba(0xffffff1a))
                    .flex()
                    .flex_col()
                    .gap(px(12.))
                    .child(
                        div().flex().items_start().gap(px(12.)).child(avatar()).child(
                            div()
                                .flex_1()
                                .flex()
                                .flex_col()
                                .gap(px(4.))
                                .child(header())
                                .child(div().text_size(px(size)).line_height(px(size * 1.5)).text_color(rgb(0xe5e7eb)).child("what happened to all the beans"))
                                .child(
                                    div()
                                        .pt(px(4.))
                                        .flex()
                                        .gap(px(6.))
                                        .child(pill("🫐 3", Hsla::from(rgb(0x1e1a4d)).opacity(0.6), Hsla::from(rgb(0x625fff)).opacity(0.4), rgb(0xa3b3ff).into()))
                                        .child(pill("🧱 1", rgba(0xffffff0d).into(), rgba(0xffffff1a).into(), gray300)),
                                ),
                        ),
                    )
                    .child(
                        div().pt(px(4.)).flex().items_start().gap(px(12.)).child(avatar()).child(
                            div()
                                .flex_1()
                                .flex()
                                .flex_col()
                                .gap(px(4.))
                                .child(header())
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .justify_between()
                                        .text_size(px(size))
                                        .line_height(px(size * 1.5))
                                        .text_color(rgb(0xe5e7eb))
                                        .child(
                                            div()
                                                .flex()
                                                .child("here's a link\u{a0}")
                                                .child(div().text_color(indigo400).when(a.underline_links, |d| d.underline()).child("https://hoffle.online/accessibility")),
                                        )
                                        .child(
                                            div()
                                                .ml(px(16.))
                                                // `button.primary` keeps its 16px top margin in settings.
                                                .mt(px(16.))
                                                .flex_none()
                                                .h(px(42.))
                                                .px(px(16.))
                                                .rounded(px(10.))
                                                .bg(Theme::lavender())
                                                .flex()
                                                .items_center()
                                                .text_size(px(12.))
                                                .font_weight(FontWeight::EXTRA_BOLD)
                                                .text_color(rgb(0x15121f))
                                                .child("Example Button"),
                                        ),
                                ),
                        ),
                    ),
            );
        // Chat font size: a 12–24 track with its marks.
        let spot = super::profile_card::spot();
        let fill = (size - 12.) / 12.;
        let mut marks = div().relative().h(px(16.)).mt(px(8.));
        for mark in [12u32, 14, 15, 16, 18, 20, 24] {
            let chosen = a.chat_font_size == mark;
            let frac = (mark as f32 - 12.) / 12.;
            marks = marks.child(
                div()
                    .id(SharedString::from(format!("ac-mark-{mark}")))
                    .absolute()
                    .top_0()
                    .left(gpui::relative(frac))
                    // `left: calc(8px + (100% - 16px) * f)`, centred on that point.
                    .ml(px(8. - 16. * frac - 12.))
                    .w(px(24.))
                    .flex()
                    .justify_center()
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .font_weight(if chosen { FontWeight::BOLD } else { FontWeight::NORMAL })
                    .text_color(if chosen { indigo400 } else { gray400 })
                    .cursor_pointer()
                    .hover(|s| s.text_color(gpui::white()))
                    .child(format!("{mark}px"))
                    .on_click(cx.listener(move |this, _, _, cx| this.change_access(|a| a.chat_font_size = mark, cx))),
            );
        }
        let slider = div()
            .relative()
            .pt(px(4.))
            .pb(px(16.))
            .child(
                div()
                    .id("ac-font")
                    .relative()
                    .h(px(24.))
                    .cursor_pointer()
                    .child(div().absolute().left_0().right_0().top(px(10.)).h(px(8.)).rounded(px(8.)).bg(rgb(0x364153)))
                    .child(div().absolute().top(px(6.)).left(gpui::relative(fill)).ml(px(-16. * fill)).size(px(16.)).rounded_full().bg(rgb(0x6366f1)))
                    .child(super::profile_card::track(&spot))
                    .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                        let b = spot.get();
                        let share = (f32::from(e.position.x - b.origin.x - px(8.)) / (f32::from(b.size.width) - 16.)).clamp(0., 1.);
                        let value = (12. + share * 12.).round() as u32;
                        this.change_access(|a| a.chat_font_size = value, cx);
                    })),
            )
            .child(marks);
        let row = |id: &str, title: String, desc: String, control: AnyElement| {
            div()
                .id(SharedString::from(id.to_string()))
                .py(px(12.))
                .border_t_1()
                .border_color(rgba(0xffffff1a))
                .flex()
                .items_center()
                .justify_between()
                .gap(px(16.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(title))
                        .child(div().text_size(px(12.)).line_height(px(16.)).text_color(gray400).child(desc)),
                )
                .child(control)
        };
        let mut segmented = div().flex_none().flex().p(px(4.)).rounded(px(8.)).bg(rgba(0xffffff0d));
        for (value, label) in [("hover", "On hover"), ("always", "Always"), ("still", "Never")] {
            let on = a.name_motion == value;
            segmented = segmented.child(
                div()
                    .id(SharedString::from(format!("ac-motion-{value}")))
                    .px(px(12.))
                    .py(px(4.))
                    .rounded(px(6.))
                    .when(on, |d| d.bg(rgba(0xffffff26)))
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(if on { gpui::white() } else { gray400 })
                    .cursor_pointer()
                    .when(!on, |d| d.hover(|s| s.text_color(gpui::white())))
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| this.change_access(|a| a.name_motion = value.into(), cx))),
            );
        }
        let readability = div()
            .mt(px(24.))
            .pt(px(8.))
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child("Text Readability"))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .text_color(gray300)
                            .child(t("accessibilitySettings.fontSize"))
                            .child(div().font_weight(FontWeight::BOLD).text_color(indigo400).child(format!("{}px", a.chat_font_size))),
                    )
                    .child(div().mt(px(4.)).mb(px(12.)).text_size(px(12.)).line_height(px(16.)).text_color(gray400).child(t("accessibilitySettings.fontSizeDesc")))
                    .child(slider),
            )
            .child(row(
                "ac-underline",
                t("accessibilitySettings.underlineLinks"),
                t("accessibilitySettings.underlineLinksDesc"),
                Self::toggle(a.underline_links).id("ac-underline-t").cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.change_access(|a| a.underline_links = !a.underline_links, cx))).into_any_element(),
            ))
            .child(row(
                "ac-names",
                t("accessibilitySettings.displayNameStyles"),
                t("accessibilitySettings.displayNameStylesDesc"),
                Self::toggle(a.display_name_styles).id("ac-names-t").cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.change_access(|a| a.display_name_styles = !a.display_name_styles, cx))).into_any_element(),
            ))
            .child(row("ac-name-motion", t("accessibilitySettings.animateNameEffects"), t("accessibilitySettings.animateNameEffectsDesc"), segmented.into_any_element()))
            .child(row(
                "ac-motion",
                t("accessibilitySettings.interfaceMotion"),
                t("accessibilitySettings.interfaceMotionDesc"),
                Self::toggle(a.motion).id("ac-motion-t").cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.change_access(|a| a.motion = !a.motion, cx))).into_any_element(),
            ));
        vec![preview.into_any_element(), readability.into_any_element()]
    }
}

/// licenses-tab.tsx THIRD_PARTY_PACKAGES: name, category, license, its URL, author, what it is, project.
const PACKAGES: [(&str, &str, &str, &str, &str, &str, &str); 12] = [
    ("React & React DOM", "Core & UI", "MIT", "https://opensource.org/licenses/MIT", "Meta Platforms, Inc.", "The library for web and native user interfaces.", "https://react.dev"),
    ("Lucide React", "Core & UI", "ISC", "https://opensource.org/licenses/ISC", "Lucide Contributors", "Beautiful & consistent icons crafted for modern interfaces.", "https://lucide.dev"),
    ("Tailwind CSS", "Core & UI", "MIT", "https://opensource.org/licenses/MIT", "Tailwind Labs, Inc.", "Utility-first CSS framework for rapid UI styling.", "https://tailwindcss.com"),
    ("Three.js", "Audio & Graphics", "MIT", "https://opensource.org/licenses/MIT", "Ricardo Cabello (mrdoob) & contributors", "JavaScript 3D library used for tabletop dice rendering and 3D visualizers.", "https://threejs.org"),
    ("@3d-dice/dice-box", "Audio & Graphics", "MIT", "https://opensource.org/licenses/MIT", "Frank S", "3D physics-based dice rolling engine for the tabletop game room.", "https://github.com/3d-dice/dice-box"),
    ("RNNoise", "Audio & Graphics", "Apache-2.0", "https://www.apache.org/licenses/LICENSE-2.0", "Jean-Marc Valin / Xiph.Org Foundation", "Recurrent neural network for real-time microphone noise suppression.", "https://github.com/xiph/rnnoise"),
    ("pdf-lib & fontkit", "Documents & Tools", "MIT", "https://opensource.org/licenses/MIT", "Andrew Dillon (Hopding) & fontkit contributors", "PDF creation and modification library for interactive character sheets and handouts.", "https://pdf-lib.js.org"),
    ("PDF.js (pdfjs-dist)", "Documents & Tools", "Apache-2.0", "https://www.apache.org/licenses/LICENSE-2.0", "Mozilla Foundation", "Standards-based PDF viewer and canvas rendering engine.", "https://mozilla.github.io/pdf.js/"),
    ("yt-dlp", "Platform & Services", "The Unlicense", "https://unlicense.org", "yt-dlp contributors", "Command-line media extractor powering the self-hosted music resolver bot.", "https://github.com/yt-dlp/yt-dlp"),
    ("FFmpeg", "Platform & Services", "LGPL / GPL", "https://www.ffmpeg.org/legal.html", "FFmpeg team", "Cross-platform audio and video processing framework.", "https://ffmpeg.org"),
    ("Discord.js", "Platform & Services", "Apache-2.0", "https://www.apache.org/licenses/LICENSE-2.0", "Discord.js contributors", "JavaScript interface powering the optional bidirectional Discord chat bridge.", "https://discord.js.org"),
    ("Cloudflare Wrangler & Workers", "Platform & Services", "Apache-2.0", "https://www.apache.org/licenses/LICENSE-2.0", "Cloudflare, Inc.", "Developer tooling and runtime environment for local and edge service orchestration.", "https://developers.cloudflare.com/workers/"),
];

const AGPL_SUMMARY: [(&str, &str); 4] = [
    ("Freedom to Run & Self-Host", "You can run Hoffle on your own private hardware, VPS, or cloud server for your community without paying license fees."),
    ("Freedom to Inspect & Modify", "You have complete access to the source code and can adapt it, add custom bot commands, or customize the UI."),
    ("Copyleft Network Clause (Section 13)", "If you modify Hoffle and offer it as a service over a network, you must provide your modified source code to everyone interacting with it."),
    ("No Warranty", "Hoffle is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY of merchantability or fitness for a particular purpose."),
];

const AGPL_TEXT: &str = "                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007\n\n Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>\n Everyone is permitted to copy and distribute verbatim copies\n of this license document, but changing it is not allowed.\n\n                            Preamble\n\n  The GNU Affero General Public License is a free, copyleft license for\nsoftware and other kinds of works, specifically designed to ensure\ncooperation with the community in the case of network server software.\n\n  The GNU Affero General Public License is designed specifically to ensure\nthat, in such cases, the modified source code becomes available to the\ncommunity. It requires the operator of a network server to provide the\nsource code of the modified version running there to the users of that\nserver. Therefore, public use of a modified version, on a publicly\naccessible server, gives the public access to the source code of the\nmodified version.\n\nSection 13: Remote Network Interaction; Use with the GNU General Public License.\n  Notwithstanding any other provision of this License, if you modify the\nProgram, your modified version must prominently offer all users\ninteracting with it remotely through a computer network (if your version\nsupports such interaction) an opportunity to receive the Corresponding\nSource of your version by providing access to the Corresponding Source\nfrom a network server at no charge, through some standard or customary\nmeans of facilitating copying of software.\n\nThe complete license text is available in the root LICENSE file of this\nrepository, or online at: https://www.gnu.org/licenses/agpl-3.0.html";

impl Shell {
    /// licenses-tab.tsx: Hoffle's AGPL card (the app hides Ko-fi and Sponsors, as the web's native
    /// shell does), then the third-party packages with search and categories.
    fn render_licenses_page(&self, s: &Settings, window: &mut Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let blurple: Hsla = rgb(0x5865f2).into();
        let muted: Hsla = rgb(0x949ba4).into();
        let faint: Hsla = rgb(0x80848e).into();
        let soft: Hsla = rgb(0xc4c9ce).into();
        let edge: Hsla = rgb(0x3f4147).into();
        let width = 772.;
        let link = |id: &str, url: &'static str| div().id(SharedString::from(id.to_string())).cursor_pointer().on_click(move |_, _, cx| cx.open_url(url));
        // The AGPL summaries, two to a row, each row as tall as its taller card.
        let cell_w = (730. - 10.) / 2.;
        let text_lines = |text: &str, size: f32, weight: FontWeight, w: f32| -> usize {
            let mut face = gpui::font(crate::theme::UI_FONT);
            face.weight = weight;
            let mut wrapper = window.text_system().line_wrapper(face, px(size));
            wrapper.wrap_line(&[gpui::LineFragment::text(text)], px(w)).count() + 1
        };
        let mut summary = div().mt(px(16.)).flex().flex_col().gap(px(10.));
        for pair in AGPL_SUMMARY.chunks(2) {
            let lines = pair.iter().map(|(_, d)| text_lines(d, 11., FontWeight::NORMAL, cell_w - 22.)).max().unwrap_or(1);
            let height = 10. + 16. + 4. + lines as f32 * 17.875 + 10. + 2.;
            let mut row = div().flex().gap(px(10.));
            for (title, desc) in pair {
                row = row.child(
                    div()
                        .w(px(cell_w))
                        .h(px(height))
                        .p(px(10.))
                        .rounded(px(8.))
                        .bg(Hsla::from(rgb(0x232428)).opacity(0.8))
                        .border_1()
                        .border_color(edge.opacity(0.4))
                        .flex()
                        .flex_col()
                        .child(div().flex().items_center().gap(px(6.)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(ui::icon("shield-check", 14., blurple)).child(*title))
                        .child(div().mt(px(4.)).text_size(px(11.)).line_height(px(17.875)).text_color(muted).child(*desc)),
                );
            }
            summary = summary.child(row);
        }
        let open = s.agpl_open;
        let hero = div()
            .relative()
            .flex_none()
            .w(px(width))
            .p(px(20.))
            .rounded(px(12.))
            .border_1()
            .border_color(blurple.opacity(0.3))
            .overflow_hidden()
            .flex()
            .flex_col()
            .child(ui::css_background("linear-gradient(135deg, rgba(88, 101, 242, 0.1), #2b2d31 50%, #1e1f22)", 12.))
            .child(
                div()
                    .relative()
                    .flex()
                    .flex_col()
                    .gap(px(12.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(div().size(px(44.)).flex_none().rounded(px(12.)).bg(blurple).flex().items_center().justify_center().child(ui::icon("scale", 24., gpui::white())))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(2.))
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(8.))
                                            .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child("Hoffle Self-Hosted Platform"))
                                            .child(div().px(px(8.)).py(px(2.)).rounded(px(4.)).bg(blurple.opacity(0.3)).border_1().border_color(blurple.opacity(0.5)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xa5b4fc)).child("GNU AGPLv3")),
                                    )
                                    .child(div().text_size(px(12.)).line_height(px(16.)).text_color(muted).child("Copyright © 2026 coxaexs <coxaexs@gmail.com> · Free & Open Source")),
                            ),
                    )
                    .child(
                        div().flex().child(
                            link("lic-source", "https://github.com/Coxaexs/huddle")
                                .px(px(12.))
                                .py(px(6.))
                                .rounded(px(8.))
                                .bg(rgb(0x35373c))
                                .hover(|s| s.bg(rgb(0x3e4046)))
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .text_size(px(12.))
                                .line_height(px(16.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(gpui::white())
                                .child(ui::icon("code-xml", 14., gpui::white()))
                                .child("Source Code")
                                .child(div().opacity(0.7).child(ui::icon("external-link", 12., gpui::white()))),
                        ),
                    ),
            )
            .child(
                div()
                    .relative()
                    .mt(px(12.))
                    .text_size(px(12.))
                    .line_height(px(19.5))
                    .text_color(soft)
                    .child(gpui::StyledText::new("Hoffle is licensed under the GNU Affero General Public License Version 3 (GNU AGPLv3). As a self-hosted platform, this ensures that Hoffle remains free and open source forever, protecting user freedom across both private server deployments and networked services.").with_highlights([(29..85, gpui::HighlightStyle { font_weight: Some(FontWeight::BOLD), ..Default::default() })])),
            )
            .child(summary.relative())
            .child(
                div()
                    .relative()
                    .mt(px(16.))
                    .pt(px(12.))
                    .border_t_1()
                    .border_color(edge.opacity(0.5))
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(
                        div()
                            .id("lic-agpl")
                            .flex()
                            .items_center()
                            .justify_between()
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(rgb(0xa5b4fc))
                            .cursor_pointer()
                            .hover(|s| s.text_color(gpui::white()))
                            .child(div().flex().items_center().gap(px(6.)).child(ui::icon("scale", 14., rgb(0xa5b4fc))).child(if open { "Hide full GNU AGPLv3 text" } else { "Read full GNU AGPLv3 terms and conditions" }))
                            .child(ui::icon(if open { "chevron-up" } else { "chevron-down" }, 16., rgb(0xa5b4fc)))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(s) = this.settings.as_mut() {
                                    s.agpl_open = !s.agpl_open;
                                    cx.notify();
                                }
                            })),
                    )
                    .when(open, |d| {
                        d.child(
                            div()
                                .id("lic-agpl-text")
                                .mt(px(8.))
                                .max_h(px(288.))
                                .overflow_y_scroll()
                                .p(px(12.))
                                .rounded(px(8.))
                                .bg(rgb(0x18191c))
                                .border_1()
                                .border_color(edge.opacity(0.6))
                                .font_family(crate::theme::MONO_FONT)
                                .text_size(px(11.))
                                .line_height(px(17.875))
                                .text_color(rgb(0xb5bac1))
                                .children(AGPL_TEXT.split('\n').map(|l| div().min_h(px(17.875)).child(if l.is_empty() { " ".to_string() } else { l.to_string() }))),
                        )
                    }),
            );
        // Third-party attributions.
        let query = s.license_search.read(cx).text().trim().to_lowercase();
        let category = s.license_category;
        let shown: Vec<_> = PACKAGES
            .iter()
            .filter(|p| category == "all" || p.1 == category)
            .filter(|p| query.is_empty() || [p.0, p.2, p.4, p.5].iter().any(|f| f.to_lowercase().contains(&query)))
            .collect();
        let focused = gpui::Focusable::focus_handle(s.license_search.read(cx), cx).is_focused(window);
        let mut pills = div().pt(px(4.)).flex().flex_wrap().gap(px(6.));
        for cat in ["all", "Core & UI", "Audio & Graphics", "Documents & Tools", "Platform & Services"] {
            let on = category == cat;
            pills = pills.child(
                div()
                    .id(SharedString::from(format!("lic-cat-{cat}")))
                    .px(px(10.))
                    .py(px(2.))
                    .rounded_full()
                    .bg(if on { blurple } else { rgb(0x2b2d31).into() })
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(if on { gpui::white() } else { muted })
                    .cursor_pointer()
                    .when(!on, |d| d.hover(|s| s.bg(rgb(0x35373c)).text_color(gpui::white())))
                    .child(if cat == "all" { "All Packages" } else { cat })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.settings.as_mut() {
                            s.license_category = cat;
                            cx.notify();
                        }
                    })),
            );
        }
        let card_w = (width - 10.) / 2.;
        let mut grid = div().flex().flex_col().gap(px(10.));
        for pair in shown.chunks(2) {
            let desc_lines = pair.iter().map(|p| text_lines(p.5, 12., FontWeight::NORMAL, card_w - 26.).min(2)).max().unwrap_or(1);
            let height = 12. + 20.3 + 2. + 15.7 + 6. + desc_lines as f32 * 19.5 + 10. + 8. + 15.7 + 12. + 2. + 1.;
            let mut row = div().flex().gap(px(10.));
            for (n, p) in pair.iter().enumerate() {
                let (name, cat, license, license_url, author, desc, project) = **p;
                row = row.child(
                    div()
                        .w(px(card_w))
                        .h(px(height))
                        .p(px(12.))
                        .rounded(px(8.))
                        .bg(Hsla::from(rgb(0x2b2d31)).opacity(0.8))
                        .border_1()
                        .border_color(edge.opacity(0.5))
                        .flex()
                        .flex_col()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .child(
                                    div()
                                        .flex()
                                        .items_start()
                                        .justify_between()
                                        .gap(px(8.))
                                        .child(div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(name))
                                        .child(
                                            link(&format!("lic-l-{name}-{n}"), license_url)
                                                .px(px(6.))
                                                .py(px(2.))
                                                .rounded(px(4.))
                                                .bg(rgb(0x1e1f22))
                                                .border_1()
                                                .border_color(edge)
                                                .flex()
                                                .items_center()
                                                .gap(px(4.))
                                                .font_family(crate::theme::MONO_FONT)
                                                .text_size(px(10.))
                                                .line_height(px(14.3))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(blurple)
                                                .hover(|s| s.text_color(rgb(0x7983f5)))
                                                .child(license)
                                                .child(ui::icon("external-link", 10., blurple)),
                                        ),
                                )
                                .child(div().mt(px(2.)).text_size(px(11.)).line_height(px(15.7)).text_color(faint).child(author))
                                .child(div().mt(px(6.)).text_size(px(12.)).line_height(px(19.5)).text_color(soft).line_clamp(2).child(desc)),
                        )
                        .child(
                            div()
                                .mt(px(10.))
                                .pt(px(8.))
                                .border_t_1()
                                .border_color(edge.opacity(0.3))
                                .flex()
                                .items_center()
                                .justify_between()
                                .text_size(px(11.))
                                .line_height(px(15.7))
                                .child(div().text_color(faint).child(cat))
                                .child(
                                    link(&format!("lic-p-{name}-{n}"), project)
                                        .flex()
                                        .items_center()
                                        .gap(px(4.))
                                        .text_color(muted)
                                        .hover(|s| s.text_color(gpui::white()))
                                        .child("Visit Project")
                                        .child(ui::icon("external-link", 11., muted)),
                                ),
                        ),
                );
            }
            grid = grid.child(row);
        }
        if shown.is_empty() {
            grid = grid.child(div().py(px(32.)).flex().justify_center().text_size(px(12.)).text_color(faint).child(format!("No dependencies found matching \"{query}\".")));
        }
        let third = div()
            .flex_none()
            .mt(px(24.))
            .flex()
            .flex_col()
            .gap(px(12.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().flex().items_center().gap(px(6.)).text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(ui::icon("heart", 15., rgb(0xff6467))).child("Third-Party Open Source Attributions"))
                            .child(div().text_size(px(12.)).line_height(px(16.)).text_color(muted).child("Hoffle is made possible by these essential open source projects and libraries.")),
                    )
                    .child(
                        div()
                            .relative()
                            .w(px(205.))
                            .h(px(30.))
                            .pl(px(32.))
                            .pr(px(12.))
                            .rounded(px(6.))
                            .bg(rgb(0x1e1f22))
                            .border_1()
                            .border_color(if focused { blurple } else { edge })
                            .flex()
                            .items_center()
                            .child(div().absolute().left(px(9.)).top(px(7.)).child(ui::icon("search", 14., faint)))
                            .child(div().flex_1().child(s.license_search.clone())),
                    ),
            )
            .child(pills)
            .child(grid);
        vec![hero.into_any_element(), third.into_any_element()]
    }
}
