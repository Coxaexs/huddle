//! Running a server's channels (hooks/use-channel-server-actions.tsx): the custom prompt each tool
//! asks through (create a channel of a kind, add / rename a category, rename a channel, its topic,
//! slowmode, voice bitrate and region, rename the server), the switches (age restriction,
//! soundboard, kind) and the delete confirms. Every change answers with the servers, reloaded here.

use gpui::{AppContext as _, Context, Window};
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::t;
use crate::theme::Theme;

/// What a prompt's answer is for.
#[derive(Clone, Debug)]
pub(super) enum PromptKind {
    RenameServer(String),
    CreateChannel(&'static str, Option<String>),
    AddCategory,
    RenameCategory(String, String),
    RenameChannel(String),
    Topic(String),
    Slowmode(String),
    Bitrate(String),
    Region(String),
    CreateRole,
    /// Server settings → Emoji: the picked picture's name.
    EmojiName,
    /// Server settings → Integrations → Tabletop: homebrew JSON.
    Homebrew,
    /// The status menu: Set a status / Edit status.
    CustomStatus,
    /// A group DM's name.
    RenameGroup(String),
    RenameFolder(String),
    /// The battlemap page asked (its question's id).
    Battlemap(u64),
    /// The user menu: (server, member) nickname.
    Nickname(String, String),
    /// A staged picture's description (ALT), by its place in the row.
    ImageAlt(usize),
}

/// CREATABLE_CHANNEL_KINDS with CHANNEL_KIND_COPY: kind, label, icon, title, message, placeholder.
pub(super) const CHANNEL_KINDS: [(&str, &str, &str, &str, &str, &str); 5] = [
    ("text", "Text channel", "hash", "Create Text Channel", "Enter name for the new text channel:", "general"),
    ("voice", "Voice room", "volume-2", "Create Voice Room", "Enter name for the new voice room:", "Voice Lounge"),
    ("announcement", "Announcement", "radio", "Create Announcement Channel", "Create a read-only feed that only moderators can post in:", "announcements"),
    ("forum", "Forum", "message-square", "Create Forum", "Create a board where each post starts its own thread:", "help"),
    ("stage", "Stage", "users", "Create Stage", "Create a voice room with an audience, where speaking is a permission:", "Friday Standup"),
];

/// lib/voice-quality.ts.
const BITRATE_MIN: u64 = 32_000;
const BITRATE_MAX: u64 = 320_000;
const BITRATE_DEFAULT: u64 = 64_000;

pub(super) fn clamp_bitrate(value: Option<u64>) -> u64 {
    match value {
        Some(v) if v > 0 => v.clamp(BITRATE_MIN, BITRATE_MAX),
        _ => BITRATE_DEFAULT,
    }
}

/// channelNameRules(): text-like names are slugs of 25, the rest 40 long.
fn max_name(kind: &str) -> usize {
    if matches!(kind, "voice" | "stage") { 40 } else { 25 }
}

/// withArticle(): "a text channel", "an announcement".
pub(super) fn with_article(label: &str) -> String {
    let lower = label.to_lowercase();
    format!("{} {lower}", if lower.starts_with(['a', 'e', 'i', 'o', 'u']) { "an" } else { "a" })
}

/// convertibleKinds(): the other kinds of the same family.
pub(super) fn convertible(kind: &str) -> Vec<&'static str> {
    let family: [&'static str; 3] = if matches!(kind, "voice" | "stage") { ["voice", "stage", ""] } else { ["text", "announcement", "forum"] };
    let kind = if kind.is_empty() { "text" } else { kind };
    family.into_iter().filter(|k| !k.is_empty() && *k != kind).collect()
}

pub(super) fn kind_label(kind: &str) -> &'static str {
    CHANNEL_KINDS.iter().find(|k| k.0 == kind).map(|k| k.1).unwrap_or("Text channel")
}

pub(super) fn kind_icon(kind: &str) -> &'static str {
    CHANNEL_KINDS.iter().find(|k| k.0 == kind).map(|k| k.2).unwrap_or("hash")
}

impl Shell {
    /// showCustomPrompt: the field (selected), the action's button in lavender; Enter saves, Esc
    /// cancels; `max` caps the length as maxLength does.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn open_prompt(&mut self, kind: PromptKind, title: String, text: String, value: String, placeholder: &str, ok: &str, max: Option<usize>, window: &mut Window, cx: &mut Context<Self>) {
        let input = cx.new(|cx| {
            let mut i = crate::input::TextInput::new(placeholder.to_string(), cx).look(crate::input::Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() });
            i.set_text(value, cx);
            i.select_everything(cx);
            i
        });
        window.focus(&gpui::Focusable::focus_handle(&input, cx));
        self.prompt_sub = Some(cx.subscribe_in(&input, window, move |this, input, event, _, cx| match event {
            crate::input::InputEvent::Submit => {
                if let Some(action) = this.confirm.as_ref().map(|c| c.action.clone()) {
                    this.confirmed_public(action, cx);
                }
            }
            crate::input::InputEvent::Escape => {
                this.dismiss_confirm(cx);
            }
            _ => {
                if let Some(max) = max {
                    let text = input.read(cx).text();
                    if text.chars().count() > max {
                        let cut: String = text.chars().take(max).collect();
                        input.update(cx, |i, cx| i.set_text(cut, cx));
                    }
                }
                cx.notify();
            }
        }));
        self.server_menu = false;
        self.notify_menu = None;
        self.confirm = Some(Confirm { title, text, ok: ok.into(), cancel: t("common.cancel"), action: ConfirmAction::Prompt(kind, input) });
        cx.notify();
    }

    /// createChannel(): the kind's prompt; the new text-like channel opens.
    pub(super) fn prompt_create_channel(&mut self, kind: &'static str, category: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        self.kind_menu = None;
        let (_, _, _, title, message, placeholder) = CHANNEL_KINDS.iter().find(|k| k.0 == kind).copied().unwrap_or(CHANNEL_KINDS[0]);
        self.open_prompt(PromptKind::CreateChannel(kind, category), title.into(), message.into(), String::new(), placeholder, "Create Channel", Some(max_name(kind)), window, cx);
    }

    pub(super) fn prompt_add_category(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.open_prompt(PromptKind::AddCategory, "Add Category".into(), "Enter name for the new category:".into(), String::new(), "e.g. Text Channels", "Create Category", None, window, cx);
    }

    pub(super) fn prompt_rename_category(&mut self, id: String, current: String, window: &mut Window, cx: &mut Context<Self>) {
        self.open_prompt(PromptKind::RenameCategory(id, current.clone()), "Rename Category".into(), format!("Enter new name for category \"{current}\":"), current, "", "Save Name", None, window, cx);
    }

    /// The channel menu's tools, by name.
    pub(super) fn channel_tool(&mut self, tool: &str, channel_id: String, window: &mut Window, cx: &mut Context<Self>) {
        self.notify_menu = None;
        let Some(c) = self.channel_by_id(&channel_id).cloned() else { return };
        match tool {
            "rename" => self.open_prompt(PromptKind::RenameChannel(c.id.clone()), "Rename Channel".into(), format!("Enter a new name for {}:", c.name), c.name.clone(), "", "Save Name", Some(25), window, cx),
            "topic" => self.open_prompt(PromptKind::Topic(c.id.clone()), "Edit Channel Topic".into(), format!("Set topic description for #{}:", c.name), c.topic.clone(), "e.g. Plans, chaos, and meme sharing", "Save Topic", None, window, cx),
            "slowmode" => self.open_prompt(
                PromptKind::Slowmode(c.id.clone()),
                "Set Channel Slowmode Cooldown".into(),
                "Seconds each member waits between messages here (0 turns it off, up to 300). Moderators are not slowed down.".into(),
                c.slowmode.unwrap_or(0).to_string(),
                "0",
                "Set Slowmode",
                None,
                window,
                cx,
            ),
            "bitrate" => self.open_prompt(
                PromptKind::Bitrate(c.id.clone()),
                format!("Voice Bitrate for {}", c.name),
                format!(
                    "The most each speaker sends, in kbps ({}–{}). 64 is clear speech; go higher for music or singing. Above 192 is for rooms of up to 10 people: it carries more detail but no backup for lost packets, so anyone on a shaky connection stays at 192.",
                    BITRATE_MIN / 1000,
                    BITRATE_MAX / 1000
                ),
                (clamp_bitrate(c.bitrate) / 1000).to_string(),
                &(BITRATE_DEFAULT / 1000).to_string(),
                "Set Bitrate",
                None,
                window,
                cx,
            ),
            "region" => self.open_prompt(
                PromptKind::Region(c.id.clone()),
                format!("Region Override for #{}", c.name),
                "Select the primary voice server region for this channel.\n• \"auto\" - Netherlands normally, automatically routes to Germany when 40+ people join\n• \"nl\" - Netherlands (Home Server)\n• \"de\" - Germany (Oracle Cloud)".into(),
                c.rtc_region.clone().unwrap_or_else(|| "auto".into()),
                "auto, nl, or de",
                "Set Region",
                None,
                window,
                cx,
            ),
            "nsfw" => {
                let on = !c.nsfw;
                let name = c.name.clone();
                self.patch_channel(c.id.clone(), json!({ "nsfw": on }), move || if on { format!("#{name} is now age-restricted.") } else { format!("#{name} is no longer age-restricted.") }, cx);
            }
            "soundboard" => {
                let enable = c.soundboard == Some(false);
                let name = c.name.clone();
                self.patch_channel(c.id.clone(), json!({ "soundboard": enable }), move || if enable { format!("Soundboard on in {name}.") } else { format!("Soundboard off in {name}.") }, cx);
            }
            "delete" => {
                self.confirm = Some(Confirm {
                    title: format!("Delete '{}'?", c.name),
                    text: "Are you sure? All messages in this channel will be permanently removed.".into(),
                    ok: "Delete Channel".into(),
                    cancel: t("common.cancel"),
                    action: ConfirmAction::DeleteChannel(c.id.clone()),
                });
                cx.notify();
            }
            "permissions" => self.open_channel_permissions(c.id.clone(), window, cx),
            kind => {
                if let Some(kind) = kind.strip_prefix("kind:") {
                    let label = kind_label(kind).to_string();
                    let name = c.name.clone();
                    self.patch_channel(c.id.clone(), json!({ "kind": kind }), move || format!("#{name} is now {}.", with_article(&label)), cx);
                }
            }
        }
    }

    pub(super) fn confirm_delete_category(&mut self, id: String, name: String, cx: &mut Context<Self>) {
        self.confirm = Some(Confirm {
            title: format!("Delete Category '{name}'?"),
            text: format!("Are you sure you want to delete the \"{name}\" category? Channels inside it will remain uncategorized."),
            ok: "Delete Category".into(),
            cancel: t("common.cancel"),
            action: ConfirmAction::DeleteCategory(id),
        });
        cx.notify();
    }

    /// PATCH /api/channels/<id>; the servers come back reloaded, then the notice.
    fn patch_channel(&mut self, id: String, body: Value, done: impl FnOnce() -> String + 'static, cx: &mut Context<Self>) {
        let path = format!("/api/channels/{}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        self.server_call(move |c| c.settings_patch(&path, body), move |this, cx| {
            let text = done();
            if !text.is_empty() {
                this.set_notice(text, cx);
            }
        }, cx);
    }

    /// A change that answers with the servers: reload them, then `then`; errors become the notice.
    pub(super) fn server_call(&mut self, call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static, then: impl FnOnce(&mut Self, &mut Context<Self>) + 'static, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { call(&client) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        this.load_servers(cx);
                        if let Some(id) = v.get("channelId").and_then(Value::as_str) {
                            this.pending_open_channel = Some(id.to_string());
                        }
                        then(this, cx);
                    }
                    Err(e) => this.set_notice(if e.to_string().is_empty() { "That did not work.".into() } else { e.to_string() }, cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// A prompt answered.
    pub(super) fn run_prompt(&mut self, kind: PromptKind, value: String, cx: &mut Context<Self>) {
        self.prompt_sub = None;
        let value = value.trim().to_string();
        let enc = |id: &str| url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>();
        match kind {
            PromptKind::RenameServer(id) => {
                if value.is_empty() {
                    return;
                }
                let path = format!("/api/servers/{}", enc(&id));
                self.server_call(move |c| c.settings_patch(&path, json!({ "name": value })), |_, _| {}, cx);
            }
            PromptKind::CreateChannel(kind, category) => {
                if value.is_empty() {
                    return;
                }
                let Some(server) = self.server_id.clone().filter(|_| !self.home) else { return };
                let opens = !matches!(kind, "voice" | "stage");
                self.server_call(move |c| c.settings_post("/api/channels", json!({ "serverId": server, "name": value, "kind": kind, "categoryId": category })), move |this, _| {
                    if !opens {
                        this.pending_open_channel = None;
                    }
                }, cx);
            }
            PromptKind::AddCategory => {
                if value.is_empty() {
                    return;
                }
                let Some(server) = self.server_id.clone().filter(|_| !self.home) else { return };
                self.server_call(move |c| c.settings_post("/api/categories", json!({ "serverId": server, "name": value })), |_, _| {}, cx);
            }
            PromptKind::RenameCategory(id, current) => {
                if value.is_empty() || value == current {
                    return;
                }
                let path = format!("/api/categories/{}", enc(&id));
                self.server_call(move |c| c.settings_patch(&path, json!({ "name": value })), |_, _| {}, cx);
            }
            PromptKind::RenameChannel(id) => {
                if !value.is_empty() {
                    self.patch_channel(id, json!({ "name": value }), String::new, cx);
                }
            }
            PromptKind::Topic(id) => self.patch_channel(id, json!({ "topic": value }), String::new, cx),
            PromptKind::Slowmode(id) => {
                let sec = value.parse::<i64>().unwrap_or(0).clamp(0, 300);
                self.patch_channel(id, json!({ "slowmode": sec }), move || if sec > 0 { format!("Slowmode set to {sec}s") } else { "Slowmode disabled".into() }, cx);
            }
            PromptKind::Bitrate(id) => {
                let Ok(kbps) = value.parse::<u64>() else { return };
                let bitrate = clamp_bitrate(Some(kbps * 1000));
                self.patch_channel(id, json!({ "bitrate": bitrate }), move || format!("Voice bitrate set to {} kbps", bitrate / 1000), cx);
            }
            PromptKind::EmojiName => self.upload_emoji(value, cx),
            PromptKind::Homebrew => self.import_homebrew(value, cx),
            PromptKind::CustomStatus => self.save_custom_status(value, cx),
            PromptKind::RenameGroup(channel) => self.save_group_name(channel, value, cx),
            PromptKind::RenameFolder(id) => self.save_folder_name(id, value, cx),
            PromptKind::Battlemap(id) => self.battlemap_answer(id, serde_json::json!(value)),
            PromptKind::Nickname(server, user) => self.save_nickname(server, user, value, cx),
            PromptKind::ImageAlt(ix) => {
                if let Some(f) = self.pending_files.get_mut(ix) {
                    f.alt = (!value.is_empty()).then_some(value);
                }
                cx.notify();
            }
            PromptKind::CreateRole => {
                if value.is_empty() {
                    return;
                }
                let Some(server) = self.server_settings_server() else { return };
                let name = value.clone();
                self.server_call(move |c| c.settings_post("/api/roles", json!({ "serverId": server, "name": name })), move |this, cx| this.role_created(value, cx), cx);
            }
            PromptKind::Region(id) => {
                let val = value.to_lowercase();
                if !matches!(val.as_str(), "auto" | "nl" | "de") {
                    return self.set_notice("Invalid region. Choose 'auto', 'nl', or 'de'.", cx);
                }
                let name = self.channel_by_id(&id).map(|c| c.name.clone()).unwrap_or_default();
                let label = match val.as_str() { "de" => "Germany", "nl" => "Netherlands", _ => "Automatic" };
                self.patch_channel(id, json!({ "rtcRegion": val }), move || format!("Voice region set to {label} for #{name}."), cx);
            }
        }
    }

    pub(super) fn delete_channel_confirmed(&mut self, id: String, cx: &mut Context<Self>) {
        let path = format!("/api/channels/{}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        let in_it = self.call.as_ref().is_some_and(|c| c.channel_id == id);
        self.server_call(move |c| c.settings_delete(&path, json!({})), move |this, cx| {
            if in_it {
                this.leave_voice(cx);
            }
        }, cx);
    }

    pub(super) fn delete_category_confirmed(&mut self, id: String, cx: &mut Context<Self>) {
        let path = format!("/api/categories/{}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        self.server_call(move |c| c.settings_delete(&path, json!({})), |_, _| {}, cx);
    }
}
