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
