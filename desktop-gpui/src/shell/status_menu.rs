//! The presence menu from your user card (chat/status-menu.tsx): online / idle / do not disturb /
//! invisible, set or edit a custom status with its "Clear after" chips, Edit Profile, Settings.
//! And the card's mic / headphones chevrons (user-footer.tsx): pick the input or output device.

use gpui::{AnyElement, Context, FontWeight, Hsla, Rgba, SharedString, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use super::channel_tools::PromptKind;
use crate::i18n::t;
use crate::theme::Theme;
use crate::ui::icon;

/// lib/users.ts PRESENCE: key and colour.
pub(super) const PRESENCE: [(&str, u32); 4] = [("online", 0x3ba55d), ("idle", 0xfaa81a), ("dnd", 0xed4245), ("invisible", 0x80848e)];

pub(super) fn presence_color(status: &str) -> Rgba {
    rgb(PRESENCE.iter().find(|(k, _)| *k == status).map_or(0x3ba55d, |(_, c)| *c))
}

/// lib/status-clear.ts STATUS_CLEAR_CHOICES.
const CLEAR_CHOICES: [&str; 5] = ["30m", "1h", "4h", "today", "never"];

/// statusClearAfterMs(): how long from now; "today" runs to local midnight; None keeps it.
fn clear_after_ms(choice: &str) -> Option<i64> {
    match choice {
        "30m" => Some(30 * 60_000),
        "1h" => Some(60 * 60_000),
        "4h" => Some(4 * 60 * 60_000),
        "today" => {
            let now = chrono::Local::now();
            let midnight = (now.date_naive() + chrono::Days::new(1)).and_hms_opt(0, 0, 0)?.and_local_timezone(chrono::Local).earliest()?;
            Some((midnight - now).num_milliseconds())
        }
        _ => None,
    }
}

/// The "Clear after" choice, kept on this computer like the web keeps it in localStorage.
fn clear_path() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("Hoffle Lite").join("status-clear-after"))
}

pub(super) fn load_clear_choice() -> String {
    clear_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| CLEAR_CHOICES.contains(&s.as_str()))
        .unwrap_or_else(|| "never".into())
}

fn save_clear_choice(choice: &str) {
    if let Some(path) = clear_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, choice);
    }
}

impl Shell {
    /// Your presence: what you picked, else what the server has stored for you, else online.
    pub(super) fn my_status(&self) -> String {
        if let Some(status) = &self.my_status {
            return status.clone();
        }
        let stored = self.member_anywhere(&self.me.id).map(|m| m.status.clone()).unwrap_or_default();
        if PRESENCE.iter().any(|(k, _)| *k == stored) { stored } else { "online".into() }
    }

    /// Your custom status text, if any.
    pub(super) fn my_custom_status(&self) -> Option<String> {
        match &self.me.custom_status {
            Some(Value::String(text)) if !text.is_empty() => Some(text.clone()),
            Some(Value::Object(o)) => o.get("text").and_then(Value::as_str).filter(|t| !t.is_empty()).map(String::from),
            _ => None,
        }
    }

    pub(super) fn toggle_status_menu(&mut self, cx: &mut Context<Self>) {
        self.status_open = !self.status_open;
        self.device_menu = None;
        cx.notify();
    }

    /// savePresence(): shown at once, then saved; the reply says when a custom status clears.
    fn save_presence(&mut self, patch: Value, cx: &mut Context<Self>) {
        if let Some(status) = patch.get("status").and_then(Value::as_str) {
            self.my_status = Some(status.to_string());
        }
        if let Some(custom) = patch.get("customStatus") {
            self.me.custom_status = custom.as_str().filter(|s| !s.trim().is_empty()).map(|s| Value::String(s.to_string()));
        }
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let saved = cx.background_executor().spawn(async move { client.settings_post("/api/settings/presence", patch) }).await;
            let Ok(saved) = saved else { return };
            let Some(at) = saved.get("customStatusExpiresAt").and_then(Value::as_i64) else { return };
            // The server clears it and tells everyone else; this copy clears at the same moment.
            let wait = at - chrono::Utc::now().timestamp_millis();
            if wait > 0 {
                cx.background_executor().timer(std::time::Duration::from_millis(wait as u64)).await;
            }
            this.update(cx, |this, cx| {
                this.me.custom_status = None;
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn save_custom_status(&mut self, text: String, cx: &mut Context<Self>) {
        // A status typed in clears itself as picked under "Clear after".
        let clear = if text.trim().is_empty() { None } else { clear_after_ms(&self.status_clear) };
        self.save_presence(json!({ "customStatus": text, "clearAfterMs": clear }), cx);
    }

    pub(super) fn render_status_menu(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.status_open {
            return None;
        }
        let current = self.my_status();
        let custom = self.my_custom_status();
        let row = |id: SharedString, active: bool| {
            div()
                .id(id)
                .w_full()
                .flex()
                .items_center()
                .gap(px(9.))
                .px(px(10.))
                .py(px(8.))
                .rounded(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .text_color(Theme::ink())
                .when(active, |d| d.font_weight(FontWeight::BOLD))
                .cursor_pointer()
                .hover(|s| s.bg(Theme::lavender_soft()))
        };
        let slot = |name: &str, size: f32| div().size(px(12.)).flex_none().flex().items_center().justify_center().child(icon(name, size, Theme::muted()));
        let mut menu = div()
            .id("status-menu")
            .occlude()
            .absolute()
            .left(px(66.))
            .bottom(px(73.))
            .min_w(px(294.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::paper())
            .border_1()
            .border_color(Theme::line())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.32), offset: gpui::point(px(0.), px(16.)), blur_radius: px(44.), spread_radius: px(0.) }])
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.status_open = false;
                cx.notify();
            }));
        for (key, color) in PRESENCE {
            menu = menu.child(
                row(SharedString::from(format!("status-{key}")), current == key)
                    .child(div().size(px(12.)).flex_none().rounded_full().bg(rgb(color)))
                    .child(t(&format!("presence.{key}")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.status_open = false;
                        this.save_presence(json!({ "status": key }), cx);
                    })),
            );
        }
        menu = menu.child(div().h(px(1.)).mx(px(2.)).my(px(5.)).bg(Theme::line()));
        let value = custom.clone().unwrap_or_default();
        menu = menu.child(
            row("status-custom".into(), false).child(slot("pencil", 13.)).child(t(if custom.is_some() { "status.edit" } else { "status.set" })).on_click(cx.listener(move |this, _, window, cx| {
                this.status_open = false;
                this.open_prompt(
                    PromptKind::CustomStatus,
                    t("status.custom.title"),
                    t("status.custom.message"),
                    value.clone(),
                    &t("status.custom.placeholder"),
                    &t("status.custom.save"),
                    None,
                    window,
                    cx,
                );
            })),
        );
        // StatusClearPicker: applies to the status you have now, and to the next one you set.
        // One row as on the web (glyphs come out a few px wider here, so the menu grows instead).
        let mut chips = div().flex().gap(px(4.)).mt(px(4.));
        for choice in CLEAR_CHOICES {
            let active = self.status_clear == choice;
            chips = chips.child(
                div()
                    .id(SharedString::from(format!("status-clear-{choice}")))
                    .px(px(7.))
                    .py(px(2.))
                    .rounded_full()
                    .border_1()
                    .border_color(if active { gpui::transparent_black() } else { Hsla::from(Theme::line()) })
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .when(active, |d| d.bg(Theme::lavender()).text_color(rgb(0x111111)).font_weight(FontWeight::BOLD))
                    .cursor_pointer()
                    .child(t(&format!("status.clear.{choice}")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.status_clear = choice.to_string();
                        save_clear_choice(choice);
                        if this.my_custom_status().is_some() {
                            this.save_presence(json!({ "clearAfterMs": clear_after_ms(choice) }), cx);
                        }
                        cx.notify();
                    })),
            );
        }
        menu = menu.child(
            div()
                .px(px(10.))
                .pt(px(4.))
                .pb(px(8.))
                .text_size(px(11.))
                .line_height(px(16.5))
                .text_color(Theme::muted())
                .child(div().child(t(if custom.is_some() { "status.clear.after" } else { "status.clear.newAfter" })))
                .child(chips),
        );
        for (id, name, label) in [("status-profile", "user", "status.editProfile"), ("status-settings", "settings", "common.settings")] {
            menu = menu.child(row(id.into(), false).child(slot(name, 14.)).child(t(label)).on_click(cx.listener(|this, _, window, cx| {
                this.status_open = false;
                this.open_settings(window, cx);
            })));
        }
        Some(gpui::deferred(menu).with_priority(2).into_any_element())
    }

    /// The mic or headphones chevron: the device list, read when it opens.
    pub(super) fn toggle_device_menu(&mut self, which: &'static str, cx: &mut Context<Self>) {
        self.status_open = false;
        self.device_menu = if self.device_menu == Some(which) { None } else { Some(which) };
        if self.device_menu.is_some() {
            cx.spawn(async move |this, cx| {
                let found = cx.background_executor().spawn(async move { crate::voice::list_devices() }).await;
                this.update(cx, |this, cx| {
                    this.footer_devices = Some(found);
                    cx.notify();
                })
                .ok();
            })
            .detach();
        }
        cx.notify();
    }

    /// The same saved choice as Settings → Voice & Video, switched live in a call.
    fn choose_device(&mut self, which: &str, id: String, cx: &mut Context<Self>) {
        let mut prefs = crate::voice::load_prefs();
        let id = (!id.is_empty()).then_some(id);
        if which == "mic" {
            prefs.input = id;
        } else {
            prefs.output = id;
        }
        crate::voice::save_prefs(&prefs);
        if let Some(s) = self.settings.as_mut() {
            s.audio.input = prefs.input.clone();
            s.audio.output = prefs.output.clone();
        }
        self.voice.send(crate::voice::VoiceCmd::Audio(prefs));
        self.device_menu = None;
        cx.notify();
    }

    pub(super) fn render_device_menu(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let which = self.device_menu?;
        let prefs = crate::voice::load_prefs();
        let selected = if which == "mic" { prefs.input } else { prefs.output }.unwrap_or_default();
        let (mics, speakers) = self.footer_devices.clone().unwrap_or_default();
        let list = if which == "mic" { mics } else { speakers };
        let mut menu = div()
            .id("device-menu")
            .occlude()
            .absolute()
            .left(px(9.))
            .bottom(px(68.))
            .w(px(282.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::paper())
            .border_1()
            .border_color(Theme::line())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) }])
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.device_menu = None;
                cx.notify();
            }))
            .child(
                div()
                    .px(px(8.))
                    .py(px(6.))
                    .text_size(px(10.))
                    .line_height(px(15.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::muted())
                    .child(t(if which == "mic" { "footer.inputDevice" } else { "footer.outputDevice" })),
            );
        let entries = std::iter::once((String::new(), t("footer.systemDefault"))).chain(list.into_iter().filter(|(id, _)| id != "default"));
        for (n, (id, name)) in entries.enumerate() {
            let active = id == selected;
            menu = menu.child(
                div()
                    .id(SharedString::from(format!("device-{n}")))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .px(px(10.))
                    .py(px(7.))
                    .rounded(px(6.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .text_color(if active { Theme::lavender() } else { Theme::ink() })
                    .when(active, |d| d.font_weight(FontWeight::BOLD).child(icon("check", 14., Theme::lavender())))
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()))
                    .child(div().min_w_0().truncate().child(name))
                    .on_click(cx.listener(move |this, _, _, cx| this.choose_device(which, id.clone(), cx))),
            );
        }
        Some(gpui::deferred(menu).with_priority(2).into_any_element())
    }

    /// Development: HOFFLE_DEV_STATUS=menu|mic|speaker opens that menu.
    pub(super) fn dev_status_menu(&mut self, cx: &mut Context<Self>) {
        static DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        let Ok(which) = std::env::var("HOFFLE_DEV_STATUS") else { return };
        if DONE.swap(true, std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        match which.as_str() {
            "mic" => self.toggle_device_menu("mic", cx),
            "speaker" => self.toggle_device_menu("speaker", cx),
            _ => self.toggle_status_menu(cx),
        }
    }
}
