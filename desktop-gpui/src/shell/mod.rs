//! The signed-in window: server rail, channel sidebar (with who is in each voice room), the open
//! conversation and the composer. State comes from the REST API once and then from the hub socket.

mod chat;
mod members;
mod rail;
mod sidebar;

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use gpui::{
    App, Context, Entity, EventEmitter, FocusHandle, Focusable, ListAlignment, ListState, SharedString,
    Subscription, Task, Window, prelude::*, px,
};
use serde_json::{Value, json};

use crate::api::Client;
use crate::input::{InputEvent, TextInput};
use crate::model::{self, Channel, DmConversation, Member, Message, MessagePage, ReadState, Server, User, VoiceParticipant};
use crate::realtime::{self, Hub, HubEvent};
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
    /// Unread counts and mentions per channel, from /api/channels/reads, kept current by the hub.
    reads: HashMap<String, ReadState>,
    /// Members of each server (members panel, presence, statuses).
    members: HashMap<String, Vec<Member>>,
    dms: Vec<DmConversation>,
    /// Categories folded shut in the sidebar.
    collapsed: HashSet<String>,
    members_open: bool,
    /// Room players from the hub (`ready.players`, `player` events), by voice channel id.
    players: HashMap<String, Value>,
    /// The small menu over the user card.
    footer_menu: bool,
    /// Hub clock minus ours, in ms: voice seat timers count in the hub's time.
    clock_offset: f64,
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
        let composer = cx.new(|cx| TextInput::new("Message", cx).bare());
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
            reads: HashMap::new(),
            members: HashMap::new(),
            dms: Vec::new(),
            collapsed: HashSet::new(),
            members_open: true,
            players: HashMap::new(),
            footer_menu: false,
            clock_offset: 0.,
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
        shell.load_side_data(cx);
        // Voice seat timers tick once a second.
        shell._tasks.push(cx.spawn(async move |this, cx| loop {
            cx.background_executor().timer(Duration::from_secs(1)).await;
            if this.update(cx, |this, cx| if this.rooms.values().any(|r| !r.is_empty()) { cx.notify() }).is_err() {
                break;
            }
        }));
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

    /// DMs and unread counts: once at start and after reconnecting.
    fn load_side_data(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let fetch = client.clone();
            let (dms, reads) = cx.background_executor().spawn(async move { (fetch.dms(), fetch.reads()) }).await;
            this.update(cx, |this, cx| {
                if let Ok(dms) = dms {
                    this.dms = dms;
                }
                if let Ok(mut reads) = reads {
                    // The open channel is being read right now.
                    if let Some(open) = &this.channel_id {
                        reads.remove(open);
                    }
                    this.reads = reads;
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn load_members(&mut self, server_id: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let id = server_id.clone();
            let result = cx.background_executor().spawn(async move { client.members(&id) }).await;
            this.update(cx, |this, cx| {
                if let Ok(members) = result {
                    this.members.insert(server_id, members);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn mark_read(&mut self, channel_id: &str, cx: &mut Context<Self>) {
        let had = self.reads.remove(channel_id).is_some_and(|r| r.unread || r.count > 0);
        if had {
            let client = self.client.clone();
            let id = channel_id.to_string();
            cx.background_executor().spawn(async move { client.mark_read(&id) }).detach();
        }
    }

    fn bump_unread(&mut self, channel: &str, message: &Message) {
        if message.user_id.as_deref() == Some(self.me.id.as_str()) {
            return;
        }
        let entry = self.reads.entry(channel.to_string()).or_default();
        entry.unread = true;
        entry.count += 1;
        if mentions(&message.text, &self.me.username) {
            entry.mentions += 1;
        }
    }

    /// The hub's clock in our terms, in ms.
    fn hub_now(&self) -> f64 {
        chrono::Utc::now().timestamp_millis() as f64 + self.clock_offset
    }

    fn open_server(&mut self, id: String, cx: &mut Context<Self>) {
        if !self.members.contains_key(&id) {
            self.load_members(id.clone(), cx);
        }
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
        if let Some(previous) = self.channel_id.clone() {
            self.reads.insert(previous.clone(), ReadState { unread: true, ..Default::default() });
            self.mark_read(&previous, cx);
        }
        self.mark_read(&id, cx);
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
                self.bump_unread(&channel, &message);
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
            let message = self.messages.get(&channel).and_then(|l| l.last()).cloned().unwrap_or_default();
            self.bump_unread(&channel, &message);
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
        if let Some(now) = value.get("serverNow").and_then(Value::as_f64) {
            self.clock_offset = now - chrono::Utc::now().timestamp_millis() as f64;
        }
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
                if let Some(players) = value.get("players").and_then(Value::as_object) {
                    self.players = players.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                }
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
            "player" => {
                if let Some(state) = value.get("state") {
                    let room = state.get("channelId").and_then(Value::as_str).or(channel.as_deref()).map(str::to_string);
                    if let Some(room) = room {
                        self.players.insert(room, state.clone());
                    }
                }
            }
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






    fn reveal(&mut self, id: String, cx: &mut Context<Self>) {
        self.revealed.insert(id.clone());
        let open = self.channel_id.as_ref().and_then(|c| self.messages.get(c));
        if let Some(ix) = open.and_then(|list| list.iter().position(|m| m.id == id)) {
            self.list.splice(ix..ix + 1, 1);
        }
        cx.notify();
    }

}

impl Focusable for Shell {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
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









