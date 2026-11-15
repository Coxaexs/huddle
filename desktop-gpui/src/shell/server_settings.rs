//! ServerSettingsDialog (components/server-settings-dialog.tsx and server-settings/*): the full-window
//! settings of the open server. The ESC button, the sidebar (the server's name, Expression, People,
//! Apps, Moderation, Community / Template, then Delete or Leave), and each tab's page; which tabs
//! show follows the viewer's permissions as isTabVisible does.

use gpui::{AnyElement, AppContext as _, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui;

/// server-settings/constants.ts BANNER_COLORS: label and the two stops of its 135° gradient.
const BANNER_COLORS: [(&str, u32, u32); 10] = [
    ("Dark", 0x1e1f29, 0x111218),
    ("Soul", 0xff4081, 0xff80ab),
    ("Crimson", 0xf44336, 0xff7961),
    ("Amber", 0xff9800, 0xffc947),
    ("Gold", 0xffeb3b, 0xfff350),
    ("Purple", 0x9c27b0, 0xba68c8),
    ("Cyan", 0x00bcd4, 0x4dd0e1),
    ("Teal", 0x009688, 0x4db6ac),
    ("Green", 0x4caf50, 0x81c784),
    ("Charcoal", 0x37474f, 0x263238),
];

/// lib/permissions.ts bits the tabs depend on.
mod bits {
    pub const MANAGE_CHANNELS: u64 = 1 << 1;
    pub const MODERATE: u64 = 1 << 2;
    pub const MANAGE_SERVER: u64 = 1 << 3;
    pub const MANAGE_ROLES: u64 = 1 << 5;
    pub const VIEW_AUDIT_LOG: u64 = 1 << 6;
    pub const MANAGE_EMOJIS: u64 = 1 << 7;
    pub const CREATE_INVITES: u64 = 1 << 8;
    pub const KICK_MEMBERS: u64 = 1 << 11;
    pub const BAN_MEMBERS: u64 = 1 << 12;
}

pub(super) struct ServerSettings {
    server_id: String,
    pub(super) tab: &'static str,
    name: Entity<TextInput>,
    color: String,
    icon_url: String,
    banner_url: String,
    gradient: usize,
    notice: Option<String>,
    member_search: Entity<TextInput>,
    role_menu: Option<String>,
    role_search: Entity<TextInput>,
    role_emoji: Entity<TextInput>,
    /// The role open in the editor ("@everyone" for the server's defaults).
    active_role: Option<String>,
    pub(super) main_scroll: gpui::ScrollHandle,
    invites: Option<Vec<Value>>,
    bans: Option<Vec<Value>>,
    audit: Option<Vec<Value>>,
    /// What is on its way ("invites", "bans", "audit").
    loading: std::cell::RefCell<std::collections::HashSet<&'static str>>,
    creating_invite: bool,
    vanity: Entity<TextInput>,
    ban_search: Entity<TextInput>,
    audit_query: Entity<TextInput>,
    audit_cat: &'static str,
    emojis: Option<Vec<Value>>,
    stickers: Option<Vec<Value>>,
    sounds: Option<Vec<Value>>,
    /// The editable names (and a sound's emoji) by item id, saved on Enter.
    expr_inputs: std::collections::HashMap<String, Entity<TextInput>>,
    expr_subs: Vec<Subscription>,
    uploading: bool,
    /// The picture picked for a new emoji, waiting for its name.
    pub(super) pending_emoji: Option<std::path::PathBuf>,
    description: Entity<TextInput>,
    saving_access: bool,
    welcome: Option<Welcome>,
    automod: Option<Vec<Value>>,
    automod_draft: Option<AutomodDraft>,
    automod_saving: bool,
    automod_notice: Option<String>,
    reports: Option<Vec<Value>>,
    purge_channel: Option<String>,
    purge_count: i64,
    purge_open: Option<&'static str>,
    purge_user: Entity<TextInput>,
    purging: bool,
    tpl_link: Entity<TextInput>,
    tpl_guild: Entity<TextInput>,
    tpl_token: Entity<TextInput>,
    tpl_json: Entity<crate::textarea::TextArea>,
    importing: bool,
    _subs: Vec<Subscription>,
}

const STARTER_TEMPLATES: [(&str, &str, &str); 4] = [
    ("gaming", "Gaming Hangout", "Announcements, clips, squad voice rooms & roles"),
    ("dnd", "D&D Campaign Hub", "Lore forum, session recaps, dice chat & GM rooms"),
    ("study", "Study & Co-working", "Daily goals, resource forum & quiet focus voice"),
    ("community", "Public Community", "Welcome & rules, say-hi, looking-for-group, questions & a bug forum"),
];

/// Chrome's radio button in the dark scheme (13px).
fn radio(on: bool) -> gpui::Div {
    div()
        .flex_none()
        .size(px(13.))
        .rounded_full()
        .when(on, |d| d.bg(rgb(0x99c8ff)).flex().items_center().justify_center().child(div().size(px(5.)).rounded_full().bg(rgb(0x1e1a2e))))
        .when(!on, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585)))
}

/// RuleDraft: the rule being made or changed ("new" or its id), every kind's inputs at once.
struct AutomodDraft {
    editing: String,
    kind: &'static str,
    action: &'static str,
    regex: bool,
    kind_open: bool,
    action_open: bool,
    words: Entity<crate::textarea::TextArea>,
    allow: Entity<crate::textarea::TextArea>,
    /// max mentions, percent, min letters, max repeats, timeout minutes
    numbers: [Entity<TextInput>; 5],
    _subs: Vec<Subscription>,
}

const AUTOMOD_KINDS: [(&str, &str, &str); 5] = [
    ("keyword", "Blocked words", "Refuses messages containing any of the listed words, matched on whole words and ignoring case."),
    ("mention_limit", "Mention limit", "Refuses messages that mention more people than the limit allows."),
    ("link", "Link filter", "Refuses messages containing links outside the allow-list. An entry also covers its subdomains, so example.com allows cdn.example.com."),
    ("caps", "Excessive caps", "Refuses messages that are mostly capital letters."),
    ("repeat", "Repeated messages", "Refuses the same message posted over and over in one channel."),
];
const AUTOMOD_ACTIONS: [(&str, &str); 2] = [("block", "Refuse the message"), ("timeout", "Refuse the message and time the author out")];

/// formatMinutes(): "1 day 2 hours".
fn format_minutes(minutes: i64) -> String {
    if minutes <= 0 {
        return "0 minutes".into();
    }
    let (d, h, m) = (minutes / 1440, (minutes % 1440) / 60, minutes % 60);
    let mut parts = Vec::new();
    for (n, one, many) in [(d, "day", "days"), (h, "hour", "hours"), (m, "minute", "minutes")] {
        if n > 0 {
            parts.push(format!("{n} {}", if n == 1 { one } else { many }));
        }
    }
    parts.join(" ")
}

/// summarizeRule() + describeAction().
fn summarize_rule(rule: &Value) -> String {
    let c = &rule["config"];
    let plural = |n: i64, one: &str, many: &str| if n == 1 { one.to_string() } else { many.to_string() };
    let summary = match c["kind"].as_str().unwrap_or_default() {
        "keyword" => {
            let n = c["words"].as_array().map(|a| a.len() as i64).unwrap_or(0);
            format!("{n} blocked {}{}", plural(n, "word", "words"), if c["regex"].as_bool().unwrap_or(false) { " (regular expressions)" } else { "" })
        }
        "mention_limit" => {
            let n = c["max"].as_i64().unwrap_or(0);
            format!("max {n} {}", plural(n, "mention", "mentions"))
        }
        "link" => {
            let allow: Vec<String> = c["allow"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            if allow.is_empty() { "allow no links".into() } else { format!("allow only {}", allow.join(", ")) }
        }
        "caps" => format!("mostly caps over {} letters, at {}%", c["minLetters"].as_i64().unwrap_or(0), c["percent"].as_i64().unwrap_or(0)),
        _ => {
            let n = c["maxRepeats"].as_i64().unwrap_or(0);
            format!("max {n} {}", plural(n, "repeat", "repeats"))
        }
    };
    let action = if rule["action"] == "timeout" { format!("message refused, {} timeout", format_minutes(rule["timeoutMinutes"].as_i64().unwrap_or(0))) } else { "message refused".into() };
    format!("{summary} · {action}")
}

/// entriesOf(): lines or commas, trimmed, each once.
fn entries_of(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in text.split(['\n', ',']) {
        let e = raw.trim().to_string();
        if !e.is_empty() && !out.contains(&e) {
            out.push(e);
        }
    }
    out
}

/// clampInt(): a whole number from 1 to `max`, else the default.
fn clamp_int(text: &str, fallback: i64, max: i64) -> i64 {
    match text.trim().parse::<f64>().map(|v| v.floor() as i64) {
        Ok(v) if v >= 1 => v.min(max),
        _ => fallback,
    }
}

/// WelcomeConfig as edited here.
struct Welcome {
    enabled: bool,
    rules: Entity<crate::textarea::TextArea>,
    fields: Vec<WelcomeField>,
    saving: bool,
    type_open: Option<usize>,
    _subs: Vec<Subscription>,
}

struct WelcomeField {
    id: String,
    label: Entity<TextInput>,
    kind: &'static str,
    required: bool,
}

const WELCOME_TYPES: [(&str, &str); 3] = [("text", "Short answer"), ("long", "Paragraph"), ("date", "Date")];

/// lib/features.ts FEATURE_MODULES (resources/data/feature-modules.json): key, label, description.
static FEATURE_MODULES: std::sync::LazyLock<Vec<(String, String, String)>> = std::sync::LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/feature-modules.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

/// Chrome's own small checkbox (13px, the dark scheme's light-blue tick) and the bigger lavender
/// `.appearance-switch` one (19px).
fn checkbox(on: bool, big: bool) -> gpui::Div {
    let size = if big { 19. } else { 13. };
    let fill: Hsla = if big { Theme::lavender().into() } else { rgb(0x99c8ff).into() };
    div()
        .flex_none()
        .size(px(size))
        .rounded(px(if big { 4. } else { 2. }))
        .when(on, |d| d.bg(fill).flex().items_center().justify_center().child(ui::icon("check", size - 4., rgb(0x15121f))))
        .when(!on, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585)))
}

/// AUDIT_LABELS (server-settings/constants.ts → resources/data/audit-labels.json).
static AUDIT_LABELS: std::sync::LazyLock<std::collections::HashMap<String, String>> = std::sync::LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/audit-labels.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

/// matchesCategory() in audit-log-tab.tsx.
fn audit_matches(action: &str, cat: &str) -> bool {
    match cat {
        "moderation" => ["moderation.", "message.", "report."].iter().any(|p| action.starts_with(p)) || matches!(action, "member.kick" | "member.ban" | "member.unban" | "member.timeout" | "member.timeout_remove"),
        "structure" => ["server.", "channel.", "role."].iter().any(|p| action.starts_with(p)),
        "members" => action.starts_with("member.") || action.starts_with("invite."),
        "integrations" => ["webhook.", "bot.", "feed."].iter().any(|p| action.starts_with(p)),
        _ => true,
    }
}

/// lib/permissions.ts PERMISSION_INFO (tools: esbuild + node, resources/data/permissions.json):
/// flag, label, description, category.
static PERMISSIONS: std::sync::LazyLock<Vec<(u64, String, String, String)>> = std::sync::LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/permissions.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

const EVERYONE: &str = "@everyone";

/// What the viewer may do here (the dialog's can* props, made effective as it makes them).
#[derive(Clone, Copy)]
struct Can {
    owner: bool,
    manage_server: bool,
    expressions: bool,
    members: bool,
    roles: bool,
    invites: bool,
    access: bool,
    moderate: bool,
    audit: bool,
    ban: bool,
}

impl ServerSettings {
    pub(super) fn server_id_pub(&self) -> String {
        self.server_id.clone()
    }
}

impl Shell {
    pub(super) fn set_active_role(&mut self, role: String) {
        if let Some(s) = self.server_settings.as_mut() {
            s.active_role = Some(role);
        }
    }

    fn server_can(&self) -> Can {
        let p = self.my_permissions();
        let has = |b: u64| p & b != 0;
        let owner = self.server().is_some_and(|s| s.owner_id.as_deref() == Some(self.me.id.as_str()));
        let manage_server = has(bits::MANAGE_SERVER);
        let moderate = has(bits::MODERATE);
        Can {
            owner,
            manage_server,
            expressions: has(bits::MANAGE_EMOJIS) || has(bits::MANAGE_CHANNELS) || manage_server || owner,
            members: manage_server || has(bits::MANAGE_ROLES) || moderate || has(bits::KICK_MEMBERS) || has(bits::BAN_MEMBERS) || owner,
            roles: has(bits::MANAGE_ROLES) || manage_server || owner,
            invites: self.can_invite() || has(bits::CREATE_INVITES) || manage_server || owner,
            access: manage_server || has(bits::MANAGE_ROLES) || owner,
            moderate: moderate || manage_server || owner,
            audit: has(bits::VIEW_AUDIT_LOG) || manage_server || owner,
            ban: has(bits::BAN_MEMBERS) || moderate || manage_server || owner,
        }
    }

    pub(super) fn open_server_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(server) = self.server().cloned() else { return };
        let name = cx.new(|cx| {
            let mut i = TextInput::new("", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() });
            i.set_text(server.name.clone(), cx);
            i
        });
        let subs = vec![cx.subscribe_in(&name, window, |this, input, event, _, cx| {
            if matches!(event, InputEvent::Changed) {
                let text = input.read(cx).text();
                if text.chars().count() > 50 {
                    let cut: String = text.chars().take(50).collect();
                    input.update(cx, |i, cx| i.set_text(cut, cx));
                }
            }
            if matches!(event, InputEvent::Escape) {
                this.server_settings = None;
            }
            cx.notify();
        })];
        let member_search = cx.new(|cx| TextInput::new("Search Members, Roles, or Invites", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        let mut subs = subs;
        subs.push(cx.subscribe_in(&member_search, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Escape) {
                this.server_settings = None;
            }
            cx.notify();
        }));
        let role_search = cx.new(|cx| TextInput::new("Search Roles", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        let role_emoji = cx.new(|cx| TextInput::new(t("roleIcon.emoji"), cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        for input in [&role_search, &role_emoji] {
            subs.push(cx.subscribe_in(input, window, |this, _, event, _, cx| {
                match event {
                    InputEvent::Escape => this.server_settings = None,
                    InputEvent::Submit => this.save_role_emoji(cx),
                    _ => {}
                }
                cx.notify();
            }));
        }
        let active_role = server.roles.first().map(|r| r.id.clone());
        let purge_user = cx.new(|cx| TextInput::new("@username (leave blank for all)", cx).look(Look { size: 12., line_height: 16., height: 16., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        subs.push(cx.subscribe_in(&purge_user, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Escape) {
                this.server_settings = None;
            }
            cx.notify();
        }));
        let purge_channel = server.channels.iter().find(|c| !c.is_voice()).map(|c| c.id.clone());
        let small_look = || Look { size: 12., line_height: 16., height: 16., color: Theme::ink().into(), placeholder: Theme::muted().into() };
        let tpl_link = cx.new(|cx| TextInput::new(t("discordMove.templatePlaceholder"), cx).look(small_look()));
        let tpl_guild = cx.new(|cx| TextInput::new("e.g. 123456789012345678", cx).look(small_look()));
        let tpl_token = cx.new(|cx| TextInput::new("Bot token with View Channels permission", cx).look(small_look()).masked());
        let tpl_json = cx.new(|cx| {
            crate::textarea::TextArea::new("{\n  \"categories\": [{ \"name\": \"Text Channels\", \"channels\": [{ \"name\": \"welcome\", \"kind\": \"text\" }] }],\n  \"roles\": [{ \"name\": \"Moderator\", \"color\": \"#5865f2\" }]\n}", cx).text(12., 16.).min_height(96.).enter_newline().placeholder_color(Hsla::from(Theme::muted()).opacity(0.75))
        });
        for input in [&tpl_link, &tpl_guild, &tpl_token] {
            subs.push(cx.subscribe_in(input, window, |this, _, event, _, cx| {
                if matches!(event, InputEvent::Escape) {
                    this.server_settings = None;
                }
                cx.notify();
            }));
        }
        subs.push(cx.subscribe(&tpl_json, |_, _, _, cx| cx.notify()));
        let description = cx.new(|cx| {
            let mut i = TextInput::new("What is this server about? (e.g. Cozy gaming nights, D&D campaigns, and music)", cx).look(Look { size: 16., line_height: 24., height: 24., color: Theme::ink().into(), placeholder: Theme::muted().into() });
            i.set_text(server.description.clone().unwrap_or_default(), cx);
            i
        });
        subs.push(cx.subscribe_in(&description, window, |this, input, event, _, cx| {
            match event {
                InputEvent::Escape => this.server_settings = None,
                InputEvent::Changed => {
                    let text = input.read(cx).text();
                    if text.chars().count() > 240 {
                        let cut: String = text.chars().take(240).collect();
                        input.update(cx, |i, cx| i.set_text(cut, cx));
                    }
                }
                _ => {}
            }
            cx.notify();
        }));
        let look = || Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() };
        let vanity = cx.new(|cx| {
            let mut i = TextInput::new(t("vanity.placeholder"), cx).look(look());
            i.set_text(server.vanity_code.clone().unwrap_or_default(), cx);
            i
        });
        let ban_search = cx.new(|cx| TextInput::new("Search Bans by User Id or Username", cx).look(look()));
        let audit_query = cx.new(|cx| TextInput::new("Filter by moderator, target, or action…", cx).look(Look { size: 12., line_height: 16., height: 16., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        for input in [&vanity, &ban_search, &audit_query] {
            subs.push(cx.subscribe_in(input, window, |this, input, event, _, cx| {
                if matches!(event, InputEvent::Escape) {
                    this.server_settings = None;
                }
                // The vanity code: spaces become dashes, at most 32 long.
                if matches!(event, InputEvent::Changed) && this.server_settings.as_ref().is_some_and(|s| s.vanity == *input) {
                    let text = input.read(cx).text();
                    let fixed: String = text.split_whitespace().collect::<Vec<_>>().join("-").chars().take(32).collect();
                    if fixed != text && !text.ends_with(' ') {
                        input.update(cx, |i, cx| i.set_text(fixed, cx));
                    }
                }
                cx.notify();
            }));
        }
        self.server_menu = false;
        self.server_settings = Some(ServerSettings {
            server_id: server.id.clone(),
            tab: "profile",
            name,
            color: if server.color.is_empty() { "#7b63e6".into() } else { server.color.clone() },
            icon_url: server.icon_url.clone().unwrap_or_default(),
            banner_url: server.banner_url.clone().unwrap_or_default(),
            gradient: 0,
            notice: None,
            member_search,
            role_menu: None,
            role_search,
            role_emoji,
            active_role,
            main_scroll: gpui::ScrollHandle::new(),
            invites: None,
            bans: None,
            audit: None,
            loading: Default::default(),
            creating_invite: false,
            vanity,
            ban_search,
            audit_query,
            audit_cat: "all",
            emojis: None,
            stickers: None,
            sounds: None,
            expr_inputs: Default::default(),
            expr_subs: Vec::new(),
            uploading: false,
            pending_emoji: None,
            description,
            saving_access: false,
            welcome: None,
            automod: None,
            automod_draft: None,
            automod_saving: false,
            automod_notice: None,
            reports: None,
            purge_channel,
            purge_count: 25,
            purge_open: None,
            purge_user,
            purging: false,
            tpl_link,
            tpl_guild,
            tpl_token,
            tpl_json,
            importing: false,
            _subs: subs,
        });
        cx.notify();
    }

    pub(super) fn server_settings_server(&self) -> Option<String> {
        self.server_settings.as_ref().map(|s| s.server_id.clone())
    }

    /// After Create Role: the newest role opens in the editor once the servers are back.
    pub(super) fn role_created(&mut self, name: String, cx: &mut Context<Self>) {
        if let Some(s) = self.server_settings.as_mut() {
            s.active_role = None;
            s.notice = Some(format!("Role \"{name}\" created."));
        }
        self.pending_new_role = true;
        cx.notify();
    }

    pub(super) fn close_server_settings(&mut self, cx: &mut Context<Self>) {
        self.server_settings = None;
        cx.notify();
    }

    fn server_notice(&mut self, text: String, cx: &mut Context<Self>) {
        if let Some(s) = self.server_settings.as_mut() {
            s.notice = Some(text);
        }
        cx.notify();
    }

    /// handleSaveProfile(): name, colour, icon and banner.
    fn save_server_profile(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        let body = json!({
            "name": s.name.read(cx).text(),
            "color": s.color,
            "iconUrl": if s.icon_url.is_empty() { Value::Null } else { json!(s.icon_url) },
            "bannerUrl": if s.banner_url.is_empty() { Value::Null } else { json!(s.banner_url) },
        });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, body) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => {
                    this.load_servers(cx);
                    this.server_notice("Server profile saved successfully!".into(), cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { "Failed to save server profile".into() } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// handleIconUpload / handleBannerUpload: kept once Save Changes is pressed.
    fn upload_server_image(&mut self, banner: bool, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
            let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/jpeg",
            };
            let result = cx
                .background_executor()
                .spawn(async move {
                    let bytes = std::fs::read(&path)?;
                    client.upload_reply("file", &name, mime, &bytes)
                })
                .await;
            this.update(cx, |this, cx| match result.map(|v| v.get("url").and_then(Value::as_str).map(str::to_string)) {
                Ok(Some(url)) => {
                    if let Some(s) = this.server_settings.as_mut() {
                        if banner {
                            s.banner_url = url;
                        } else {
                            s.icon_url = url;
                        }
                    }
                    this.server_notice(if banner { "Server banner uploaded! Click 'Save Changes' to apply." } else { "Server icon uploaded! Click 'Save Changes' to apply." }.into(), cx);
                }
                Ok(None) => this.server_notice(if banner { "Banner upload failed" } else { "Icon upload failed" }.into(), cx),
                Err(e) => this.server_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_server_settings(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let s = self.server_settings.as_ref()?;
        let server = self.servers.iter().find(|x| x.id == s.server_id)?;
        let can = self.server_can();
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();

        // The sidebar: groups of items, dividers, then Delete / Leave.
        let tab = s.tab;
        let header = |text: String| div().flex_none().pt(px(12.)).px(px(10.)).pb(px(6.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::quiet()).whitespace_nowrap().child(text.to_uppercase());
        let item = |id: &'static str, label: String, cx: &mut Context<Self>| {
            let active = tab == id;
            div()
                .id(SharedString::from(format!("ss-tab-{id}")))
                .flex_none()
                .px(px(10.))
                .py(px(8.))
                .rounded(px(8.))
                .text_size(px(14.))
                .line_height(px(21.))
                .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::MEDIUM })
                .text_color(if active { ink } else { muted })
                .when(active, |d| d.bg(Theme::lavender_soft()))
                .when(!active, |d| d.hover(|s| s.bg(gpui::white().opacity(0.06)).text_color(Theme::ink())))
                .cursor_pointer()
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(s) = this.server_settings.as_mut() {
                        s.tab = id;
                        s.notice = None;
                    }
                    cx.notify();
                }))
        };
        // `.sidebar-divider` keeps its 8px margins but draws no line in this theme.
        let divider = || div().flex_none().my(px(8.)).h(px(0.));
        let mut side = div()
            .id("ss-sidebar")
            .w(px(240.))
            .h_full()
            .flex_none()
            .overflow_y_scroll()
            .bg(Theme::panel())
            .border_r_1()
            .border_color(Theme::line())
            .px(px(16.))
            .py(px(32.))
            .flex()
            .flex_col()
            .gap(px(2.))
            .child(header(server.name.clone()))
            .child(item("profile", t("serverSettings.tab.profile"), cx));
        if can.expressions {
            side = side
                .child(divider())
                .child(header(t("serverSettings.group.expression")))
                .child(item("emoji", t("serverSettings.tab.emoji"), cx))
                .child(item("stickers", t("serverSettings.tab.stickers"), cx))
                .child(item("soundboard", t("serverSettings.tab.soundboard"), cx));
        }
        if can.members || can.roles || can.invites || can.access || can.manage_server || can.owner {
            side = side.child(divider()).child(header(t("serverSettings.group.people")));
            if can.members {
                side = side.child(item("members", t("serverSettings.tab.members"), cx));
            }
            if can.roles {
                side = side.child(item("roles", t("serverSettings.tab.roles"), cx));
            }
            if can.invites {
                side = side.child(item("invites", t("serverSettings.tab.invites"), cx));
            }
            if can.access {
                side = side.child(item("access", t("serverSettings.tab.access"), cx));
            }
            if can.manage_server || can.owner {
                side = side.child(item("welcome", t("serverSettings.tab.welcome"), cx));
            }
        }
        if can.manage_server || can.owner {
            side = side.child(divider()).child(header(t("serverSettings.group.apps"))).child(item("integrations", t("serverSettings.tab.integrations"), cx));
        }
        if can.moderate || can.audit || can.ban {
            side = side.child(divider()).child(header(t("serverSettings.group.moderation")));
            if can.moderate {
                side = side.child(item("safety", t("serverSettings.tab.safety"), cx));
            }
            if can.audit {
                side = side.child(item("audit_log", t("serverSettings.tab.auditLog"), cx));
            }
            if can.ban {
                side = side.child(item("bans", t("serverSettings.tab.bans"), cx));
            }
            if can.moderate {
                side = side.child(item("automod", t("serverSettings.tab.automod"), cx));
            }
        }
        if can.manage_server || can.owner {
            side = side.child(divider()).child(item("community", "Enable Community".into(), cx)).child(item("template", t("serverSettings.tab.templates"), cx));
        }
        side = side.child(divider());
        let red: Hsla = rgb(0xf23f43).into();
        let (sid, sname) = (server.id.clone(), server.name.clone());
        if can.owner {
            if can.manage_server {
                side = side.child(
                    div()
                        .id("ss-delete")
                        .flex_none()
                        .px(px(10.))
                        .py(px(8.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(14.))
                        .line_height(px(21.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(red)
                        .cursor_pointer()
                        .hover(move |s| s.bg(red.opacity(0.1)))
                        .child(t("serverSettings.deleteServer"))
                        .child(ui::icon("trash-2", 16., red))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.confirm = Some(Confirm {
                                title: format!("Delete '{sname}'?"),
                                text: "Are you sure you want to delete this server? This action cannot be undone.".into(),
                                ok: "Delete Server".into(),
                                cancel: t("common.cancel"),
                                action: ConfirmAction::DeleteServer(sid.clone()),
                            });
                            this.server_settings = None;
                            cx.notify();
                        })),
                );
            }
        } else {
            side = side.child(
                div()
                    .id("ss-leave")
                    .flex_none()
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(14.))
                    .line_height(px(21.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(red)
                    .cursor_pointer()
                    .hover(move |s| s.bg(red.opacity(0.1)))
                    .child(t("serverSettings.leaveServer"))
                    .child(ui::icon("log-out", 14., red))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.confirm = Some(Confirm {
                            title: format!("Leave {sname}?"),
                            text: "You will need a fresh invite to come back. Your messages stay.".into(),
                            ok: t("serverSettings.leaveServer"),
                            cancel: t("common.cancel"),
                            action: ConfirmAction::LeaveServer(sid.clone()),
                        });
                        this.server_settings = None;
                        cx.notify();
                    })),
            );
        }

        let page: AnyElement = match tab {
            "profile" => self.render_server_profile(s, server, can, window, cx),
            "members" => self.render_server_members(s, server, can, window, cx),
            "roles" => self.render_server_roles(s, server, can, window, cx),
            "invites" => self.render_server_invites(s, server, can, cx),
            "bans" => self.render_server_bans(s, cx),
            "audit_log" => self.render_server_audit(s, server, window, cx),
            "emoji" => self.render_server_emoji(s, can, cx),
            "stickers" => self.render_server_stickers(s, can, window, cx),
            "soundboard" => self.render_server_sounds(s, can, cx),
            "access" | "community" => self.render_server_access(s, server, can, cx),
            "welcome" => self.render_server_welcome(s, cx),
            "automod" => self.render_server_automod(s, server, can, cx),
            "safety" => self.render_server_safety(s, server, can, cx),
            "template" => self.render_server_template(s, server, cx),
            other => self.render_server_tab(other, s, server, can, window, cx),
        };
        let main = div()
            .id("ss-main")
            .flex_1()
            .h_full()
            .min_w_0()
            .overflow_y_scroll()
            .track_scroll(&s.main_scroll)
            .bg(Theme::chat_bg())
            .px(px(60.))
            .py(px(40.))
            .flex()
            .flex_col()
            .children(s.notice.clone().map(|n| div().flex_none().text_size(px(16.)).line_height(px(24.)).text_color(ink).child(n)))
            .child(page);

        // `.discord-esc-button`.
        let esc = div()
            .id("ss-esc")
            .absolute()
            .top(px(24.))
            .right(px(32.))
            .flex()
            .flex_col()
            .items_center()
            .gap(px(4.))
            .cursor_pointer()
            .child(div().size(px(36.)).rounded_full().border_2().border_color(muted).flex().items_center().justify_center().text_size(px(20.)).line_height(px(30.)).text_color(muted).child("×"))
            .child(div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(muted).child("ESC"))
            .on_click(cx.listener(|this, _, _, cx| this.close_server_settings(cx)));

        Some(
            div()
                .id("server-settings")
                .absolute()
                .inset_0()
                .bg(Theme::chat_bg())
                .text_color(ink)
                .flex()
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_scroll_wheel(|_, _, cx| cx.stop_propagation())
                .child(side)
                .child(main)
                .child(esc)
                .into_any_element(),
        )
    }

    /// ServerProfileTab: name, icon, banner (picture or one of ten gradients), traits, Save, and the
    /// live server card beside it.
    fn render_server_profile(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let scale = window.scale_factor();
        let label = |text: &str| div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(text.to_uppercase());
        let hint = |text: &str| div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(text.to_string());
        let field = || div().flex().flex_col().gap(px(8.));
        let primary = |id: &'static str, text: &'static str| {
            div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().hover(|s| s.opacity(0.9)).child(text)
        };
        let secondary = |id: &'static str, text: &'static str| {
            div()
                .id(id)
                .h(px(38.25))
                .px(px(18.))
                .rounded(px(8.))
                .bg(Theme::card())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .text_size(px(13.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(ink)
                .cursor_pointer()
                .child(text)
        };
        let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
        let left_w = (main_w - 48. - 300.).max(260.);
        let sw = (left_w - 32.) / 5.;
        let mut swatches = div().flex().flex_wrap().gap(px(8.));
        for (n, (name, a, b)) in BANNER_COLORS.iter().enumerate() {
            let selected = s.gradient == n;
            swatches = swatches.child(
                div()
                    .id(SharedString::from(format!("ss-swatch-{n}")))
                    .w(px(sw))
                    .h(px(54.))
                    .rounded(px(8.))
                    .border_2()
                    .border_color(if selected { gpui::white() } else { gpui::transparent_black() })
                    .bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(*a), 0.), gpui::linear_color_stop(rgb(*b), 1.)))
                    .cursor_pointer()
                    .tooltip(ui::tooltip(name.to_string()))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.gradient = n;
                            s.banner_url.clear();
                        }
                        cx.notify();
                    })),
            );
        }
        let tw = (left_w - 20.) / 3.;
        let mut traits = div().flex().flex_wrap().gap(px(10.));
        for n in 0..5 {
            traits = traits.child(div().id(SharedString::from(format!("ss-trait-{n}"))).w(px(tw)).h(px(48.)).px(px(12.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().items_center().child(ui::icon("smile", 20., ink)));
        }
        let mut left = div().w(px(left_w)).flex_none().flex().flex_col().gap(px(24.));
        if !can.manage_server {
            left = left.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(13.))
                    .text_color(muted)
                    .child(ui::icon("info", 16., muted))
                    .child("Viewing server overview in read-only mode. You need the Manage Server permission to edit server details."),
            );
        }
        left = left
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Profile"))
                    .child(div().mt(px(28.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Customize how your server appears in invite links and, if enabled, in Server Discovery and Announcement Channel messages")),
            )
            .child(field().child(label("Name")).child(div().h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(s.name.clone())))
            .child(
                field()
                    .child(label("Server Icon (Photo)"))
                    .child(hint("Upload a custom image/photo for your server icon (minimum 512x512 recommended)."))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(primary("ss-icon-up", "Upload Server Icon").on_click(cx.listener(|this, _, _, cx| this.upload_server_image(false, cx))))
                            .when(!s.icon_url.is_empty(), |d| {
                                d.child(secondary("ss-icon-rm", "Remove Icon").on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.icon_url.clear();
                                    }
                                    cx.notify();
                                })))
                            }),
                    ),
            )
            .child(
                field()
                    .child(label("Server Banner Image"))
                    .child(hint("Upload a custom header banner image for your server sidebar."))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(primary("ss-banner-up", "Upload Server Banner").on_click(cx.listener(|this, _, _, cx| this.upload_server_image(true, cx))))
                            .when(!s.banner_url.is_empty(), |d| {
                                d.child(secondary("ss-banner-rm", "Remove Banner").on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.banner_url.clear();
                                    }
                                    cx.notify();
                                })))
                            }),
                    ),
            )
            .child(field().child(label("Or Pick Banner Gradient")).child(swatches))
            .child(field().child(label("Traits")).child(hint("Add up to 5 traits to show off your server's interests and personality.")).child(traits));
        if can.manage_server {
            left = left.child(div().flex().child(primary("ss-save", "Save Changes").on_click(cx.listener(|this, _, _, cx| this.save_server_profile(cx)))));
        }

        // `.server-card-preview`.
        let (a, b) = (BANNER_COLORS[s.gradient].1, BANNER_COLORS[s.gradient].2);
        let banner: AnyElement = if s.banner_url.is_empty() {
            div().h(px(100.)).bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(a), 0.), gpui::linear_color_stop(rgb(b), 1.))).into_any_element()
        } else {
            div().h(px(100.)).overflow_hidden().child(gpui::img(self.client.absolute(&s.banner_url)).size_full().object_fit(gpui::ObjectFit::Cover)).into_any_element()
        };
        let name_text = s.name.read(cx).text();
        let color = crate::theme::css_color(&s.color).unwrap_or_else(|| rgb(0x7b63e6).into());
        let avatar: AnyElement = if s.icon_url.is_empty() {
            div().text_size(px(24.)).font_weight(FontWeight::EXTRA_BOLD).text_color(gpui::white()).child(if server.icon.is_empty() { name_text.chars().take(2).collect::<String>().to_uppercase() } else { server.icon.clone() }).into_any_element()
        } else {
            gpui::img(self.client.absolute(&s.icon_url)).size(px(56.)).object_fit(gpui::ObjectFit::Cover).into_any_element()
        };
        let members = self.members.get(&server.id).map(|m| m.len()).unwrap_or(0);
        let online = self.members.get(&server.id).map(|m| m.iter().filter(|m| self.presence_of(&m.id) != "offline").count()).unwrap_or(0);
        let _ = scale;
        let card = div()
            .w(px(300.))
            .flex_none()
            .rounded(px(12.))
            .overflow_hidden()
            .bg(Theme::panel())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(12.)), blur_radius: px(30.), spread_radius: px(0.) }])
            .child(banner)
            .child(
                div()
                    .relative()
                    .p(px(16.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .absolute()
                            .left(px(16.))
                            .top(px(-32.))
                            .size(px(64.))
                            .rounded(px(16.))
                            .border(px(4.))
                            .border_color(Theme::panel())
                            .bg(color)
                            .overflow_hidden()
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(4.)), blur_radius: px(12.), spread_radius: px(0.) }])
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(avatar),
                    )
                    .child(div().mt(px(28.)).text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(name_text))
                    .child(
                        div()
                            .mt(px(6.))
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .text_color(rgb(0xb5bac1))
                            .child(div().size(px(8.)).rounded_full().bg(rgb(0x23a55a)))
                            .child(format!("{online} Online"))
                            .child(div().ml(px(6.)).size(px(8.)).rounded_full().bg(rgb(0x80848e)))
                            .child(format!("{} Members", if members > 0 { members } else { 12 })),
                    )
                    .child(div().mt(px(10.)).text_size(px(11.)).line_height(px(16.5)).text_color(muted).child("Est. Jun 2026")),
            );
        div().flex().items_start().gap(px(48.)).child(left).child(card).into_any_element()
    }

    /// moderate (kick or ban) once confirmed.
    pub(super) fn moderate_member(&mut self, server: String, member: String, name: String, action: &'static str, cx: &mut Context<Self>) {
        let path = format!("/api/members/{}", url::form_urlencoded::byte_serialize(member.as_bytes()).collect::<String>());
        let body = json!({ "serverId": server, "action": action });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post(&path, body) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => {
                    if let Some(list) = this.members.get_mut(&server) {
                        list.retain(|m| m.id != member);
                    }
                    if action == "unban" {
                        if let Some(s) = this.server_settings.as_mut()
                            && let Some(list) = s.bans.as_mut()
                        {
                            list.retain(|b| b["userId"].as_str() != Some(member.as_str()));
                        }
                        this.server_notice(format!("{name} can rejoin the conversation."), cx);
                        return;
                    }
                    this.server_notice(format!("{} {name}.", if action == "kick" { "Kicked" } else { "Banned" }), cx);
                    this.load_servers(cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { format!("Could not {action} member.") } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// toggleMemberRole(): shown at once, then POST /api/roles/assign.
    fn toggle_member_role(&mut self, server: String, user: String, role: String, add: bool, cx: &mut Context<Self>) {
        if let Some(m) = self.members.get_mut(&server).and_then(|l| l.iter_mut().find(|m| m.id == user)) {
            let mut held: Vec<String> = m.role_ids.get(&server).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            held.retain(|r| r != &role);
            if add {
                held.push(role.clone());
            }
            if !m.role_ids.is_object() {
                m.role_ids = json!({});
            }
            m.role_ids[&server] = json!(held);
        }
        let body = json!({ "serverId": server, "userId": user, "roleId": role, "add": add });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/roles/assign", body) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.server_notice(e.to_string(), cx);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// ServerMembersTab: search, then each member with where they came from, their roles (add /
    /// remove), and kick / ban — the grid's fourth column wraps under the first, as on the web.
    fn render_server_members(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let grey: Hsla = rgb(0x949ba4).into();
        let query = s.member_search.read(cx).text().trim().to_lowercase();
        let mut roles = server.roles.clone();
        roles.sort_by_key(|r| -r.position);
        let held = |m: &crate::model::Member| -> Vec<String> { m.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default() };
        let all = self.members.get(&server.id).cloned().unwrap_or_default();
        let shown: Vec<&crate::model::Member> = all
            .iter()
            .filter(|m| {
                query.is_empty()
                    || m.display_name.to_lowercase().contains(&query)
                    || m.username.to_lowercase().contains(&query)
                    || m.joined_via.as_ref().is_some_and(|j| j.code.to_lowercase().contains(&query) || j.creator_username.as_deref().unwrap_or("").to_lowercase().contains(&query) || j.creator_name.as_deref().unwrap_or("").to_lowercase().contains(&query))
                    || roles.iter().any(|r| held(m).contains(&r.id) && r.name.to_lowercase().contains(&query))
            })
            .collect();
        let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
        let mid_w = (main_w - 32. - 280. - 140.).max(60.);
        let head = |text: &str, w: f32| div().w(px(w)).flex_none().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(grey).child(text.to_string());
        let mut list = div().flex().flex_col().gap(px(4.));
        for m in shown.iter() {
            let owner = server.owner_id.as_deref() == Some(m.id.as_str());
            let mine = held(m);
            let member_roles: Vec<&crate::model::Role> = roles.iter().filter(|r| mine.contains(&r.id)).collect();
            let open_menu = s.role_menu.as_deref() == Some(m.id.as_str());
            let online = self.presence_of(&m.id) != "offline";
            let joined: AnyElement = match (&m.joined_via, owner) {
                (Some(j), _) => div()
                    .flex()
                    .items_center()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .h(px(20.5))
                            .px(px(6.))
                            .rounded(px(4.))
                            .border_1()
                            .border_color(rgba(0x5865f24d))
                            .bg(rgba(0x5865f226))
                            .font_family(crate::theme::MONO_FONT)
                            .text_size(px(11.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(rgb(0xa5b4fc))
                            .child(ui::icon("link", 12., rgb(0xa5b4fc)))
                            .child(j.code.clone()),
                    )
                    .children(j.creator_username.clone().or(j.creator_name.clone()).map(|by| div().text_size(px(11.)).text_color(grey).child(format!("by @{by}"))))
                    .into_any_element(),
                (None, true) => div().flex().items_center().gap(px(4.)).text_size(px(11.)).italic().text_color(rgb(0x80848e)).child(ui::icon("crown", 12., rgb(0x80848e))).child("Server Owner").into_any_element(),
                (None, false) => div().text_size(px(11.)).italic().text_color(rgb(0x80848e)).child("Direct / Default").into_any_element(),
            };
            let mut role_col = div().w(px(140.)).flex_none().flex().flex_wrap().items_center().gap(px(4.));
            for r in &member_roles {
                let color = crate::theme::css_color(&r.color);
                let (sid, uid, rid) = (server.id.clone(), m.id.clone(), r.id.clone());
                role_col = role_col.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .px(px(8.))
                        .py(px(3.))
                        .rounded(px(4.))
                        .bg(gpui::white().opacity(0.08))
                        .border_1()
                        .border_color(color.map(|c| c.opacity(0.4)).unwrap_or(gpui::transparent_black()))
                        .text_size(px(11.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(div().size(px(8.)).rounded_full().bg(color.unwrap_or(rgb(0x99aab5).into())))
                        .child(div().text_color(color.unwrap_or(rgb(0xdbdee1).into())).child(r.name.clone()))
                        .when(can.roles, |d| {
                            d.child(
                                div()
                                    .id(SharedString::from(format!("rr-{}-{}", m.id, r.id)))
                                    .opacity(0.6)
                                    .hover(|s| s.opacity(1.))
                                    .cursor_pointer()
                                    .child(ui::icon("x", 12., color.unwrap_or(rgb(0xdbdee1).into())))
                                    .on_click(cx.listener(move |this, _, _, cx| this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), false, cx))),
                            )
                        }),
                );
            }
            if can.roles {
                let uid = m.id.clone();
                let mut add = div().relative().child(
                    div()
                        .id(SharedString::from(format!("ra-{}", m.id)))
                        .size(px(22.))
                        .rounded(px(4.))
                        .bg(gpui::white().opacity(0.06))
                        .border_1()
                        .border_dashed()
                        .border_color(gpui::white().opacity(0.2))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .hover(|s| s.bg(gpui::white().opacity(0.12)))
                        .tooltip(ui::tooltip("Add Role".to_string()))
                        .child(ui::icon("plus", 14., rgb(0xb5bac1)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(s) = this.server_settings.as_mut() {
                                s.role_menu = if s.role_menu.as_deref() == Some(uid.as_str()) { None } else { Some(uid.clone()) };
                            }
                            cx.notify();
                        })),
                );
                if open_menu {
                    let missing: Vec<&crate::model::Role> = roles.iter().filter(|r| !mine.contains(&r.id)).collect();
                    let mut menu = div().absolute().top(px(22.)).left_0().min_w(px(160.)).p(px(6.)).rounded(px(8.)).bg(rgb(0x111214)).border_1().border_color(gpui::white().opacity(0.12)).shadow(ui::card_shadow()).flex().flex_col();
                    if missing.is_empty() {
                        menu = menu.child(div().px(px(8.)).py(px(6.)).text_size(px(11.)).text_color(grey).child("No more roles to add"));
                    }
                    for r in missing {
                        let color = crate::theme::css_color(&r.color);
                        let (sid, uid, rid) = (server.id.clone(), m.id.clone(), r.id.clone());
                        menu = menu.child(
                            div()
                                .id(SharedString::from(format!("rao-{}-{}", m.id, r.id)))
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .px(px(8.))
                                .py(px(6.))
                                .rounded(px(4.))
                                .text_size(px(12.))
                                .cursor_pointer()
                                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.15)))
                                .child(div().size(px(8.)).rounded_full().bg(color.unwrap_or(rgb(0x99aab5).into())))
                                .child(div().text_color(color.unwrap_or(rgb(0xdbdee1).into())).child(r.name.clone()))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.role_menu = None;
                                    }
                                    this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), true, cx);
                                })),
                        );
                    }
                    add = add.child(gpui::deferred(menu).with_priority(3));
                }
                role_col = role_col.child(add);
            }
            let mut actions = div().w(px(280.)).flex().justify_end().items_center().gap(px(6.));
            if !owner && (can.members || can.ban) {
                let act = |id: String, icon: &'static str, tip: &'static str, danger: bool| {
                    div()
                        .id(SharedString::from(id))
                        .p(px(6.))
                        .rounded(px(4.))
                        .cursor_pointer()
                        .hover(move |s| if danger { s.bg(rgba(0xef444433)) } else { s.bg(gpui::white().opacity(0.08)) })
                        .tooltip(ui::tooltip(tip.to_string()))
                        .child(ui::icon(icon, 15., grey))
                };
                let (sid, uid, name) = (server.id.clone(), m.id.clone(), m.display_name_or_name());
                let server_name = server.name.clone();
                let (sid2, uid2, name2, server_name2) = (sid.clone(), uid.clone(), name.clone(), server_name.clone());
                actions = actions
                    .child(act(format!("kick-{}", m.id), "user-minus", "Kick Member", false).on_click(cx.listener(move |this, _, _, cx| {
                        this.confirm = Some(Confirm {
                            title: format!("Kick {name}?"),
                            text: format!("Are you sure you want to remove {name} from {server_name}? They will be able to rejoin with an invite."),
                            ok: "Kick Member".into(),
                            cancel: t("common.cancel"),
                            action: ConfirmAction::Moderate(sid.clone(), uid.clone(), name.clone(), "kick"),
                        });
                        cx.notify();
                    })))
                    .when(can.ban, |d| {
                        d.child(act(format!("ban-{}", m.id), "hammer", "Ban Member", true).on_click(cx.listener(move |this, _, _, cx| {
                            this.confirm = Some(Confirm {
                                title: format!("Ban {name2}?"),
                                text: format!("Are you sure you want to ban {name2} from {server_name2}? They will not be able to rejoin unless unbanned."),
                                ok: "Ban Member".into(),
                                cancel: t("common.cancel"),
                                action: ConfirmAction::Moderate(sid2.clone(), uid2.clone(), name2.clone(), "ban"),
                            });
                            cx.notify();
                        })))
                    });
            }
            let face = div()
                .relative()
                .flex_none()
                .child(ui::avatar(self.picture(&m.avatar_url), &m.avatar, &m.color, m.name(), 36.))
                .child(div().absolute().right(px(-1.)).bottom(px(-1.)).size(px(12.)).rounded_full().border_2().border_color(rgb(0x1e1f22)).bg(if online { rgb(0x3ba55d) } else { rgb(0x80848e) }));
            list = list.child(
                div()
                    .px(px(16.))
                    .py(px(10.))
                    .rounded(px(8.))
                    .bg(Theme::panel())
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .child(
                                div()
                                    .w(px(280.))
                                    .flex_none()
                                    .flex()
                                    .items_center()
                                    .gap(px(12.))
                                    .child(face)
                                    .child(
                                        div()
                                            .min_w_0()
                                            .flex()
                                            .flex_col()
                                            .child(div().flex().items_center().gap(px(4.)).text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf2f3f5)).child(m.display_name_or_name()).when(owner, |d| d.child(ui::icon("crown", 14., rgb(0xf59e0b)))))
                                            .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(grey).child(format!("@{}", m.username))),
                                    ),
                            )
                            .child(div().w(px(mid_w)).flex_none().child(joined))
                            .child(role_col),
                    )
                    .child(actions),
            );
        }
        let _ = (ink, muted);
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Members"))
            .child(div().mt(px(-4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("{} {} in {}. Manage their server roles, view invite sources, and moderate members here.", shown.len(), if shown.len() == 1 { "member" } else { "members" }, server.name)))
            .child(div().relative().h(px(43.)).pl(px(36.)).pr(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().absolute().left(px(12.)).top(px(14.)).opacity(0.6).child(ui::icon("search", 14., ink))).child(div().flex_1().child(s.member_search.clone())))
            .child(
                div()
                    .mt(px(-8.))
                    .px(px(16.))
                    .py(px(8.))
                    .border_b_1()
                    .border_color(Theme::divider())
                    .flex()
                    .flex_col()
                    .child(div().flex().child(head("MEMBER", 280.)).child(head("JOINED VIA", mid_w)).child(head("ROLES", 140.)))
                    .child(div().w(px(280.)).flex().justify_end().child(head("ACTIONS", 60.).flex().justify_end())),
            )
            .child(list.mt(px(-8.)))
            .into_any_element()
    }

    /// A role change that answers with the servers: reload them, then the notice.
    fn role_call(&mut self, method: &'static str, path: String, body: Value, notice: Option<String>, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match method {
                        "POST" => client.settings_post(&path, body),
                        "DELETE" => client.settings_delete(&path, body),
                        _ => client.settings_patch(&path, body),
                    }
                })
                .await;
            this.update(cx, |this, cx| match result {
                Ok(v) => {
                    // The answer carries the servers; the newest role opens after Create Role.
                    if method == "POST"
                        && let Some(sid) = this.server_settings.as_ref().map(|s| s.server_id.clone())
                        && let Some(role) = v.get("servers").and_then(Value::as_array).and_then(|a| a.iter().find(|s| s["id"] == sid.as_str())).and_then(|s| s["roles"].as_array()).and_then(|r| r.last()).and_then(|r| r["id"].as_str())
                        && let Some(s) = this.server_settings.as_mut()
                    {
                        s.active_role = Some(role.to_string());
                    }
                    this.load_servers(cx);
                    if let Some(n) = notice {
                        this.server_notice(n, cx);
                    }
                }
                Err(e) => this.server_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    /// toggleRolePermission(): the flag flipped, shown at once (the next toggle builds on it).
    fn toggle_role_permission(&mut self, flag: u64, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let Some(role_id) = s.active_role.clone() else { return };
        let sid = s.server_id.clone();
        let Some(server) = self.servers.iter_mut().find(|x| x.id == sid) else { return };
        let (path, body) = if role_id == EVERYONE {
            server.everyone_permissions ^= flag;
            ("/api/roles/everyone".to_string(), json!({ "serverId": sid, "permissions": server.everyone_permissions }))
        } else {
            let Some(role) = server.roles.iter_mut().find(|r| r.id == role_id) else { return };
            role.permissions ^= flag;
            (format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role_id.as_bytes()).collect::<String>()), json!({ "permissions": role.permissions }))
        };
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, body) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.server_notice(if e.to_string().is_empty() { "Could not update permissions".into() } else { e.to_string() }, cx);
                    this.load_servers(cx);
                }
            })
            .ok();
        })
        .detach();
    }

    fn save_role_emoji(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let Some(role) = s.active_role.clone().filter(|r| r != EVERYONE) else { return };
        let emoji = s.role_emoji.read(cx).text().trim().to_string();
        if emoji.is_empty() {
            return;
        }
        let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role.as_bytes()).collect::<String>());
        self.role_call("PATCH", path, json!({ "icon": emoji }), Some("Role icon saved.".into()), cx);
    }

    fn upload_role_icon(&mut self, cx: &mut Context<Self>) {
        let Some(role) = self.server_settings.as_ref().and_then(|s| s.active_role.clone()).filter(|r| r != EVERYONE) else { return };
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
            let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/jpeg",
            };
            let result = cx.background_executor().spawn(async move { client.upload_field("image", &name, mime, &std::fs::read(&path)?) }).await;
            this.update(cx, |this, cx| match result {
                Ok(key) => {
                    let icon = format!("/hangout/api/uploads/{}", url::form_urlencoded::byte_serialize(key.as_bytes()).collect::<String>());
                    let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role.as_bytes()).collect::<String>());
                    this.role_call("PATCH", path, json!({ "icon": icon }), Some("Role icon saved.".into()), cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { "That image did not upload.".into() } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// ServerRolesTab: Default Permissions (@everyone), search and Create Role, the roles, and the
    /// open role's icon and permissions.
    fn render_server_roles(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let grey: Hsla = rgb(0x949ba4).into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let query = s.role_search.read(cx).text().to_lowercase();
        let roles: Vec<&crate::model::Role> = server.roles.iter().filter(|r| r.name.to_lowercase().contains(&query)).collect();
        let members = self.members.get(&server.id).map(|m| m.len()).unwrap_or(0);
        let active = s.active_role.clone();
        let everyone = active.as_deref() == Some(EVERYONE);
        let _ = window;
        let mut page = div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Roles"))
            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Use roles to group your server members and assign permissions."))
            .child(
                div()
                    .id("ss-everyone")
                    .px(px(20.))
                    .py(px(16.))
                    .rounded(px(8.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(if everyone { lavender } else { gpui::transparent_black() })
                    .flex()
                    .items_center()
                    .justify_between()
                    .cursor_pointer()
                    .child(div().flex().flex_col().gap(px(6.)).child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).child("Default Permissions")).child(div().text_size(px(12.)).line_height(px(15.)).text_color(grey).child("@everyone · applies to all server members")))
                    .child(div().text_size(px(20.)).line_height(px(30.)).text_color(grey).child("›"))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.active_role = Some(EVERYONE.into());
                        }
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .mt(px(10.))
                    .flex()
                    .items_center()
                    .gap(px(16.))
                    .child(div().flex_1().relative().h(px(43.)).pl(px(36.)).pr(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().absolute().left(px(12.)).top(px(14.)).opacity(0.6).child(ui::icon("search", 14., ink))).child(div().flex_1().child(s.role_search.clone())))
                    .when(can.roles, |d| {
                        d.child(div().id("ss-create-role").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().child("Create Role").on_click(cx.listener(|this, _, window, cx| {
                            this.open_prompt(super::channel_tools::PromptKind::CreateRole, "Create Role".into(), "Enter a name for the new role:".into(), String::new(), "e.g. Moderator", "Create Role", None, window, cx);
                        })))
                    }),
            )
            .child(div().pt(px(12.)).px(px(10.)).pb(px(4.)).flex().justify_between().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(grey).child(format!("ROLES - {}", roles.len())).child("MEMBERS"));
        let mut list = div().flex().flex_col().gap(px(4.));
        for r in &roles {
            let selected = active.as_deref() == Some(r.id.as_str());
            let color = crate::theme::css_color(&r.color).unwrap_or(rgb(0x99aab5).into());
            let id = r.id.clone();
            let icon_el = r.icon.as_ref().filter(|i| !i.is_empty()).map(|i| {
                if i.starts_with('/') || i.starts_with("http") {
                    gpui::img(self.client.absolute(i)).size(px(16.)).into_any_element()
                } else {
                    div().text_size(px(14.)).child(i.clone()).into_any_element()
                }
            });
            let act = |id: String, icon: &'static str, tip: &'static str| div().id(SharedString::from(id)).p(px(6.)).rounded(px(4.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.08))).tooltip(ui::tooltip(tip.to_string())).child(ui::icon(icon, 14., rgb(0xb5bac1)));
            list = list.child(
                div()
                    .id(SharedString::from(format!("ss-role-{}", r.id)))
                    .h(px(50.))
                    .px(px(16.))
                    .rounded(px(6.))
                    .bg(if selected { rgb(0x35373c) } else { rgb(0x1e1f22) })
                    .flex()
                    .items_center()
                    .cursor_pointer()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(ui::icon("grip-vertical", 14., rgb(0x6d6f78)))
                            .child(ui::icon("shield", 16., color))
                            .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(r.name.clone()))
                            .children(icon_el),
                    )
                    .child(div().flex_1().flex().justify_center().child(div().flex().items_center().gap(px(4.)).text_size(px(16.)).line_height(px(24.)).text_color(ink).child(members.to_string()).child(ui::icon("users", 14., ink))))
                    .child(div().flex().items_center().gap(px(8.)).child(act(format!("ss-role-edit-{}", r.id), "pencil", "Edit Role")).child(act(format!("ss-role-more-{}", r.id), "ellipsis", "More")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.active_role = Some(id.clone());
                        }
                        cx.notify();
                    })),
            );
        }
        page = page.child(list);
        let active_role: Option<(String, String, u64, Option<String>)> = match active.as_deref() {
            Some(EVERYONE) => Some((EVERYONE.into(), "@everyone".into(), server.everyone_permissions, None)),
            Some(id) => server.roles.iter().find(|r| r.id == id).map(|r| (r.id.clone(), r.name.clone(), r.permissions, r.icon.clone())),
            None => None,
        };
        if let (Some((rid, rname, perms, ricon)), true) = (active_role, can.roles) {
            let mut editor = div().mt(px(24.)).flex().flex_col();
            if rid != EVERYONE {
                let has_icon = ricon.as_ref().is_some_and(|i| !i.is_empty());
                let emoji_ok = { let e = s.role_emoji.read(cx).text(); !e.trim().is_empty() && Some(e.trim().to_string()) != ricon };
                let current: AnyElement = match ricon.as_ref().filter(|i| !i.is_empty()) {
                    Some(i) if i.starts_with('/') || i.starts_with("http") => gpui::img(self.client.absolute(i)).size(px(28.)).into_any_element(),
                    Some(i) => div().text_size(px(22.)).child(i.clone()).into_any_element(),
                    None => div().text_size(px(22.)).line_height(px(22.)).child("—").into_any_element(),
                };
                let plain = |id: &'static str, text: String| div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer().child(text);
                editor = editor.child(
                    div()
                        .mt(px(12.))
                        .mb(px(20.))
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .child(div().text_size(px(16.)).line_height(px(24.)).text_color(ink).child(t("roleIcon.title")))
                        .child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(t("roleIcon.desc")))
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .items_center()
                                .gap(px(8.))
                                .child(div().ml(px(4.)).size(px(28.)).flex().items_center().justify_center().child(current))
                                .child(div().w(px(120.)).h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(s.role_emoji.clone()))
                                .child(div().id("ss-role-emoji").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).when(!emoji_ok, |d| d.opacity(0.5)).when(emoji_ok, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.save_role_emoji(cx)))).child(t("roleIcon.save")))
                                .child(plain("ss-role-upload", t("roleIcon.upload")).on_click(cx.listener(|this, _, _, cx| this.upload_role_icon(cx))))
                                .when(has_icon, |d| {
                                    let rid = rid.clone();
                                    d.child(plain("ss-role-remove-icon", t("roleIcon.remove")).on_click(cx.listener(move |this, _, _, cx| {
                                        let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(rid.as_bytes()).collect::<String>());
                                        this.role_call("PATCH", path, json!({ "icon": Value::Null }), Some("Role icon removed.".into()), cx);
                                    })))
                                }),
                        ),
                );
            }
            editor = editor.child(div().mb(px(8.)).text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(format!("Edit Permissions for {rname}")));
            if rid == EVERYONE {
                editor = editor.child(div().mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Every member has these, whatever roles they hold."));
            }
            for (flag, label, desc, _) in PERMISSIONS.iter() {
                let on = perms & flag == *flag;
                let flag = *flag;
                editor = editor.child(
                    div()
                        .id(SharedString::from(format!("ss-perm-{flag}")))
                        .py(px(14.))
                        .border_b_1()
                        .border_color(Theme::divider())
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(16.))
                        .cursor_pointer()
                        .child(div().flex_1().flex().flex_col().gap(px(4.)).child(div().text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(label.clone())).child(div().text_size(px(13.)).line_height(px(19.5)).text_color(grey).child(desc.clone())))
                        // Chrome's dark checkbox in the #5865f2 accent.
                        .child(
                            div()
                                .flex_none()
                                .size(px(18.))
                                .child(
                                    div()
                                        .size(px(18.))
                                        .rounded(px(3.))
                                        .when(on, |d| d.bg(rgb(0x5865f2)).child(div().size_full().flex().items_center().justify_center().child(ui::icon("check", 14., gpui::white()))))
                                        .when(!on, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585))),
                                ),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_role_permission(flag, cx))),
                );
            }
            page = page.child(editor);
        }
        page.into_any_element()
    }

    /// The tab's list, fetched once when it is first shown (and on Refresh).
    fn ss_load(&self, kind: &'static str, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        if !s.loading.borrow_mut().insert(kind) {
            return;
        }
        let sid = url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>();
        let (path, key) = match kind {
            "invites" => (format!("/api/invites?serverId={sid}"), "invites"),
            "bans" => (format!("/api/bans?serverId={sid}"), "bans"),
            "emojis" => (format!("/api/emojis?serverId={sid}"), "emojis"),
            "stickers" => (format!("/api/stickers/packs?serverId={sid}"), "stickers"),
            "sounds" => (format!("/api/sounds?serverId={sid}"), "sounds"),
            "automod" => (format!("/api/automod?serverId={sid}"), "rules"),
            "reports" => (format!("/api/reports?serverId={sid}"), "reports"),
            _ => (format!("/api/audit?serverId={sid}"), "entries"),
        };
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let Some(s) = this.server_settings.as_mut() else { return };
                s.loading.borrow_mut().remove(kind);
                let list = result.ok().and_then(|v| v.get(key).and_then(Value::as_array).cloned()).unwrap_or_default();
                match kind {
                    "invites" => s.invites = Some(list),
                    "bans" => s.bans = Some(list),
                    "emojis" => s.emojis = Some(list),
                    "reports" => s.reports = Some(list),
                    "automod" => s.automod = Some(list.into_iter().map(|mut r| { if r.get("enabled").is_none() { r["enabled"] = json!(true); } r }).collect()),
                    "stickers" | "sounds" => {
                        if kind == "stickers" {
                            s.stickers = Some(list.clone());
                        } else {
                            s.sounds = Some(list.clone());
                        }
                        this.make_expr_inputs(kind, &list, cx);
                    }
                    _ => s.audit = Some(list),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn ss_refresh(&mut self, kind: &'static str, cx: &mut Context<Self>) {
        if let Some(s) = self.server_settings.as_mut() {
            match kind {
                "invites" => s.invites = None,
                "bans" => s.bans = None,
                "emojis" => s.emojis = None,
                "reports" => s.reports = None,
                "automod" => s.automod = None,
                "stickers" => s.stickers = None,
                "sounds" => s.sounds = None,
                _ => s.audit = None,
            }
        }
        self.ss_load(kind, cx);
        cx.notify();
    }

    /// A server-settings call; `then` runs on success, errors become the notice.
    fn ss_call(&mut self, call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static, then: impl FnOnce(&mut Self, &mut Context<Self>) + 'static, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { call(&client) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => then(this, cx),
                Err(e) => this.server_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    fn ss_button(id: SharedString, label: &str, kind: &str) -> gpui::Stateful<gpui::Div> {
        let ink: Hsla = Theme::ink().into();
        let base = div().id(id).flex_none().h(px(34.25)).px(px(10.)).rounded(px(8.)).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).cursor_pointer().child(label.to_string());
        match kind {
            "secondary" => base.bg(Theme::card()).border_1().border_color(rgb(0x4b4d5b)).text_color(ink),
            "danger" => base.bg(Hsla::from(Theme::coral()).opacity(0.14)).border_1().border_color(Hsla::from(Theme::coral()).opacity(0.35)).text_color(Theme::coral()),
            _ => base.border_1().border_color(rgb(0x4b4d5b)).text_color(rgb(0xaaaeba)),
        }
    }

    /// ServerInvitesTab: Create Invite Code, the vanity URL, and every code with copy and revoke.
    fn render_server_invites(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        if s.invites.is_none() {
            self.ss_load("invites", cx);
        }
        let sid = server.id.clone();
        let mut page = div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Invite People"))
            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Share one of these codes to let someone join {}. A code with no use limit works until you revoke it.", server.name)));
        if can.invites {
            let creating = s.creating_invite;
            let sid = sid.clone();
            page = page.child(
                div()
                    .id("ss-new-invite")
                    .h(px(38.25))
                    .rounded(px(8.))
                    .bg(lavender)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(13.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(on_accent)
                    .when(creating, |d| d.opacity(0.5))
                    .when(!creating, |d| d.cursor_pointer())
                    .child(if creating { "Creating…" } else { "Create Invite Code" })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.creating_invite = true;
                        }
                        let sid = sid.clone();
                        this.ss_call(
                            move |c| c.create_invite(json!({ "serverId": sid, "maxUses": 100 })),
                            |this, cx| {
                                if let Some(s) = this.server_settings.as_mut() {
                                    s.creating_invite = false;
                                }
                                this.ss_refresh("invites", cx);
                            },
                            cx,
                        );
                    })),
            );
        } else {
            page = page.child(div().mt(px(8.)).text_size(px(13.5)).text_color(rgb(0xf0b232)).child("Only the server owner and designated members can create invite codes."));
        }
        // VanityInviteCard.
        let current = server.vanity_code.clone().unwrap_or_default();
        if can.manage_server || !current.is_empty() {
            let draft = s.vanity.read(cx).text().trim().to_string();
            let save_ok = !draft.is_empty() && draft.to_uppercase() != current;
            let mut card = div()
                .my(px(16.))
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(t("vanity.title")))
                .child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(t("vanity.desc")));
            if can.manage_server {
                let (sid1, sid2) = (sid.clone(), sid.clone());
                card = card.child(
                    div()
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(8.))
                        .child(div().flex_1().min_w(px(180.)).h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(s.vanity.clone()))
                        .child(
                            div()
                                .id("ss-vanity-save")
                                .h(px(38.25))
                                .px(px(18.))
                                .rounded(px(8.))
                                .bg(lavender)
                                .flex()
                                .items_center()
                                .text_size(px(13.5))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(on_accent)
                                .when(!save_ok, |d| d.opacity(0.5))
                                .when(save_ok, |d| {
                                    d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                                        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(sid1.as_bytes()).collect::<String>());
                                        let code = draft.clone();
                                        this.ss_call(move |c| c.settings_patch(&path, json!({ "vanityCode": code })), |this, cx| {
                                            this.load_servers(cx);
                                            this.server_notice(t("vanity.saved"), cx);
                                        }, cx);
                                    }))
                                })
                                .child(t("vanity.save")),
                        )
                        .when(!current.is_empty(), |d| {
                            d.child(Self::ss_button("ss-vanity-remove".into(), &t("vanity.remove"), "plain").on_click(cx.listener(move |this, _, _, cx| {
                                let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(sid2.as_bytes()).collect::<String>());
                                this.ss_call(move |c| c.settings_patch(&path, json!({ "vanityCode": Value::Null })), |this, cx| {
                                    this.load_servers(cx);
                                    this.server_notice(t("vanity.removed"), cx);
                                }, cx);
                            })))
                        }),
                );
            }
            if !current.is_empty() {
                let link = format!("https://hoffle.online/i/{}", current.to_uppercase());
                let copy = link.clone();
                card = card.child(
                    div()
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(8.))
                        .child(div().px(px(8.)).py(px(2.)).rounded(px(6.)).bg(Theme::card()).font_family(crate::theme::MONO_FONT).text_size(px(15.)).font_weight(FontWeight::BOLD).text_color(ink).child(link))
                        .child(Self::ss_button("ss-vanity-copy".into(), &t("vanity.copy"), "plain").on_click(cx.listener(move |this, _, _, cx| {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(copy.clone()));
                            this.server_notice(t("vanity.copied"), cx);
                        }))),
                );
            }
            page = page.child(card);
        }
        match &s.invites {
            None => page = page.child(div().text_size(px(13.5)).text_color(muted).child("Loading invites…")),
            Some(list) if list.is_empty() => page = page.child(div().text_size(px(13.5)).text_color(muted).child("No invites yet — create one above.")),
            Some(list) => {
                let mut ul = div().mt(px(16.)).flex().flex_col().gap(px(10.));
                for inv in list {
                    let code = inv["code"].as_str().unwrap_or_default().to_string();
                    let revoked = inv["revoked"].as_bool().unwrap_or(false);
                    let max = inv["maxUses"].as_i64().unwrap_or(0);
                    let uses = inv["uses"].as_i64().unwrap_or(0);
                    let meta = if revoked { "revoked".to_string() } else if inv["spent"].as_bool().unwrap_or(false) { "used up".into() } else if max > 0 { format!("{uses}/{max} uses") } else { format!("{uses} uses · unlimited") };
                    let (c1, c2, c3) = (code.clone(), code.clone(), code.clone());
                    ul = ul.child(
                        div()
                            .py(px(10.))
                            .rounded(px(10.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .child(div().px(px(8.)).py(px(2.)).rounded(px(6.)).bg(Theme::card()).font_family(crate::theme::MONO_FONT).text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::BOLD).text_color(ink).child(code.clone()))
                            .child(div().flex_1().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(meta))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(8.))
                                    .child(Self::ss_button(SharedString::from(format!("inv-link-{code}")), "Copy Link", "plain").on_click(cx.listener(move |this, _, _, cx| {
                                        cx.write_to_clipboard(gpui::ClipboardItem::new_string(format!("https://hoffle.online/i/{}", c1.to_uppercase())));
                                        this.server_notice("Invite link copied to clipboard.".into(), cx);
                                    })))
                                    .child(Self::ss_button(SharedString::from(format!("inv-code-{code}")), "Copy Code", "secondary").on_click(cx.listener(move |this, _, _, cx| {
                                        cx.write_to_clipboard(gpui::ClipboardItem::new_string(c2.clone()));
                                        this.server_notice("Invite code copied.".into(), cx);
                                    })))
                                    .when(!revoked, |d| {
                                        d.child(Self::ss_button(SharedString::from(format!("inv-revoke-{code}")), "Revoke", "danger").on_click(cx.listener(move |this, _, _, cx| {
                                            let path = format!("/api/invites?code={}", url::form_urlencoded::byte_serialize(c3.as_bytes()).collect::<String>());
                                            this.ss_call(move |c| c.settings_delete(&path, json!({})), |this, cx| this.ss_refresh("invites", cx), cx);
                                        })))
                                    }),
                            ),
                    );
                }
                page = page.child(ul);
            }
        }
        page.into_any_element()
    }

    /// ServerBansTab: search, Refresh, and each banned account with Unban (confirmed).
    fn render_server_bans(&self, s: &ServerSettings, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        if s.bans.is_none() {
            self.ss_load("bans", cx);
        }
        let term = s.ban_search.read(cx).text().trim().to_lowercase();
        let mut page = div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Ban List"))
            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("A ban applies to the account: it removes them from the server and stops that account rejoining. Someone could still come back with a new account, so a verification level in Safety Setup helps keep throwaway accounts out."))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(div().relative().h(px(43.)).pl(px(36.)).pr(px(14.)).rounded(px(6.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().items_center().child(div().absolute().left(px(12.)).top(px(14.)).opacity(0.6).child(ui::icon("search", 14., ink))).child(div().flex_1().child(s.ban_search.clone())))
                    .child(div().flex().child(div().id("ss-bans-refresh").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().child("Refresh").on_click(cx.listener(|this, _, _, cx| this.ss_refresh("bans", cx))))),
            );
        match &s.bans {
            None => page = page.child(div().text_size(px(13.5)).text_color(muted).child("Loading the ban list…")),
            Some(list) if list.is_empty() => {
                page = page.child(
                    div()
                        .mt(px(20.))
                        .px(px(20.))
                        .py(px(60.))
                        .rounded(px(16.))
                        .bg(Theme::panel())
                        .border_1()
                        .border_color(Theme::line())
                        .flex()
                        .flex_col()
                        .items_center()
                        .child(div().size(px(120.)).rounded_full().bg(ink.opacity(0.06)).flex().flex_col().items_center().justify_center().child(ui::icon("hammer", 26., ink)).child(ui::icon("zap", 26., ink)))
                        .child(div().mt(px(12.)).text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child("NO BANS"))
                        .child(div().mt(px(12.)).text_size(px(14.)).line_height(px(21.)).text_color(muted).child("You haven't banned anybody... but if and when you must, do not hesitate!")),
                )
            }
            Some(list) => {
                let shown: Vec<&Value> = list
                    .iter()
                    .filter(|b| term.is_empty() || ["username", "displayName", "userId"].iter().any(|k| b[*k].as_str().unwrap_or_default().to_lowercase().contains(&term)))
                    .collect();
                if shown.is_empty() {
                    page = page.child(div().text_size(px(13.5)).text_color(muted).child("Nobody matched that search."));
                } else {
                    let mut ul = div().mt(px(14.)).flex().flex_col().gap(px(8.));
                    for b in shown {
                        let (uid, name) = (b["userId"].as_str().unwrap_or_default().to_string(), b["displayName"].as_str().unwrap_or_default().to_string());
                        let mut sub = format!("@{}", b["username"].as_str().unwrap_or_default());
                        if let Some(by) = b["bannedBy"].as_str() {
                            sub.push_str(&format!(" · banned by {by}"));
                        }
                        if let Some(at) = b["bannedAt"].as_str().and_then(crate::model::parse_time) {
                            sub.push_str(&format!(" · {}", at.with_timezone(&chrono::Local).format("%-m/%-d/%Y")));
                        }
                        let avatar_url = b["avatarUrl"].as_str().filter(|u| !u.is_empty()).map(str::to_string);
                        let sid = s.server_id.clone();
                        ul = ul.child(
                            div()
                                .px(px(12.))
                                .py(px(10.))
                                .rounded(px(10.))
                                .bg(Theme::paper())
                                .border_1()
                                .border_color(Theme::line())
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(ui::avatar(self.picture(&avatar_url), b["avatar"].as_str().unwrap_or_default(), b["color"].as_str().unwrap_or_default(), &name, 36.))
                                .child(div().flex_1().flex().flex_col().child(div().text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(ink).child(name.clone())).child(div().text_size(px(12.)).text_color(muted).child(sub)))
                                .child(Self::ss_button(SharedString::from(format!("unban-{uid}")), "Unban", "plain").on_click(cx.listener(move |this, _, _, cx| {
                                    this.confirm = Some(Confirm {
                                        title: format!("Unban {name}?"),
                                        text: "They will be able to read and post here again.".into(),
                                        ok: "Unban".into(),
                                        cancel: t("common.cancel"),
                                        action: ConfirmAction::Moderate(sid.clone(), uid.clone(), name.clone(), "unban"),
                                    });
                                    cx.notify();
                                }))),
                        );
                    }
                    page = page.child(ul);
                }
            }
        }
        page.into_any_element()
    }

    /// ServerAuditLogTab: Refresh, the five filters and a search, then who did what, newest first.
    fn render_server_audit(&self, s: &ServerSettings, server: &crate::model::Server, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        if s.audit.is_none() {
            self.ss_load("audit", cx);
        }
        let _ = window;
        let q = s.audit_query.read(cx).text().trim().to_lowercase();
        let mut chips = div().my(px(12.)).flex().flex_wrap().items_center().gap(px(8.));
        for (id, label) in [("all", "All Actions"), ("moderation", "Moderation"), ("structure", "Channels & Roles"), ("members", "Members & Invites"), ("integrations", "Webhooks & Bots")] {
            let on = s.audit_cat == id;
            chips = chips.child(
                div()
                    .id(SharedString::from(format!("audit-cat-{id}")))
                    .h(px(24.))
                    .px(px(12.))
                    .rounded_full()
                    .flex()
                    .items_center()
                    .text_size(px(12.))
                    .font_weight(FontWeight::MEDIUM)
                    .bg(if on { rgb(0x6366f1).into() } else { Hsla::from(Theme::panel()) })
                    .text_color(if on { gpui::white().into() } else { Hsla::from(rgb(0xd4d4d8)) })
                    .cursor_pointer()
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.audit_cat = id;
                        }
                        cx.notify();
                    })),
            );
        }
        chips = chips.child(div().ml_auto().w(px(220.)).h(px(28.)).px(px(12.)).flex().items_center().child(s.audit_query.clone()));
        let mut page = div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Audit Log"))
                    .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Who did what in {}, newest first.", server.name)))
                    .child(div().flex().child(div().id("ss-audit-refresh").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().child("Refresh").on_click(cx.listener(|this, _, _, cx| this.ss_refresh("audit", cx))))),
            )
            .child(chips);
        match &s.audit {
            None => page = page.child(div().text_size(px(13.5)).text_color(muted).child("Loading the audit log…")),
            Some(all) => {
                let shown: Vec<&Value> = all
                    .iter()
                    .filter(|e| {
                        let action = e["action"].as_str().unwrap_or_default();
                        if !audit_matches(action, s.audit_cat) {
                            return false;
                        }
                        if q.is_empty() {
                            return true;
                        }
                        let label = AUDIT_LABELS.get(action).map(String::as_str).unwrap_or(action);
                        [e["actorName"].as_str(), Some(action), Some(label), e["targetName"].as_str(), e["detail"].as_str()].iter().flatten().any(|t| t.to_lowercase().contains(&q))
                    })
                    .collect();
                if shown.is_empty() {
                    page = page.child(div().p(px(24.)).text_size(px(14.)).text_color(muted).child(if all.is_empty() { "Nothing has happened here yet." } else { "No audit entries match your filter." }));
                } else {
                    let mut ul = div().mt(px(14.)).flex().flex_col().gap(px(2.));
                    for (n, e) in shown.iter().enumerate() {
                        let action = e["action"].as_str().unwrap_or_default();
                        let label = AUDIT_LABELS.get(action).cloned().unwrap_or_else(|| action.to_string());
                        let when = e["createdAt"].as_str().and_then(crate::model::parse_time).map(|t| t.with_timezone(&chrono::Local).format("%-m/%-d/%Y, %-I:%M:%S %p").to_string()).unwrap_or_default();
                        let mut text = vec![(e["actorName"].as_str().unwrap_or_default().to_string(), FontWeight::BOLD, ink), (format!(" {label}"), FontWeight::NORMAL, ink)];
                        if let Some(target) = e["targetName"].as_str() {
                            text.push((format!(" {target}"), FontWeight::NORMAL, lavender));
                        }
                        if let Some(detail) = e["detail"].as_str() {
                            text.push((format!(" ({detail})"), FontWeight::NORMAL, muted));
                        }
                        let mut line = div().flex_1().min_w_0().flex().flex_wrap().text_size(px(13.)).line_height(px(19.5));
                        for (part, weight, color) in text {
                            line = line.child(div().font_weight(weight).text_color(color).whitespace_nowrap().child(part));
                        }
                        ul = ul.child(
                            div()
                                .px(px(10.))
                                .py(px(8.))
                                .rounded(px(8.))
                                .when(n % 2 == 0, |d| d.bg(ink.opacity(0.04)))
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(div().text_size(px(16.)).line_height(px(16.)).text_color(lavender).child("•"))
                                .child(line)
                                .child(div().flex_none().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(when)),
                        );
                    }
                    page = page.child(ul);
                }
            }
        }
        page.into_any_element()
    }

    /// InlineName: a field per sticker / sound (and a sound's emoji) that saves on Enter.
    fn make_expr_inputs(&mut self, kind: &'static str, list: &[Value], cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        let mut made = Vec::new();
        for item in list {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            let fields: Vec<(&str, usize, f32)> = if kind == "sounds" { vec![("name", 40, 14.), ("emoji", 8, 20.)] } else { vec![("name", 40, 13.)] };
            for (field, max, size) in fields {
                let key = format!("{kind}:{field}:{id}");
                if s.expr_inputs.contains_key(&key) {
                    continue;
                }
                let value = item[field].as_str().unwrap_or_default().to_string();
                let input = cx.new(|cx| {
                    let mut i = TextInput::new("", cx).look(Look { size, line_height: size * 1.5, height: size * 1.5, color: Theme::ink().into(), placeholder: Theme::muted().into() });
                    i.set_text(value, cx);
                    i.move_to_start(cx);
                    i
                });
                made.push((key, input, id.clone(), field, max));
            }
        }
        for (key, input, id, field, max) in made {
            let sub = cx.subscribe(&input, move |this, input, event, cx| match event {
                InputEvent::Submit => {
                    let next = input.read(cx).text().trim().to_string();
                    if next.is_empty() {
                        return;
                    }
                    let (path, body) = if kind == "sounds" { ("/api/sounds".to_string(), json!({ "id": id, field: next })) } else { ("/api/stickers/packs".to_string(), json!({ "id": id, "name": next })) };
                    this.ss_call(move |c| c.settings_patch(&path, body), |_, cx| cx.notify(), cx);
                }
                InputEvent::Changed => {
                    let text = input.read(cx).text();
                    if text.chars().count() > max {
                        let cut: String = text.chars().take(max).collect();
                        input.update(cx, |i, cx| i.set_text(cut, cx));
                    }
                }
                _ => {}
            });
            if let Some(s) = self.server_settings.as_mut() {
                s.expr_inputs.insert(key, input);
                s.expr_subs.push(sub);
            }
        }
    }

    /// Upload Stickers / Upload Sounds: several files, each uploaded then added under its file name.
    fn upload_expressions(&mut self, kind: &'static str, cx: &mut Context<Self>) {
        let Some(sid) = self.server_settings.as_ref().map(|s| s.server_id.clone()) else { return };
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: true, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            this.update(cx, |this, cx| {
                if let Some(s) = this.server_settings.as_mut() {
                    s.uploading = true;
                }
                cx.notify();
            })
            .ok();
            let count = paths.len();
            let result = cx
                .background_executor()
                .spawn(async move {
                    for path in paths {
                        let file = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
                        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                        let mime = match ext.as_str() {
                            "png" => "image/png",
                            "gif" => "image/gif",
                            "webp" => "image/webp",
                            "jpg" | "jpeg" => "image/jpeg",
                            "mp3" => "audio/mpeg",
                            "ogg" => "audio/ogg",
                            "wav" => "audio/wav",
                            "m4a" => "audio/mp4",
                            _ => "application/octet-stream",
                        };
                        let key = client.upload_field("file", &file, mime, &std::fs::read(&path)?)?;
                        let name: String = path.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default().chars().take(40).collect();
                        let name = if name.is_empty() { "untitled".to_string() } else { name };
                        let body = json!({ "serverId": sid, "key": key, "name": name });
                        client.settings_post(if kind == "sounds" { "/api/sounds" } else { "/api/stickers/packs" }, body)?;
                    }
                    anyhow::Ok(())
                })
                .await;
            this.update(cx, |this, cx| {
                if let Some(s) = this.server_settings.as_mut() {
                    s.uploading = false;
                }
                let what = if kind == "sounds" { "sound" } else { "sticker" };
                match result {
                    Ok(()) => this.server_notice(if count == 1 { format!("{}{} added.", what[..1].to_uppercase(), &what[1..]) } else { format!("{count} {what}s added.") }, cx),
                    Err(e) => this.server_notice(e.to_string(), cx),
                }
                this.ss_refresh(kind, cx);
            })
            .ok();
        })
        .detach();
    }

    /// handleFileSelect(): pick the picture, then name it (the prompt), then it uploads.
    fn pick_emoji(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let handle = window.window_handle();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let default: String = path.file_stem().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(32).collect();
            cx.update_window(handle, |_, window, cx| {
                this.update(cx, |this, cx| {
                    if let Some(s) = this.server_settings.as_mut() {
                        s.pending_emoji = Some(path);
                    }
                    this.open_prompt(super::channel_tools::PromptKind::EmojiName, "Upload Custom Emoji".into(), "Enter emoji name (letters, numbers, underscores):".into(), default, "e.g. party_cat", "Upload Emoji", None, window, cx);
                })
                .ok();
            })
            .ok();
        })
        .detach();
    }

    /// The named emoji: upload the picture, then add it.
    pub(super) fn upload_emoji(&mut self, name: String, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        let Some(path) = s.pending_emoji.take() else { return };
        if name.trim().is_empty() {
            return;
        }
        s.uploading = true;
        let sid = s.server_id.clone();
        let client = self.client.clone();
        let label = name.trim().to_string();
        cx.spawn(async move |this, cx| {
            let n = label.clone();
            let result = cx
                .background_executor()
                .spawn(async move {
                    let file = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "emoji".into());
                    let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                        Some("png") => "image/png",
                        Some("gif") => "image/gif",
                        Some("webp") => "image/webp",
                        _ => "image/jpeg",
                    };
                    let key = client.upload_field("file", &file, mime, &std::fs::read(&path)?)?;
                    client.settings_post("/api/emojis", json!({ "serverId": sid, "key": key, "name": n }))
                })
                .await;
            this.update(cx, |this, cx| {
                if let Some(s) = this.server_settings.as_mut() {
                    s.uploading = false;
                }
                match result {
                    Ok(_) => {
                        this.server_notice(format!("Uploaded emoji :{label}:"), cx);
                        this.load_servers(cx);
                    }
                    Err(e) => this.server_notice(if e.to_string().is_empty() { "Failed to add emoji".into() } else { e.to_string() }, cx),
                }
                this.ss_refresh("emojis", cx);
            })
            .ok();
        })
        .detach();
    }

    /// A removal once confirmed: emoji, sticker or sound by id.
    pub(super) fn remove_expression(&mut self, kind: &'static str, id: String, cx: &mut Context<Self>) {
        let enc = url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>();
        let path = match kind {
            "emojis" => format!("/api/emojis?id={enc}"),
            "stickers" => format!("/api/stickers/packs?id={enc}"),
            _ => format!("/api/sounds?id={enc}"),
        };
        self.ss_call(move |c| c.settings_delete(&path, json!({})), move |this, cx| {
            if kind == "emojis" {
                this.load_servers(cx);
            }
            this.ss_refresh(kind, cx);
        }, cx);
    }

    fn expr_table_head() -> gpui::Div {
        div()
            .px(px(14.))
            .py(px(10.))
            .bg(rgba(0x0000002e))
            .flex()
            .gap(px(12.))
            .text_size(px(11.))
            .line_height(px(16.5))
            .font_weight(FontWeight::BOLD)
            .text_color(rgb(0x949ba4))
            .child(div().w(px(72.)).child("EMOJI"))
            .child(div().flex_1().child("NAME"))
            .child("ACTIONS")
    }

    fn table_button_icon(id: SharedString, label: &str, icon: &'static str) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .h(px(30.))
            .px(px(10.))
            .rounded(px(8.))
            .bg(gpui::white().opacity(0.06))
            .border_1()
            .border_color(rgba(0xffffff1a))
            .flex()
            .items_center()
            .gap(px(4.))
            .text_size(px(12.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(rgb(0xdbdee1))
            .cursor_pointer()
            .child(ui::icon(icon, 13., rgb(0xdbdee1)))
            .child(label.to_string())
    }

    fn table_button(id: SharedString, label: &str, danger: bool) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .h(px(30.))
            .px(px(10.))
            .rounded(px(8.))
            .bg(gpui::white().opacity(0.06))
            .border_1()
            .border_color(if danger { rgba(0xf871714d) } else { rgba(0xffffff1a) })
            .flex()
            .items_center()
            .gap(px(4.))
            .text_size(px(12.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(if danger { rgb(0xf87171) } else { rgb(0xdbdee1) })
            .cursor_pointer()
            .child(label.to_string())
    }

    fn expr_header(title: &str, text: String, button: Option<gpui::Stateful<gpui::Div>>, note: &str) -> gpui::Div {
        let ink: Hsla = Theme::ink().into();
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .when(!title.is_empty(), |d| d.child(div().flex().flex_col().child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child(title.to_string())).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(Theme::muted()).child(text))))
            .children(button.map(|b| div().flex().flex_col().gap(px(12.)).child(div().flex().child(b)).child(div().text_size(px(12.)).line_height(px(18.)).text_color(rgb(0x949ba4)).child(note.to_string()))))
    }

    fn upload_button(id: &'static str, label: &str, busy: bool) -> gpui::Stateful<gpui::Div> {
        div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(Theme::lavender()).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0x15121f)).when(busy, |d| d.opacity(0.5)).when(!busy, |d| d.cursor_pointer()).child(label.to_string())
    }

    fn empty_box(icons: Vec<&'static str>, title: &str, text: &str) -> gpui::Div {
        let ink: Hsla = Theme::ink().into();
        div()
            .px(px(20.))
            .py(px(60.))
            .rounded(px(16.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .flex()
            .flex_col()
            .items_center()
            .child(div().size(px(120.)).rounded_full().bg(ink.opacity(0.06)).flex().items_center().justify_center().gap(px(6.)).children(icons.into_iter().map(|i| ui::icon(i, if title.contains("EMOJI") { 22. } else { 42. }, ink))))
            .child(div().mt(px(12.)).text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child(title.to_string()))
            .child(div().mt(px(12.)).text_size(px(14.)).line_height(px(21.)).text_color(Theme::muted()).child(text.to_string()))
    }

    /// ServerEmojiTab: Upload Emoji (picture, then its name), and the emoji with Remove.
    fn render_server_emoji(&self, s: &ServerSettings, can: Can, cx: &mut Context<Self>) -> AnyElement {
        if s.emojis.is_none() {
            self.ss_load("emojis", cx);
        }
        let manage = can.manage_server || can.owner;
        let button = manage.then(|| Self::upload_button("ss-emoji-up", if s.uploading { "Uploading..." } else { "Upload Emoji" }, s.uploading).on_click(cx.listener(|this, _, window, cx| this.pick_emoji(window, cx))));
        // `.emoji-pane`: the title and the line are the pane's own children, 24px apart.
        let mut page = Self::expr_header("", String::new(), None, "").child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(Theme::ink()).child("Emoji")).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(Theme::muted()).child("Add up to 50 custom emoji that anyone can use in this server. Animated GIF emoji may be used by members with Discord Nitro.")).children(button.map(|b| div().flex().flex_col().gap(px(12.)).child(div().flex().child(b)).child(div().text_size(px(12.)).line_height(px(18.)).text_color(rgb(0x949ba4)).child("If you want to upload multiple emojis or skip the editor, drag and drop the file(s) onto this page."))));
        let _unused = Self::expr_header("Emoji", "Add up to 50 custom emoji that anyone can use in this server. Animated GIF emoji may be used by members with Discord Nitro.".into(), None, "");
        match &s.emojis {
            None => page = page.child(div().text_size(px(14.)).text_color(Theme::muted()).child("Loading emojis...")),
            Some(list) if list.is_empty() => page = page.child(Self::empty_box(vec!["crown", "smile", "ellipsis", "skull"], "NO EMOJI", "Get the party started by uploading an emoji")),
            Some(list) => {
                let mut table = div().rounded(px(12.)).border_1().border_color(Theme::divider()).overflow_hidden().flex().flex_col().child(Self::expr_table_head());
                for (n, e) in list.iter().enumerate() {
                    let (id, name) = (e["id"].as_str().unwrap_or_default().to_string(), e["name"].as_str().unwrap_or_default().to_string());
                    let url = e["url"].as_str().map(|u| self.client.absolute(u)).unwrap_or_default();
                    let label = name.clone();
                    table = table.child(
                        div()
                            .px(px(14.))
                            .py(px(10.))
                            .when(n > 0, |d| d.border_t_1().border_color(rgba(0xffffff0d)))
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(div().w(px(72.)).child(gpui::img(url).size(px(32.)).object_fit(gpui::ObjectFit::Contain)))
                            .child(div().flex_1().text_size(px(14.)).line_height(px(21.)).text_color(rgb(0xdbdee1)).child(format!(":{name}:")))
                            .when(manage, |d| {
                                d.child(Self::table_button(SharedString::from(format!("emoji-rm-{n}")), "Remove", true).on_click(cx.listener(move |this, _, _, cx| {
                                    this.confirm = Some(Confirm {
                                        title: format!("Remove :{label}:?"),
                                        text: "This emoji will be permanently removed from this server.".into(),
                                        ok: "Remove Emoji".into(),
                                        cancel: t("common.cancel"),
                                        action: ConfirmAction::RemoveExpression("emojis", id.clone()),
                                    });
                                    cx.notify();
                                })))
                            }),
                    );
                }
                page = page.child(table);
            }
        }
        page.into_any_element()
    }

    /// StickersTab: Upload Stickers (several at once), and each sticker with its name and remove.
    fn render_server_stickers(&self, s: &ServerSettings, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        if s.stickers.is_none() {
            self.ss_load("stickers", cx);
        }
        let manage = can.expressions;
        let button = manage.then(|| Self::upload_button("ss-sticker-up", if s.uploading { "Uploading…" } else { "Upload Stickers" }, s.uploading).on_click(cx.listener(|this, _, _, cx| this.upload_expressions("stickers", cx))));
        let mut page = Self::expr_header("Stickers", "Stickers anyone in this server can send from the sticker picker. PNG, GIF and WebP images up to 8 MB work best.".into(), button, "You can pick several images at once.");
        match &s.stickers {
            None => page = page.child(div().text_size(px(14.)).text_color(Theme::muted()).child("Loading stickers…")),
            Some(list) if list.is_empty() => page = page.child(Self::empty_box(vec!["sticker"], "NO STICKERS", if manage { "Upload an image to make the first one." } else { "Nobody has added any yet." })),
            Some(list) => {
                let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
                let cols = ((main_w + 12.) / 152.).floor().max(1.);
                let card_w = (main_w - 12. * (cols - 1.)) / cols;
                let mut grid = div().flex().flex_wrap().gap(px(12.));
                for (n, st) in list.iter().enumerate() {
                    let (id, name) = (st["id"].as_str().unwrap_or_default().to_string(), st["name"].as_str().unwrap_or_default().to_string());
                    let url = st["url"].as_str().map(|u| self.client.absolute(u)).unwrap_or_default();
                    let input = s.expr_inputs.get(&format!("stickers:name:{id}")).cloned();
                    let group = SharedString::from(format!("sticker-card-{n}"));
                    grid = grid.child(
                        div()
                            .id(SharedString::from(format!("ss-sticker-{n}")))
                            .group(group.clone())
                            .relative()
                            .w(px(card_w))
                            .p(px(12.))
                            .rounded(px(12.))
                            .bg(rgba(0x00000033))
                            .border_1()
                            .border_color(Theme::divider())
                            .flex()
                            .flex_col()
                            .items_center()
                            .gap(px(8.))
                            .child(gpui::img(url).size(px(96.)).object_fit(gpui::ObjectFit::Contain))
                            .children(input.map(|i| div().w_full().h(px(29.5)).px(px(6.)).rounded(px(6.)).border_1().border_color(gpui::transparent_black()).hover(|s| s.border_color(Theme::line())).flex().items_center().child(i)))
                            .when(manage, |d| {
                                d.child(
                                    div()
                                        .id(SharedString::from(format!("ss-sticker-rm-{n}")))
                                        .absolute()
                                        .top(px(6.))
                                        .right(px(6.))
                                        .size(px(26.))
                                        .rounded_full()
                                        .bg(rgba(0x0000008c))
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .opacity(0.)
                                        .group_hover(group, |s| s.opacity(1.))
                                        .cursor_pointer()
                                        .child(ui::icon("trash-2", 14., rgb(0xf87171)))
                                        .on_click(cx.listener(move |this, _, _, cx| {
                                            this.confirm = Some(Confirm {
                                                title: format!("Remove \"{name}\"?"),
                                                text: "It will disappear from the sticker picker for everyone.".into(),
                                                ok: "Remove Sticker".into(),
                                                cancel: t("common.cancel"),
                                                action: ConfirmAction::RemoveExpression("stickers", id.clone()),
                                            });
                                            cx.notify();
                                        })),
                                )
                            }),
                    );
                }
                page = page.child(grid);
            }
        }
        page.into_any_element()
    }

    /// SoundboardTab: Upload Sounds, the server's clips (emoji, name, Play, Remove), then your own pack.
    fn render_server_sounds(&self, s: &ServerSettings, can: Can, cx: &mut Context<Self>) -> AnyElement {
        if s.sounds.is_none() {
            self.ss_load("sounds", cx);
        }
        let manage = can.expressions;
        let button = manage.then(|| Self::upload_button("ss-sound-up", if s.uploading { "Uploading…" } else { "Upload Sounds" }, s.uploading).on_click(cx.listener(|this, _, _, cx| this.upload_expressions("sounds", cx))));
        let mut page = Self::expr_header("Soundboard", "Clips anyone in a voice channel here can play for the room. MP3, OGG, WAV or M4A up to 3 MB. Click a name or emoji to change it.".into(), button, "You can pick several clips at once.");
        let row = |n: usize, snd: &Value, editable: bool, cx: &mut Context<Self>| {
            let (id, name) = (snd["id"].as_str().unwrap_or_default().to_string(), snd["name"].as_str().unwrap_or_default().to_string());
            let url = snd["url"].as_str().map(|u| self.client.absolute(u)).unwrap_or_default();
            let emoji_in = s.expr_inputs.get(&format!("sounds:emoji:{id}")).cloned();
            let name_in = s.expr_inputs.get(&format!("sounds:name:{id}")).cloned();
            let personal = snd["personal"].as_bool().unwrap_or(false);
            let client = self.client.clone();
            div()
                .px(px(14.))
                .py(px(10.))
                .when(n > 0, |d| d.border_t_1().border_color(rgba(0xffffff0d)))
                .flex()
                .items_center()
                .gap(px(12.))
                .child(div().w(px(72.)).h(px(40.)).px(px(6.)).rounded(px(6.)).flex().items_center().justify_center().children(emoji_in))
                .child(div().flex_1().h(px(31.)).px(px(6.)).rounded(px(6.)).flex().items_center().text_color(rgb(0xdbdee1)).children(name_in))
                .child(
                    div()
                        .flex()
                        .gap(px(6.))
                        .child(Self::table_button_icon(SharedString::from(format!("snd-play-{id}")), "Play", "play").on_click(cx.listener(move |this, _, _, cx| {
                            let (client, url) = (client.clone(), url.clone());
                            cx.spawn(async move |this, cx| {
                                let ext = url.rsplit('.').next().filter(|e| e.len() <= 4).unwrap_or("mp3").to_string();
                                let bytes = cx.background_executor().spawn(async move { client.fetch(&url).map(|(_, b)| b) }).await;
                                this.update(cx, |this, cx| match bytes {
                                    Ok(b) => crate::sounds::play_clip(b, &ext),
                                    Err(_) => this.server_notice("That clip could not be played.".into(), cx),
                                })
                                .ok();
                            })
                            .detach();
                            let _ = this;
                        })))
                        .when(editable, |d| {
                            d.child(Self::table_button(SharedString::from(format!("snd-rm-{id}")), "Remove", true).on_click(cx.listener(move |this, _, _, cx| {
                                this.confirm = Some(Confirm {
                                    title: format!("Remove \"{name}\"?"),
                                    text: if personal { "It will be removed from your personal pack.".into() } else { "It will disappear from the soundboard for everyone.".into() },
                                    ok: "Remove Sound".into(),
                                    cancel: t("common.cancel"),
                                    action: ConfirmAction::RemoveExpression("sounds", id.clone()),
                                });
                                cx.notify();
                            })))
                        }),
                )
        };
        match &s.sounds {
            None => page = page.child(div().text_size(px(14.)).text_color(Theme::muted()).child("Loading sounds…")),
            Some(list) => {
                let shared: Vec<&Value> = list.iter().filter(|x| !x["personal"].as_bool().unwrap_or(false)).collect();
                let personal: Vec<&Value> = list.iter().filter(|x| x["personal"].as_bool().unwrap_or(false)).collect();
                if shared.is_empty() {
                    page = page.child(Self::empty_box(vec!["music"], "NO SERVER SOUNDS", if manage { "Upload a clip to start the soundboard. The built-in sounds are always there too." } else { "Only the built-in sounds for now." }));
                } else {
                    let mut table = div().rounded(px(12.)).border_1().border_color(Theme::divider()).overflow_hidden().flex().flex_col().child(Self::expr_table_head());
                    for (n, snd) in shared.iter().enumerate() {
                        table = table.child(row(n, snd, manage, cx));
                    }
                    page = page.child(table);
                }
                if !personal.is_empty() {
                    let mut table = div().rounded(px(12.)).border_1().border_color(Theme::divider()).overflow_hidden().flex().flex_col();
                    for (n, snd) in personal.iter().enumerate() {
                        table = table.child(row(n, snd, true, cx));
                    }
                    page = page.child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(18.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Your personal pack"))
                            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).text_color(Theme::muted()).child("Only you can play these. They follow you to every server."))
                            .child(table),
                    );
                }
            }
        }
        page.into_any_element()
    }

    /// saveAccessSettings(): directory, description and the modules switched off, in one PATCH.
    fn save_access(&mut self, is_public: bool, disabled: Vec<String>, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        s.saving_access = true;
        let description = s.description.read(cx).text();
        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        // Shown at once; the reloaded servers confirm it.
        let sid = s.server_id.clone();
        if let Some(server) = self.servers.iter_mut().find(|x| x.id == sid) {
            server.is_public = is_public;
            server.disabled_modules = disabled.clone();
        }
        let body = json!({ "isPublic": is_public, "description": description, "disabledModules": disabled });
        self.ss_call(move |c| c.settings_patch(&path, body), |this, cx| {
            if let Some(s) = this.server_settings.as_mut() {
                s.saving_access = false;
            }
            this.load_servers(cx);
            this.server_notice("Server access and feature modules updated.".into(), cx);
        }, cx);
        cx.notify();
    }

    /// ServerAccessTab: the public directory, readable on the web, the description, and which
    /// feature modules this server keeps.
    fn render_server_access(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let manage = can.manage_server && !s.saving_access;
        let is_public = server.is_public;
        let web_public = server.web_public;
        let disabled = server.disabled_modules.clone();
        let box_ = || div().p(px(16.)).rounded(px(12.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().flex_col();
        let h3 = |icon: &'static str, color: Hsla, icon_op: f32, text: String| div().flex().items_center().gap(px(8.)).text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(div().opacity(icon_op).child(ui::icon(icon, 16., color))).child(text);
        let small = |text: String| div().mt(px(4.)).opacity(0.75).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(text);
        let slug = server.vanity_code.clone().unwrap_or_else(|| server.id.clone()).to_lowercase();
        let (d0, d1) = (disabled.clone(), disabled.clone());
        let top = box_()
            .gap(px(16.))
            .child(
                div()
                    .id("ss-public")
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap(px(16.))
                    .child(div().flex_1().min_w_0().child(h3(if is_public { "globe" } else { "lock" }, if is_public { rgb(0x34d399).into() } else { rgb(0xfbbf24).into() }, 1., "Public Server Directory".into())).child(small(format!("When enabled, {} appears in the Public Servers directory so new users without an invite code can discover and join it after the tutorial.", server.name))))
                    .child(checkbox(is_public, false))
                    .when(manage, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.save_access(!is_public, d0.clone(), cx)))),
            )
            .child(
                div()
                    .id("ss-webpublic")
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap(px(16.))
                    .child({
                        // One paragraph, the address underlined inside it.
                        let before = "Anyone can read this server's open channels at ";
                        let link = format!("hoffle.online/s/{slug}");
                        let text = format!("{before}{link}, and search engines can list them. Private channels, 18+ channels and any channel with its own permissions stay hidden. Tell your members before you turn this on.");
                        let range = before.len()..before.len() + link.len();
                        let styled = gpui::StyledText::new(text).with_highlights(vec![(range, gpui::HighlightStyle { underline: Some(gpui::UnderlineStyle { thickness: px(1.), color: Some(ink), wavy: false }), ..Default::default() })]);
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(h3("globe", if web_public { rgb(0x38bdf8).into() } else { ink }, if web_public { 1. } else { 0.6 }, "Readable on the web".into()))
                            .child(div().mt(px(4.)).opacity(0.75).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(styled))
                    })
                    .child(checkbox(web_public, false))
                    .when(manage, |d| {
                        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(server.id.as_bytes()).collect::<String>());
                        d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                            let next = !web_public;
                            let path = path.clone();
                            this.ss_call(move |c| c.settings_patch(&path, json!({ "webPublic": next })), move |this, cx| {
                                this.load_servers(cx);
                                this.server_notice(if next { "Open channels are now readable on the web." } else { "This server is no longer readable on the web." }.into(), cx);
                            }, cx);
                        }))
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(div().opacity(0.75).text_size(px(11.)).line_height(px(14.67)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child("COMMUNITY DESCRIPTION (SHOWN IN PUBLIC SERVER DIRECTORY)"))
                    .child(
                        div()
                            .flex()
                            .gap(px(8.))
                            .child(div().flex_1().h(px(38.25)).flex().items_center().child(s.description.clone()))
                            .child(
                                div()
                                    .id("ss-access-save")
                                    .h(px(38.25))
                                    .px(px(18.))
                                    .rounded(px(8.))
                                    .bg(lavender)
                                    .flex()
                                    .items_center()
                                    .text_size(px(13.5))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(on_accent)
                                    .when(!manage, |d| d.opacity(0.5))
                                    .when(manage, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.save_access(is_public, d1.clone(), cx))))
                                    .child(if s.saving_access { "Saving…" } else { "Save" }),
                            ),
                    ),
            );
        let mut modules = div().pt(px(8.)).flex().flex_col().gap(px(8.));
        for (key, label, desc) in FEATURE_MODULES.iter() {
            let enabled = !disabled.contains(key);
            let (key, disabled) = (key.clone(), disabled.clone());
            modules = modules.child(
                div()
                    .id(SharedString::from(format!("ss-mod-{key}")))
                    .px(px(12.))
                    .py(px(11.))
                    .rounded(px(12.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().flex_1().min_w_0().flex().flex_col().gap(px(2.)).child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(ink).child(label.clone())).child(div().opacity(0.7).text_size(px(12.)).line_height(px(16.)).text_color(muted).child(desc.clone())))
                    .child(checkbox(enabled, true))
                    .when(manage, |d| {
                        d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                            let mut next = disabled.clone();
                            if enabled {
                                next.push(key.clone());
                            } else {
                                next.retain(|k| k != &key);
                            }
                            this.save_access(is_public, next, cx);
                        }))
                    }),
            );
        }
        let bottom = box_()
            .gap(px(12.))
            .child(div().child(h3("layers", rgb(0x818cf8).into(), 1., "Server Feature Modules (\u{201c}Simple by default, deep when you want it\u{201d})".into())).child(small(format!("Switch off optional modules your community doesn't use to keep slash commands and toolbars clean for everyone in {}.", server.name))))
            .child(modules);
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Access, Community & Feature Modules"))
            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Control whether anyone on this Hoffle can discover and join {}, and choose which feature modules are active here.", server.name)))
            .child(top.mt(px(24.)))
            .child(bottom.mt(px(24.)))
            .into_any_element()
    }

    fn welcome_field(&self, id: String, label: String, kind: &'static str, required: bool, cx: &mut Context<Self>) -> WelcomeField {
        let input = cx.new(|cx| {
            let mut i = TextInput::new("Question, e.g. What should we call you?", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() });
            i.set_text(label, cx);
            i
        });
        WelcomeField { id, label: input, kind, required }
    }

    /// GET /api/servers/<id>/welcome, then the editors for it.
    fn load_welcome(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        if !s.loading.borrow_mut().insert("welcome") {
            return;
        }
        let path = format!("/api/servers/{}/welcome", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let w = result.ok().and_then(|v| v.get("welcome").cloned()).unwrap_or(Value::Null);
                this.set_welcome(&w, cx);
                if let Some(s) = this.server_settings.as_ref() {
                    s.loading.borrow_mut().remove("welcome");
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn set_welcome(&mut self, w: &Value, cx: &mut Context<Self>) {
        let rules_text = w["rules"].as_str().unwrap_or_default().to_string();
        let rules = cx.new(|cx| {
            let mut a = crate::textarea::TextArea::new("1. Be kind to each other.\n2. No spam or self-promotion.\n3. Keep it safe for work.", cx).text(14., 21.).min_height(147.).enter_newline().placeholder_color(Hsla::from(Theme::muted()).opacity(0.75));
            a.set_value(rules_text, cx);
            a
        });
        let fields: Vec<WelcomeField> = w["fields"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|f| {
                        let kind = WELCOME_TYPES.iter().find(|t| f["type"] == t.0).map(|t| t.0).unwrap_or("text");
                        self.welcome_field(f["id"].as_str().unwrap_or_default().to_string(), f["label"].as_str().unwrap_or_default().to_string(), kind, f["required"].as_bool().unwrap_or(false), cx)
                    })
                    .collect()
            })
            .unwrap_or_default();
        let sub = cx.subscribe(&rules, |_, _, _, cx| cx.notify());
        if let Some(s) = self.server_settings.as_mut() {
            s.welcome = Some(Welcome { enabled: w["enabled"].as_bool().unwrap_or(false), rules, fields, saving: false, type_open: None, _subs: vec![sub] });
        }
    }

    fn add_welcome_field(&mut self, label: &str, kind: &'static str, cx: &mut Context<Self>) {
        let id = format!("f{:x}{}", chrono::Utc::now().timestamp_millis(), self.server_settings.as_ref().and_then(|s| s.welcome.as_ref()).map(|w| w.fields.len()).unwrap_or(0));
        let field = self.welcome_field(id, label.to_string(), kind, false, cx);
        if let Some(w) = self.server_settings.as_mut().and_then(|s| s.welcome.as_mut())
            && w.fields.len() < 10
        {
            w.fields.push(field);
        }
        cx.notify();
    }

    /// save(): PUT the whole config; the answer replaces it.
    fn save_welcome(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        let path = format!("/api/servers/{}/welcome", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        let Some(w) = s.welcome.as_mut() else { return };
        w.saving = true;
        let body = json!({
            "enabled": w.enabled,
            "rules": w.rules.read(cx).value(),
            "fields": w.fields.iter().map(|f| json!({ "id": f.id, "label": f.label.read(cx).text(), "type": f.kind, "required": f.required })).collect::<Vec<_>>(),
        });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_put(&path, body) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        if let Some(w) = v.get("welcome").cloned() {
                            this.set_welcome(&w, cx);
                        }
                        this.server_notice("Welcome screen saved.".into(), cx);
                    }
                    Err(e) => {
                        if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                            w.saving = false;
                        }
                        this.server_notice(if e.to_string().is_empty() { "Could not save the welcome screen.".into() } else { e.to_string() }, cx);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// WelcomeTab: switch it on, the rules, the intro form's questions, Save Changes.
    fn render_server_welcome(&self, s: &ServerSettings, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let Some(w) = s.welcome.as_ref() else {
            cx.spawn(async move |this, cx| {
                this.update(cx, |this, cx| this.load_welcome(cx)).ok();
            })
            .detach();
            return div().text_size(px(14.)).text_color(muted).child("Loading…").into_any_element();
        };
        let label = |text: &str| div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(text.to_uppercase());
        let hint = |text: &str| div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(text.to_string());
        let secondary = |id: SharedString| div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(Theme::card()).border_1().border_color(Theme::line()).flex().items_center().gap(px(6.)).text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer();
        let enabled = w.enabled;
        let mut form = div().flex().flex_col().gap(px(8.)).child(label("Intro form (optional)")).child(hint("Questions newcomers answer before they start. Leave empty for rules only."));
        for (n, f) in w.fields.iter().enumerate() {
            let kind_label = WELCOME_TYPES.iter().find(|t| t.0 == f.kind).map(|t| t.1).unwrap_or("Short answer");
            let open = w.type_open == Some(n);
            let mut select = div().relative().child(
                div()
                    .id(SharedString::from(format!("wf-type-{n}")))
                    .h(px(43.))
                    .px(px(14.))
                    .rounded(px(6.))
                    .bg(Theme::paper())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(14.))
                    .text_color(ink)
                    .cursor_pointer()
                    .child(kind_label)
                    .child(ui::icon("chevron-down", 14., ink))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                            w.type_open = if w.type_open == Some(n) { None } else { Some(n) };
                        }
                        cx.notify();
                    })),
            );
            if open {
                let mut menu = div().absolute().top(px(46.)).left_0().w(px(160.)).p(px(4.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).shadow(ui::card_shadow()).flex().flex_col();
                for (k, l) in WELCOME_TYPES {
                    menu = menu.child(div().id(SharedString::from(format!("wf-type-{n}-{k}"))).px(px(10.)).py(px(6.)).rounded(px(6.)).text_size(px(13.)).text_color(ink).hover(|s| s.bg(gpui::white().opacity(0.08))).cursor_pointer().child(l).on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                            w.fields[n].kind = k;
                            w.type_open = None;
                        }
                        cx.notify();
                    })));
                }
                select = select.child(gpui::deferred(menu).with_priority(3));
            }
            let required = f.required;
            form = form.child(
                div()
                    .mb(px(8.))
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(8.))
                    .child(div().flex_1().min_w(px(220.)).h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(f.label.clone()))
                    .child(select)
                    .child(
                        div()
                            .id(SharedString::from(format!("wf-req-{n}")))
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .cursor_pointer()
                            .text_size(px(16.))
                            .text_color(ink)
                            .child(checkbox(required, false))
                            .child("Required")
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                                    w.fields[n].required = !required;
                                }
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id(SharedString::from(format!("wf-rm-{n}")))
                            .p(px(6.))
                            .rounded(px(4.))
                            .cursor_pointer()
                            .hover(|s| s.bg(gpui::white().opacity(0.08)))
                            .child(ui::icon("trash-2", 16., rgb(0xb5bac1)))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                                    w.fields.remove(n);
                                }
                                cx.notify();
                            })),
                    ),
            );
        }
        if w.fields.len() < 10 {
            let empty = w.fields.is_empty();
            form = form.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(secondary("wf-add".into()).child(ui::icon("plus", 14., ink)).child("Add question").on_click(cx.listener(|this, _, _, cx| this.add_welcome_field("", "text", cx))))
                    .when(empty, |d| {
                        d.child(secondary("wf-preset".into()).child("Name + birthdate + about").on_click(cx.listener(|this, _, _, cx| {
                            this.add_welcome_field("Name", "text", cx);
                            this.add_welcome_field("Birthdate", "date", cx);
                            this.add_welcome_field("Tell us a bit about yourself", "long", cx);
                        })))
                    }),
            );
        }
        let saving = w.saving;
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().flex().flex_col().child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Welcome Screen")).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Show people who join the server your rules, and optionally a short form to introduce themselves. Only people who join after you switch it on are asked.")))
            .child(
                div()
                    .id("wf-enabled")
                    .mt(px(4.))
                    .mb(px(16.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .text_size(px(16.))
                    .line_height(px(24.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(ink)
                    .child(checkbox(enabled, false))
                    .child("Show the welcome screen to new members")
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(w) = this.server_settings.as_mut().and_then(|s| s.welcome.as_mut()) {
                            w.enabled = !enabled;
                        }
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(label("Rules"))
                    .child(hint("One rule per line works well. Markdown-style text is shown as written."))
                    .child(div().min_h(px(169.)).px(px(14.)).py(px(10.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).child(w.rules.clone())),
            )
            .child(form)
            .child(
                div().flex().child(
                    div()
                        .id("wf-save")
                        .h(px(38.25))
                        .px(px(18.))
                        .rounded(px(8.))
                        .bg(Theme::lavender())
                        .flex()
                        .items_center()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(rgb(0x15121f))
                        .when(saving, |d| d.opacity(0.5))
                        .when(!saving, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.save_welcome(cx))))
                        .child(if saving { "Saving…" } else { "Save Changes" }),
                ),
            )
            .into_any_element()
    }

    /// startCreate() / startEdit(): the draft, filled from the rule when editing.
    fn start_automod_draft(&mut self, rule: Option<Value>, cx: &mut Context<Self>) {
        let c = rule.as_ref().map(|r| r["config"].clone()).unwrap_or(Value::Null);
        let join = |k: &str| c[k].as_array().map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
        let area = |placeholder: &str, value: String, rows: f32, cx: &mut Context<Self>| {
            cx.new(|cx| {
                let mut a = crate::textarea::TextArea::new(placeholder.to_string(), cx).text(14., 21.).min_height(21. * rows).enter_newline().placeholder_color(Hsla::from(Theme::muted()).opacity(0.75));
                a.set_value(value, cx);
                a
            })
        };
        let words = area("one per line, or separated by commas", join("words"), 4., cx);
        let allow = area("youtube.com\ntenor.com   (leave empty to block every link)", join("allow"), 3., cx);
        let num = |v: i64, cx: &mut Context<Self>| {
            cx.new(|cx| {
                let mut i = TextInput::new("", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() });
                i.set_text(v.to_string(), cx);
                i
            })
        };
        let numbers = [
            num(c["max"].as_i64().unwrap_or(5), cx),
            num(c["percent"].as_i64().unwrap_or(70), cx),
            num(c["minLetters"].as_i64().unwrap_or(12), cx),
            num(c["maxRepeats"].as_i64().unwrap_or(3), cx),
            num(rule.as_ref().and_then(|r| r["timeoutMinutes"].as_i64()).filter(|v| *v > 0).unwrap_or(10), cx),
        ];
        let mut subs = vec![cx.subscribe(&words, |_, _, _, cx| cx.notify()), cx.subscribe(&allow, |_, _, _, cx| cx.notify())];
        for n in &numbers {
            subs.push(cx.subscribe(n, |_, _, _, cx| cx.notify()));
        }
        let kind = AUTOMOD_KINDS.iter().find(|k| rule.as_ref().is_some_and(|r| r["kind"] == k.0)).map(|k| k.0).unwrap_or("keyword");
        let action = if rule.as_ref().is_some_and(|r| r["action"] == "timeout") { "timeout" } else { "block" };
        let editing = rule.as_ref().and_then(|r| r["id"].as_str()).unwrap_or("new").to_string();
        if let Some(s) = self.server_settings.as_mut() {
            s.automod_notice = None;
            s.automod_draft = Some(AutomodDraft { editing, kind, action, regex: c["regex"].as_bool().unwrap_or(false), kind_open: false, action_open: false, words, allow, numbers, _subs: subs });
        }
        cx.notify();
    }

    /// saveRule(): POST a new rule or PATCH the one being edited.
    fn save_automod(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        let Some(d) = s.automod_draft.as_ref() else { return };
        let n = |i: usize| d.numbers[i].read(cx).text();
        let config = match d.kind {
            "keyword" => json!({ "kind": "keyword", "words": entries_of(&d.words.read(cx).value()), "regex": d.regex }),
            "mention_limit" => json!({ "kind": "mention_limit", "max": clamp_int(&n(0), 5, 100) }),
            "link" => json!({ "kind": "link", "allow": entries_of(&d.allow.read(cx).value()) }),
            "caps" => json!({ "kind": "caps", "minLetters": clamp_int(&n(2), 12, 1000), "percent": clamp_int(&n(1), 70, 100) }),
            _ => json!({ "kind": "repeat", "maxRepeats": clamp_int(&n(3), 3, 50) }),
        };
        if d.kind == "keyword" && config["words"].as_array().is_some_and(|a| a.is_empty()) {
            s.automod_notice = Some("A keyword rule needs at least one word to look for.".into());
            return cx.notify();
        }
        let body = json!({ "kind": d.kind, "action": d.action, "timeoutMinutes": if d.action == "timeout" { clamp_int(&n(4), 10, 10080) } else { 0 }, "config": config });
        let editing = d.editing.clone();
        let sid = s.server_id.clone();
        s.automod_saving = true;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let new = editing == "new";
            let result = cx
                .background_executor()
                .spawn(async move {
                    if new {
                        let mut b = body;
                        b["serverId"] = json!(sid);
                        client.settings_post("/api/automod", b)
                    } else {
                        client.settings_patch(&format!("/api/automod/{}", url::form_urlencoded::byte_serialize(editing.as_bytes()).collect::<String>()), body)
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                let Some(s) = this.server_settings.as_mut() else { return };
                s.automod_saving = false;
                match result {
                    Ok(_) => {
                        s.automod_draft = None;
                        s.automod_notice = Some(if new { "Rule created. It applies to the next message posted.".into() } else { "Rule updated.".into() });
                        this.ss_refresh("automod", cx);
                    }
                    Err(e) => s.automod_notice = Some(if e.to_string().is_empty() { "Could not save that rule.".into() } else { e.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// toggleRule(): paused rules stay in the list (the server would not list them again).
    fn toggle_automod(&mut self, id: String, next: bool, cx: &mut Context<Self>) {
        let path = format!("/api/automod/{}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        self.ss_call(move |c| c.settings_patch(&path, json!({ "enabled": next })), move |this, cx| {
            if let Some(s) = this.server_settings.as_mut() {
                if let Some(r) = s.automod.as_mut().and_then(|l| l.iter_mut().find(|r| r["id"] == id.as_str())) {
                    r["enabled"] = json!(next);
                }
                s.automod_notice = Some(if next { "Rule is active again.".into() } else { "Rule paused. Posts that it would have refused now go through.".into() });
            }
            cx.notify();
        }, cx);
    }

    pub(super) fn delete_automod(&mut self, id: String, cx: &mut Context<Self>) {
        let path = format!("/api/automod/{}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        self.ss_call(move |c| c.settings_delete(&path, json!({})), move |this, cx| {
            if let Some(s) = this.server_settings.as_mut() {
                if let Some(l) = s.automod.as_mut() {
                    l.retain(|r| r["id"] != id.as_str());
                }
                if s.automod_draft.as_ref().is_some_and(|d| d.editing == id) {
                    s.automod_draft = None;
                }
                s.automod_notice = Some("Rule deleted.".into());
            }
            cx.notify();
        }, cx);
    }

    /// AutomodPanel.
    fn render_server_automod(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        if s.automod.is_none() {
            self.ss_load("automod", cx);
        }
        let manage = can.manage_server || can.owner;
        let secondary = |id: SharedString| div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(Theme::card()).border_1().border_color(Theme::line()).flex().items_center().gap(px(4.)).text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer();
        let primary = |id: SharedString| div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer();
        let mut page = div().flex().flex_col().gap(px(24.)).child(
            div()
                .mt(px(10.))
                .flex()
                .items_center()
                .gap(px(16.))
                .child(div().flex_1().min_w_0().flex().flex_col().child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("AutoMod")).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Every message posted in {} is checked against these rules before it appears.", server.name))))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.))
                        .child(secondary("am-refresh".into()).child("Refresh").on_click(cx.listener(|this, _, _, cx| this.ss_refresh("automod", cx))))
                        .when(manage && s.automod_draft.is_none(), |d| d.child(primary("am-create".into()).child(ui::icon("plus", 16., on_accent)).child(div().ml(px(6.)).child("Create Rule")).on_click(cx.listener(|this, _, _, cx| this.start_automod_draft(None, cx))))),
                ),
        );
        if let Some(n) = &s.automod_notice {
            page = page.child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(rgb(0xf0b232)).child(n.clone()));
        }
        if !manage {
            page = page.child(div().text_size(px(13.5)).text_color(muted).child("You can read these rules, but only members with Manage Server can change them."));
        }
        if let (true, Some(d)) = (manage, s.automod_draft.as_ref()) {
            let label = |text: String| div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(text.to_uppercase());
            let field = || div().flex().flex_col().gap(px(8.));
            let input_box = |child: AnyElement| div().min_h(px(43.)).px(px(14.)).py(px(10.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).child(child);
            let select = |id: &'static str, text: &str, open: bool, enabled: bool, options: Vec<(&'static str, &'static str)>, which: &'static str, cx: &mut Context<Self>| {
                let mut el = div().relative().child(
                    div()
                        .id(id)
                        .h(px(43.))
                        .px(px(14.))
                        .rounded(px(6.))
                        .bg(Theme::paper())
                        .border_1()
                        .border_color(Theme::line())
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(14.))
                        .text_color(ink)
                        .when(!enabled, |d| d.opacity(0.6))
                        .when(enabled, |d| d.cursor_pointer())
                        .child(text.to_string())
                        .child(ui::icon("chevron-down", 14., ink))
                        .when(enabled, |d| {
                            d.on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(d) = this.server_settings.as_mut().and_then(|s| s.automod_draft.as_mut()) {
                                    if which == "kind" {
                                        d.kind_open = !d.kind_open;
                                    } else {
                                        d.action_open = !d.action_open;
                                    }
                                }
                                cx.notify();
                            }))
                        }),
                );
                if open {
                    let mut menu = div().absolute().top(px(46.)).left_0().right_0().p(px(4.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).shadow(ui::card_shadow()).flex().flex_col();
                    for (k, l) in options {
                        menu = menu.child(div().id(SharedString::from(format!("am-{which}-{k}"))).px(px(10.)).py(px(6.)).rounded(px(6.)).text_size(px(13.)).text_color(ink).hover(|s| s.bg(gpui::white().opacity(0.08))).cursor_pointer().child(l).on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(d) = this.server_settings.as_mut().and_then(|s| s.automod_draft.as_mut()) {
                                if which == "kind" {
                                    d.kind = k;
                                    d.kind_open = false;
                                } else {
                                    d.action = k;
                                    d.action_open = false;
                                }
                            }
                            cx.notify();
                        })));
                    }
                    el = el.child(gpui::deferred(menu).with_priority(3));
                }
                el
            };
            let kind_info = AUTOMOD_KINDS.iter().find(|k| k.0 == d.kind).copied().unwrap_or(AUTOMOD_KINDS[0]);
            let number = |i: usize, text: String| field().child(label(text)).child(input_box(d.numbers[i].clone().into_any_element()));
            let mut form = div()
                .mt(px(8.))
                .mb(px(20.))
                .p(px(18.))
                .rounded(px(10.))
                .bg(Theme::chat_bg())
                .border_1()
                .border_color(Theme::divider())
                .flex()
                .flex_col()
                .gap(px(16.))
                .child(field().child(label("Rule type".into())).child(select("am-kind", kind_info.1, d.kind_open, d.editing == "new", AUTOMOD_KINDS.iter().map(|k| (k.0, k.1)).collect(), "kind", cx)).child(div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(kind_info.2)));
            match d.kind {
                "keyword" => {
                    let regex = d.regex;
                    form = form.child(
                        field()
                            .child(label("Words or phrases".into()))
                            .child(input_box(d.words.clone().into_any_element()))
                            .child(
                                div()
                                    .id("am-regex")
                                    .flex()
                                    .items_center()
                                    .gap(px(8.))
                                    .cursor_pointer()
                                    .text_size(px(13.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(muted)
                                    .child(checkbox(regex, false))
                                    .child("Treat entries as regular expressions")
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        if let Some(d) = this.server_settings.as_mut().and_then(|s| s.automod_draft.as_mut()) {
                                            d.regex = !regex;
                                        }
                                        cx.notify();
                                    })),
                            ),
                    )
                }
                "mention_limit" => form = form.child(number(0, "Most mentions allowed in one message".into())),
                "link" => form = form.child(field().child(label("Allowed sites".into())).child(input_box(d.allow.clone().into_any_element()))),
                "caps" => form = form.child(number(1, "Refuse when more than this % of letters are capitals".into())).child(number(2, "Only check messages with at least this many letters".into())),
                _ => form = form.child(number(3, "Identical messages allowed within 10 minutes".into())),
            }
            let action_label = AUTOMOD_ACTIONS.iter().find(|a| a.0 == d.action).map(|a| a.1).unwrap_or("Refuse the message");
            form = form.child(field().child(label("When it matches".into())).child(select("am-action", action_label, d.action_open, true, AUTOMOD_ACTIONS.to_vec(), "action", cx)));
            if d.action == "timeout" {
                let minutes = d.numbers[4].read(cx).text().trim().parse::<i64>().unwrap_or(0);
                form = form.child(number(4, format!("Timeout length in minutes ({})", format_minutes(minutes))));
            }
            let saving = s.automod_saving;
            let new = d.editing == "new";
            form = form.child(
                div()
                    .flex()
                    .justify_end()
                    .gap(px(12.))
                    .child(secondary("am-cancel".into()).child("Cancel").on_click(cx.listener(|this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.automod_draft = None;
                        }
                        cx.notify();
                    })))
                    .child(primary("am-save".into()).when(saving, |d| d.opacity(0.5)).child(if saving { "Saving…" } else if new { "Create Rule" } else { "Save Rule" }).when(!saving, |d| d.on_click(cx.listener(|this, _, _, cx| this.save_automod(cx))))),
            );
            page = page.child(form);
        }
        match &s.automod {
            None => page = page.child(div().text_size(px(13.5)).text_color(muted).child("Loading automod rules…")),
            Some(rules) if rules.is_empty() => {
                page = page.child(
                    div()
                        .mt(px(20.))
                        .px(px(20.))
                        .py(px(60.))
                        .rounded(px(16.))
                        .bg(Theme::panel())
                        .border_1()
                        .border_color(Theme::line())
                        .flex()
                        .flex_col()
                        .items_center()
                        .child(div().size(px(120.)).rounded_full().bg(ink.opacity(0.06)).flex().items_center().justify_center().child(ui::icon("shield", 42., ink)))
                        .child(div().mt(px(12.)).text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child("NO AUTOMOD RULES"))
                        .child(div().mt(px(12.)).text_size(px(14.)).line_height(px(21.)).text_color(muted).child("AutoMod reads each message as it is posted and either refuses it, or refuses it and times the author out."))
                        .child(div().mt(px(12.)).text_size(px(14.)).line_height(px(21.)).text_color(muted).child("Moderators are never subject to these rules, and direct messages between two people are never filtered.")),
                )
            }
            Some(rules) => {
                let mut ul = div().mt(px(14.)).flex().flex_col().gap(px(8.));
                for r in rules {
                    let id = r["id"].as_str().unwrap_or_default().to_string();
                    let enabled = r["enabled"].as_bool().unwrap_or(true);
                    let kind = AUTOMOD_KINDS.iter().find(|k| r["kind"] == k.0).map(|k| k.1).unwrap_or("Rule");
                    let summary = summarize_rule(r);
                    let (id1, id2, rule) = (id.clone(), id.clone(), r.clone());
                    let (dkind, dsummary) = (kind.to_lowercase(), summary.split(" · ").next().unwrap_or_default().to_string());
                    ul = ul.child(
                        div()
                            .px(px(12.))
                            .py(px(10.))
                            .rounded(px(10.))
                            .bg(Theme::paper())
                            .border_1()
                            .border_color(Theme::line())
                            .opacity(if enabled { 1. } else { 0.55 })
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(div().flex_1().min_w_0().flex().flex_col().child(div().text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(ink).child(kind)).child(div().text_size(px(12.)).text_color(muted).child(summary)))
                            .child(
                                div()
                                    .id(SharedString::from(format!("am-on-{id}")))
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .text_size(px(13.))
                                    .text_color(rgb(0xb5bac1))
                                    .when(manage, |d| d.cursor_pointer().child(checkbox(enabled, false)).on_click(cx.listener(move |this, _, _, cx| this.toggle_automod(id1.clone(), !enabled, cx))))
                                    .child(if enabled { "Enabled" } else { "Disabled" }),
                            )
                            .when(manage, |d| {
                                d.child(secondary(SharedString::from(format!("am-edit-{id}"))).child(ui::icon("pencil", 14., ink)).child("Edit").on_click(cx.listener(move |this, _, _, cx| this.start_automod_draft(Some(rule.clone()), cx))))
                                    .child(Self::ss_button(SharedString::from(format!("am-del-{id}")), "", "danger").child(ui::icon("trash-2", 14., Theme::coral())).on_click(cx.listener(move |this, _, _, cx| {
                                        this.confirm = Some(Confirm {
                                            title: format!("Delete the {dkind} rule?"),
                                            text: format!("{dsummary}. Messages it would have refused will go through again."),
                                            ok: "Delete Rule".into(),
                                            cancel: t("common.cancel"),
                                            action: ConfirmAction::DeleteAutomod(id2.clone()),
                                        });
                                        cx.notify();
                                    })))
                            }),
                    );
                }
                page = page.child(ul);
                if rules.iter().any(|r| r["enabled"] == false) {
                    page = page.child(div().text_size(px(13.)).text_color(muted).child("Paused rules stay listed here so you can turn them back on."));
                }
            }
        }
        page.into_any_element()
    }

    fn patch_server(&mut self, body: Value, notice: String, cx: &mut Context<Self>) {
        let Some(sid) = self.server_settings.as_ref().map(|s| s.server_id.clone()) else { return };
        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(sid.as_bytes()).collect::<String>());
        self.ss_call(move |c| c.settings_patch(&path, body), move |this, cx| {
            this.load_servers(cx);
            this.server_notice(notice, cx);
        }, cx);
    }

    /// ServerSafetyTab: Raid Lockdown, verification level, bulk purge, the member reports.
    fn render_server_safety(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        if s.reports.is_none() {
            self.ss_load("reports", cx);
        }
        let card = || div().p(px(16.)).rounded(px(12.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().flex_col();
        let h3 = |icon: &'static str, color: Hsla, text: String, tone: Hsla| div().flex().items_center().gap(px(8.)).text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(tone).child(ui::icon(icon, 16., color)).child(text);
        let small = |text: String, op: f32| div().mt(px(4.)).opacity(op).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(text);
        let raid = server.raid_mode;
        let rose: Hsla = rgb(0xfda4af).into();
        let raid_card = div()
            .id("ss-raid")
            .mt(px(24.))
            .p(px(16.))
            .rounded(px(12.))
            .bg(rgba(0xf43f5e1a))
            .border_1()
            .border_color(rgba(0xf43f5e4d))
            .flex()
            .items_start()
            .justify_between()
            .gap(px(16.))
            .child(div().flex_1().min_w_0().child(h3("shield-alert", rose, "Raid Lockdown Mode".into(), rose)).child(small(format!("Immediately pauses all invite links and public directory joins for {}. Turn this on if your server is experiencing a raid or spam wave.", server.name), 0.8)))
            .child(checkbox(raid, false))
            .when(can.moderate, |d| {
                d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| {
                    let next = !raid;
                    this.patch_server(json!({ "raidMode": next }), if next { "Raid Lockdown enabled: invite joins and public directory joins are paused.".into() } else { "Raid Lockdown disabled: normal server joins resumed.".into() }, cx);
                }))
            });
        let level = server.verification_level;
        let mut levels = div().mt(px(12.)).flex().flex_col().gap(px(8.));
        for (n, key) in ["none", "low", "medium", "high"].iter().enumerate() {
            let n = n as i64;
            levels = levels.child(
                div()
                    .id(SharedString::from(format!("ss-level-{n}")))
                    .flex()
                    .items_start()
                    .gap(px(8.))
                    .cursor_pointer()
                    .child(div().pt(px(4.)).child(radio(level == n)))
                    .child(div().flex().flex_col().child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(ink).child(t(&format!("verification.{key}")))).child(div().opacity(0.7).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(t(&format!("verification.{key}.desc")))))
                    .when(can.manage_server && level != n, |d| d.on_click(cx.listener(move |this, _, _, cx| this.patch_server(json!({ "verificationLevel": n }), t("verification.saved"), cx)))),
            );
        }
        let verify_card = card().mt(px(24.)).child(h3("shield-check", rgb(0x34d399).into(), t("serverSafety.verification"), ink)).child(small(t("verification.desc"), 0.75)).child(levels);
        // Bulk Message Purge.
        let texts: Vec<(String, String)> = server.channels.iter().filter(|c| !c.is_voice()).map(|c| (c.id.clone(), c.name.clone())).collect();
        let channel_name = s.purge_channel.as_ref().and_then(|id| texts.iter().find(|c| &c.0 == id)).map(|c| format!("#{}", c.1)).unwrap_or_default();
        let field_label = |text: &str| div().mb(px(4.)).opacity(0.7).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(text.to_string());
        let select = |id: &'static str, w: f32, text: String, open: bool, options: Vec<(String, String)>, which: &'static str, cx: &mut Context<Self>| {
            let mut el = div().relative().w(px(w)).child(
                div()
                    .id(id)
                    .h(px(29.))
                    .px(px(10.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .text_size(px(12.))
                    .text_color(ink)
                    .cursor_pointer()
                    .child(text)
                    .child(ui::icon("chevron-down", 14., ink))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.purge_open = if s.purge_open == Some(which) { None } else { Some(which) };
                        }
                        cx.notify();
                    })),
            );
            if open {
                let mut menu = div().absolute().top(px(31.)).left_0().min_w(px(w)).max_h(px(260.)).p(px(4.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).shadow(ui::card_shadow()).flex().flex_col();
                for (value, label) in options {
                    menu = menu.child(div().id(SharedString::from(format!("purge-{which}-{value}"))).px(px(10.)).py(px(5.)).rounded(px(6.)).text_size(px(12.)).text_color(ink).hover(|s| s.bg(gpui::white().opacity(0.08))).cursor_pointer().child(label).on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            if which == "channel" {
                                s.purge_channel = Some(value.clone());
                            } else {
                                s.purge_count = value.parse().unwrap_or(25);
                            }
                            s.purge_open = None;
                        }
                        cx.notify();
                    })));
                }
                el = el.child(gpui::deferred(menu).with_priority(3));
            }
            el
        };
        let purging = s.purging;
        let channel_options: Vec<(String, String)> = texts.iter().map(|(id, n)| (id.clone(), format!("#{n}"))).collect();
        let purge_card = card()
            .mt(px(24.))
            .gap(px(12.))
            .child(h3("trash-2", rgb(0xfbbf24).into(), "Bulk Message Purge".into(), ink))
            .child(
                div()
                    .opacity(0.75)
                    .flex()
                    .flex_wrap()
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .text_color(ink)
                    .child("Quickly clean up recent spam in a channel (you can also run\u{a0}")
                    .child(div().font_family(crate::theme::MONO_FONT).child("/purge 25 @username"))
                    .child("\u{a0}directly in any channel)."),
            )
            .child(
                div()
                    .pt(px(4.))
                    .flex()
                    .flex_wrap()
                    .items_end()
                    .gap(px(12.))
                    .child(div().child(field_label("Channel")).child(select("purge-ch", 166., channel_name, s.purge_open == Some("channel"), channel_options, "channel", cx)))
                    .child(div().child(field_label("Count")).child(select("purge-n", 145., format!("Last {} messages", s.purge_count), s.purge_open == Some("count"), [10, 25, 50, 100].iter().map(|n| (n.to_string(), format!("Last {n} messages"))).collect(), "count", cx)))
                    .child(div().flex_1().min_w(px(160.)).child(field_label("Filter by Username (optional)")).child(div().h(px(28.)).px(px(10.)).flex().items_center().child(s.purge_user.clone())))
                    .child(
                        div()
                            .id("ss-purge")
                            .h(px(36.))
                            .px(px(18.))
                            .rounded(px(8.))
                            .flex()
                            .items_center()
                            .text_size(px(13.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(ink)
                            .when(purging || s.purge_channel.is_none(), |d| d.opacity(0.5))
                            .when(!purging && s.purge_channel.is_some(), |d| {
                                d.cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.06))).on_click(cx.listener(|this, _, _, cx| {
                                    let Some(s) = this.server_settings.as_mut() else { return };
                                    let Some(channel) = s.purge_channel.clone() else { return };
                                    let user = s.purge_user.read(cx).text().trim().to_string();
                                    let count = s.purge_count;
                                    s.purging = true;
                                    let mut body = json!({ "channelId": channel, "count": count });
                                    if !user.is_empty() {
                                        body["targetUsername"] = json!(user);
                                    }
                                    let client = this.client.clone();
                                    cx.spawn(async move |this, cx| {
                                        let result = cx.background_executor().spawn(async move { client.settings_post("/api/messages/purge", body) }).await;
                                        this.update(cx, |this, cx| {
                                            if let Some(s) = this.server_settings.as_mut() {
                                                s.purging = false;
                                                if result.is_ok() {
                                                    s.purge_user.update(cx, |i, cx| i.set_text("", cx));
                                                }
                                            }
                                            match result {
                                                Ok(v) => {
                                                    let n = v["purged"].as_i64().unwrap_or(0);
                                                    this.server_notice(format!("Purged {n} message{}.", if n == 1 { "" } else { "s" }), cx);
                                                }
                                                Err(e) => this.server_notice(if e.to_string().is_empty() { "Bulk purge failed.".into() } else { e.to_string() }, cx),
                                            }
                                        })
                                        .ok();
                                    })
                                    .detach();
                                    cx.notify();
                                }))
                            })
                            .child(if purging { "Purging…" } else { "Purge Messages" }),
                    ),
            );
        // Member Message Reports.
        let mut reports = card()
            .mt(px(24.))
            .gap(px(12.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().child(h3("flag", rgb(0x818cf8).into(), "Member Message Reports".into(), ink)).child(div().opacity(0.75).text_size(px(12.)).line_height(px(16.)).text_color(ink).child("Messages flagged by members via \u{201c}Report message\u{201d} in the message menu.")))
                    .child(div().id("ss-reports-refresh").h(px(36.)).px(px(18.)).rounded(px(8.)).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.06))).child("Refresh").on_click(cx.listener(|this, _, _, cx| this.ss_refresh("reports", cx)))),
            );
        match &s.reports {
            None => reports = reports.child(div().opacity(0.7).text_size(px(12.)).text_color(ink).child("Loading reports…")),
            Some(list) if list.is_empty() => reports = reports.child(div().py(px(12.)).opacity(0.7).text_size(px(12.)).text_color(ink).child(format!("No message reports in {}.", server.name))),
            Some(list) => {
                let mut col = div().id("ss-reports").max_h(px(320.)).overflow_y_scroll().pr(px(4.)).flex().flex_col().gap(px(8.));
                for r in list {
                    let id = r["id"].as_str().unwrap_or_default().to_string();
                    let open = r["status"] == "open";
                    let status = r["status"].as_str().unwrap_or_default().to_uppercase();
                    let when = r["createdAt"].as_str().and_then(crate::model::parse_time).map(|t| t.with_timezone(&chrono::Local).format("%-m/%-d/%Y, %-I:%M:%S %p").to_string()).unwrap_or_default();
                    let (id1, id2) = (id.clone(), id.clone());
                    let resolve = move |this: &mut Self, id: String, status: &'static str, delete: bool, cx: &mut Context<Self>| {
                        this.ss_call(move |c| c.settings_patch("/api/reports", json!({ "reportId": id, "status": status, "deleteMessage": delete })), move |this, cx| {
                            this.ss_refresh("reports", cx);
                            this.server_notice(if delete { "Deleted reported message and resolved report.".into() } else { format!("Report marked as {status}.") }, cx);
                        }, cx);
                    };
                    col = col.child(
                        div()
                            .p(px(12.))
                            .rounded(px(8.))
                            .bg(rgba(0x00000040))
                            .border_1()
                            .border_color(gpui::white().opacity(0.1))
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .text_size(px(12.))
                            .text_color(ink)
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(div().flex().font_weight(FontWeight::SEMIBOLD).child(format!("#{} · Author:\u{a0}", r["channelName"].as_str().unwrap_or_default())).child(div().text_color(rgb(0xa5b4fc)).child(r["messageAuthor"].as_str().unwrap_or_default().to_string())))
                                    .child(div().px(px(8.)).py(px(2.)).rounded_full().bg(if open { rgba(0xf59e0b33) } else { rgba(0x10b98133) }).text_size(px(11.)).font_weight(FontWeight::BOLD).text_color(if open { rgb(0xfcd34d) } else { rgb(0x6ee7b7) }).child(status)),
                            )
                            .child(div().relative().p(px(8.)).pl(px(10.)).rounded(px(4.)).bg(gpui::white().opacity(0.05)).child(div().absolute().left_0().top_0().bottom_0().w(px(2.)).bg(rgb(0x818cf8))).child(r["messageContent"].as_str().unwrap_or_default().to_string()))
                            .child(div().opacity(0.75).flex().justify_between().child(format!("Reported by {}: \u{201c}{}\u{201d}", r["reporterName"].as_str().unwrap_or_default(), r["reason"].as_str().unwrap_or_default())).child(when))
                            .when(open, |d| {
                                d.child(
                                    div()
                                        .pt(px(4.))
                                        .flex()
                                        .gap(px(8.))
                                        .child(div().id(SharedString::from(format!("rep-del-{id}"))).h(px(26.)).px(px(10.)).rounded(px(8.)).flex().items_center().gap(px(4.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.06))).child(ui::icon("circle-check-big", 13., ink)).child("Delete Message & Resolve").on_click(cx.listener(move |this, _, _, cx| resolve(this, id1.clone(), "resolved", true, cx))))
                                        .child(div().id(SharedString::from(format!("rep-dis-{id}"))).h(px(26.)).px(px(10.)).rounded(px(8.)).flex().items_center().gap(px(4.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.06))).child(ui::icon("circle-x", 13., ink)).child("Dismiss").on_click(cx.listener(move |this, _, _, cx| resolve(this, id2.clone(), "dismissed", false, cx)))),
                                )
                            }),
                    );
                }
                reports = reports.child(col);
            }
        }
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().flex().flex_col().child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Safety Setup & Moderation Center")).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("Raid protection, bulk message cleanup, and member-submitted message reports for {}.", server.name))))
            .child(raid_card)
            .child(verify_card)
            .child(purge_card)
            .child(reports)
            .into_any_element()
    }

    /// runImport(): POST /api/servers/<id>/import, then the servers reload.
    fn run_import(&mut self, body: Value, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_mut() else { return };
        s.importing = true;
        let path = format!("/api/servers/{}/import", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post(&path, body) }).await;
            this.update(cx, |this, cx| {
                if let Some(s) = this.server_settings.as_mut() {
                    s.importing = false;
                }
                match result {
                    Ok(v) => {
                        let i = &v["imported"];
                        let private: Vec<String> = i["privateChannels"].as_array().map(|a| a.iter().filter_map(|c| c.as_str().map(|n| format!("#{n}"))).collect()).unwrap_or_default();
                        let note = if private.is_empty() { String::new() } else { format!(" {}", tv("discordMove.private", &[("channels", &private.join(", "))])) };
                        this.load_servers(cx);
                        this.server_notice(format!("Imported {} categories, {} channels, and {} roles!{note}", i["categories"].as_i64().unwrap_or(0), i["channels"].as_i64().unwrap_or(0), i["roles"].as_i64().unwrap_or(0)), cx);
                    }
                    Err(e) => this.server_notice(if e.to_string().is_empty() { "Import failed.".into() } else { e.to_string() }, cx),
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// exportJson(): the layout as JSON, copied and shown in the box.
    fn export_layout(&mut self, server: &crate::model::Server, cx: &mut Context<Self>) {
        let channel = |c: &crate::model::Channel| json!({ "name": c.name, "kind": c.kind, "topic": c.topic });
        let payload = json!({
            "categories": server.categories.iter().map(|cat| json!({ "name": cat.name, "channels": server.channels.iter().filter(|c| c.category_id.as_deref() == Some(cat.id.as_str())).map(channel).collect::<Vec<_>>() })).collect::<Vec<_>>(),
            "channels": server.channels.iter().filter(|c| c.category_id.is_none()).map(channel).collect::<Vec<_>>(),
            "roles": server.roles.iter().map(|r| json!({ "name": r.name, "color": r.color })).collect::<Vec<_>>(),
        });
        let text = serde_json::to_string_pretty(&payload).unwrap_or_default();
        cx.write_to_clipboard(gpui::ClipboardItem::new_string(text.clone()));
        if let Some(s) = self.server_settings.as_ref() {
            s.tpl_json.update(cx, |a, cx| a.set_value(text, cx));
        }
        self.server_notice("Copied server structure JSON to clipboard!".into(), cx);
    }

    /// ServerTemplateTab.
    fn render_server_template(&self, s: &ServerSettings, server: &crate::model::Server, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let card = || div().mt(px(24.)).p(px(16.)).rounded(px(12.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().flex_col().gap(px(12.));
        let h3 = |icon: &'static str, color: u32, text: String| div().flex().items_center().gap(px(8.)).text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(ui::icon(icon, 16., rgb(color))).child(text);
        let small = |text: String| div().opacity(0.75).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(text);
        let button = |id: &'static str, label: String, enabled: bool| div().id(id).h(px(36.)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).when(!enabled, |d| ui::faded(d, lavender, on_accent, Theme::panel())).when(enabled, |d| d.cursor_pointer()).child(label);
        let busy = s.importing;
        let main_w = 820f32.max(0.);
        let col_w = (main_w - 34. - 24.) / 3.;
        let mut grid = div().pt(px(4.)).flex().flex_wrap().gap(px(12.));
        for (id, title, desc) in STARTER_TEMPLATES {
            grid = grid.child(
                div()
                    .id(SharedString::from(format!("tpl-{id}")))
                    .w(px(col_w))
                    .p(px(12.))
                    .rounded(px(8.))
                    .bg(Theme::paper())
                    .border_1()
                    .border_color(Theme::line())
                    .hover(|s| s.bg(gpui::white().opacity(0.1)))
                    .flex()
                    .flex_col()
                    .gap(px(4.))
                    .child(div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(lavender).child(title))
                    .child(div().opacity(0.75).text_size(px(11.)).line_height(px(16.5)).text_color(ink).child(desc))
                    .when(!busy, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.run_import(json!({ "mode": "template", "templateId": id }), cx)))),
            );
        }
        let link_ok = !busy && !s.tpl_link.read(cx).text().trim().is_empty();
        let discord_ok = !busy && !s.tpl_guild.read(cx).text().trim().is_empty() && !s.tpl_token.read(cx).text().trim().is_empty();
        let json_ok = !busy && !s.tpl_json.read(cx).value().trim().is_empty();
        let label = |text: &str| div().opacity(0.7).text_size(px(12.)).line_height(px(16.)).text_color(ink).child(text.to_string());
        let half = (main_w - 34. - 12.) / 2.;
        let server_c = server.clone();
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().flex().flex_col().child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Templates & Data Import")).child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Import channels, categories, and roles from a Discord server, apply a starter template, or export/import a portable JSON structure.")))
            .child(card().child(h3("sparkles", 0x818cf8, "Quick Starter Templates".into())).child(small(format!("Add a pre-built set of categories, channels, and roles to {} in one click.", server.name))).child(grid))
            .child(
                card()
                    .child(h3("download", 0x34d399, t("discordMove.fromTemplate")))
                    .child(small(t("discordMove.fromTemplateHint")))
                    .child(div().mt(px(6.)).h(px(16.)).child(s.tpl_link.clone()))
                    .child(div().flex().child(button("tpl-link-go", if busy { t("discordMove.importing") } else { t("discordMove.import") }, link_ok).when(link_ok, |d| d.on_click(cx.listener(|this, _, _, cx| {
                        let link = this.server_settings.as_ref().map(|s| s.tpl_link.read(cx).text().trim().to_string()).unwrap_or_default();
                        this.run_import(json!({ "mode": "discord-template", "link": link }), cx);
                    }))))),
            )
            .child(
                card()
                    .child(h3("download", 0x34d399, "Import from Discord Server".into()))
                    .child(small(format!("Mirrors a Discord server's categories, text/voice/forum/stage channels, topics, and roles directly into {}.", server.name)))
                    .child(div().pb(px(2.)).flex().gap(px(12.)).child(div().w(px(half)).child(label("Discord Server (Guild) ID")).child(div().mt(px(10.)).h(px(16.)).child(s.tpl_guild.clone()))).child(div().w(px(half)).child(label("Discord Bot Token")).child(div().mt(px(10.)).h(px(16.)).child(s.tpl_token.clone()))))
                    .child(div().flex().child(button("tpl-discord-go", if busy { "Importing…".into() } else { "Import Discord Structure".into() }, discord_ok).when(discord_ok, |d| d.on_click(cx.listener(|this, _, _, cx| {
                        let Some(s) = this.server_settings.as_ref() else { return };
                        let body = json!({ "mode": "discord", "guildId": s.tpl_guild.read(cx).text().trim(), "botToken": s.tpl_token.read(cx).text().trim() });
                        this.run_import(body, cx);
                    }))))),
            )
            .child(
                card()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(h3("upload", 0x38bdf8, "Portable JSON Template".into())).child(small("Export this server's layout to JSON or paste a template JSON to import.".into())))
                            .child(div().id("tpl-export").h(px(36.)).px(px(18.)).rounded(px(8.)).flex().items_center().gap(px(6.)).text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.06))).child(ui::icon("copy", 13., ink)).child("Export Current Layout").on_click(cx.listener(move |this, _, _, cx| this.export_layout(&server_c, cx)))),
                    )
                    .child(div().pb(px(6.)).font_family(crate::theme::MONO_FONT).child(s.tpl_json.clone()))
                    .child(div().flex().child(button("tpl-json-go", if busy { "Importing…".into() } else { "Import JSON Template".into() }, json_ok).when(json_ok, |d| d.on_click(cx.listener(|this, _, _, cx| {
                        let text = this.server_settings.as_ref().map(|s| s.tpl_json.read(cx).value()).unwrap_or_default();
                        match serde_json::from_str::<Value>(&text) {
                            Ok(parsed) => this.run_import(json!({ "mode": "json", "structure": parsed }), cx),
                            Err(_) => this.server_notice("Invalid JSON template format.".into(), cx),
                        }
                    }))))),
            )
            .into_any_element()
    }

    /// The tabs still to come in this app: what they are, and the way to them on the web.
    fn render_server_tab(&self, tab: &str, _s: &ServerSettings, _server: &crate::model::Server, _can: Can, _window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let name = match tab {
            "emoji" => t("serverSettings.tab.emoji"),
            "stickers" => t("serverSettings.tab.stickers"),
            "soundboard" => t("serverSettings.tab.soundboard"),
            "members" => t("serverSettings.tab.members"),
            "roles" => t("serverSettings.tab.roles"),
            "invites" => t("serverSettings.tab.invites"),
            "access" => t("serverSettings.tab.access"),
            "welcome" => t("serverSettings.tab.welcome"),
            "integrations" => t("serverSettings.tab.integrations"),
            "safety" => t("serverSettings.tab.safety"),
            "audit_log" => t("serverSettings.tab.auditLog"),
            "bans" => t("serverSettings.tab.bans"),
            "automod" => t("serverSettings.tab.automod"),
            "community" => "Enable Community".into(),
            _ => t("serverSettings.tab.templates"),
        };
        let base = self.client.base().to_string();
        let _ = tv;
        let _ = rgba;
        div()
            .flex()
            .flex_col()
            .gap(px(12.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(Theme::ink()).child(name))
            .child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(Theme::muted()).child("This part of server settings is not in this app yet."))
            .child(div().flex().child(div().id("ss-web").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(Theme::lavender()).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0x15121f)).cursor_pointer().child("Open on the web").on_click(move |_, _, cx| cx.open_url(&base))))
            .into_any_element()
    }
}
