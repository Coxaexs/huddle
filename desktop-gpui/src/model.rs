//! The parts of Hoffle's wire types (lib/protocol.ts, lib/servers.ts, app/api/messages) this client reads.
//! Every field is defaulted so a newer server that adds or drops one does not break parsing.

use serde::Deserialize;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
}

impl User {
    pub fn name(&self) -> &str {
        if self.display_name.is_empty() { &self.username } else { &self.display_name }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub icon_url: Option<String>,
    pub banner_url: Option<String>,
    pub is_public: bool,
    pub channels: Vec<Channel>,
    pub categories: Vec<Category>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Channel {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub kind: String,
    pub topic: String,
    pub position: i64,
    pub category_id: Option<String>,
    pub private: bool,
    /// Voice rooms: the most each speaker sends, in bits per second.
    pub bitrate: Option<u64>,
}

impl Channel {
    /// Rooms you join rather than read. Everything else opens as a conversation.
    pub fn is_voice(&self) -> bool {
        matches!(self.kind.as_str(), "voice" | "stage")
    }
    /// Kinds whose page is not a message list (forums, boards, docs…): shown, but opened in the web app.
    pub fn is_text(&self) -> bool {
        matches!(self.kind.as_str(), "text" | "announcement" | "" )
    }
    /// The Lucide icon the web uses for this kind (app/components/chat/channel-kind.tsx).
    pub fn icon(&self) -> &'static str {
        match self.kind.as_str() {
            "announcement" => "radio",
            "forum" => "message-square",
            "voice" => "volume-2",
            "stage" => "users",
            _ => "hash",
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub position: i64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Message {
    pub id: String,
    pub channel_id: Option<String>,
    pub user_id: Option<String>,
    pub author: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub text: String,
    pub bot: bool,
    pub created_at: String,
    pub image: Option<String>,
    pub images: Vec<String>,
    pub files: Vec<FileRef>,
    pub kind: Option<String>,
    pub edited_at: Option<String>,
    pub reply_preview: Option<ReplyPreview>,
    pub reactions: Vec<Reaction>,
    pub thread_id: Option<String>,
    pub thread_count: Option<u32>,
    pub command_text: Option<String>,
    pub command_by: Option<String>,
    pub payload: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FileRef {
    pub url: String,
    pub name: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReplyPreview {
    pub author: String,
    pub text: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Reaction {
    pub emoji: String,
    pub count: u32,
    pub mine: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceParticipant {
    pub id: String,
    pub connection_id: String,
    pub display_name: String,
    pub username: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub muted: bool,
    pub deafened: bool,
    pub bot: bool,
    /// Hub-clock ms the seat was taken.
    pub joined_at: f64,
    pub screen_stream_id: Option<String>,
    pub camera_stream_id: Option<String>,
}

impl VoiceParticipant {
    pub fn name(&self) -> &str {
        if self.display_name.is_empty() { &self.username } else { &self.display_name }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MessagePage {
    pub messages: Vec<Message>,
    pub has_more: bool,
}


/// A message's time the way the browser shows it (formatClientTime): "1:45 PM" in en-US,
/// "13:45" in most other locales.
pub fn client_time(value: &str) -> String {
    let Some(t) = parse_time(value) else { return String::new() };
    let local = t.with_timezone(&chrono::Local);
    if twelve_hour() { local.format("%-I:%M %p").to_string() } else { local.format("%H:%M").to_string() }
}

fn twelve_hour() -> bool {
    use std::sync::OnceLock;
    static TWELVE: OnceLock<bool> = OnceLock::new();
    *TWELVE.get_or_init(|| {
        let locale = std::env::var("HOFFLE_LOCALE").ok().or_else(sys_locale::get_locale).unwrap_or_default().replace('_', "-");
        ["en-US", "en-CA", "en-AU", "en-NZ", "en-IN", "en-PH"].iter().any(|l| locale.starts_with(l)) || locale == "en"
    })
}

/// toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" [, year] }) in the
/// system's locale, for the languages Hoffle ships.
pub fn long_date(when: &chrono::DateTime<chrono::Local>, with_year: bool) -> String {
    let locale = std::env::var("HOFFLE_LOCALE").ok().or_else(sys_locale::get_locale).unwrap_or_default().replace('_', "-");
    let base = locale.split('-').next().unwrap_or("en").to_string();
    let (chrono_locale, pattern, year_pattern) = match base.as_str() {
        "tr" => (chrono::Locale::tr_TR, "%-d %B %A", "%-d %B %Y %A"),
        "de" => (chrono::Locale::de_DE, "%A, %-d. %B", "%A, %-d. %B %Y"),
        "fr" => (chrono::Locale::fr_FR, "%A %-d %B", "%A %-d %B %Y"),
        "es" => (chrono::Locale::es_ES, "%A, %-d de %B", "%A, %-d de %B de %Y"),
        "pt" => (chrono::Locale::pt_BR, "%A, %-d de %B", "%A, %-d de %B de %Y"),
        "nl" => (chrono::Locale::nl_NL, "%A %-d %B", "%A %-d %B %Y"),
        _ => (chrono::Locale::en_US, "%A, %B %-d", "%A, %B %-d, %Y"),
    };
    when.format_localized(if with_year { year_pattern } else { pattern }, chrono_locale).to_string()
}

pub fn parse_time(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|t| t.with_timezone(&chrono::Utc))
}


#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Member {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub nickname: Option<String>,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub server_avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub color: String,
    pub status: String,
    pub custom_status: Option<serde_json::Value>,
    pub tagline: String,
    pub nameplate: String,
    pub avatar_frame: String,
    pub last_seen_at: String,
}

impl Member {
    pub fn name(&self) -> &str {
        self.nickname.as_deref().filter(|n| !n.is_empty()).unwrap_or(if self.display_name.is_empty() { &self.username } else { &self.display_name })
    }
    pub fn picture(&self) -> Option<&str> {
        self.server_avatar_url.as_deref().or(self.avatar_url.as_deref()).filter(|u| !u.is_empty())
    }
    /// The second line under an online member: their custom status text.
    pub fn status_text(&self) -> Option<String> {
        match &self.custom_status {
            Some(serde_json::Value::String(s)) if !s.is_empty() => Some(s.clone()),
            Some(serde_json::Value::Object(o)) => o.get("text").and_then(|t| t.as_str()).filter(|t| !t.is_empty()).map(str::to_string),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DmConversation {
    pub channel_id: String,
    pub user: User,
    pub last_message: String,
    pub last_at: String,
    pub hidden: bool,
    pub pinned: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(default)]
pub struct ReadState {
    pub unread: bool,
    pub count: u32,
    pub mentions: u32,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Friend {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub custom_status: Option<serde_json::Value>,
}

impl Friend {
    pub fn name(&self) -> &str {
        if self.display_name.is_empty() { &self.username } else { &self.display_name }
    }
    pub fn status_text(&self) -> Option<String> {
        match &self.custom_status {
            Some(serde_json::Value::String(s)) if !s.is_empty() => Some(s.clone()),
            Some(serde_json::Value::Object(o)) => o.get("text").and_then(|t| t.as_str()).filter(|t| !t.is_empty()).map(str::to_string),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct FriendsData {
    pub friends: Vec<Friend>,
    pub incoming: Vec<Friend>,
    pub outgoing: Vec<Friend>,
    pub blocked: Vec<Friend>,
}
