//! The signed-in window: server rail, channel sidebar (with who is in each voice room), the open
//! conversation and the composer. State comes from the REST API once and then from the hub socket.

use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::time::{Duration, Instant};

use gpui::{
    AnyElement, App, Context, Entity, EventEmitter, FocusHandle, Focusable, FontWeight, IntoElement,
    ListAlignment, ListState, ObjectFit, Render, img, SharedString, Subscription, Task, Window, div,
    list, prelude::*, px,
};
use serde_json::{Value, json};

use crate::api::Client;
use crate::input::{InputEvent, TextInput};
use crate::model::{self, Channel, Message, MessagePage, Server, User, VoiceParticipant};
use crate::realtime::{self, Hub, HubEvent};
use crate::rich;
use crate::voice::{Voice, VoiceCmd, VoiceEvent};

#[derive(Clone, Copy, PartialEq)]
enum CallState {
    Joining,
    Connected,
    Reconnecting,
}

struct Call {
    channel_id: String,
    state: CallState,
    /// LiveKit identities talking right now.
    speaking: HashSet<String>,
}
use crate::theme::{Theme, css_color};

pub enum ShellEvent {
    SignedOut,
}

pub struct Shell {
    client: Client,
    hub: Hub,
    me: User,
    servers: Vec<Server>,
    server_id: Option<String>,
    channel_id: Option<String>,
    messages: HashMap<String, Vec<Message>>,
    has_more: HashMap<String, bool>,
    loading: HashSet<String>,
    list: ListState,
    online: HashSet<String>,
    /// Who sits in each voice room, from the hub.
    rooms: HashMap<String, Vec<VoiceParticipant>>,
    voice: Voice,
    /// The room this app is in, and how far the connection got.
    call: Option<Call>,
    /// This app's hub connection id: the second half of its LiveKit identity.
    connection_id: Option<String>,
    muted: bool,
    deafened: bool,
    /// The mic was closed by deafening, so undeafening opens it again.
    mute_from_deafen: bool,
    dev_joined: bool,
    /// Who is typing where: (user id, name, when it was last heard).
    typing: HashMap<String, Vec<(String, String, Instant)>>,
    unread: HashSet<String>,
    /// Messages whose spoilers were clicked open.
    revealed: HashSet<String>,
    composer: Entity<TextInput>,
    connected: bool,
    status: Option<SharedString>,
    last_typing_sent: Option<Instant>,
    focus: FocusHandle,
    _tasks: Vec<Task<()>>,
    _subs: Vec<Subscription>,
}

impl EventEmitter<ShellEvent> for Shell {}

const TYPING_SHOWN_FOR: Duration = Duration::from_secs(6);

impl Shell {
    pub fn new(client: Client, me: User, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let (hub, events) = realtime::start(client.clone());
        let (voice, voice_events) = Voice::start();
        let voice_task = cx.spawn(async move |this, cx| {
            while let Ok(event) = voice_events.recv().await {
                if this.update(cx, |this, cx| this.on_voice(event, cx)).is_err() {
                    break;
                }
            }
        });
        let composer = cx.new(|cx| TextInput::new("Message", cx));
        let subs = vec![cx.subscribe_in(&composer, window, |this, _, event, _window, cx| match event {
            InputEvent::Submit => this.send_composer(cx),
            InputEvent::Changed => this.note_typing(),
            InputEvent::Escape => {}
        })];

        let hub_task = cx.spawn(async move |this, cx| {
            while let Ok(event) = events.recv().await {
                if this.update(cx, |this, cx| this.on_hub(event, cx)).is_err() {
                    break;
                }
            }
        });
        // Typing lines fade on their own; nothing tells us someone stopped.
        let typing_task = cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_secs(1)).await;
                let alive = this.update(cx, |this, cx| {
                    let before: usize = this.typing.values().map(Vec::len).sum();
                    for list in this.typing.values_mut() {
                        list.retain(|(_, _, at)| at.elapsed() < TYPING_SHOWN_FOR);
                    }
                    let after: usize = this.typing.values().map(Vec::len).sum();
                    if before != after {
                        cx.notify();
                    }
                });
                if alive.is_err() {
                    break;
                }
            }
        });

        let list = ListState::new(0, ListAlignment::Bottom, px(800.));
        let weak = cx.weak_entity();
        list.set_scroll_handler(move |event, _window, cx| {
            // Near the top of what is loaded: fetch the page before it.
            if event.visible_range.start < 3 {
                weak.update(cx, |this, cx| this.load_older(cx)).ok();
            }
        });

        // Cmd-Q while in a room: leave properly, so nobody sees a ghost seat until LiveKit times it out.
        let quit = cx.on_app_quit(|this: &mut Self, _cx| {
            if this.call.take().is_some() {
                this.hub.send(json!({ "t": "voice-leave" }));
                let left = this.voice.leave_blocking(Duration::from_millis(700));
                crate::trace(format!("quit: left voice cleanly: {left}"));
            }
            async {}
        });
        let mut shell = Self {
            client,
            hub,
            me,
            servers: Vec::new(),
            server_id: None,
            channel_id: None,
            messages: HashMap::new(),
            has_more: HashMap::new(),
            loading: HashSet::new(),
            list,
            online: HashSet::new(),
            rooms: HashMap::new(),
            voice,
            call: None,
            connection_id: None,
            muted: false,
            deafened: false,
            mute_from_deafen: false,
            dev_joined: false,
            typing: HashMap::new(),
            unread: HashSet::new(),
            revealed: HashSet::new(),
            composer,
            connected: false,
            status: Some("Loading your servers…".into()),
            last_typing_sent: None,
            focus: cx.focus_handle(),
            _tasks: vec![hub_task, typing_task, voice_task],
            _subs: { let mut subs = subs; subs.push(quit); subs },
        };
        shell.load_servers(cx);
        shell
    }

    fn server(&self) -> Option<&Server> {
        let id = self.server_id.as_ref()?;
        self.servers.iter().find(|s| &s.id == id)
    }

    fn channel(&self) -> Option<&Channel> {
        let id = self.channel_id.as_ref()?;
        self.servers.iter().flat_map(|s| s.channels.iter()).find(|c| &c.id == id)
    }

    fn load_servers(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.servers() }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(servers) => {
                        crate::trace(format!("servers loaded: {}", servers.len()));
                        this.servers = servers;
                        this.status = None;
                        let keep = this.server_id.as_ref().is_some_and(|id| this.servers.iter().any(|s| &s.id == id));
                        if !keep {
                            let first = this.servers.first().map(|s| s.id.clone());
                            if let Some(id) = first {
                                this.open_server(id, cx);
                            }
                        }
                    }
                    Err(err) => this.status = Some(format!("Could not load servers: {err}").into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn open_server(&mut self, id: String, cx: &mut Context<Self>) {
        self.server_id = Some(id);
        let first_text = self.server().and_then(|s| {
            let mut channels: Vec<&Channel> = s.channels.iter().filter(|c| c.is_text()).collect();
            channels.sort_by_key(|c| (c.category_id.is_some(), c.position));
            channels.first().map(|c| c.id.clone())
        });
        if let Some(channel) = first_text {
            self.open_channel(channel, cx);
        }
        cx.notify();
    }

    fn open_channel(&mut self, id: String, cx: &mut Context<Self>) {
        if self.channel_id.as_deref() == Some(&id) {
            return;
        }
        self.unread.remove(&id);
        self.channel_id = Some(id.clone());
        self.hub.send(json!({ "t": "subscribe", "channelId": id }));
        let count = self.messages.get(&id).map_or(0, Vec::len);
        self.list.reset(count);
        if !self.messages.contains_key(&id) {
            self.fetch_messages(id, None, cx);
        }
        let name = self.channel().map(|c| c.name.clone()).unwrap_or_default();
        self.composer.update(cx, |input, cx| input.set_placeholder(format!("Message #{name}"), cx));
        cx.notify();
    }

    fn fetch_messages(&mut self, channel: String, before: Option<String>, cx: &mut Context<Self>) {
        if !self.loading.insert(channel.clone()) {
            return;
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let id = channel.clone();
            let older = before.clone();
            let result: anyhow::Result<MessagePage> = cx
                .background_executor()
                .spawn(async move { client.messages(&id, older.as_deref()) })
                .await;
            this.update(cx, |this, cx| {
                this.loading.remove(&channel);
                match result {
                    Ok(page) => {
                        this.has_more.insert(channel.clone(), page.has_more);
                        let added = page.messages.len();
                        let list = this.messages.entry(channel.clone()).or_default();
                        if before.is_some() {
                            // Older page: goes in front, and the view stays where the reader was.
                            let mut merged = page.messages;
                            merged.append(list);
                            *list = merged;
                            if this.channel_id.as_deref() == Some(&channel) {
                                this.list.splice(0..0, added);
                            }
                        } else {
                            *list = page.messages;
                            if this.channel_id.as_deref() == Some(&channel) {
                                this.list.reset(list.len());
                            }
                        }
                    }
                    Err(err) => this.status = Some(format!("Could not load messages: {err}").into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn load_older(&mut self, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else { return };
        if !self.has_more.get(&channel).copied().unwrap_or(false) || self.loading.contains(&channel) {
            return;
        }
        let oldest = self.messages.get(&channel).and_then(|m| m.first()).map(|m| m.id.clone());
        if let Some(oldest) = oldest {
            self.fetch_messages(channel, Some(oldest), cx);
        }
    }

    fn send_composer(&mut self, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else { return };
        let text = self.composer.read(cx).text();
        if text.trim().is_empty() {
            return;
        }
        self.composer.update(cx, |input, cx| input.clear(cx));
        self.last_typing_sent = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let body = text.clone();
            let result = cx
                .background_executor()
                .spawn(async move { client.send(&channel, &body, None) })
                .await;
            this.update(cx, |this, cx| {
                match result {
                    // The hub echoes the message to every tab, this one included; add it now in case
                    // the socket is down, and the echo is dropped as a duplicate.
                    Ok(message) => this.add_message(message, cx),
                    Err(err) => {
                        this.status = Some(format!("Not sent: {err}").into());
                        this.composer.update(cx, |input, cx| input.set_text(text, cx));
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn note_typing(&mut self) {
        let Some(channel) = &self.channel_id else { return };
        if self.last_typing_sent.is_some_and(|at| at.elapsed() < Duration::from_secs(3)) {
            return;
        }
        self.last_typing_sent = Some(Instant::now());
        self.hub.send(json!({ "t": "typing", "channelId": channel }));
    }

    fn add_message(&mut self, message: Message, cx: &mut Context<Self>) {
        let Some(channel) = message.channel_id.clone() else { return };
        // A thread reply belongs to its thread, not the channel's main list.
        if message.thread_id.is_some() {
            return;
        }
        let Some(list) = self.messages.get_mut(&channel) else {
            if self.channel_id.as_deref() != Some(&channel) {
                self.unread.insert(channel);
                cx.notify();
            }
            return;
        };
        if list.iter().any(|m| m.id == message.id) {
            return;
        }
        if let Some(user) = &message.user_id
            && let Some(typing) = self.typing.get_mut(&channel)
        {
            typing.retain(|(id, _, _)| id != user);
        }
        list.push(message);
        let len = list.len();
        if self.channel_id.as_deref() == Some(&channel) {
            self.list.splice(len - 1..len - 1, 1);
            // A message above it can now continue into it, so redraw that one too.
            if len >= 2 {
                self.list.splice(len - 2..len - 1, 1);
            }
        } else {
            self.unread.insert(channel);
        }
        cx.notify();
    }

    fn on_hub(&mut self, event: HubEvent, cx: &mut Context<Self>) {
        match &event {
            HubEvent::Connected => crate::trace("hub connected"),
            HubEvent::Disconnected(reason) => crate::trace(format!("hub disconnected: {reason}")),
            HubEvent::Event(v) => crate::trace(format!("hub event {}", v.get("t").and_then(Value::as_str).unwrap_or("?"))),
        }
        match event {
            HubEvent::Connected => {
                self.connected = true;
            }
            HubEvent::Disconnected(reason) => {
                if self.connected {
                    eprintln!("hub: disconnected: {reason}");
                }
                self.connected = false;
            }
            HubEvent::Event(value) => self.on_hub_event(value, cx),
        }
        cx.notify();
    }

    fn on_hub_event(&mut self, value: Value, cx: &mut Context<Self>) {
        let t = value.get("t").and_then(Value::as_str).unwrap_or("");
        let channel = value.get("channelId").and_then(Value::as_str).map(str::to_string);
        match t {
            "ready" => {
                let id = value.get("connectionId").and_then(Value::as_str).map(str::to_string);
                let changed = id != self.connection_id;
                self.connection_id = id;
                // A fresh hub connection (not a resume) lost the seat: take it again.
                if changed && let Some(room) = self.call.as_ref().map(|c| c.channel_id.clone()) {
                    self.join_voice(room, cx);
                }
                self.online = strings(value.get("online"));
                // Development: HOFFLE_DEV_JOIN=<room name or id> joins that voice room once.
                if self.call.is_none()
                    && let Ok(want) = std::env::var("HOFFLE_DEV_JOIN")
                    && !std::mem::replace(&mut self.dev_joined, true)
                {
                    let room = self.servers.iter().flat_map(|s| s.channels.iter())
                        .find(|c| c.is_voice() && (c.id == want || c.name == want)).map(|c| c.id.clone());
                    if let Some(room) = room {
                        self.join_voice(room, cx);
                    }
                }
                if let Some(rooms) = value.get("voice").and_then(Value::as_object) {
                    self.rooms = rooms
                        .iter()
                        .map(|(id, list)| (id.clone(), serde_json::from_value(list.clone()).unwrap_or_default()))
                        .collect();
                }
                // Missed messages while away: reload the open channel.
                if let Some(open) = self.channel_id.clone() {
                    self.messages.remove(&open);
                    self.fetch_messages(open, None, cx);
                }
            }
            "presence" => self.online = strings(value.get("online")),
            "voice" => {
                if let Some(channel) = channel {
                    let list = serde_json::from_value(value["participants"].clone()).unwrap_or_default();
                    self.rooms.insert(channel, list);
                }
            }
            "message" => {
                if let Ok(message) = serde_json::from_value::<Message>(value["message"].clone()) {
                    let mut message = message;
                    if message.channel_id.is_none() {
                        message.channel_id = channel;
                    }
                    self.add_message(message, cx);
                }
            }
            "message-deleted" => {
                let id = value.get("id").and_then(Value::as_str).unwrap_or("");
                if let Some(channel) = channel
                    && let Some(list) = self.messages.get_mut(&channel)
                    && let Some(ix) = list.iter().position(|m| m.id == id)
                {
                    list.remove(ix);
                    if self.channel_id.as_deref() == Some(&channel) {
                        self.list.splice(ix..ix + 1, 0);
                    }
                }
            }
            "message-edited" => {
                let id = value.get("id").and_then(Value::as_str).unwrap_or("");
                if let Some(channel) = channel
                    && let Some(list) = self.messages.get_mut(&channel)
                    && let Some(ix) = list.iter().position(|m| m.id == id)
                {
                    if let Some(content) = value.get("content").and_then(Value::as_str) {
                        list[ix].text = content.to_string();
                    }
                    list[ix].edited_at = value.get("editedAt").and_then(Value::as_str).map(str::to_string);
                    if self.channel_id.as_deref() == Some(&channel) {
                        self.list.splice(ix..ix + 1, 1);
                    }
                }
            }
            "reaction" => {
                let id = value.get("messageId").and_then(Value::as_str).unwrap_or("");
                let emoji = value.get("emoji").and_then(Value::as_str).unwrap_or("").to_string();
                let added = value.get("added").and_then(Value::as_bool).unwrap_or(false);
                let mine = value.get("userId").and_then(Value::as_str) == Some(self.me.id.as_str());
                if let Some(channel) = channel
                    && let Some(list) = self.messages.get_mut(&channel)
                    && let Some(ix) = list.iter().position(|m| m.id == id)
                {
                    let reactions = &mut list[ix].reactions;
                    match reactions.iter_mut().position(|r| r.emoji == emoji) {
                        Some(r) if added => {
                            reactions[r].count += 1;
                            reactions[r].mine |= mine;
                        }
                        Some(r) => {
                            reactions[r].count = reactions[r].count.saturating_sub(1);
                            if mine {
                                reactions[r].mine = false;
                            }
                            if reactions[r].count == 0 {
                                reactions.remove(r);
                            }
                        }
                        None if added => reactions.push(model::Reaction { emoji, count: 1, mine }),
                        None => {}
                    }
                    if self.channel_id.as_deref() == Some(&channel) {
                        self.list.splice(ix..ix + 1, 1);
                    }
                }
            }
            "typing" => {
                let user = value.get("userId").and_then(Value::as_str).unwrap_or("").to_string();
                let name = value.get("displayName").and_then(Value::as_str).unwrap_or("Someone").to_string();
                if let Some(channel) = channel
                    && user != self.me.id
                {
                    let list = self.typing.entry(channel).or_default();
                    list.retain(|(id, _, _)| id != &user);
                    list.push((user, name, Instant::now()));
                }
            }
            "structure" => self.load_servers(cx),
            "voice-evicted" => {
                if self.call.is_some() {
                    self.leave_voice(cx);
                    self.status = Some("You were removed from the voice room.".into());
                }
            }
            "force-mute" => {
                if value.get("userId").and_then(Value::as_str) == Some(self.me.id.as_str()) {
                    let muted = value.get("muted").and_then(Value::as_bool).unwrap_or(true);
                    if muted && !self.muted {
                        self.toggle_mute(cx);
                    }
                }
            }
            _ => {}
        }
    }

    fn join_voice(&mut self, channel_id: String, cx: &mut Context<Self>) {
        let Some(connection_id) = self.connection_id.clone() else {
            self.status = Some("Still connecting to Hoffle; try again in a moment.".into());
            cx.notify();
            return;
        };
        self.call = Some(Call { channel_id: channel_id.clone(), state: CallState::Joining, speaking: HashSet::new() });
        // Take the seat first: the token is tied to this connection, and other people's apps only
        // trust a LiveKit identity they can find in the room's roster.
        self.hub.send(json!({
            "t": "voice-join",
            "channelId": channel_id,
            "sfu": true,
            "muted": self.muted,
            "deafened": self.deafened,
        }));
        let people = self.rooms.get(&channel_id).map_or(0, Vec::len) + 1;
        let wanted = self.channel_by_id(&channel_id).and_then(|c| c.bitrate).unwrap_or(64_000);
        // Hoffle's 320k tier is for rooms of up to 10; bigger rooms stay at or under 192k.
        let bitrate = wanted.clamp(16_000, if people <= 10 { 320_000 } else { 192_000 });
        let (muted, deafened) = (self.muted, self.deafened);
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let room = channel_id.clone();
            let token = cx
                .background_executor()
                .spawn(async move { client.voice_token(&room, &connection_id) })
                .await;
            this.update(cx, |this, cx| {
                // Left or moved on while the token was on its way.
                if this.call.as_ref().is_none_or(|c| c.channel_id != channel_id) {
                    return;
                }
                crate::trace(format!("voice token: {}", token.as_ref().map(|t| t.identity.clone()).unwrap_or_else(|e| e.to_string())));
                match token {
                    Ok(token) => this.voice.send(VoiceCmd::Join { url: token.url, token: token.token, bitrate, muted, deafened }),
                    Err(err) => {
                        this.status = Some(format!("Could not join voice: {err}").into());
                        this.leave_voice(cx);
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn leave_voice(&mut self, cx: &mut Context<Self>) {
        if self.call.take().is_some() {
            self.voice.send(VoiceCmd::Leave(None));
            self.hub.send(json!({ "t": "voice-leave" }));
        }
        cx.notify();
    }

    fn toggle_mute(&mut self, cx: &mut Context<Self>) {
        self.muted = !self.muted;
        // Unmuting while deafened hears again too, as on the web.
        if !self.muted && self.deafened {
            self.deafened = false;
            self.voice.send(VoiceCmd::Deafen(false));
        }
        self.voice.send(VoiceCmd::Mute(self.muted));
        self.hub.send(json!({ "t": "voice-state", "muted": self.muted, "deafened": self.deafened }));
        cx.notify();
    }

    fn toggle_deafen(&mut self, cx: &mut Context<Self>) {
        self.deafened = !self.deafened;
        self.voice.send(VoiceCmd::Deafen(self.deafened));
        // Deafening closes the mic; undeafening opens it only if deafen was what closed it.
        if self.deafened && !self.muted {
            self.muted = true;
            self.mute_from_deafen = true;
            self.voice.send(VoiceCmd::Mute(true));
        } else if !self.deafened && self.mute_from_deafen {
            self.muted = false;
            self.mute_from_deafen = false;
            self.voice.send(VoiceCmd::Mute(false));
        }
        self.hub.send(json!({ "t": "voice-state", "muted": self.muted, "deafened": self.deafened }));
        cx.notify();
    }

    fn on_voice(&mut self, event: VoiceEvent, cx: &mut Context<Self>) {
        crate::trace(format!("voice: {event:?}"));
        match event {
            VoiceEvent::Connected => {
                if let Some(call) = self.call.as_mut() {
                    call.state = CallState::Connected;
                }
                // Development: HOFFLE_DEV_QUIT_AFTER=<seconds> quits the way Cmd-Q does, once in a call.
                if let Some(secs) = std::env::var("HOFFLE_DEV_QUIT_AFTER").ok().and_then(|v| v.parse::<u64>().ok()) {
                    cx.spawn(async move |_, cx| {
                        cx.background_executor().timer(Duration::from_secs(secs)).await;
                        cx.update(|cx| cx.quit()).ok();
                    })
                    .detach();
                }
            }
            VoiceEvent::Reconnecting => {
                if let Some(call) = self.call.as_mut() {
                    call.state = CallState::Reconnecting;
                }
            }
            VoiceEvent::Speaking(ids) => {
                if let Some(call) = self.call.as_mut() {
                    call.speaking = ids;
                }
            }
            VoiceEvent::Error(err) => {
                self.status = Some(err.into());
                if self.call.take().is_some() {
                    self.hub.send(json!({ "t": "voice-leave" }));
                }
            }
            VoiceEvent::Disconnected(reason) => {
                if reason != "left" && self.call.take().is_some() {
                    self.hub.send(json!({ "t": "voice-leave" }));
                    self.status = Some("Voice disconnected.".into());
                }
            }
        }
        cx.notify();
    }

    /// An absolute URL for a picture the API named, if it named one.
    fn picture(&self, url: &Option<String>) -> Option<String> {
        url.as_deref().filter(|u| !u.is_empty()).map(|u| self.client.absolute(u))
    }

    fn channel_by_id(&self, id: &str) -> Option<&Channel> {
        self.servers.iter().flat_map(|s| s.channels.iter()).find(|c| c.id == id)
    }

    fn render_call(&self, cx: &mut Context<Self>) -> Option<impl IntoElement> {
        let call = self.call.as_ref()?;
        let room = self.channel_by_id(&call.channel_id).map(|c| c.name.clone()).unwrap_or_default();
        let (label, color) = match call.state {
            CallState::Joining => ("Joining voice…", Theme::muted()),
            CallState::Connected => ("Voice connected", Theme::mint()),
            CallState::Reconnecting => ("Reconnecting…", Theme::coral()),
        };
        let button = |id: &'static str, text: &'static str, on: bool| {
            div()
                .id(id)
                .flex_1()
                .h(px(30.))
                .rounded(px(8.))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(12.))
                .cursor_pointer()
                .bg(if on { Theme::coral() } else { Theme::lavender_soft() })
                .text_color(if on { Theme::paper() } else { Theme::ink() })
                .hover(|s| s.opacity(0.85))
                .child(text)
        };
        Some(
            div()
                .px_3()
                .py_2()
                .flex()
                .flex_col()
                .gap_2()
                .bg(Theme::paper())
                .border_t_1()
                .border_color(Theme::line())
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .child(div().text_size(px(12.)).font_weight(FontWeight::SEMIBOLD).text_color(color).child(label))
                        .child(div().text_size(px(12.)).text_color(Theme::muted()).truncate().child(room)),
                )
                .child(
                    div()
                        .flex()
                        .gap_2()
                        .child(
                            button("mute", if self.muted { "Unmute" } else { "Mute" }, self.muted)
                                .on_click(cx.listener(|this, _, _, cx| this.toggle_mute(cx))),
                        )
                        .child(
                            button("deafen", if self.deafened { "Undeafen" } else { "Deafen" }, self.deafened)
                                .on_click(cx.listener(|this, _, _, cx| this.toggle_deafen(cx))),
                        )
                        .child(
                            button("leave", "Leave", false).on_click(cx.listener(|this, _, _, cx| this.leave_voice(cx))),
                        ),
                ),
        )
    }

    fn sign_out(&mut self, cx: &mut Context<Self>) {
        self.leave_voice(cx);
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.logout() }).detach();
        let mut saved = crate::api::store::load();
        saved.token = None;
        crate::api::store::save(&saved);
        cx.emit(ShellEvent::SignedOut);
    }

    // ---------------------------------------------------------------- rendering

    fn render_rail(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let mut rail = div()
            .id("rail")
            .w(px(72.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .items_center()
            .gap_2()
            .pt(px(40.))
            .pb_3()
            .bg(Theme::paper())
            .overflow_y_scroll();
        for server in &self.servers {
            let selected = self.server_id.as_deref() == Some(&server.id);
            let unread = server.channels.iter().any(|c| self.unread.contains(&c.id));
            let color = css_color(&server.color).unwrap_or(Theme::lavender_soft().into());
            let id = server.id.clone();
            rail = rail.child(
                div()
                    .relative()
                    .flex()
                    .items_center()
                    .child(
                        div()
                            .absolute()
                            .left(px(-14.))
                            .w(px(4.))
                            .h(px(if selected { 36. } else if unread { 8. } else { 0. }))
                            .rounded(px(2.))
                            .bg(Theme::ink()),
                    )
                    .child(
                        div()
                            .id(SharedString::from(format!("server-{}", server.id)))
                            .size(px(46.))
                            .rounded(px(if selected { 14. } else { 23. }))
                            .bg(if selected { color } else { Theme::panel().into() })
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(if is_emojiish(&server.icon) { 22. } else { 15. }))
                            .font_weight(FontWeight::SEMIBOLD)
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::lavender_muted()).rounded(px(14.)))
                            .child(match self.picture(&server.icon_url) {
                                Some(url) => img(url).size(px(46.)).rounded(px(if selected { 14. } else { 23. })).object_fit(ObjectFit::Cover).into_any_element(),
                                None => server_icon(server).into_any_element(),
                            })
                            .tooltip(tooltip(server.name.clone()))
                            .on_click(cx.listener(move |this, _, _, cx| this.open_server(id.clone(), cx))),
                    ),
            );
        }
        rail
    }

    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let Some(server) = self.server() else {
            return div().w(px(248.)).h_full().bg(Theme::panel()).into_any_element();
        };
        let mut categories = server.categories.clone();
        categories.sort_by_key(|c| c.position);
        let mut channels: Vec<&Channel> = server.channels.iter().collect();
        channels.sort_by_key(|c| c.position);

        let mut body = div().id("channels").flex_1().overflow_y_scroll().px_2().pb_3().flex().flex_col();
        let groups = std::iter::once((None, String::new()))
            .chain(categories.iter().map(|c| (Some(c.id.clone()), c.name.clone())));
        for (category, name) in groups {
            let members: Vec<&&Channel> = channels.iter().filter(|c| c.category_id == category).collect();
            if members.is_empty() {
                continue;
            }
            if category.is_some() {
                body = body.child(
                    div()
                        .pt_4()
                        .pb_1()
                        .px_2()
                        .text_size(px(11.))
                        .font_weight(FontWeight::BOLD)
                        .text_color(Theme::muted())
                        .child(name.to_uppercase()),
                );
            }
            for channel in members {
                body = body.child(self.render_channel_row(channel, cx));
                if channel.is_voice()
                    && let Some(people) = self.rooms.get(&channel.id)
                {
                    for person in people {
                        let identity = format!("{}|{}", person.id, person.connection_id);
                        let talking = self.call.as_ref().is_some_and(|c| c.channel_id == channel.id && c.speaking.contains(&identity));
                        let picture = self.picture(&person.avatar_url);
                        body = body.child(render_voice_person(person, picture, talking));
                    }
                }
            }
        }

        div()
            .w(px(248.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .border_r_1()
            .border_color(Theme::line())
            .child(
                div()
                    .h(px(52.))
                    .pt(px(14.))
                    .px_4()
                    .flex()
                    .items_center()
                    .border_b_1()
                    .border_color(Theme::line())
                    .font_weight(FontWeight::BOLD)
                    .child(server.name.clone()),
            )
            .child(body)
            .children(self.render_call(cx))
            .child(self.render_me(cx))
            .into_any_element()
    }

    fn render_channel_row(&self, channel: &Channel, cx: &mut Context<Self>) -> impl IntoElement {
        let selected = self.channel_id.as_deref() == Some(&channel.id);
        let unread = self.unread.contains(&channel.id);
        let id = channel.id.clone();
        let text = channel.is_text();
        let voice = channel.is_voice();
        let server_id = channel.server_id.clone();
        let base = self.client.base().to_string();
        let count = self.rooms.get(&channel.id).map_or(0, Vec::len);
        div()
            .id(SharedString::from(format!("channel-{}", channel.id)))
            .h(px(32.))
            .px_2()
            .mt(px(1.))
            .rounded(px(8.))
            .flex()
            .items_center()
            .gap_2()
            .cursor_pointer()
            .text_size(px(14.))
            .when(selected, |d| d.bg(Theme::lavender_soft()).text_color(Theme::ink()))
            .when(!selected, |d| {
                d.text_color(if unread { Theme::ink() } else { Theme::muted() }).hover(|s| s.bg(Theme::hover()))
            })
            .when(unread && !selected, |d| d.font_weight(FontWeight::SEMIBOLD))
            .child(div().w(px(18.)).flex().justify_center().text_color(Theme::muted()).child(channel.glyph()))
            .child(div().flex_1().truncate().child(channel.name.clone()))
            .when(voice && count > 0, |d| {
                d.child(div().text_size(px(11.)).text_color(Theme::mint()).child(format!("{count}")))
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                if text {
                    this.open_channel(id.clone(), cx);
                } else if voice {
                    if this.call.as_ref().is_none_or(|c| c.channel_id != id) {
                        this.join_voice(id.clone(), cx);
                    }
                } else {
                    // Forums, boards and the other richer kinds are not native yet: hand over to the web app.
                    cx.open_url(&format!("{base}?server={server_id}"));
                }
            }))
    }

    fn render_me(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .h(px(56.))
            .px_3()
            .flex()
            .items_center()
            .gap_2()
            .bg(Theme::paper())
            .border_t_1()
            .border_color(Theme::line())
            .child(avatar(self.picture(&self.me.avatar_url), &self.me.avatar, &self.me.color, self.me.name(), 32.))
            .child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .overflow_hidden()
                    .child(div().text_size(px(13.)).font_weight(FontWeight::SEMIBOLD).truncate().child(self.me.name().to_string()))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .text_size(px(11.))
                            .text_color(Theme::muted())
                            .child(div().size(px(7.)).rounded_full().bg(if self.connected { Theme::mint() } else { Theme::coral() }))
                            .child(if self.connected { "Connected" } else { "Reconnecting…" }),
                    ),
            )
            .child(
                div()
                    .id("sign-out")
                    .px_2()
                    .py_1()
                    .rounded(px(6.))
                    .text_size(px(11.))
                    .text_color(Theme::muted())
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()).text_color(Theme::ink()))
                    .child("Sign out")
                    .on_click(cx.listener(|this, _, _, cx| this.sign_out(cx))),
            )
    }

    fn render_conversation(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let channel = self.channel();
        let title = channel.map(|c| c.name.clone()).unwrap_or_default();
        let topic = channel.map(|c| c.topic.clone()).unwrap_or_default();
        let has_topic = !topic.is_empty();
        let online = self.online.len();

        let header = div()
            .h(px(52.))
            .pt(px(14.))
            .px_4()
            .flex()
            .flex_none()
            .items_center()
            .gap_2()
            .border_b_1()
            .border_color(Theme::line())
            .child(div().text_color(Theme::muted()).child("#"))
            .child(div().font_weight(FontWeight::BOLD).child(title))
            .when(has_topic, |d| {
                d.child(div().w(px(1.)).h(px(18.)).bg(Theme::line()))
                    .child(div().flex_1().truncate().text_size(px(13.)).text_color(Theme::muted()).child(topic))
            })
            .when(!has_topic, |d| d.child(div().flex_1()))
            .child(
                div()
                    .text_size(px(12.))
                    .text_color(Theme::muted())
                    .child(format!("{online} online")),
            );

        let loading = self.channel_id.as_ref().is_some_and(|c| self.loading.contains(c))
            && self.channel_id.as_ref().is_some_and(|c| !self.messages.contains_key(c));
        let body: AnyElement = if loading {
            div()
                .flex_1()
                .flex()
                .items_center()
                .justify_center()
                .text_color(Theme::muted())
                .child("Loading messages…")
                .into_any_element()
        } else {
            list(
                self.list.clone(),
                cx.processor(|this, ix: usize, _window, cx| this.render_message(ix, cx)),
            )
            .flex_1()
            .into_any_element()
        };

        let typing = self
            .channel_id
            .as_ref()
            .and_then(|c| self.typing.get(c))
            .filter(|l| !l.is_empty())
            .map(|l| match l.as_slice() {
                [one] => format!("{} is typing…", one.1),
                [a, b] => format!("{} and {} are typing…", a.1, b.1),
                _ => "Several people are typing…".to_string(),
            });

        div()
            .flex_1()
            .h_full()
            .flex()
            .flex_col()
            .bg(Theme::chat_bg())
            .child(header)
            .child(body)
            .child(
                div()
                    .px_4()
                    .pb_1()
                    .pt_2()
                    .child(self.composer.clone())
                    .child(
                        div()
                            .h(px(20.))
                            .pt_1()
                            .text_size(px(12.))
                            .text_color(Theme::muted())
                            .child(typing.or(self.status.as_ref().map(|s| s.to_string())).unwrap_or_default()),
                    ),
            )
    }

    fn reveal(&mut self, id: String, cx: &mut Context<Self>) {
        self.revealed.insert(id.clone());
        let open = self.channel_id.as_ref().and_then(|c| self.messages.get(c));
        if let Some(ix) = open.and_then(|list| list.iter().position(|m| m.id == id)) {
            self.list.splice(ix..ix + 1, 1);
        }
        cx.notify();
    }

    fn render_message(&mut self, ix: usize, cx: &mut Context<Self>) -> AnyElement {
        let Some(list) = self.channel_id.as_ref().and_then(|c| self.messages.get(c)) else {
            return div().into_any_element();
        };
        let Some(message) = list.get(ix) else { return div().into_any_element() };
        let continued = ix > 0 && model::continues(&list[ix - 1], message);
        let mentions_me = mentions(&message.text, &self.me.username);

        let mut text_col = div().flex_1().min_w_0().flex().flex_col();
        if !continued {
            let name_color = css_color(&message.color).unwrap_or(Theme::ink().into());
            text_col = text_col.child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().font_weight(FontWeight::SEMIBOLD).text_color(name_color).child(message.author.clone()))
                    .when(message.bot, |d| {
                        d.child(
                            div()
                                .px_1()
                                .rounded(px(4.))
                                .bg(Theme::lavender_muted())
                                .text_size(px(10.))
                                .font_weight(FontWeight::BOLD)
                                .child("BOT"),
                        )
                    })
                    .child(div().text_size(px(11.)).text_color(Theme::muted()).child(model::short_time(&message.created_at))),
            );
        }
        if let Some(reply) = &message.reply_preview {
            text_col = text_col.child(
                div()
                    .text_size(px(12.))
                    .text_color(Theme::muted())
                    .truncate()
                    .child(format!("↪ {}: {}", reply.author, reply.text)),
            );
        }
        if let Some(command) = &message.command_text {
            text_col = text_col.child(div().text_size(px(12.)).text_color(Theme::muted()).child(format!("used {command}")));
        }
        if !message.text.is_empty() {
            let revealed = self.revealed.contains(&message.id);
            let weak = cx.weak_entity();
            let id = message.id.clone();
            let on_spoiler: Rc<dyn Fn(&mut App)> = Rc::new(move |cx| {
                weak.update(cx, |this, cx| this.reveal(id.clone(), cx)).ok();
            });
            text_col = text_col.child(rich::message_body(&message.id, &message.text, &self.me.username, revealed, on_spoiler));
            if message.edited_at.is_some() {
                text_col = text_col.child(div().text_size(px(10.)).text_color(Theme::muted()).child("(edited)"));
            }
        } else if message.kind.is_some() {
            text_col = text_col.child(
                div().text_size(px(13.)).italic().text_color(Theme::muted()).child("A card the web app shows (open Hoffle in the browser to see it)."),
            );
        }
        let images = message.image.iter().chain(message.images.iter()).count();
        if images > 0 || !message.files.is_empty() {
            let mut chips = div().flex().flex_wrap().gap_2().mt_1();
            let base = self.client.clone();
            for (n, url) in message.image.iter().chain(message.images.iter()).enumerate() {
                let link = base.absolute(url);
                let open = link.clone();
                chips = chips.child(
                    div()
                        .id(SharedString::from(format!("img-{}-{n}", message.id)))
                        .w(px(360.))
                        .h(px(240.))
                        .rounded(px(10.))
                        .overflow_hidden()
                        .bg(Theme::paper())
                        .cursor_pointer()
                        .child(
                            img(link)
                                .size_full()
                                .object_fit(ObjectFit::Contain)
                                .with_loading(|| div().size_full().into_any_element())
                                .with_fallback(|| div().size_full().flex().items_center().justify_center().text_color(Theme::muted()).child("Image could not be shown").into_any_element()),
                        )
                        .on_click(move |_, _, cx| cx.open_url(&open)),
                );
            }
            for (n, file) in message.files.iter().enumerate() {
                let link = base.absolute(&file.url);
                chips = chips.child(chip(format!("📎 {}", file.name), link, format!("file-{}-{n}", message.id)));
            }
            text_col = text_col.child(chips);
        }
        if !message.reactions.is_empty() {
            let mut row = div().flex().flex_wrap().gap_1().mt_1();
            for reaction in &message.reactions {
                row = row.child(
                    div()
                        .px_2()
                        .h(px(24.))
                        .flex()
                        .items_center()
                        .gap_1()
                        .rounded(px(12.))
                        .text_size(px(12.))
                        .bg(if reaction.mine { Theme::lavender_soft() } else { Theme::paper() })
                        .border_1()
                        .border_color(if reaction.mine { Theme::lavender_muted() } else { Theme::line() })
                        .child(reaction.emoji.clone())
                        .child(div().text_color(Theme::muted()).child(reaction.count.to_string())),
                );
            }
            text_col = text_col.child(row);
        }
        if let Some(count) = message.thread_count.filter(|c| *c > 0) {
            text_col = text_col.child(
                div()
                    .mt_1()
                    .text_size(px(12.))
                    .text_color(Theme::lavender())
                    .child(format!("{count} {} in thread", if count == 1 { "reply" } else { "replies" })),
            );
        }

        div()
            .w_full()
            .px_4()
            .pt(px(if continued { 2. } else { 14. }))
            .pb(px(2.))
            .flex()
            .gap_3()
            .text_size(px(14.))
            .line_height(px(20.))
            .when(mentions_me, |d| d.bg(Theme::lavender_soft()).border_l_2().border_color(Theme::lavender()))
            .child(if continued {
                div().w(px(38.)).flex_none().into_any_element()
            } else {
                avatar(self.picture(&message.avatar_url), &message.avatar, &message.color, &message.author, 38.)
            })
            .child(text_col)
            .into_any_element()
    }
}

impl Focusable for Shell {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for Shell {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Typing goes to the composer unless something else has focus.
        if window.focused(cx).is_none() {
            window.focus(&self.composer.focus_handle(cx));
        }
        div()
            .size_full()
            .flex()
            .bg(Theme::paper())
            .text_color(Theme::ink())
            .child(self.render_rail(cx))
            .child(self.render_sidebar(cx))
            .child(self.render_conversation(cx))
    }
}

fn strings(value: Option<&Value>) -> HashSet<String> {
    value
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .unwrap_or_default()
}

/// Whether a message names this account (@name, @everyone, @here), read the same way the body is drawn.
fn mentions(text: &str, username: &str) -> bool {
    crate::markdown::inline(text, username)
        .spans
        .iter()
        .any(|(_, span)| matches!(span, crate::markdown::Span::Mention { me: true }))
}

fn is_emojiish(text: &str) -> bool {
    text.chars().next().is_some_and(|c| !c.is_ascii())
}

fn server_icon(server: &Server) -> String {
    if !server.icon.trim().is_empty() {
        return server.icon.clone();
    }
    server
        .name
        .split_whitespace()
        .filter_map(|w| w.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase()
}

/// A round avatar: the account's picture, or its emoji or initials on its colour.
fn avatar(picture: Option<String>, avatar: &str, color: &str, name: &str, size: f32) -> AnyElement {
    let fallback = letter_avatar(avatar, color, name, size);
    match picture.filter(|p| !p.is_empty()) {
        Some(url) => {
            let (avatar, color, name) = (avatar.to_string(), color.to_string(), name.to_string());
            img(url)
                .size(px(size))
                .flex_none()
                .rounded_full()
                .object_fit(ObjectFit::Cover)
                .with_fallback(move || letter_avatar(&avatar, &color, &name, size))
                .into_any_element()
        }
        None => fallback,
    }
}

fn letter_avatar(avatar: &str, color: &str, name: &str, size: f32) -> AnyElement {
    let color = css_color(color).unwrap_or(Theme::lavender_muted().into());
    let face = if avatar.trim().is_empty() {
        name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default()
    } else {
        avatar.to_string()
    };
    div()
        .size(px(size))
        .flex_none()
        .rounded_full()
        .bg(color.opacity(0.35))
        .border_1()
        .border_color(color.opacity(0.6))
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(size * 0.5))
        .child(face)
        .into_any_element()
}

fn render_voice_person(person: &VoiceParticipant, picture: Option<String>, talking: bool) -> impl IntoElement {
    let face = div()
        .rounded_full()
        .border_2()
        .border_color(if talking { Theme::mint() } else { gpui::transparent_black().into() })
        .child(avatar(picture, &person.avatar, &person.color, person.name(), 20.));
    let mut row = div()
        .h(px(26.))
        .pl(px(34.))
        .pr_2()
        .flex()
        .items_center()
        .gap_2()
        .text_size(px(13.))
        .text_color(Theme::muted())
        .child(face)
        .child(div().flex_1().truncate().when(talking, |d| d.text_color(Theme::ink())).child(person.name().to_string()));
    if person.screen_stream_id.is_some() {
        row = row.child(div().text_size(px(10.)).px_1().rounded(px(4.)).bg(Theme::coral()).text_color(Theme::paper()).child("LIVE"));
    }
    if person.deafened {
        row = row.child("🔇");
    } else if person.muted {
        row = row.child("🎙̸");
    }
    row
}

fn chip(label: String, url: String, id: String) -> impl IntoElement {
    div()
        .id(SharedString::from(id))
        .px_2()
        .py_1()
        .rounded(px(8.))
        .bg(Theme::paper())
        .border_1()
        .border_color(Theme::line())
        .text_size(px(12.))
        .cursor_pointer()
        .hover(|s| s.border_color(Theme::lavender_muted()))
        .child(label)
        .on_click(move |_, _, cx| cx.open_url(&url))
}

fn tooltip(text: String) -> impl Fn(&mut Window, &mut App) -> gpui::AnyView {
    move |_, cx| cx.new(|_| Tooltip(text.clone().into())).into()
}

struct Tooltip(SharedString);

impl Render for Tooltip {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .px_2()
            .py_1()
            .rounded(px(6.))
            .bg(Theme::paper())
            .border_1()
            .border_color(Theme::line())
            .text_color(Theme::ink())
            .text_size(px(12.))
            .child(self.0.clone())
    }
}
