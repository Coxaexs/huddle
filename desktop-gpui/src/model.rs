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
    pub fn glyph(&self) -> &'static str {
        match self.kind.as_str() {
            "voice" => "🔊",
            "stage" => "🎙",
            "announcement" => "📣",
            "forum" => "💬",
            _ => "#",
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

/// Messages from one author within a few minutes read as one block, as on the web.
pub fn continues(prev: &Message, next: &Message) -> bool {
    if prev.author != next.author || prev.user_id != next.user_id || next.reply_preview.is_some() {
        return false;
    }
    match (parse_time(&prev.created_at), parse_time(&next.created_at)) {
        (Some(a), Some(b)) => (b - a).num_seconds().abs() < 7 * 60,
        _ => false,
    }
}

pub fn parse_time(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value).ok().map(|t| t.with_timezone(&chrono::Utc))
}

/// "14:05" today, "Yesterday 14:05", otherwise "12 Nov 14:05", in local time.
pub fn short_time(value: &str) -> String {
    let Some(t) = parse_time(value) else { return String::new() };
    let local = t.with_timezone(&chrono::Local);
    let today = chrono::Local::now().date_naive();
    let day = local.date_naive();
    if day == today {
        local.format("%H:%M").to_string()
    } else if Some(day) == today.pred_opt() {
        local.format("Yesterday %H:%M").to_string()
    } else {
        local.format("%-d %b %H:%M").to_string()
    }
}
