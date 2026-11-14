//! Hoffle's HTTP API, signed in with the same `hoffle_session` cookie the web app uses.
//! Every call blocks, so callers run them on gpui's background executor.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context as _, Result, anyhow, bail};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};

use crate::model::{Message, MessagePage, Server, User};

pub const DEFAULT_BASE: &str = "https://chat.hoffle.online/hangout";
pub const SESSION_COOKIE: &str = "hoffle_session";

#[derive(Clone)]
pub struct Client {
    /// Origin plus base path, no trailing slash: `https://chat.hoffle.online/hangout`.
    base: Arc<str>,
    token: Arc<Mutex<Option<String>>>,
    agent: ureq::Agent,
}

pub enum LoginOutcome {
    SignedIn(User),
    /// Two-factor is on: the password was right and this ticket buys the second step.
    SecondFactor { ticket: String },
}

impl Client {
    pub fn new(base: &str, token: Option<String>) -> Self {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(20)))
            .user_agent(concat!("HoffleLite-GPUI/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        Self {
            base: base.trim_end_matches('/').into(),
            token: Arc::new(Mutex::new(token)),
            agent,
        }
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }

    /// `wss://host/hangout/api/realtime`.
    pub fn realtime_url(&self) -> String {
        let base = if let Some(rest) = self.base.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = self.base.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            self.base.to_string()
        };
        format!("{base}/api/realtime")
    }

    /// An absolute URL for a path the API hands back (`/hangout/api/uploads/…`).
    pub fn absolute(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        let origin = url::Url::parse(&self.base)
            .map(|u| u.origin().ascii_serialization())
            .unwrap_or_default();
        format!("{origin}{path}")
    }

    pub fn cookie_header(&self) -> Option<String> {
        self.token().map(|t| format!("{SESSION_COOKIE}={t}"))
    }

    fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let mut request = self.agent.get(format!("{}{path}", self.base));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let response = request.call().with_context(|| format!("GET {path}"))?;
        read(response, path)
    }

    fn post<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        let mut request = self
            .agent
            .post(format!("{}{path}", self.base))
            .header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let response = request.send_json(body).with_context(|| format!("POST {path}"))?;
        self.take_cookie(&response);
        read(response, path)
    }

    fn take_cookie(&self, response: &ureq::http::Response<ureq::Body>) {
        for value in response.headers().get_all("set-cookie") {
            let Ok(value) = value.to_str() else { continue };
            let first = value.split(';').next().unwrap_or("");
            if let Some(token) = first.strip_prefix(&format!("{SESSION_COOKIE}=")) {
                let token = token.trim();
                *self.token.lock().unwrap() = (!token.is_empty()).then(|| token.to_string());
            }
        }
    }

    pub fn login(&self, username: &str, password: &str) -> Result<LoginOutcome> {
        let reply: Value = self.post(
            "/api/auth/login",
            json!({ "username": username, "password": password }),
        )?;
        signed_in_or_second_factor(reply)
    }

    pub fn second_factor(&self, ticket: &str, code: &str) -> Result<User> {
        let reply: Value = self.post("/api/auth/two-factor", json!({ "ticket": ticket, "code": code }))?;
        match signed_in_or_second_factor(reply)? {
            LoginOutcome::SignedIn(user) => Ok(user),
            LoginOutcome::SecondFactor { .. } => bail!("That code did not work."),
        }
    }

    /// Who the stored cookie belongs to, or None when it expired.
    pub fn session(&self) -> Result<Option<User>> {
        #[derive(Deserialize)]
        struct Session {
            user: Option<User>,
        }
        Ok(self.get::<Session>("/api/auth/session")?.user)
    }

    pub fn logout(&self) {
        let _: Result<Value> = self.post("/api/auth/logout", json!({}));
        *self.token.lock().unwrap() = None;
    }

    pub fn servers(&self) -> Result<Vec<Server>> {
        #[derive(Deserialize)]
        struct Servers {
            servers: Vec<Server>,
        }
        Ok(self.get::<Servers>("/api/servers")?.servers)
    }

    pub fn messages(&self, channel_id: &str, before: Option<&str>) -> Result<MessagePage> {
        let mut path = format!("/api/messages?channelId={}", encode(channel_id));
        if let Some(before) = before {
            path.push_str(&format!("&before={}", encode(before)));
        }
        self.get(&path)
    }

    pub fn send(&self, channel_id: &str, content: &str, reply_to: Option<&str>) -> Result<Message> {
        let mut body = json!({ "channelId": channel_id, "content": content });
        if let Some(reply_to) = reply_to {
            body["replyTo"] = json!(reply_to);
        }
        let reply: Value = self.post("/api/messages", body)?;
        let message = reply.get("message").cloned().unwrap_or(reply);
        Ok(serde_json::from_value(message)?)
    }

    /// A message by id, with where it lives (`/api/messages/<id>`); an error when we cannot read it.
    pub fn linked_message(&self, id: &str) -> Result<Value> {
        self.get(&format!("/api/messages/{}", encode(id)))
    }

    /// runMusicUiCommand: a music command in a voice room; answers the room's state.
    pub fn music_command(&self, command: &str, voice_channel_id: &str, text_channel_id: Option<&str>, silent: bool) -> Result<Value> {
        self.post("/api/music/command", json!({ "command": command, "voiceChannelId": voice_channel_id, "textChannelId": text_channel_id, "silent": silent }))
    }

    /// A poll's tallies, my votes, whether it is private, and (public) who voted for what.
    pub fn poll(&self, poll_id: &str) -> Result<Value> {
        self.get(&format!("/api/polls?pollId={}", encode(poll_id)))
    }

    /// Vote on a poll (again on the same option takes the vote back).
    pub fn vote(&self, poll_id: &str, choice: usize) -> Result<Value> {
        self.post("/api/polls/vote", json!({ "pollId": poll_id, "choice": choice }))
    }

    /// A thread's replies, oldest first.
    pub fn thread(&self, root_id: &str) -> Result<Vec<Message>> {
        let page: MessagePage = self.get(&format!("/api/messages?threadId={}", encode(root_id)))?;
        Ok(page.messages)
    }

    /// A reply in a thread.
    pub fn send_thread(&self, channel_id: &str, content: &str, thread_id: &str) -> Result<Message> {
        let reply: Value = self.post("/api/messages", json!({ "channelId": channel_id, "content": content, "threadId": thread_id }))?;
        let message = reply.get("message").cloned().unwrap_or(reply);
        Ok(serde_json::from_value(message)?)
    }

    /// A message with a payload of its own (a forward's `forwardedFrom`).
    pub fn send_payload(&self, channel_id: &str, content: &str, payload: Value) -> Result<Message> {
        let reply: Value = self.post("/api/messages", json!({ "channelId": channel_id, "content": content, "payload": payload }))?;
        let message = reply.get("message").cloned().unwrap_or(reply);
        Ok(serde_json::from_value(message)?)
    }

    /// A message carrying uploaded files: the first key as `attachmentKey`, the rest after it.
    pub fn send_with_files(&self, channel_id: &str, content: &str, reply_to: Option<&str>, keys: &[String]) -> Result<Message> {
        let mut body = json!({ "channelId": channel_id, "content": content });
        if let Some(reply_to) = reply_to {
            body["replyTo"] = json!(reply_to);
        }
        if let Some((first, rest)) = keys.split_first() {
            body["attachmentKey"] = json!(first);
            body["attachmentKeys"] = json!(rest);
        }
        let reply: Value = self.post("/api/messages", body)?;
        let message = reply.get("message").cloned().unwrap_or(reply);
        Ok(serde_json::from_value(message)?)
    }

    /// `POST /api/uploads` (multipart, one `file` field); answers the stored file's key.
    pub fn upload(&self, name: &str, mime: &str, bytes: &[u8]) -> Result<String> {
        let boundary = format!("hoffle{:016x}", rand_u64());
        let safe = name.replace(['"', '\r', '\n'], "_");
        let mut body = Vec::with_capacity(bytes.len() + 256);
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes());
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let mut request = self
            .agent
            .post(format!("{}/api/uploads", self.base))
            .header("Origin", self.absolute(""))
            .header("Content-Type", &format!("multipart/form-data; boundary={boundary}"));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let reply: Value = read(request.send(&body[..])?, "upload")?;
        reply.get("key").and_then(Value::as_str).map(str::to_string).ok_or_else(|| anyhow::anyhow!("The upload gave no key back."))
    }

    pub fn members(&self, server_id: &str) -> Result<Vec<crate::model::Member>> {
        #[derive(Deserialize)]
        struct Members {
            members: Vec<crate::model::Member>,
        }
        Ok(self.get::<Members>(&format!("/api/members?serverId={}", encode(server_id)))?.members)
    }

    pub fn friends(&self) -> Result<crate::model::FriendsData> {
        self.get("/api/friends")
    }

    /// Finds or opens the direct message with someone; returns its channel id.
    pub fn open_dm(&self, user_id: &str) -> Result<String> {
        let reply: Value = self.post("/api/dms", json!({ "userId": user_id }))?;
        reply.get("channelId").and_then(Value::as_str).map(str::to_string).ok_or_else(|| anyhow!("No conversation came back."))
    }

    pub fn dms(&self) -> Result<Vec<crate::model::DmConversation>> {
        #[derive(Deserialize)]
        struct Dms {
            conversations: Vec<crate::model::DmConversation>,
        }
        Ok(self.get::<Dms>("/api/dms")?.conversations)
    }

    /// Unread state for every channel this account can see.
    pub fn reads(&self) -> Result<std::collections::HashMap<String, crate::model::ReadState>> {
        #[derive(Deserialize)]
        struct Reads {
            channels: std::collections::HashMap<String, crate::model::ReadState>,
        }
        Ok(self.get::<Reads>("/api/channels/reads")?.channels)
    }

    /// Adds or removes this account's reaction (the server flips it).
    pub fn toggle_reaction(&self, message_id: &str, emoji: &str) -> Result<()> {
        let _: Value = self.post(&format!("/api/messages/{}/reactions", encode(message_id)), json!({ "emoji": emoji }))?;
        Ok(())
    }

    pub fn emojis(&self, server_id: &str) -> Result<Vec<crate::model::Emoji>> {
        #[derive(Deserialize)]
        struct Emojis {
            emojis: Vec<crate::model::Emoji>,
        }
        Ok(self.get::<Emojis>(&format!("/api/emojis?serverId={}", encode(server_id)))?.emojis)
    }

    pub fn edit_message(&self, message_id: &str, content: &str) -> Result<()> {
        let mut request = self.agent.patch(format!("{}/api/messages/{}", self.base, encode(message_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let response = request.send_json(json!({ "content": content }))?;
        read::<Value>(response, "edit message").map(|_| ())
    }

    pub fn delete_message(&self, message_id: &str) -> Result<()> {
        let mut request = self.agent.delete(format!("{}/api/messages/{}", self.base, encode(message_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let response = request.call()?;
        read::<Value>(response, "delete message").map(|_| ())
    }

    /// Pins or unpins a message (togglePin); the answer is the state it ended in.
    pub fn pin_message(&self, message_id: &str, pinned: bool) -> Result<bool> {
        let mut request = self.agent.patch(format!("{}/api/messages/{}", self.base, encode(message_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let response = request.send_json(json!({ "pinned": pinned }))?;
        let reply: Value = read(response, "pin message")?;
        Ok(reply.get("pinned").and_then(Value::as_bool).unwrap_or(pinned))
    }

    /// The ids of the messages this account bookmarked (loadSaved).
    pub fn saved_ids(&self) -> Result<Vec<String>> {
        let reply: Value = self.get("/api/saved")?;
        Ok(reply
            .get("saved")
            .and_then(Value::as_array)
            .map(|list| list.iter().filter_map(|e| e.get("messageId").and_then(Value::as_str).map(str::to_string)).collect())
            .unwrap_or_default())
    }

    /// Bookmarks a message, or takes the bookmark off (toggleSaved).
    pub fn set_saved(&self, message_id: &str, saved: bool) -> Result<()> {
        if saved {
            let _: Value = self.post("/api/saved", json!({ "messageId": message_id }))?;
            return Ok(());
        }
        let mut request = self.agent.delete(format!("{}/api/saved?messageId={}", self.base, encode(message_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        read::<Value>(request.call()?, "unsave").map(|_| ())
    }

    /// "Translate" from the message menu: the text in `to`, and the language it ended up in.
    pub fn translate(&self, message_id: &str, to: &str) -> Result<(String, String)> {
        let reply: Value = self.post(&format!("/api/messages/{}/translate", encode(message_id)), json!({ "to": to }))?;
        let text = reply.get("text").and_then(Value::as_str).unwrap_or_default().to_string();
        let to = reply.get("to").and_then(Value::as_str).unwrap_or(to).to_string();
        Ok((text, to))
    }

    /// `https://host/hangout?server=…&channel=…&message=…` (buildMessageLink; no server for a DM).
    pub fn message_link(&self, message_id: &str, channel_id: Option<&str>, server_id: Option<&str>) -> String {
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        if let Some(s) = server_id {
            query.append_pair("server", s);
        }
        if let Some(c) = channel_id {
            query.append_pair("channel", c);
        }
        query.append_pair("message", message_id);
        format!("{}?{}", self.base.trim_end_matches('/'), query.finish())
    }

    /// Report Message: to the server's moderators, or to the Hoffle team from a DM.
    pub fn report(&self, server_id: Option<&str>, channel_id: Option<&str>, message_id: &str) -> Result<()> {
        let _: Value = self.post(
            "/api/reports",
            json!({ "serverId": server_id, "channelId": channel_id, "messageId": message_id, "reason": "Reported from chat" }),
        )?;
        Ok(())
    }

    /// The reactions in this account's message toolbar (`PATCH /api/settings/profile`).
    pub fn set_quick_reactions(&self, list: &[String]) -> Result<()> {
        let mut request = self.agent.patch(format!("{}/api/settings/profile", self.base)).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        read::<Value>(request.send_json(json!({ "quickReactions": list }))?, "quick reactions").map(|_| ())
    }

    /// What you have in common with someone (`/api/users/{id}/mutuals`).
    pub fn mutuals(&self, user_id: &str) -> Result<crate::model::Mutuals> {
        self.get(&format!("/api/users/{}/mutuals", encode(user_id)))
    }

    /// Your private note about someone.
    pub fn note(&self, user_id: &str) -> Result<String> {
        let reply: Value = self.get(&format!("/api/users/{}/note", encode(user_id)))?;
        Ok(reply.get("note").and_then(Value::as_str).unwrap_or_default().to_string())
    }

    pub fn set_note(&self, user_id: &str, note: &str) -> Result<String> {
        let mut request = self.agent.put(format!("{}/api/users/{}/note", self.base, encode(user_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let reply: Value = read(request.send_json(json!({ "note": note }))?, "note")?;
        Ok(reply.get("note").and_then(Value::as_str).unwrap_or_default().to_string())
    }

    pub fn add_friend(&self, username: &str) -> Result<()> {
        let _: Value = self.post("/api/friends", json!({ "username": username }))?;
        Ok(())
    }

    pub fn accept_friend(&self, user_id: &str) -> Result<()> {
        let _: Value = self.post("/api/friends/accept", json!({ "requesterId": user_id }))?;
        Ok(())
    }

    /// Unfriends, or unblocks (the same call on the web).
    pub fn remove_friend(&self, user_id: &str) -> Result<()> {
        let mut request = self.agent.delete(format!("{}/api/friends?id={}", self.base, encode(user_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        read::<Value>(request.call()?, "friends").map(|_| ())
    }

    pub fn block(&self, user_id: &str) -> Result<()> {
        let _: Value = self.post("/api/friends/block", json!({ "targetId": user_id }))?;
        Ok(())
    }

    /// A channel's pinned messages.
    pub fn pinned(&self, channel_id: &str) -> Result<Vec<crate::model::Message>> {
        Ok(self.get::<crate::model::MessagePage>(&format!("/api/messages?channelId={}&pinned=1", encode(channel_id)))?.messages)
    }

    pub fn saved_list(&self) -> Result<Vec<crate::shell::SavedEntry>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Saved {
            saved: Vec<crate::shell::SavedEntry>,
        }
        Ok(self.get::<Saved>("/api/saved")?.saved)
    }

    pub fn mention_inbox(&self) -> Result<Vec<crate::shell::MentionEntry>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Mentions {
            mentions: Vec<crate::shell::MentionEntry>,
        }
        Ok(self.get::<Mentions>("/api/mentions")?.mentions)
    }

    pub fn search(&self, server_id: &str, query: &str) -> Result<Vec<crate::shell::SearchResult>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Results {
            results: Vec<crate::shell::SearchResult>,
        }
        Ok(self.get::<Results>(&format!("/api/messages/search?serverId={}&q={}", encode(server_id), encode(query)))?.results)
    }

    /// A link's preview card (`/api/unfurl`), or none.
    pub fn unfurl(&self, url: &str) -> Result<Option<crate::shell::Preview>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Reply {
            preview: Option<crate::shell::Preview>,
        }
        Ok(self.get::<Reply>(&format!("/api/unfurl?url={}", encode(url)))?.preview)
    }

    /// Klipy GIFs or stickers for a search (`/api/gifs`, `/api/stickers`), and the setup hint when
    /// search is not configured.
    pub fn media(&self, kind: &str, query: &str) -> Result<(Vec<crate::shell::MediaItem>, String)> {
        let reply: Value = self.get(&format!("/api/{kind}?q={}", encode(query)))?;
        let items = reply.get(kind).cloned().map(serde_json::from_value).transpose()?.unwrap_or_default();
        let hint = if reply.get("configured").and_then(Value::as_bool) == Some(false) {
            reply.get("hint").and_then(Value::as_str).unwrap_or_default().to_string()
        } else {
            String::new()
        };
        Ok((items, hint))
    }

    pub fn server_stickers(&self, server_id: &str) -> Result<(Vec<crate::shell::MediaItem>, String)> {
        let reply: Value = self.get(&format!("/api/stickers/packs?serverId={}", encode(server_id)))?;
        let items = reply.get("stickers").cloned().map(serde_json::from_value).transpose()?.unwrap_or_default();
        Ok((items, String::new()))
    }

    /// Volume and mute for each person, as this account set them (`/api/voice/prefs`).
    pub fn voice_prefs(&self) -> Result<std::collections::HashMap<String, crate::shell::VoicePref>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Reply {
            prefs: std::collections::HashMap<String, crate::shell::VoicePref>,
        }
        Ok(self.get::<Reply>("/api/voice/prefs")?.prefs)
    }

    pub fn save_voice_pref(&self, target: &str, volume: Option<u32>, muted: Option<bool>) -> Result<()> {
        let mut body = json!({ "targetId": target });
        if let Some(v) = volume {
            body["volume"] = json!(v);
        }
        if let Some(m) = muted {
            body["muted"] = json!(m);
        }
        let _: Value = self.post("/api/voice/prefs", body)?;
        Ok(())
    }

    pub fn mark_read_many(&self, channel_ids: &[String]) -> Result<()> {
        let _: Value = self.post("/api/channels/reads", json!({ "channelIds": channel_ids }))?;
        Ok(())
    }

    /// Notification levels by channel (or `server:<id>`).
    pub fn channel_prefs(&self) -> Result<std::collections::HashMap<String, String>> {
        #[derive(serde::Deserialize, Default)]
        #[serde(default)]
        struct Reply {
            prefs: std::collections::HashMap<String, String>,
        }
        Ok(self.get::<Reply>("/api/channels/prefs")?.prefs)
    }

    pub fn set_channel_pref(&self, key: &str, level: &str) -> Result<()> {
        let _: Value = self.post("/api/channels/prefs", json!({ "channelId": key, "level": level }))?;
        Ok(())
    }

    pub fn leave_server(&self, server_id: &str) -> Result<()> {
        let _: Value = self.post("/api/servers/membership", json!({ "action": "leave", "serverId": server_id }))?;
        Ok(())
    }

    pub fn delete_server(&self, server_id: &str) -> Result<()> {
        let mut request = self.agent.delete(format!("{}/api/servers/{}", self.base, encode(server_id))).header("Origin", self.absolute(""));
        if let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        read::<Value>(request.call()?, "delete server").map(|_| ())
    }

    pub fn set_channel_pref_for(&self, key: &str, level: &str, duration_ms: Option<u64>) -> Result<()> {
        let _: Value = self.post("/api/channels/prefs", json!({ "channelId": key, "level": level, "durationMs": duration_ms }))?;
        Ok(())
    }

    pub fn mark_read(&self, channel_id: &str) -> Result<()> {
        let _: Value = self.post("/api/channels/reads", json!({ "channelId": channel_id }))?;
        Ok(())
    }

    /// A LiveKit login for one voice room, tied to this app's hub connection id.
    pub fn voice_token(&self, channel_id: &str, connection_id: &str) -> Result<VoiceToken> {
        let token: VoiceToken = self.get(&format!(
            "/api/voice/token?channelId={}&connectionId={}",
            encode(channel_id),
            encode(connection_id)
        ))?;
        if !token.enabled {
            bail!("Voice is not set up on this Hoffle.");
        }
        Ok(token)
    }

    /// A picture or file by URL: status and body. The session cookie goes only to this Hoffle's own
    /// origin, never to another host an avatar URL might point at.
    pub fn fetch(&self, url: &str) -> Result<(u16, Vec<u8>)> {
        let url = self.absolute(url);
        let mut request = self.agent.get(&url);
        let own = url::Url::parse(&url).ok().map(|u| u.origin()) == url::Url::parse(&self.base).ok().map(|u| u.origin());
        if own && let Some(cookie) = self.cookie_header() {
            request = request.header("Cookie", &cookie);
        }
        let mut response = request.call()?;
        let status = response.status().as_u16();
        let body = response.body_mut().with_config().limit(25 * 1024 * 1024).read_to_vec()?;
        Ok((status, body))
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct VoiceToken {
    pub enabled: bool,
    pub url: String,
    pub token: String,
    pub identity: String,
    pub region: Option<String>,
}

fn signed_in_or_second_factor(reply: Value) -> Result<LoginOutcome> {
    if let Some(ticket) = reply.pointer("/twoFactor/ticket").and_then(Value::as_str) {
        return Ok(LoginOutcome::SecondFactor { ticket: ticket.to_string() });
    }
    let user = reply.get("user").cloned().ok_or_else(|| anyhow!("The server did not sign you in."))?;
    Ok(LoginOutcome::SignedIn(serde_json::from_value(user)?))
}

/// Turns an error reply (`{ "error": "…" }`) into an error carrying that sentence.
fn read<T: DeserializeOwned>(mut response: ureq::http::Response<ureq::Body>, path: &str) -> Result<T> {
    let status = response.status();
    let text = response.body_mut().with_config().limit(32 * 1024 * 1024).read_to_string()?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| format!("{status} from {path}"));
        bail!(message);
    }
    serde_json::from_str(&text).with_context(|| format!("reading {path}"))
}

fn rand_u64() -> u64 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    h.finish()
}

fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

/// Where the session is kept between launches: the base URL and the cookie, readable only by this user.
pub mod store {
    use std::path::PathBuf;

    use serde::{Deserialize, Serialize};

    #[derive(Default, Serialize, Deserialize)]
    pub struct Saved {
        pub base: String,
        pub token: Option<String>,
        pub username: Option<String>,
    }

    fn path() -> Option<PathBuf> {
        Some(dirs::config_dir()?.join("Hoffle Lite").join("session.json"))
    }

    pub fn load() -> Saved {
        path()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(saved: &Saved) {
        let Some(path) = path() else { return };
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let Ok(bytes) = serde_json::to_vec_pretty(saved) else { return };
        if std::fs::write(&path, bytes).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
        }
    }
}
