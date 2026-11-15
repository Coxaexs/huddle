//! Server Settings → Integrations (server-settings/integrations-tab.tsx with feeds-settings,
//! webhooks-settings, discord-bridge-settings, dnd-settings and game-server-settings): the app cards,
//! Feeds, Webhooks, the Discord Bridge, Bots, Tabletop, the Minecraft server and the developer note.

use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::rc::Rc;

use gpui::{AnyElement, AppContext as _, Context, Entity, Focusable as _, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::t;
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::{DISPLAY_FONT, MONO_FONT, Theme, mix};
use crate::ui;

/// What a confirm in this tab does once accepted.
#[derive(Clone)]
pub(super) enum IntegAct {
    StopFeed(String, String),
    RotateHook(String),
    DeleteHook(String, String),
    RemoveBot(String, String),
    BridgeOff,
}

/// The tab's state, made when the settings open.
pub(super) struct Integ {
    loading: RefCell<HashSet<&'static str>>,
    bots: Option<Vec<Value>>,
    /// `{feeds, channels, max}`; Null when the list answered with an error (the panel hides).
    feeds: Option<Value>,
    hooks: Option<Value>,
    bridge: Option<Value>,
    dnd: Option<Value>,
    game: Option<Value>,
    revealed: HashSet<String>,
    creating_bot: bool,
    feed_url: Entity<TextInput>,
    hook_avatar: Entity<TextInput>,
    hook_name: Entity<TextInput>,
    combat: Entity<TextInput>,
    explore: Entity<TextInput>,
    gs_host: Entity<TextInput>,
    gs_port: Entity<TextInput>,
    gs_rcon_port: Entity<TextInput>,
    gs_rcon_pw: Entity<TextInput>,
    feed_channel: Option<String>,
    hook_channel: Option<String>,
    /// The open dropdown: "feed-ch", "hook-ch", "feed-<id>", "hook-<id>" or "pair-<channel>".
    open: Option<String>,
    feed_busy: bool,
    feed_error: String,
    hook_busy: bool,
    bridge_busy: bool,
    bridge_error: String,
    dnd_saving: bool,
    gs_saving: bool,
    dev_open: bool,
    /// Where each panel sits on the page (window y, and the scroll offset then), for goTo().
    spots: Rc<RefCell<std::collections::HashMap<&'static str, f32>>>,
    flash: Option<(&'static str, std::time::Instant)>,
    dev_scrolled: Cell<bool>,
    _subs: Vec<Subscription>,
}

impl Integ {
    pub(super) fn new(window: &mut Window, cx: &mut Context<Shell>) -> Self {
        // Chrome's own placeholder: the text colour at half strength.
        let look = |size: f32, line: f32| Look { size, line_height: line, height: line, color: Theme::ink().into(), placeholder: Hsla::from(Theme::ink()).opacity(0.5) };
        let input = |placeholder: &str, size: f32, line: f32, cx: &mut Context<Shell>| {
            let placeholder = placeholder.to_string();
            cx.new(|cx| TextInput::new(placeholder, cx).look(look(size, line)))
        };
        let feed_url = input("Paste a link: YouTube channel, subreddit, blog, Bluesky…", 14., 21., cx);
        let hook_avatar = cx.new(|cx| {
            let mut i = TextInput::new("", cx).look(look(14., 21.)).centered();
            i.set_text("🪝", cx);
            i
        });
        let hook_name = input("Name it, e.g. GitHub", 14., 21., cx);
        let combat = input("e.g. epic battle music", 12., 18., cx);
        let explore = input("e.g. tavern ambience", 12., 18., cx);
        let gs_host = input("mc.example.com", 12., 18., cx);
        let gs_port = input("25565", 12., 18., cx);
        let gs_rcon_port = input("25575", 12., 18., cx);
        let gs_rcon_pw = cx.new(|cx| TextInput::new("", cx).look(look(12., 18.)).masked());
        let mut subs = Vec::new();
        // Lengths and digits as the web's inputs keep them (maxLength, replace(/\D/g, "")).
        let limits: [(&Entity<TextInput>, usize, bool); 9] = [
            (&feed_url, 2000, false),
            (&hook_avatar, 8, false),
            (&hook_name, 40, false),
            (&combat, 300, false),
            (&explore, 300, false),
            (&gs_host, 253, false),
            (&gs_port, 6, true),
            (&gs_rcon_port, 6, true),
            (&gs_rcon_pw, 200, false),
        ];
        for (entity, max, digits) in limits {
            subs.push(cx.subscribe_in(entity, window, move |this, input, event, _, cx| {
                match event {
                    InputEvent::Changed => {
                        let text = input.read(cx).text();
                        let kept: String = text.chars().filter(|c| !digits || c.is_ascii_digit()).take(max).collect();
                        if kept != text {
                            input.update(cx, |i, cx| i.set_text(kept, cx));
                        }
                    }
                    InputEvent::Escape => this.server_settings = None,
                    InputEvent::Submit => {}
                }
                cx.notify();
            }));
        }
        subs.push(cx.subscribe_in(&feed_url, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Submit) {
                this.follow_feed(cx);
            }
        }));
        subs.push(cx.subscribe_in(&hook_name, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Submit) {
                this.create_hook(cx);
            }
        }));
        Self {
            loading: Default::default(),
            bots: None,
            feeds: None,
            hooks: None,
            bridge: None,
            dnd: None,
            game: None,
            revealed: HashSet::new(),
            creating_bot: false,
            feed_url,
            hook_avatar,
            hook_name,
            combat,
            explore,
            gs_host,
            gs_port,
            gs_rcon_port,
            gs_rcon_pw,
            feed_channel: None,
            hook_channel: None,
            open: None,
            feed_busy: false,
            feed_error: String::new(),
            hook_busy: false,
            bridge_busy: false,
            bridge_error: String::new(),
            dnd_saving: false,
            gs_saving: false,
            dev_open: false,
            spots: Default::default(),
            flash: None,
            dev_scrolled: Cell::new(false),
            _subs: subs,
        }
    }
}

/// `ago()` in feeds-settings.tsx.
fn feed_ago(iso: Option<&str>) -> String {
    let Some(at) = iso.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) else { return "nothing yet".into() };
    let minutes = ((chrono::Utc::now() - at.with_timezone(&chrono::Utc)).num_seconds() as f64 / 60.).round() as i64;
    if minutes < 1 {
        "just now".into()
    } else if minutes < 60 {
        format!("{minutes}m ago")
    } else if minutes < 48 * 60 {
        format!("{}h ago", (minutes as f64 / 60.).round() as i64)
    } else {
        local_date(at)
    }
}

/// `ago()` in discord-bridge-settings.tsx.
fn bridge_ago(iso: Option<&str>) -> String {
    let Some(at) = iso.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) else { return "never".into() };
    let seconds = (chrono::Utc::now() - at.with_timezone(&chrono::Utc)).num_seconds().max(0);
    if seconds < 60 {
        return "just now".into();
    }
    let minutes = (seconds as f64 / 60.).round() as i64;
    if minutes < 60 {
        return format!("{minutes} min ago");
    }
    let hours = (minutes as f64 / 60.).round() as i64;
    if hours < 48 {
        return format!("{hours} h ago");
    }
    local_date(at)
}

/// toLocaleDateString() in English: 10/31/2026.
fn local_date(at: chrono::DateTime<chrono::FixedOffset>) -> String {
    let local = at.with_timezone(&chrono::Local);
    local.format("%-m/%-d/%Y").to_string()
}

/// new Date(...).toLocaleString(): 10/31/2026, 4:05:09 PM.
fn local_time(iso: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(iso).map(|at| at.with_timezone(&chrono::Local).format("%-m/%-d/%Y, %-I:%M:%S %p").to_string()).unwrap_or_default()
}

fn plain(name: &str) -> String {
    name.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect()
}

/// Discord's voice (2) and stage (13) channel types.
fn discord_voice(kind: i64) -> bool {
    kind == 2 || kind == 13
}

fn fits(kind: &str, discord_type: i64) -> bool {
    kind == "voice" || kind == "stage" || !discord_voice(discord_type)
}

const OPTIONS: [(&str, &str, &str); 7] = [
    ("reactions", "Reactions", "Each Discord person's reaction shows here under their name; Hoffle reactions show on Discord."),
    ("edits", "Edits and deletes", "Changing or deleting a message changes it on the other side too."),
    ("files", "Files and pictures", "Copied across, so they still work after Discord's links expire."),
    ("threads", "Threads", "A thread on one side opens the same thread on the other."),
    ("typing", "Typing", "\"Someone is typing…\" crosses over."),
    ("mirrorDeletes", "Deletes go both ways", "Deleting the copy of a message on either side deletes the original too. On Discord the bot needs Manage Messages."),
    (
        "voice",
        "Voice chat",
        "A voice room paired with a Discord voice channel carries the call: each Discord person shows here as their own seat, and everyone here is heard on Discord through the bot (or each as their own voice, with voice helpers).",
    ),
];

fn permission_words(name: &str) -> String {
    match name {
        "ViewChannel" => "see the channel",
        "SendMessages" => "send messages",
        "ReadMessageHistory" => "read message history",
        "ManageWebhooks" => "manage webhooks",
        "AddReactions" => "add reactions",
        "AttachFiles" => "attach files",
        "EmbedLinks" => "embed links",
        "ManageMessages" => "manage messages",
        "CreatePublicThreads" => "create threads",
        "SendMessagesInThreads" => "send in threads",
        "Connect" => "join the voice channel",
        "Speak" => "speak in the voice channel",
        other => other,
    }
    .to_string()
}

const FEED_EXAMPLES: [(&str, &str); 5] = [
    ("A YouTube channel", "https://www.youtube.com/@veritasium"),
    ("A subreddit", "https://www.reddit.com/r/boardgames"),
    ("A Bluesky account", "https://bsky.app/profile/bsky.app"),
    ("GitHub releases", "https://github.com/godotengine/godot"),
    ("Any blog or news site", "https://www.theverge.com"),
];

fn feed_icon(kind: &str) -> &'static str {
    match kind {
        "youtube" => "▶️",
        "reddit" => "👽",
        "bluesky" => "🦋",
        "mastodon" => "🐘",
        "github" => "🐙",
        _ => "📰",
    }
}

fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn arr(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_string()
}

/// `.discord-btn` in the settings: kind is "primary", "secondary" or "danger"; padding x/y.
fn btn(id: impl Into<SharedString>, kind: &str, pad_x: f32, pad_y: f32, enabled: bool) -> gpui::Stateful<gpui::Div> {
    let ink: Hsla = Theme::ink().into();
    let on_accent: Hsla = rgb(0x15121f).into();
    let coral: Hsla = Theme::coral().into();
    let under: Hsla = Theme::chat_bg().into();
    let (fill, text, ring): (Hsla, Hsla, Option<Hsla>) = match kind {
        "primary" => (Theme::lavender().into(), on_accent, None),
        "danger" => (coral.opacity(0.14), coral, Some(coral.opacity(0.35))),
        _ => (Theme::card().into(), ink, Some(Theme::line().into())),
    };
    let base = div()
        .id(id.into())
        .flex_none()
        .px(px(pad_x))
        .py(px(pad_y))
        .rounded(px(8.))
        .flex()
        .items_center()
        .justify_center()
        .gap(px(6.))
        .text_size(px(13.5))
        .line_height(px(20.25))
        .font_weight(FontWeight::SEMIBOLD)
        .whitespace_nowrap()
        .when_some(ring, |d, ring| d.border_1().border_color(ring).px(px(pad_x - 1.)).py(px(pad_y - 1.)));
    if enabled {
        let hover_fill: Hsla = match kind {
            "primary" => mix(Theme::lavender(), 0.86, Theme::ink()),
            "danger" => coral,
            _ => mix(Theme::card(), 0.87, Theme::ink()),
        };
        let hover_text: Hsla = if kind == "danger" { gpui::white() } else { text };
        base.bg(fill).text_color(text).cursor_pointer().hover(move |s| s.bg(hover_fill).text_color(hover_text))
    } else {
        // opacity: .5 on the whole button (see ui::faded).
        ui::faded(base, mix(fill, 1., under), text, under).when_some(ring, |d, ring| d.border_color(ring.opacity(ring.a * 0.5)))
    }
}

/// Chrome's checkbox with `accent-color: var(--lavender)` (13px).
fn lavender_box(on: bool) -> gpui::Div {
    div()
        .flex_none()
        .mt(px(3.))
        .size(px(13.))
        .rounded(px(2.))
        .when(on, |d| d.bg(Theme::lavender()).flex().items_center().justify_center().child(ui::icon("check", 10., rgb(0x15121f))))
        .when(!on, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585)))
}

/// A paragraph with `<code>` pieces (mono on surface-2), at one size.
fn with_code(parts: &[(&str, bool)], size: f32, line: f32, color: Hsla, code_bg: Option<Hsla>) -> gpui::StyledText {
    let mut text = String::new();
    let mut runs = Vec::new();
    for (piece, code) in parts {
        text.push_str(piece);
        let mut face = gpui::font(if *code { MONO_FONT } else { crate::theme::UI_FONT });
        face.weight = FontWeight::NORMAL;
        runs.push(gpui::TextRun {
            len: piece.len(),
            font: face,
            color: if *code { Theme::ink().into() } else { color },
            background_color: if *code { code_bg } else { None },
            underline: None,
            strikethrough: None,
        });
    }
    let _ = (size, line);
    gpui::StyledText::new(SharedString::from(text)).with_runs(runs)
}

impl Shell {
    fn integ(&mut self) -> Option<&mut Integ> {
        self.server_settings.as_mut().map(|s| &mut s.integ)
    }

    /// Fetches one panel's data once ("bots", "feeds", "hooks", "bridge", "dnd", "game").
    fn integ_load(&self, kind: &'static str, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        if !st.integ.loading.borrow_mut().insert(kind) {
            return;
        }
        let sid = enc(&st.server_id_pub());
        let path = match kind {
            "bots" => format!("/api/servers/{sid}/bots"),
            "feeds" => format!("/api/feeds?serverId={sid}"),
            "hooks" => format!("/api/webhooks?serverId={sid}"),
            "bridge" => format!("/api/servers/{sid}/discord-bridge"),
            "dnd" => format!("/api/integrations/dnd/settings?serverId={sid}"),
            _ => format!("/api/game-servers?serverId={sid}"),
        };
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let Some(i) = this.integ() else { return };
                i.loading.borrow_mut().remove(kind);
                let value = result.unwrap_or(Value::Null);
                match kind {
                    "bots" => i.bots = Some(arr(&value)),
                    "feeds" => {
                        if i.feed_channel.is_none() {
                            i.feed_channel = value["channels"][0]["id"].as_str().map(String::from);
                        }
                        i.feeds = Some(value);
                    }
                    "hooks" => {
                        if i.hook_channel.is_none() {
                            i.hook_channel = value["channels"][0]["id"].as_str().map(String::from);
                        }
                        // The Discord bridge's own webhooks are run from its panel, not here.
                        let mut value = value;
                        if let Some(list) = value["webhooks"].as_array_mut() {
                            list.retain(|h| h["source"] != "discord-bridge");
                        }
                        i.hooks = Some(value);
                    }
                    "bridge" => i.bridge = Some(value),
                    "dnd" => {
                        let (combat, explore) = (s(&value["combatMusic"]), s(&value["exploreMusic"]));
                        let (c, e) = (i.combat.clone(), i.explore.clone());
                        i.dnd = Some(value);
                        c.update(cx, |x, cx| x.set_text(combat, cx));
                        e.update(cx, |x, cx| x.set_text(explore, cx));
                    }
                    _ => {
                        let settings = value["settings"].clone();
                        if settings.is_object() {
                            let host = s(&settings["host"]);
                            let port = settings["port"].as_i64().map(|p| p.to_string()).unwrap_or_default();
                            let rcon = settings["rconPort"].as_i64().map(|p| p.to_string()).unwrap_or_default();
                            let (h, p, r) = (i.gs_host.clone(), i.gs_port.clone(), i.gs_rcon_port.clone());
                            h.update(cx, |x, cx| x.set_text(host, cx));
                            p.update(cx, |x, cx| x.set_text(port, cx));
                            r.update(cx, |x, cx| x.set_text(rcon, cx));
                        }
                        i.game = Some(if value.is_null() { json!({ "configured": false }) } else { value });
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn integ_reload(&mut self, kind: &'static str, cx: &mut Context<Self>) {
        if let Some(i) = self.integ() {
            match kind {
                "bots" => i.bots = None,
                "bridge" => i.bridge = None,
                _ => {}
            }
        }
        self.integ_load(kind, cx);
    }

    /// goTo(): scrolls to a panel, flashes it and puts the cursor in its first box.
    fn integ_go_to(&mut self, id: &'static str, window: &mut Window, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_mut() else { return };
        let Some(&content_y) = st.integ.spots.borrow().get(id) else { return };
        let max = f32::from(st.main_scroll.max_offset().height);
        let target = (content_y - 24.).clamp(0., max.max(0.));
        st.main_scroll.set_offset(gpui::point(px(0.), px(-target)));
        st.integ.flash = Some((id, std::time::Instant::now()));
        let focus = match id {
            "feeds" => Some(st.integ.feed_url.clone()),
            "webhooks" => Some(st.integ.hook_name.clone()),
            _ => None,
        };
        if let Some(input) = focus {
            window.focus(&input.focus_handle(cx));
        }
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(1400)).await;
            this.update(cx, |this, cx| {
                if let Some(i) = this.integ() {
                    i.flash = None;
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// A call whose answer replaces a panel's data; errors become the notice (or `on_error`).
    fn integ_call(&mut self, call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static, then: impl FnOnce(&mut Self, Value, &mut Context<Self>) + 'static, on_error: impl FnOnce(&mut Self, String, &mut Context<Self>) + 'static, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { call(&client) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => then(this, v, cx),
                    Err(e) => on_error(this, e.to_string(), cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn follow_feed(&mut self, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let i = &st.integ;
        let url = i.feed_url.read(cx).text().trim().to_string();
        let Some(data) = i.feeds.as_ref() else { return };
        let full = arr(&data["feeds"]).len() as i64 >= data["max"].as_i64().unwrap_or(0);
        let Some(channel) = i.feed_channel.clone() else { return };
        if i.feed_busy || url.is_empty() || full {
            return;
        }
        let server = st.server_id_pub();
        let channel_name = arr(&data["channels"]).iter().find(|c| c["id"] == channel.as_str()).map(|c| s(&c["name"])).unwrap_or_else(|| "deleted channel".into());
        if let Some(i) = self.integ() {
            i.feed_busy = true;
            i.feed_error.clear();
        }
        let body = json!({ "serverId": server, "channelId": channel, "url": url });
        self.integ_call(
            move |c| c.settings_post("/api/feeds", body),
            move |this, v, cx| {
                let title = s(&v["feed"]["title"]);
                if let Some(i) = this.integ() {
                    i.feed_busy = false;
                    if let Some(list) = i.feeds.as_mut().and_then(|d| d["feeds"].as_array_mut()) {
                        list.push(v["feed"].clone());
                    }
                    let input = i.feed_url.clone();
                    input.update(cx, |x, cx| x.clear(cx));
                }
                this.server_notice(format!("#{channel_name} now follows {title}."), cx);
            },
            |this, e, _| {
                if let Some(i) = this.integ() {
                    i.feed_busy = false;
                    i.feed_error = if e.is_empty() { "Could not follow that.".into() } else { e };
                }
            },
            cx,
        );
    }

    fn move_feed(&mut self, feed: Value, channel: String, cx: &mut Context<Self>) {
        let names = self.integ().and_then(|i| i.feeds.as_ref()).map(|d| arr(&d["channels"])).unwrap_or_default();
        let name = names.iter().find(|c| c["id"] == channel.as_str()).map(|c| s(&c["name"])).unwrap_or_else(|| "deleted channel".into());
        let body = json!({ "id": feed["id"], "channelId": channel });
        let title = s(&feed["title"]);
        self.integ_call(
            move |c| c.settings_patch("/api/feeds", body),
            move |this, v, cx| {
                if let Some(list) = this.integ().and_then(|i| i.feeds.as_mut()).and_then(|d| d["feeds"].as_array_mut()) {
                    for f in list.iter_mut() {
                        if f["id"] == v["feed"]["id"] {
                            *f = v["feed"].clone();
                        }
                    }
                }
                this.server_notice(format!("{title} now posts to #{name}."), cx);
            },
            |this, e, cx| this.server_notice(if e.is_empty() { "Could not move the feed.".into() } else { e }, cx),
            cx,
        );
    }

    fn create_hook(&mut self, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let i = &st.integ;
        let name = i.hook_name.read(cx).text().trim().to_string();
        let avatar = i.hook_avatar.read(cx).text();
        let Some(data) = i.hooks.as_ref() else { return };
        let used = arr(&data["webhooks"]).iter().filter(|h| h["source"].is_null()).count() as i64;
        let Some(channel) = i.hook_channel.clone() else { return };
        if i.hook_busy || name.is_empty() || used >= data["max"].as_i64().unwrap_or(0) {
            return;
        }
        let body = json!({ "serverId": st.server_id_pub(), "channelId": channel, "name": name, "avatar": avatar });
        if let Some(i) = self.integ() {
            i.hook_busy = true;
        }
        self.integ_call(
            move |c| c.settings_post("/api/webhooks", body),
            |this, v, cx| {
                let url = this.hook_url(&s(&v["webhook"]["path"]));
                if let Some(i) = this.integ() {
                    i.hook_busy = false;
                    if let Some(list) = i.hooks.as_mut().and_then(|d| d["webhooks"].as_array_mut()) {
                        list.push(v["webhook"].clone());
                    }
                    let input = i.hook_name.clone();
                    input.update(cx, |x, cx| x.clear(cx));
                }
                cx.write_to_clipboard(gpui::ClipboardItem::new_string(url));
                this.server_notice("Webhook created and its URL copied.".into(), cx);
            },
            |this, e, cx| {
                if let Some(i) = this.integ() {
                    i.hook_busy = false;
                }
                this.server_notice(if e.is_empty() { "Could not create the webhook.".into() } else { e }, cx);
            },
            cx,
        );
    }

    /// fullUrl(): where a webhook lives.
    fn hook_url(&self, path: &str) -> String {
        self.client.absolute(&format!("/hangout{path}"))
    }

    fn update_hook(&mut self, id: String, patch: Value, notice: Option<String>, cx: &mut Context<Self>) {
        let mut body = patch;
        body["id"] = json!(id);
        self.integ_call(
            move |c| c.settings_patch("/api/webhooks", body),
            move |this, v, cx| {
                if let Some(list) = this.integ().and_then(|i| i.hooks.as_mut()).and_then(|d| d["webhooks"].as_array_mut()) {
                    for h in list.iter_mut() {
                        if h["id"] == v["webhook"]["id"] {
                            *h = v["webhook"].clone();
                        }
                    }
                }
                if let Some(n) = notice {
                    this.server_notice(n, cx);
                }
            },
            |this, e, cx| this.server_notice(if e.is_empty() { "Could not save the webhook.".into() } else { e }, cx),
            cx,
        );
    }

    /// The confirms this tab asks.
    pub(super) fn integ_confirmed(&mut self, act: IntegAct, cx: &mut Context<Self>) {
        match act {
            IntegAct::StopFeed(id, title) => {
                let path = format!("/api/feeds?id={}", enc(&id));
                self.integ_call(
                    move |c| c.settings_delete(&path, json!({})),
                    move |this, _, cx| {
                        if let Some(list) = this.integ().and_then(|i| i.feeds.as_mut()).and_then(|d| d["feeds"].as_array_mut()) {
                            list.retain(|f| f["id"] != id.as_str());
                        }
                        this.server_notice(format!("Stopped following {title}."), cx);
                    },
                    |this, e, cx| this.server_notice(if e.is_empty() { "Could not remove the feed.".into() } else { e }, cx),
                    cx,
                );
            }
            IntegAct::RotateHook(id) => self.update_hook(id, json!({ "rotate": true }), Some("New URL issued. Copy it again to use it.".into()), cx),
            IntegAct::DeleteHook(id, name) => {
                let path = format!("/api/webhooks?id={}", enc(&id));
                self.integ_call(
                    move |c| c.settings_delete(&path, json!({})),
                    move |this, _, cx| {
                        if let Some(list) = this.integ().and_then(|i| i.hooks.as_mut()).and_then(|d| d["webhooks"].as_array_mut()) {
                            list.retain(|h| h["id"] != id.as_str());
                        }
                        this.server_notice(format!("Deleted {name}. Its URL no longer works."), cx);
                    },
                    |this, e, cx| this.server_notice(if e.is_empty() { "Could not delete the webhook.".into() } else { e }, cx),
                    cx,
                );
            }
            IntegAct::RemoveBot(id, name) => {
                let Some(server) = self.server_settings.as_ref().map(|s| s.server_id_pub()) else { return };
                let path = format!("/api/servers/{}/bots/{}", enc(&server), enc(&id));
                self.integ_call(
                    move |c| c.settings_delete(&path, json!({})),
                    move |this, _, cx| {
                        this.integ_reload("bots", cx);
                        this.server_notice(format!("Removed {name}."), cx);
                    },
                    |this, e, cx| this.server_notice(if e.is_empty() { "Could not remove bot.".into() } else { e }, cx),
                    cx,
                );
            }
            IntegAct::BridgeOff => self.bridge_send("DELETE", None, Some("The Discord bridge is off.".into()), cx),
        }
    }

    fn add_bot(&mut self, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let path = format!("/api/servers/{}/bots", enc(&st.server_id_pub()));
        let server_name = self.server().map(|s| s.name.clone()).unwrap_or_default();
        if let Some(i) = self.integ() {
            i.creating_bot = true;
        }
        let body = json!({ "name": "D&D Companion", "kind": "dnd", "avatar": "⚔️", "description": "5e compendium and dice roller" });
        self.integ_call(
            move |c| c.settings_post(&path, body),
            move |this, _, cx| {
                if let Some(i) = this.integ() {
                    i.creating_bot = false;
                }
                this.integ_reload("bots", cx);
                this.server_notice(format!("Added bot D&D Companion to {server_name}!"), cx);
            },
            |this, e, cx| {
                if let Some(i) = this.integ() {
                    i.creating_bot = false;
                }
                this.server_notice(if e.is_empty() { "Could not add bot.".into() } else { e }, cx);
            },
            cx,
        );
    }

    fn toggle_bot(&mut self, id: String, enabled: bool, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let path = format!("/api/servers/{}/bots/{}", enc(&st.server_id_pub()), enc(&id));
        self.integ_call(
            move |c| c.settings_patch(&path, json!({ "enabled": if enabled { 0 } else { 1 } })),
            |this, _, cx| this.integ_reload("bots", cx),
            |this, e, cx| this.server_notice(if e.is_empty() { "Could not toggle bot.".into() } else { e }, cx),
            cx,
        );
    }

    /// send() in the bridge panel: every answer is the whole snapshot.
    fn bridge_send(&mut self, method: &'static str, body: Option<Value>, notice: Option<String>, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let path = format!("/api/servers/{}/discord-bridge", enc(&st.server_id_pub()));
        if let Some(i) = self.integ() {
            i.bridge_busy = true;
            i.bridge_error.clear();
        }
        let body = body.unwrap_or(json!({}));
        self.integ_call(
            move |c| match method {
                "POST" => c.settings_post(&path, body),
                "PATCH" => c.settings_patch(&path, body),
                _ => c.settings_delete(&path, body),
            },
            move |this, v, cx| {
                if let Some(i) = this.integ() {
                    i.bridge_busy = false;
                    i.bridge = Some(v);
                }
                if let Some(n) = notice {
                    this.server_notice(n, cx);
                }
            },
            |this, e, _| {
                if let Some(i) = this.integ() {
                    i.bridge_busy = false;
                    i.bridge_error = if e.is_empty() { "That didn't save.".into() } else { e };
                }
            },
            cx,
        );
    }

    fn set_pairs(&mut self, pairs: Vec<(String, String)>, notice: Option<String>, cx: &mut Context<Self>) {
        let list: Vec<Value> = pairs.into_iter().map(|(c, d)| json!({ "channelId": c, "discordChannelId": d })).collect();
        self.bridge_send("PATCH", Some(json!({ "pairs": list })), notice, cx);
    }

    fn current_pairs(&self) -> Vec<(String, String)> {
        self.server_settings.as_ref().and_then(|s| s.integ.bridge.as_ref()).map(|b| arr(&b["pairs"]).iter().map(|p| (s(&p["channelId"]), s(&p["discordChannelId"]))).collect()).unwrap_or_default()
    }

    fn set_pair(&mut self, channel: String, discord: String, cx: &mut Context<Self>) {
        let mut next = self.current_pairs();
        if discord.is_empty() {
            next.retain(|(c, _)| *c != channel);
        } else {
            // One partner each: taking a Discord channel frees it from elsewhere.
            next.retain(|(c, d)| *d != discord && *c != channel);
            next.push((channel, discord));
        }
        self.set_pairs(next, None, cx);
    }

    fn match_by_name(&mut self, cx: &mut Context<Self>) {
        let Some(data) = self.server_settings.as_ref().and_then(|s| s.integ.bridge.clone()) else { return };
        let discord = arr(&data["discord"]["channels"]);
        let mut next = self.current_pairs();
        let mut taken: HashSet<String> = next.iter().map(|(_, d)| d.clone()).collect();
        let mut added = 0;
        for channel in arr(&data["hoffleChannels"]) {
            let id = s(&channel["id"]);
            if next.iter().any(|(c, _)| *c == id) || channel["private"] == true {
                continue;
            }
            let kind = s(&channel["kind"]);
            let name = plain(&s(&channel["name"]));
            if let Some(m) = discord.iter().find(|d| !taken.contains(&s(&d["id"])) && fits(&kind, d["type"].as_i64().unwrap_or(0)) && plain(&s(&d["name"])) == name) {
                taken.insert(s(&m["id"]));
                next.push((id, s(&m["id"])));
                added += 1;
            }
        }
        if added == 0 {
            self.server_notice("No more channels with the same name on both sides.".into(), cx);
            return;
        }
        self.set_pairs(next, Some(format!("Paired {added} channel{} by name.", if added == 1 { "" } else { "s" })), cx);
    }

    fn save_dnd(&mut self, change: Value, done: String, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let mut body = change;
        body["serverId"] = json!(st.server_id_pub());
        if let Some(i) = self.integ() {
            i.dnd_saving = true;
        }
        self.integ_call(
            move |c| c.settings_post("/api/integrations/dnd/settings", body),
            move |this, v, cx| {
                let notice = match v.get("imported") {
                    Some(imp) if imp.is_object() => {
                        let added = imp["added"].as_i64().unwrap_or(0);
                        let skipped = imp["skipped"].as_i64().unwrap_or(0);
                        format!(
                            "Imported {added} homebrew {}{}.",
                            if added == 1 { "entry" } else { "entries" },
                            if skipped > 0 { format!(" ({skipped} without a name or kind skipped)") } else { String::new() }
                        )
                    }
                    _ => done,
                };
                if let Some(i) = this.integ() {
                    i.dnd_saving = false;
                    i.dnd = Some(v);
                }
                this.server_notice(notice, cx);
            },
            |this, e, cx| {
                if let Some(i) = this.integ() {
                    i.dnd_saving = false;
                }
                this.server_notice(if e.is_empty() { "Could not save the D&D settings.".into() } else { e }, cx);
            },
            cx,
        );
    }

    /// The homebrew prompt's answer.
    pub(super) fn import_homebrew(&mut self, value: String, cx: &mut Context<Self>) {
        if value.trim().is_empty() {
            return;
        }
        match serde_json::from_str::<Value>(&value) {
            Ok(parsed) => {
                let list = if parsed.is_array() { parsed } else { json!([parsed]) };
                self.save_dnd(json!({ "homebrew": list }), "Homebrew imported.".into(), cx);
            }
            Err(_) => self.server_notice("That is not valid JSON.".into(), cx),
        }
    }

    fn save_game_server(&mut self, remove: bool, cx: &mut Context<Self>) {
        let Some(st) = self.server_settings.as_ref() else { return };
        let i = &st.integ;
        let server = st.server_id_pub();
        let body = if remove {
            json!({ "serverId": server, "remove": true })
        } else {
            let port = i.gs_port.read(cx).text();
            let rcon = i.gs_rcon_port.read(cx).text();
            let pw = i.gs_rcon_pw.read(cx).text();
            let mut b = json!({ "serverId": server, "host": i.gs_host.read(cx).text(), "rconPort": if rcon.is_empty() { Value::Null } else { json!(rcon) } });
            if !port.is_empty() {
                b["port"] = json!(port);
            }
            // Left empty, the saved password stays.
            if !pw.is_empty() {
                b["rconPassword"] = json!(pw);
            }
            b
        };
        if let Some(i) = self.integ() {
            i.gs_saving = true;
        }
        self.integ_call(
            move |c| c.settings_post("/api/game-servers", body),
            move |this, v, cx| {
                if let Some(i) = this.integ() {
                    i.gs_saving = false;
                    i.game = Some(v);
                    let inputs = if remove { vec![i.gs_rcon_pw.clone(), i.gs_host.clone(), i.gs_port.clone(), i.gs_rcon_port.clone()] } else { vec![i.gs_rcon_pw.clone()] };
                    for input in inputs {
                        input.update(cx, |x, cx| x.clear(cx));
                    }
                }
                this.server_notice(if remove { "Game server removed.".into() } else { "Game server saved. It shows in the channel list.".into() }, cx);
            },
            |this, e, cx| {
                if let Some(i) = this.integ() {
                    i.gs_saving = false;
                }
                this.server_notice(if e.is_empty() { "Could not save the game server.".into() } else { e }, cx);
            },
            cx,
        );
    }

    fn integ_confirm(&mut self, title: String, text: String, ok: &str, act: IntegAct, cx: &mut Context<Self>) {
        self.confirm = Some(Confirm { title, text, ok: ok.into(), cancel: t("common.cancel"), action: ConfirmAction::Integration(act) });
        cx.notify();
    }

    /// A closed `<select>` and, when open, its list. `key` names it in `Integ::open`.
    #[allow(clippy::too_many_arguments)]
    fn integ_select(&self, key: String, label: String, options: Vec<(String, String)>, w: Option<f32>, h: f32, pad_x: f32, radius: f32, size: f32, enabled: bool, open: bool, on_pick: impl Fn(&mut Self, String, &mut Context<Self>) + 'static, cx: &mut Context<Self>) -> gpui::Div {
        let ink: Hsla = Theme::ink().into();
        let k = key.clone();
        let closed = div()
            .id(SharedString::from(format!("isel-{key}")))
            .h(px(h))
            .when_some(w, |d, w| d.w(px(w)))
            .pl(px(pad_x))
            .pr(px(4.))
            .rounded(px(radius))
            .border_1()
            .border_color(if open { Theme::lavender().into() } else { Hsla::from(Theme::line()) })
            .bg(Theme::paper())
            .flex()
            .items_center()
            .gap(px(4.))
            .text_size(px(size))
            .text_color(ink)
            .when(!enabled, |d| d.opacity(0.5))
            .child(div().flex_1().min_w_0().overflow_hidden().whitespace_nowrap().child(label))
            .child(ui::icon("chevron-down", (size + 1.).min(14.), ink))
            .when(enabled, |d| {
                d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(i) = this.integ() {
                        i.open = if i.open.as_deref() == Some(k.as_str()) { None } else { Some(k.clone()) };
                    }
                    cx.notify();
                }))
            });
        let mut el = div().relative().when_some(w, |d, w| d.w(px(w))).child(closed);
        if open {
            let on_pick = Rc::new(on_pick);
            let mut menu = div().id(SharedString::from(format!("imenu-{key}"))).absolute().top(px(h + 2.)).left_0().min_w(px(w.unwrap_or(160.))).max_h(px(300.)).overflow_y_scroll().p(px(4.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).shadow(ui::card_shadow()).flex().flex_col();
            for (n, (value, text)) in options.into_iter().enumerate() {
                let pick = on_pick.clone();
                menu = menu.child(
                    div()
                        .id(SharedString::from(format!("iopt-{key}-{n}")))
                        .px(px(10.))
                        .py(px(5.))
                        .rounded(px(6.))
                        .text_size(px(size))
                        .text_color(ink)
                        .whitespace_nowrap()
                        .hover(|s| s.bg(gpui::white().opacity(0.08)))
                        .cursor_pointer()
                        .child(text)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(i) = this.integ() {
                                i.open = None;
                            }
                            pick(this, value.clone(), cx);
                            cx.notify();
                        })),
                );
            }
            el = el.child(gpui::deferred(menu).with_priority(3));
        }
        el
    }

    /// The box around a form input (`.integration-form input`).
    fn integ_field(input: &Entity<TextInput>, h: f32, pad: (f32, f32), radius: f32) -> gpui::Div {
        div().h(px(h)).px(px(pad.0)).py(px(pad.1)).rounded(px(radius)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().overflow_hidden().child(div().flex_1().min_w_0().child(input.clone()))
    }

    /// `.integration-section`: a top hairline, 24 above the head, 12 between parts. Records where it sits.
    fn integ_section(&self, id: &'static str, flash: bool) -> gpui::Div {
        let spots = self.server_settings.as_ref().map(|s| (s.integ.spots.clone(), s.main_scroll.clone()));
        div()
            .relative()
            .flex_none()
            .pt(px(24.))
            .border_t_1()
            .border_color(Theme::line())
            .rounded(px(2.))
            .flex()
            .flex_col()
            .gap(px(12.))
            .when(flash, |d| d.bg(Hsla::from(Theme::lavender()).opacity(0.08)))
            .when_some(spots, move |d, (spots, scroll)| {
                d.child(
                    gpui::canvas(
                        move |bounds, _, _| {
                            let content = f32::from(bounds.origin.y) - f32::from(scroll.bounds().origin.y) - f32::from(scroll.offset().y);
                            spots.borrow_mut().insert(id, content);
                        },
                        |_, _, _, _| {},
                    )
                    .absolute()
                    .top_0()
                    .left_0()
                    .size(px(1.)),
                )
            })
    }

    fn integ_head(title: &str, count: Option<String>, text: impl IntoElement) -> gpui::Div {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        div()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(17.))
                    .line_height(px(25.5))
                    .font_weight(FontWeight::BOLD)
                    .text_color(ink)
                    .child(title.to_string())
                    .when_some(count, |d, c| d.child(div().px(px(8.)).py(px(1.)).rounded_full().bg(Theme::card()).text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::SEMIBOLD).text_color(muted).child(c))),
            )
            .child(div().mt(px(4.)).max_w(px(629.)).text_size(px(13.5)).line_height(px(19.575)).text_color(muted).child(text))
    }

    fn integ_empty(text: impl IntoElement) -> gpui::Div {
        div().px(px(16.)).py(px(14.)).rounded(px(12.)).bg(Theme::panel()).text_size(px(13.5)).line_height(px(20.25)).text_color(Theme::muted()).child(text)
    }

    fn integ_row() -> gpui::Div {
        div().flex().items_center().gap(px(12.)).px(px(11.)).py(px(9.)).rounded(px(12.)).bg(Theme::panel()).border_1().border_color(Theme::line())
    }

    /// ServerIntegrationsTab.
    pub(super) fn render_server_integrations(&self, st: &super::server_settings::ServerSettings, server: &crate::model::Server, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let i = &st.integ;
        for kind in ["bots", "feeds", "hooks", "bridge", "dnd", "game"] {
            let missing = match kind {
                "bots" => i.bots.is_none(),
                "feeds" => i.feeds.is_none(),
                "hooks" => i.hooks.is_none(),
                "bridge" => i.bridge.is_none(),
                "dnd" => i.dnd.is_none(),
                _ => i.game.is_none(),
            };
            if missing {
                self.integ_load(kind, cx);
            }
        }
        // HOFFLE_DEV_SS_SCROLL again once everything is in, the page being taller by then.
        if !i.dev_scrolled.get() && i.bots.is_some() && i.feeds.is_some() && i.hooks.is_some() && i.bridge.is_some() && i.dnd.is_some() && i.game.is_some() {
            i.dev_scrolled.set(true);
            if let Some(y) = std::env::var("HOFFLE_DEV_SS_SCROLL").ok().and_then(|v| v.parse::<f32>().ok()) {
                let scroll = st.main_scroll.clone();
                cx.spawn(async move |this, cx| {
                    cx.background_executor().timer(std::time::Duration::from_millis(300)).await;
                    scroll.set_offset(gpui::point(px(0.), px(-y)));
                    this.update(cx, |_, cx| cx.notify()).ok();
                })
                .detach();
            }
        }
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
        let flash = |id: &str| i.flash.is_some_and(|(f, _)| f == id);

        let mut page = div().flex().flex_col().gap(px(28.)).child(
            div()
                .flex()
                .flex_col()
                .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Integrations"))
                .child(div().mt(px(4.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Bring the apps and sites {} already uses into its channels.", server.name))),
        );

        // The app cards: repeat(auto-fill, minmax(250px, 1fr)), gap 12.
        let has_dnd = i.bots.as_ref().is_some_and(|b| b.iter().any(|x| x["kind"] == "dnd"));
        let apps: [(&str, &str, &str, &str, bool); 5] = [
            ("📰", "Feeds", "YouTube channels, subreddits, Bluesky, blogs and GitHub releases, posted as they come out.", "Follow a feed", false),
            ("🪝", "Webhooks", "GitHub, GitLab, CI, uptime monitors, Home Assistant: anything that posts to Discord.", "Make a webhook", false),
            ("⚔️", "D&D Companion", "5e spells, monsters and items in chat, and fair dice for the table.", "Add", has_dnd),
            ("🌉", "Discord Bridge", "Mirror channels with a Discord server both ways: names, pictures, replies, edits, reactions, files and threads.", "Set up", false),
            ("🤖", "Your own bot", "Make a bot in the Developer Portal and share its invite link. discord.py and discord.js bots run here.", "Open", false),
        ];
        let cols = ((main_w + 12.) / 262.).floor().max(1.) as usize;
        // Rows are laid out by hand, so the grid's fractional column width is kept (265.33 at 1180).
        let card_w = (main_w - 12. * (cols as f32 - 1.)) / cols as f32;
        let mut grid = div().flex().flex_col().gap(px(12.));
        for row in apps.chunks(cols) {
            let mut line = div().flex().gap(px(12.));
            for (n, (icon, name, blurb, action, added)) in row.iter().enumerate() {
                let added = *added;
                let enabled = !added && !i.creating_bot;
                let which = *name;
                let button = btn(SharedString::from(format!("app-{n}-{name}")), if added { "secondary" } else { "primary" }, 14., 7., enabled)
                    .when(added, |d| d.child(ui::icon("check", 14., ink)).child("Added"))
                    .when(!added, |d| d.child(*action))
                    .when(enabled, |d| {
                        d.on_click(cx.listener(move |this, _, window, cx| match which {
                            "Feeds" => this.integ_go_to("feeds", window, cx),
                            "Webhooks" => this.integ_go_to("webhooks", window, cx),
                            "Discord Bridge" => this.integ_go_to("bridge", window, cx),
                            "D&D Companion" => this.add_bot(cx),
                            _ => {
                                let url = this.client.absolute("/hangout/developers");
                                cx.open_url(&url);
                            }
                        }))
                    });
                line = line.child(
                    div()
                        .id(SharedString::from(format!("app-card-{name}")))
                        .w(px(card_w))
                        .flex_none()
                        .p(px(15.))
                        .rounded(px(14.))
                        .bg(Theme::panel())
                        .border_1()
                        .border_color(Theme::line())
                        .hover(|s| s.border_color(mix(Theme::lavender(), 0.4, Theme::line())))
                        .flex()
                        .flex_col()
                        .gap(px(10.))
                        .child(
                            div()
                                .flex_1()
                                .flex()
                                .gap(px(12.))
                                .child(div().flex_none().size(px(44.)).rounded(px(12.)).bg(Theme::lavender_soft()).flex().items_center().justify_center().text_size(px(22.)).line_height(px(22.)).child(*icon))
                                .child(
                                    // A space's width of slack: Chrome lets the space after "edits," hang past the
                                    // 177.33px column, gpui's wrapper counts it and breaks the line early.
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .mr(px(-3.5))
                                        .flex()
                                        .flex_col()
                                        .child(div().mb(px(3.)).text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::BOLD).text_color(ink).child(*name))
                                        .child(div().text_size(px(13.)).line_height(px(18.2)).text_color(muted).child(*blurb)),
                                ),
                        )
                        .child(div().flex().child(button)),
                );
            }
            grid = grid.child(line);
        }
        page = page.child(grid);

        page = page.child(self.render_feeds_panel(i, flash("feeds"), cx));
        page = page.child(self.render_hooks_panel(i, flash("webhooks"), cx));
        if let Some(bridge) = self.render_bridge_panel(i, server, flash("bridge"), window, cx) {
            page = page.child(bridge);
        }
        page = page.child(self.render_bots_panel(i, server, cx));
        if let Some(dnd) = self.render_dnd_panel(i, window, cx) {
            page = page.child(dnd);
        }
        if let Some(game) = self.render_game_panel(i, cx) {
            page = page.child(game);
        }

        // For developers.
        let origin = self.client.absolute("");
        let open = i.dev_open;
        let mut dev = div()
            .flex_none()
            .px(px(15.))
            .py(px(13.))
            .rounded(px(12.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .text_size(px(13.5))
            .line_height(px(20.25))
            .text_color(muted)
            .child(
                div()
                    .id("integ-dev")
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(ink)
                    .cursor_pointer()
                    .child(ui::icon("terminal", 16., ink))
                    .child("For developers: the Discord-compatible API")
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(i) = this.integ() {
                            i.dev_open = !i.dev_open;
                        }
                        cx.notify();
                    })),
            );
        if open {
            let code = format!(
                "curl -X POST \"{origin}/hangout/api/v10/channels/<CHANNEL_ID>/messages\" \\\n  -H \"Authorization: Bot <YOUR_BOT_TOKEN>\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{{\"content\": \"Hello from my bot!\"}}'"
            );
            dev = dev
                .child(div().mt(px(13.5)).child("Bots and scripts talk to Hoffle the way they talk to Discord. Send a message:"))
                .child(div().my(px(10.)).p(px(12.)).rounded(px(10.)).bg(Theme::paper()).font_family(MONO_FONT).text_size(px(12.)).line_height(px(18.)).text_color(ink).child(code))
                .child(with_code(&[("Live events come over the gateway at ", false), ("/hangout/api/gateway", true), (", the same as on Discord.", false)], 13.5, 20.25, muted, Some(Theme::card().into())));
        }
        page = page.child(dev);
        page.into_any_element()
    }

    fn render_feeds_panel(&self, i: &Integ, flash: bool, cx: &mut Context<Self>) -> AnyElement {
        let Some(data) = i.feeds.as_ref().filter(|d| d.is_object()) else { return div().into_any_element() };
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let feeds = arr(&data["feeds"]);
        let channels: Vec<(String, String)> = arr(&data["channels"]).iter().map(|c| (s(&c["id"]), format!("#{}", s(&c["name"])))).collect();
        let max = data["max"].as_i64().unwrap_or(0);
        let full = feeds.len() as i64 >= max;
        let mut section = self.integ_section("feeds", flash).child(Self::integ_head("Feeds", Some(format!("{}/{max}", feeds.len())), "New videos, posts and articles show up in a channel by themselves, checked every 15 minutes."));
        if channels.is_empty() {
            section = section.child(Self::integ_empty("This server has no text channel to post into yet."));
        } else {
            let url_ok = !i.feed_url.read(cx).text().trim().is_empty();
            let enabled = !i.feed_busy && url_ok && i.feed_channel.is_some() && !full;
            let label = i.feed_channel.as_ref().and_then(|id| channels.iter().find(|c| &c.0 == id)).map(|c| c.1.clone()).unwrap_or_default();
            section = section.child(
                div()
                    .flex()
                    .gap(px(8.))
                    .child(Self::integ_field(&i.feed_url, 39., (12., 8.), 10.).flex_1().min_w_0())
                    .child(self.integ_select("feed-ch".into(), label, channels.clone(), Some(200.), 39., 12., 10., 14., true, i.open.as_deref() == Some("feed-ch"), |this, v, _| {
                        if let Some(i) = this.integ() {
                            i.feed_channel = Some(v);
                        }
                    }, cx))
                    .child(btn("feed-follow", "primary", 18., 9.5, enabled).child(if i.feed_busy { "Looking…" } else { "Follow" }).when(enabled, |d| d.on_click(cx.listener(|this, _, _, cx| this.follow_feed(cx))))),
            );
        }
        if !i.feed_error.is_empty() {
            section = section.child(div().flex().items_center().gap(px(6.)).text_size(px(13.)).text_color(Theme::coral()).child(ui::icon("triangle-alert", 14., Theme::coral())).child(i.feed_error.clone()));
        }
        if feeds.is_empty() {
            let mut ex = div().flex().flex_wrap().items_center().gap(px(6.)).text_size(px(12.5)).line_height(px(18.75)).text_color(muted).child("Try");
            for (label, value) in FEED_EXAMPLES {
                ex = ex.child(
                    div()
                        .id(SharedString::from(format!("feed-ex-{label}")))
                        .px(px(10.))
                        .py(px(4.))
                        .rounded_full()
                        .border_1()
                        .border_dashed()
                        .border_color(Theme::line())
                        .text_color(ink)
                        .cursor_pointer()
                        .hover(|s| s.border_color(Theme::lavender()))
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(i) = this.integ() {
                                let input = i.feed_url.clone();
                                input.update(cx, |x, cx| x.set_text(value, cx));
                            }
                            cx.notify();
                        })),
                );
            }
            section = section.child(ex);
        } else {
            let mut list = div().flex().flex_col().gap(px(8.));
            for feed in feeds {
                let id = s(&feed["id"]);
                let title = s(&feed["title"]);
                let channel = s(&feed["channelId"]);
                let known = channels.iter().any(|c| c.0 == channel);
                let label = channels.iter().find(|c| c.0 == channel).map(|c| c.1.clone()).unwrap_or_else(|| "deleted channel".into());
                let key = format!("feed-{id}");
                let f2 = feed.clone();
                let mut options = channels.clone();
                if !known {
                    options.insert(0, (String::new(), "deleted channel".into()));
                }
                let status: AnyElement = if let Some(err) = feed["lastError"].as_str() {
                    div().flex().items_center().gap(px(4.)).text_color(Theme::coral()).child(ui::icon("triangle-alert", 12., Theme::coral())).child(err.to_string()).into_any_element()
                } else {
                    div().child(format!("last post {}", feed_ago(feed["lastPostAt"].as_str()))).into_any_element()
                };
                let source = s(&feed["sourceUrl"]);
                let (sid, stitle) = (id.clone(), title.clone());
                list = list.child(
                    Self::integ_row()
                        .child(div().flex_none().size(px(38.)).rounded(px(10.)).bg(Theme::paper()).flex().items_center().justify_center().text_size(px(19.)).child(feed_icon(&s(&feed["kind"]))))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).overflow_hidden().whitespace_nowrap().child(title.clone()))
                                .child(
                                    div()
                                        .mt(px(3.))
                                        .flex()
                                        .flex_wrap()
                                        .items_center()
                                        .gap(px(4.))
                                        .text_size(px(12.5))
                                        .line_height(px(18.75))
                                        .text_color(muted)
                                        .child("Posts to")
                                        .child(self.integ_select(key.clone(), label, options, None, 20., 6., 6., 12.5, true, i.open.as_deref() == Some(key.as_str()), move |this, v, cx| {
                                            if !v.is_empty() {
                                                this.move_feed(f2.clone(), v, cx);
                                            }
                                        }, cx))
                                        .child("·")
                                        .child(status),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_none()
                                .gap(px(6.))
                                .child(btn(SharedString::from(format!("feed-open-{id}")), "secondary", 12., 7., true).child("Open").on_click(cx.listener(move |_, _, _, cx| cx.open_url(&source))))
                                .child(btn(SharedString::from(format!("feed-del-{id}")), "danger", 12., 7., true).child(ui::icon("trash-2", 14., Theme::coral())).on_click(cx.listener(move |this, _, _, cx| {
                                    this.integ_confirm(format!("Stop following {stitle}?"), "Nothing new will be posted. What it already posted stays.".into(), "Stop following", IntegAct::StopFeed(sid.clone(), stitle.clone()), cx)
                                }))),
                        ),
                );
            }
            section = section.child(list);
        }
        section.into_any_element()
    }

    fn render_hooks_panel(&self, i: &Integ, flash: bool, cx: &mut Context<Self>) -> AnyElement {
        let Some(data) = i.hooks.as_ref().filter(|d| d.is_object()) else { return div().into_any_element() };
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let hooks = arr(&data["webhooks"]);
        let channels: Vec<(String, String)> = arr(&data["channels"]).iter().map(|c| (s(&c["id"]), format!("#{}", s(&c["name"])))).collect();
        let max = data["max"].as_i64().unwrap_or(0);
        let used = hooks.iter().filter(|h| h["source"].is_null()).count() as i64;
        let text = with_code(
            &[
                ("A secret URL that posts into one channel. Anything that can post to a Discord webhook works here too: CI, uptime monitors, Home Assistant, scripts. For GitHub, GitLab or Gitea/Forgejo add ", false),
                ("/github", true),
                (", ", false),
                ("/gitlab", true),
                (" or ", false),
                ("/gitea", true),
                (" to the URL; ", false),
                ("/slack", true),
                (" takes Slack-style posts.", false),
            ],
            13.5,
            19.575,
            muted,
            Some(Theme::card().into()),
        );
        let mut section = self.integ_section("webhooks", flash).child(Self::integ_head("Webhooks", Some(format!("{used}/{max}")), text));
        if channels.is_empty() {
            section = section.child(Self::integ_empty("This server has no text channel to post into yet."));
        } else {
            let enabled = !i.hook_busy && !i.hook_name.read(cx).text().trim().is_empty() && i.hook_channel.is_some() && used < max;
            let label = i.hook_channel.as_ref().and_then(|id| channels.iter().find(|c| &c.0 == id)).map(|c| c.1.clone()).unwrap_or_default();
            section = section.child(
                div()
                    .flex()
                    .gap(px(8.))
                    .child(Self::integ_field(&i.hook_avatar, 39., (12., 8.), 10.).w(px(48.)).flex_none())
                    .child(Self::integ_field(&i.hook_name, 39., (12., 8.), 10.).flex_1().min_w_0())
                    .child(self.integ_select("hook-ch".into(), label, channels.clone(), Some(200.), 39., 12., 10., 14., true, i.open.as_deref() == Some("hook-ch"), |this, v, _| {
                        if let Some(i) = this.integ() {
                            i.hook_channel = Some(v);
                        }
                    }, cx))
                    .child(btn("hook-new", "primary", 18., 9.5, enabled).child("New webhook").when(enabled, |d| d.on_click(cx.listener(|this, _, _, cx| this.create_hook(cx))))),
            );
        }
        if !hooks.is_empty() {
            let mut list = div().flex().flex_col().gap(px(8.));
            for hook in hooks {
                let id = s(&hook["id"]);
                let name = s(&hook["name"]);
                let channel = s(&hook["channelId"]);
                let known = channels.iter().any(|c| c.0 == channel);
                let label = channels.iter().find(|c| c.0 == channel).map(|c| c.1.clone()).unwrap_or_else(|| "deleted channel".into());
                let mut options = channels.clone();
                if !known {
                    options.insert(0, (String::new(), "deleted channel".into()));
                }
                let uses = hook["uses"].as_i64().unwrap_or(0);
                let usage = if uses > 0 {
                    format!("{uses} post{}, last {}", if uses == 1 { "" } else { "s" }, local_time(hook["lastUsedAt"].as_str().or(hook["createdAt"].as_str()).unwrap_or_default()))
                } else {
                    "not used yet".into()
                };
                let key = format!("hook-{id}");
                let (id1, name1, names) = (id.clone(), name.clone(), channels.clone());
                let path = s(&hook["path"]);
                let (id2, id3, name3) = (id.clone(), id.clone(), name.clone());
                list = list.child(
                    Self::integ_row()
                        .child(div().flex_none().size(px(38.)).rounded(px(10.)).bg(Theme::paper()).flex().items_center().justify_center().text_size(px(19.)).child(s(&hook["avatar"])))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).overflow_hidden().whitespace_nowrap().child(name.clone()))
                                .child(
                                    div()
                                        .mt(px(3.))
                                        .flex()
                                        .flex_wrap()
                                        .items_center()
                                        .gap(px(4.))
                                        .text_size(px(12.5))
                                        .line_height(px(18.75))
                                        .text_color(muted)
                                        .child("Posts to")
                                        .child(self.integ_select(key.clone(), label, options, None, 20., 6., 6., 12.5, true, i.open.as_deref() == Some(key.as_str()), move |this, v, cx| {
                                            if v.is_empty() {
                                                return;
                                            }
                                            let channel_name = names.iter().find(|c| c.0 == v).map(|c| c.1.clone()).unwrap_or_else(|| "#deleted channel".into());
                                            this.update_hook(id1.clone(), json!({ "channelId": v }), Some(format!("{name1} now posts to {channel_name}.")), cx);
                                        }, cx))
                                        .child("·")
                                        .child(usage),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_none()
                                .gap(px(6.))
                                .child(btn(SharedString::from(format!("hook-copy-{id}")), "secondary", 12., 7., true).child(ui::icon("copy", 14., ink)).child("Copy URL").on_click(cx.listener(move |this, _, _, cx| {
                                    let url = this.hook_url(&path);
                                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(url));
                                    this.server_notice("Webhook URL copied.".into(), cx);
                                })))
                                .child(btn(SharedString::from(format!("hook-rot-{id}")), "secondary", 12., 7., true).child(ui::icon("refresh-cw", 14., ink)).on_click(cx.listener(move |this, _, _, cx| {
                                    this.integ_confirm("Give this webhook a new URL?".into(), "The old URL stops working right away. Anything using it has to be given the new one.".into(), "New URL", IntegAct::RotateHook(id2.clone()), cx)
                                })))
                                .child(btn(SharedString::from(format!("hook-del-{id}")), "danger", 12., 7., true).child(ui::icon("trash-2", 14., Theme::coral())).on_click(cx.listener(move |this, _, _, cx| {
                                    this.integ_confirm(format!("Delete {name3}?"), "Its URL stops working. Messages it already posted stay.".into(), "Delete", IntegAct::DeleteHook(id3.clone(), name3.clone()), cx)
                                }))),
                        ),
                );
            }
            section = section.child(list);
        }
        section.into_any_element()
    }

    fn render_bridge_panel(&self, i: &Integ, server: &crate::model::Server, flash: bool, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let data = i.bridge.as_ref().filter(|d| d.is_object())?;
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let coral: Hsla = Theme::coral().into();
        let busy = i.bridge_busy;
        let bridge = data["bridge"].clone();
        let service = data["service"].clone();
        let discord = data["discord"].clone();
        let pairs = arr(&data["pairs"]);
        let linked = bridge["linked"] == true;
        let paired_of = |c: &str| pairs.iter().find(|p| p["channelId"] == c).map(|p| s(&p["discordChannelId"])).unwrap_or_default();
        let discord_channels = arr(&discord["channels"]);
        let missing = arr(&discord["missing"]);
        let pairs_missing = discord_channels.iter().any(|c| pairs.iter().any(|p| p["discordChannelId"] == c["id"]) && c["missing"].as_array().is_some_and(|m| !m.is_empty()));
        let (tone, light) = if service["online"] != true {
            ("off", match service["lastSeen"].as_str() {
                Some(seen) => format!("Bridge service offline since {}", bridge_ago(Some(seen))),
                None => "Bridge service not running".into(),
            })
        } else if service["discordConnected"] != true {
            ("bad", match service["error"].as_str() {
                Some(e) => format!("Can't reach Discord: {e}"),
                None => "Reconnecting to Discord…".into(),
            })
        } else if service["hoffleConnected"] != true {
            ("bad", "Reconnecting to Hoffle…".into())
        } else if linked && discord.is_object() && discord["present"] != true {
            ("bad", "The bot isn't in that Discord server any more".into())
        } else if linked && (!missing.is_empty() || pairs_missing) {
            ("warn", "Running, but missing some permissions on Discord".into())
        } else {
            ("ok", if linked { "Running".into() } else { "Ready".into() })
        };
        let light_color: Hsla = match tone {
            "ok" => Theme::mint().into(),
            "warn" => rgb(0xe3a008).into(),
            "bad" => coral,
            _ => muted,
        };
        let mut status = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(8.))
            .text_size(px(13.5))
            .line_height(px(20.25))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(ink)
            .child(div().flex_none().size(px(10.)).rounded_full().bg(light_color).when(tone != "off", |d| d.border_color(light_color.opacity(0.22))))
            .child(light);
        if service["online"] == true && linked {
            if let Some(at) = service["activity"]["lastRelayAt"].as_str() {
                status = status.child(div().font_weight(FontWeight::NORMAL).text_color(muted).child(format!(" · last message {}", bridge_ago(Some(at)))));
            }
        }
        if let Some(e) = service["activity"]["lastError"].as_str() {
            status = status.child(div().font_weight(FontWeight::NORMAL).text_color(muted).child(format!(" · {e}")));
        }
        let head_text = "Mirror channels with a Discord server, both ways: messages with each person's name and picture, replies, edits, deletes, reactions, files and threads. Handy while people move over, or to keep both going.";
        let mut section = self
            .integ_section("bridge", flash)
            .child(Self::integ_head("Discord Bridge", linked.then(|| format!("{} paired", pairs.len())), head_text))
            .child(status);
        if service["online"] != true {
            section = section.child(Self::integ_empty(with_code(
                &[("The bridge runs as its own small service next to Hoffle. Whoever runs this Hoffle starts it once (see ", false), ("docs/self-hosting.md", true), (" → Discord bridge); after that every server sets itself up here.", false)],
                13.5,
                20.25,
                muted,
                None,
            )));
        }
        if bridge.is_null() {
            section = section.child(div().flex().child(btn("bridge-setup", "primary", 18., 9., !busy).child("Set up the bridge").when(!busy, |d| d.on_click(cx.listener(|this, _, _, cx| this.bridge_send("POST", None, None, cx))))));
        }
        let app_name = service["app"]["name"].as_str().map(String::from);
        let invite = service["inviteUrl"].as_str().map(String::from);
        if !bridge.is_null() && !linked {
            let step = |n: usize, body: gpui::Div| {
                div()
                    .relative()
                    .pl(px(47.))
                    .pr(px(13.))
                    .py(px(11.))
                    .rounded(px(12.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(Theme::line())
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .text_color(muted)
                    .child(div().absolute().top(px(11.)).left(px(13.)).size(px(24.)).rounded_full().bg(Theme::lavender_soft()).flex().items_center().justify_center().text_size(px(12.)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::lavender_light()).child(n.to_string()))
                    .child(body.flex().flex_col().items_start().gap(px(6.)))
            };
            let strong = |text: &str| div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).child(text.to_string());
            let one = div().child(strong("Add the bot to your Discord server.")).child("You need Manage Server there.").child(match invite.clone() {
                Some(url) => btn("bridge-invite", "primary", 14., 7., true)
                    .child(ui::icon("external-link", 14., rgb(0x15121f)))
                    .child(format!("Add {} to Discord", app_name.clone().unwrap_or_else(|| "the bot".into())))
                    .on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url)))
                    .into_any_element(),
                None => div().text_color(coral).child("Waiting for the bridge service to start…").into_any_element(),
            });
            let code = bridge["code"].as_str().map(String::from);
            let mut two = div().child(strong("In any channel of that Discord server, type:"));
            two = match code.clone() {
                Some(code) => {
                    let line = format!("/hoffle link {code}");
                    let copy = line.clone();
                    two.child(
                        div()
                            .flex()
                            .flex_wrap()
                            .items_center()
                            .gap(px(8.))
                            .child(div().px(px(12.)).py(px(8.)).rounded(px(10.)).bg(Theme::paper()).border_1().border_color(Theme::line()).font_family(MONO_FONT).text_size(px(15.)).font_weight(FontWeight::BOLD).text_color(ink).child(line))
                            .child(btn("bridge-copy", "secondary", 18., 9., true).child(ui::icon("copy", 14., ink)).child("Copy").on_click(cx.listener(move |this, _, _, cx| {
                                cx.write_to_clipboard(gpui::ClipboardItem::new_string(copy.clone()));
                                this.server_notice("Copied. Paste it into Discord.".into(), cx);
                            }))),
                    )
                }
                None => two.child(div().text_color(coral).child("That code expired.")),
            };
            let minutes = bridge["codeExpiresAt"].as_str().and_then(|e| chrono::DateTime::parse_from_rfc3339(e).ok()).map(|e| (((e.with_timezone(&chrono::Utc) - chrono::Utc::now()).num_seconds() as f64 / 60.).round() as i64).max(1));
            two = two.child(
                div()
                    .flex()
                    .items_center()
                    .when_some(code.as_ref().and(minutes), |d, m| d.child(format!("Works for {m} more minutes. ")))
                    .child(
                        div()
                            .id("bridge-newcode")
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(Theme::lavender_light())
                            .when(!busy, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.bridge_send("POST", None, None, cx))))
                            .child(ui::icon("refresh-cw", 12., Theme::lavender_light()))
                            .child("New code"),
                    ),
            );
            let three = div().child(strong("Pick the channels to mirror.")).child("This page updates by itself once Discord answers.");
            section = section.child(div().flex().flex_col().gap(px(10.)).child(step(1, one)).child(step(2, two)).child(step(3, three)));
        }
        if linked {
            let guild_name = bridge["guild"]["name"].as_str().unwrap_or_default().to_string();
            let icon: AnyElement = match bridge["guild"]["icon"].as_str() {
                Some(url) => div().flex_none().size(px(40.)).rounded(px(12.)).overflow_hidden().child(gpui::img(super::links::proxied(url)).size(px(40.)).object_fit(gpui::ObjectFit::Cover)).into_any_element(),
                None => div().flex_none().size(px(40.)).rounded(px(12.)).bg(rgb(0x5865f2)).flex().items_center().justify_center().font_weight(FontWeight::EXTRA_BOLD).text_color(gpui::white()).child(guild_name.chars().next().map(String::from).unwrap_or_else(|| "D".into())).into_any_element(),
            };
            let by = bridge["linkedBy"].as_str().map(|b| format!("by {b} ")).unwrap_or_default();
            section = section.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .px(px(13.))
                    .py(px(11.))
                    .rounded(px(12.))
                    .bg(mix(rgb(0x5865f2), 0.09, Theme::panel()))
                    .border_1()
                    .border_color(mix(rgb(0x5865f2), 0.3, Theme::line()))
                    .child(icon)
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(2.))
                            .min_w_0()
                            .child(
                                div()
                                    .flex()
                                    .items_baseline()
                                    .flex_wrap()
                                    .text_size(px(14.5))
                                    .line_height(px(21.75))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(ink)
                                    .child(format!("{} ", server.name))
                                    .child(div().text_size(px(12.5)).text_color(muted).child("⇄"))
                                    .child(format!(" {guild_name}")),
                            )
                            .child(div().text_size(px(12.5)).line_height(px(18.75)).text_color(muted).child(format!("Linked {by}{}", bridge_ago(bridge["linkedAt"].as_str())))),
                    ),
            );
            if !missing.is_empty() {
                let words: Vec<String> = missing.iter().map(|m| permission_words(m.as_str().unwrap_or_default())).collect();
                section = section.child(div().text_size(px(16.)).text_color(coral).child(format!("On Discord the bot can't {}. Give its role those permissions, or add it again with the button below.", words.join(", "))));
            }
            for c in discord_channels.iter().filter(|c| pairs.iter().any(|p| p["discordChannelId"] == c["id"]) && c["missing"].as_array().is_some_and(|m| !m.is_empty())) {
                let words: Vec<String> = arr(&c["missing"]).iter().map(|m| permission_words(m.as_str().unwrap_or_default())).collect();
                section = section.child(div().text_size(px(16.)).text_color(coral).child(format!("In #{} the bot can't {}.", s(&c["name"]), words.join(", "))));
            }
            let can_pair = !busy && !discord_channels.is_empty();
            section = section.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().mt(px(4.)).text_size(px(14.5)).line_height(px(21.75)).font_weight(FontWeight::BOLD).text_color(ink).child("Channels"))
                    .child(btn("bridge-match", "secondary", 12., 7., can_pair).child(ui::icon("wand-sparkles", 14., ink)).child("Pair same names").when(can_pair, |d| d.on_click(cx.listener(|this, _, _, cx| this.match_by_name(cx))))),
            );
            if discord.is_object() && discord_channels.is_empty() {
                section = section.child(Self::integ_empty(if discord["present"] == true {
                    "The bot can't see any text channel there yet. Check its role can view the channels you want to mirror."
                } else {
                    "The bot isn't in that Discord server. Add it again, then link once more."
                }));
            } else {
                let mut list = div().flex().flex_col().gap(px(8.));
                for channel in arr(&data["hoffleChannels"]) {
                    let id = s(&channel["id"]);
                    let kind = s(&channel["kind"]);
                    let paired = paired_of(&id);
                    let private = channel["private"] == true;
                    let mut options = vec![(String::new(), "Not mirrored".to_string())];
                    if !paired.is_empty() && !discord_channels.iter().any(|d| d["id"] == paired.as_str()) {
                        options.push((paired.clone(), "(channel gone)".into()));
                    }
                    for d in discord_channels.iter().filter(|d| fits(&kind, d["type"].as_i64().unwrap_or(0))) {
                        let voice = discord_voice(d["type"].as_i64().unwrap_or(0));
                        let parent = d["parent"].as_str().map(|p| format!(" · {p}")).unwrap_or_default();
                        options.push((s(&d["id"]), format!("{}{}{parent}{}", if voice { "🔊 " } else { "#" }, s(&d["name"]), if voice { " (call + chat)" } else { "" })));
                    }
                    let label = options.iter().find(|o| o.0 == paired).map(|o| o.1.clone()).unwrap_or_else(|| "Not mirrored".into());
                    let key = format!("pair-{id}");
                    let id2 = id.clone();
                    let voice_room = kind == "voice" || kind == "stage";
                    list = list.child(
                        Self::integ_row()
                            .py(px(7.))
                            .when(paired.is_empty(), |d| d.opacity(0.8))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(8.))
                                            .text_size(px(14.))
                                            .line_height(px(21.))
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(ink)
                                            .child(format!("{}{}", if voice_room { "🔊 " } else { "#" }, s(&channel["name"])))
                                            .when(private, |d| d.child(div().flex().items_center().gap(px(3.)).px(px(7.)).py(px(1.)).rounded_full().bg(Theme::card()).text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(ui::icon("lock", 10., muted)).child("private"))),
                                    )
                                    .when(!paired.is_empty() && private, |d| d.child(div().mt(px(3.)).text_size(px(12.5)).text_color(coral).child("Everyone in the Discord channel will read this private channel."))),
                            )
                            .child(div().flex_none().text_size(px(16.)).text_color(muted).child("⇄"))
                            .child(self.integ_select(key.clone(), label, options, Some(220.), 34., 10., 8., 13.5, !busy, i.open.as_deref() == Some(key.as_str()), move |this, v, cx| this.set_pair(id2.clone(), v, cx), cx)),
                    );
                }
                section = section.child(list);
            }
            section = section.child(div().mt(px(4.)).text_size(px(14.5)).line_height(px(21.75)).font_weight(FontWeight::BOLD).text_color(ink).child("What crosses over"));
            let mut options = div().flex().flex_col().gap(px(6.));
            for (key, label, hint) in OPTIONS {
                let on = bridge["settings"][key] == true;
                options = options.child(
                    div()
                        .id(SharedString::from(format!("bridge-opt-{key}")))
                        .flex()
                        .items_start()
                        .gap(px(10.))
                        .px(px(12.))
                        .py(px(8.))
                        .rounded(px(10.))
                        .bg(Theme::panel())
                        .when(!busy, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.bridge_send("PATCH", Some(json!({ "settings": { key: !on } })), None, cx))))
                        .child(lavender_box(on))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap(px(2.))
                                .child(div().text_size(px(13.5)).line_height(px(20.25)).font_weight(FontWeight::BOLD).text_color(ink).child(label))
                                .child(div().text_size(px(12.5)).line_height(px(17.5)).text_color(muted).child(hint)),
                        ),
                );
            }
            section = section.child(options);
            let helpers = arr(&service["voiceHelpers"]);
            if bridge["settings"]["voice"] == true && !helpers.is_empty() {
                let inside = helpers.iter().filter(|h| h["inServer"] == true).count();
                let guild = if guild_name.is_empty() { "the Discord server".to_string() } else { guild_name.clone() };
                let bot = app_name.clone().unwrap_or_else(|| "the bot".into());
                let tail = if inside > 0 {
                    format!(", so up to {inside} {} up one by one; anyone beyond that is heard through {bot}.", if inside == 1 { "person shows" } else { "people show" })
                } else {
                    format!("; until one is added, everyone here is heard through {bot}.")
                };
                section = section
                    .child(div().mt(px(4.)).text_size(px(14.5)).line_height(px(21.75)).font_weight(FontWeight::BOLD).text_color(ink).child("Voices on Discord"))
                    .child(Self::integ_empty(format!(
                        "Each person in a voice room here can show up on Discord on their own, with their name and picture, through a voice helper bot. {inside} of {} helper{} in {guild}{tail}",
                        helpers.len(),
                        if helpers.len() == 1 { " is" } else { "s are" }
                    )));
                let missing_helpers: Vec<Value> = helpers.iter().filter(|h| h["inServer"] != true).cloned().collect();
                if !missing_helpers.is_empty() {
                    let mut row = div().flex().flex_wrap().gap(px(8.));
                    for h in missing_helpers {
                        let url = s(&h["inviteUrl"]);
                        row = row.child(btn(SharedString::from(format!("helper-{}", s(&h["id"]))), "secondary", 12., 9., true).child(ui::icon("external-link", 14., ink)).child(format!("Add {}", s(&h["name"]))).on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url))));
                    }
                    section = section.child(row);
                }
            }
            let mut actions = div().flex().flex_wrap().gap(px(8.));
            if let Some(url) = invite.clone() {
                actions = actions.child(btn("bridge-readd", "secondary", 12., 9., true).child(ui::icon("external-link", 14., ink)).child("Add the bot again (fixes permissions)").on_click(cx.listener(move |_, _, _, cx| cx.open_url(&url))));
            }
            let (sname, gname) = (server.name.clone(), if guild_name.is_empty() { "Discord".to_string() } else { guild_name.clone() });
            actions = actions
                .child(btn("bridge-relink", "secondary", 12., 9., !busy).child(ui::icon("refresh-cw", 14., ink)).child("Link a different Discord server").when(!busy, |d| {
                    d.on_click(cx.listener(|this, _, _, cx| this.bridge_send("POST", None, Some("New link code made. Run /hoffle link in the other Discord server.".into()), cx)))
                }))
                .child(btn("bridge-off", "danger", 12., 9., !busy).child(ui::icon("unlink", 14., coral)).child("Turn off").when(!busy, |d| {
                    d.on_click(cx.listener(move |this, _, _, cx| {
                        this.integ_confirm("Turn off the Discord bridge?".into(), format!("Messages stop crossing between {sname} and {gname}. Nothing already sent is deleted on either side."), "Turn off", IntegAct::BridgeOff, cx)
                    }))
                }));
            section = section.child(actions);
        }
        if !bridge.is_null() && !linked && bridge["guild"].is_null() && pairs.is_empty() {
            section = section.child(
                div().flex().child(
                    div()
                        .id("bridge-cancel")
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_size(px(16.))
                        .text_color(Theme::lavender_light())
                        .when(!busy, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.bridge_send("DELETE", None, Some("Cancelled.".into()), cx))))
                        .child("Cancel setup"),
                ),
            );
        }
        if !i.bridge_error.is_empty() {
            section = section.child(div().text_size(px(13.)).text_color(coral).child(i.bridge_error.clone()));
        }
        if busy {
            section = section.child(div().text_size(px(12.)).text_color(muted).child("Saving…"));
        }
        let _ = window;
        Some(section.into_any_element())
    }

    fn render_bots_panel(&self, i: &Integ, server: &crate::model::Server, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let bots = i.bots.clone();
        let mut section = self.integ_section("bots", false).child(Self::integ_head("Bots", Some(bots.as_ref().map(|b| b.len()).unwrap_or(0).to_string()), format!("Bots added to {}. A token is a password for the bot: keep it secret.", server.name)));
        match bots {
            None => section = section.child(Self::integ_empty("Loading bots…")),
            Some(list) if list.is_empty() => section = section.child(Self::integ_empty("No bots yet. Add one with its invite link.")),
            Some(list) => {
                let mut ul = div().flex().flex_col().gap(px(8.));
                for bot in list {
                    let id = s(&bot["id"]);
                    let name = s(&bot["name"]);
                    let enabled = bot["enabled"] == true || bot["enabled"] == 1;
                    let avatar = bot["avatar"].as_str().filter(|a| !a.is_empty()).unwrap_or("🤖").to_string();
                    let token = s(&bot["token"]);
                    let shown = i.revealed.contains(&id);
                    let detail: AnyElement = if bot["applicationId"].as_str().is_some_and(|a| !a.is_empty()) {
                        div().mt(px(3.)).text_size(px(12.5)).line_height(px(18.75)).text_color(muted).child("Added with an invite link").into_any_element()
                    } else {
                        let masked = if shown { token.clone() } else { format!("{}••••••••••••", token.chars().take(10).collect::<String>()) };
                        let (id1, tok, name1) = (id.clone(), token.clone(), name.clone());
                        let icon_btn = |key: String, icon: &'static str| {
                            div().id(SharedString::from(key)).size(px(26.)).rounded(px(7.)).flex().items_center().justify_center().cursor_pointer().text_color(muted).hover(|s| s.bg(Theme::card())).child(ui::icon(icon, 14., muted))
                        };
                        div()
                            .mt(px(3.))
                            .flex()
                            .flex_wrap()
                            .items_center()
                            .gap(px(4.))
                            .child(div().px(px(6.)).py(px(2.)).rounded(px(6.)).bg(Theme::paper()).font_family(MONO_FONT).text_size(px(12.)).line_height(px(18.)).text_color(ink).child(masked))
                            .child(icon_btn(format!("bot-eye-{id}"), if shown { "eye-off" } else { "eye" }).on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(i) = this.integ() {
                                    if !i.revealed.remove(&id1) {
                                        i.revealed.insert(id1.clone());
                                    }
                                }
                                cx.notify();
                            })))
                            .child(icon_btn(format!("bot-copy-{id}"), "copy").on_click(cx.listener(move |this, _, _, cx| {
                                cx.write_to_clipboard(gpui::ClipboardItem::new_string(tok.clone()));
                                this.server_notice(format!("Copied the token for {name1}."), cx);
                            })))
                            .into_any_element()
                    };
                    let (id2, id3, name3) = (id.clone(), id.clone(), name.clone());
                    let server_name = server.name.clone();
                    ul = ul.child(
                        Self::integ_row()
                            .when(!enabled, |d| d.opacity(0.65))
                            .child(div().flex_none().size(px(38.)).rounded(px(10.)).bg(Theme::paper()).flex().items_center().justify_center().text_size(px(19.)).child(avatar))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(8.))
                                            .text_size(px(14.))
                                            .line_height(px(21.))
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(ink)
                                            .child(name.clone())
                                            .child(
                                                div()
                                                    .px(px(7.))
                                                    .py(px(1.))
                                                    .rounded_full()
                                                    .text_size(px(11.))
                                                    .line_height(px(16.5))
                                                    .when(enabled, |d| d.bg(Hsla::from(Theme::mint()).opacity(0.18)).text_color(Theme::mint()).child("On"))
                                                    .when(!enabled, |d| d.bg(Theme::card()).text_color(muted).child("Off")),
                                            ),
                                    )
                                    .child(detail),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_none()
                                    .gap(px(6.))
                                    .child(btn(SharedString::from(format!("bot-toggle-{id}")), "secondary", 12., 7., true).child(ui::icon("power", 14., ink)).child(if enabled { "Turn off" } else { "Turn on" }).on_click(cx.listener(move |this, _, _, cx| this.toggle_bot(id2.clone(), enabled, cx))))
                                    .child(btn(SharedString::from(format!("bot-del-{id}")), "danger", 12., 7., true).child(ui::icon("trash-2", 14., Theme::coral())).on_click(cx.listener(move |this, _, _, cx| {
                                        this.integ_confirm(format!("Remove {name3}?"), format!("Revoking this bot will disable its access to {server_name}."), "Remove Bot", IntegAct::RemoveBot(id3.clone(), name3.clone()), cx)
                                    }))),
                            ),
                    );
                }
                section = section.child(ul);
            }
        }
        section.into_any_element()
    }

    /// `.dnd-settings-row`.
    fn dnd_row(stacked: bool) -> gpui::Div {
        div().px(px(14.)).py(px(12.)).rounded(px(12.)).bg(Theme::panel()).flex().when(stacked, |d| d.flex_col().gap(px(8.))).when(!stacked, |d| d.items_center().justify_between().gap(px(16.)))
    }

    /// The title and note of a row; it takes the free width only beside a toggle (in a stacked row it
    /// would also take height).
    fn dnd_text(title: Option<&str>, text: String) -> gpui::Div {
        div()
            .min_w_0()
            .when_some(title, |d, title| d.child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(title.to_string())))
            .child(div().when(title.is_some(), |d| d.mt(px(2.))).text_size(px(12.5)).line_height(px(17.5)).text_color(Theme::muted()).child(text))
    }

    fn dnd_label(label: String, input: &Entity<TextInput>, w: Option<f32>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(4.))
            .when_some(w, |d, w| d.w(px(w)))
            .child(div().text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child(label))
            .child(Self::integ_field(input, 32., (10., 6.), 6.))
    }

    fn render_dnd_panel(&self, i: &Integ, _window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let d = i.dnd.as_ref().filter(|d| d.is_object())?;
        let saving = i.dnd_saving;
        let toggle = |id: String, label: &str, on: bool, cx: &mut Context<Self>, change: Value, done: String| {
            btn(SharedString::from(id), if on { "primary" } else { "secondary" }, 18., 9., !saving).child(label.to_string()).when(!saving, |b| b.on_click(cx.listener(move |this, _, _, cx| this.save_dnd(change.clone(), done.clone(), cx))))
        };
        let system = s(&d["system"]);
        let edition = s(&d["edition"]);
        let homebrew = arr(&d["homebrew"]).len();
        let combat = i.combat.read(cx).text();
        let explore = i.explore.read(cx).text();
        let changed = combat != s(&d["combatMusic"]) || explore != s(&d["exploreMusic"]);
        let music_ok = !saving && changed;
        let section = self
            .integ_section("dnd", false)
            .child(div().text_size(px(17.)).line_height(px(25.5)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Tabletop"))
            .child(
                Self::dnd_row(false)
                    .child(Self::dnd_text(Some("Game system"), "Which sheet \"My character\" opens, what the screens show, and who answers rolls (the D&D Bot or the Storyteller). /v and /rouse work either way.".into()).flex_1())
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .gap(px(6.))
                            .child(toggle("dnd-5e".into(), "D&D 5e", system == "dnd5e", cx, json!({ "system": "dnd5e" }), "The table now plays D&D 5e.".into()))
                            .child(toggle("dnd-vtm".into(), "Vampire V5", system == "vtm5", cx, json!({ "system": "vtm5" }), "The table now plays Vampire: The Masquerade (V5).".into())),
                    ),
            )
            .child(
                Self::dnd_row(false)
                    .child(Self::dnd_text(Some("Rules for lookups"), "What /spell and /monster show by default. Adding 2014 or 2024 to a lookup still picks one.".into()).flex_1())
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .gap(px(6.))
                            .child(toggle("dnd-2014".into(), "2014 SRD", edition == "2014", cx, json!({ "edition": "2014" }), "Lookups now use the 2014 rules.".into()))
                            .child(toggle("dnd-2024".into(), "2024 rules", edition == "2024", cx, json!({ "edition": "2024" }), "Lookups now use the 2024 rules.".into())),
                    ),
            )
            .child(
                Self::dnd_row(true)
                    .child(Self::dnd_text(
                        Some("Combat music"),
                        "When the GM starts combat on a battlemap (or takes the first turn), the call's music switches to this, and back when combat ends. A playlist link or a search; leave empty to keep the music as it is.".into(),
                    ))
                    .child(Self::dnd_label("Combat".into(), &i.combat, None))
                    .child(Self::dnd_label("Exploration".into(), &i.explore, None))
                    .child(div().flex().child(btn("dnd-music", "primary", 18., 9., music_ok).child("Save music").when(music_ok, |b| {
                        b.on_click(cx.listener(|this, _, _, cx| {
                            let Some(i) = this.integ() else { return };
                            let (c, e) = (i.combat.read(cx).text(), i.explore.read(cx).text());
                            this.save_dnd(json!({ "combatMusic": c, "exploreMusic": e }), "Combat music saved.".into(), cx);
                        }))
                    }))),
            )
            .child(
                Self::dnd_row(false)
                    .child(
                        Self::dnd_text(
                            Some("Homebrew"),
                            if homebrew > 0 { format!("{homebrew} {}; lookups find them before the books.", if homebrew == 1 { "entry" } else { "entries" }) } else { "Your own spells, monsters and items, found by the same lookups.".into() },
                        )
                        .flex_1(),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .gap(px(6.))
                            .child(btn("dnd-import", "secondary", 18., 9., !saving).child("Import JSON").when(!saving, |b| {
                                b.on_click(cx.listener(|this, _, window, cx| {
                                    this.open_prompt(
                                        super::channel_tools::PromptKind::Homebrew,
                                        "Import homebrew".into(),
                                        "Paste a JSON list. Each entry needs \"name\", \"kind\" (spell, monster, condition, item, feat, race or class) and \"description\"; \"level\", \"school\", \"type\" and \"source\" are optional. /spell <name> then finds it.".into(),
                                        String::new(),
                                        "[{ \"name\": \"Sunfire Blade\", \"kind\": \"spell\", \"level\": 2, \"description\": \"…\" }]",
                                        "Import",
                                        None,
                                        window,
                                        cx,
                                    )
                                }))
                            }))
                            .when(homebrew > 0, |d| d.child(toggle("dnd-clear".into(), "Clear", false, cx, json!({ "clearHomebrew": true }), "Homebrew cleared.".into()))),
                    ),
            );
        Some(section.into_any_element())
    }

    fn render_game_panel(&self, i: &Integ, cx: &mut Context<Self>) -> Option<AnyElement> {
        let g = i.game.as_ref()?;
        let configured = g["configured"] == true;
        let has_rcon = g["settings"]["hasRcon"] == true;
        let saving = i.gs_saving;
        let ok = !saving && !i.gs_host.read(cx).text().trim().is_empty();
        let w = Some(744.);
        let section = self.integ_section("game", false).child(div().text_size(px(17.)).line_height(px(25.5)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Minecraft server")).child(
            Self::dnd_row(true)
                .child(Self::dnd_text(None, "Who is playing shows above the voice controls in the channel list. RCON lets people with Manage Server run commands from there.".into()))
                .child(Self::dnd_label("Address".into(), &i.gs_host, w))
                .child(Self::dnd_label("Port".into(), &i.gs_port, w))
                .child(Self::dnd_label("RCON port".into(), &i.gs_rcon_port, w))
                .child(Self::dnd_label(format!("RCON password {}", if has_rcon { "(saved; type a new one to change it)" } else { "" }), &i.gs_rcon_pw, w))
                .child(
                    div()
                        .flex()
                        .gap(px(6.))
                        .child(btn("gs-save", "primary", 18., 9., ok).child("Save").when(ok, |b| b.on_click(cx.listener(|this, _, _, cx| this.save_game_server(false, cx)))))
                        .when(configured, |d| d.child(btn("gs-remove", "secondary", 18., 9., !saving).child("Remove").when(!saving, |b| b.on_click(cx.listener(|this, _, _, cx| this.save_game_server(true, cx)))))),
                ),
        );
        Some(section.into_any_element())
    }
}
