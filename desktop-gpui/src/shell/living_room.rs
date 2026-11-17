//! The 3D Living Room (components/living-room.tsx, hooks/use-living-room.ts): the lounge, cinema,
//! tabletop, board hall, meadow and club, shared by everyone in the call. The web's own room runs in a
//! web view over the stage (resources/web/livingroom.html, built by tools/export-livingroom.sh). The
//! app tells it who is in the call, who is speaking, the theme and the room's player, hands it the
//! hub's lounge and club events, and sends what it says (where you walk, sit, emote) to the hub.
//!
//! As on the web, the armchair in the call bar opens it (kept on this computer like the web's
//! `huddle-living-room-open`), for voice rooms (not Stage channels) while the Living Room module is on.
//! Voices are not yet placed where people sit: the app plays everyone at one volume.

use gpui::{AnyElement, Context, Window, div, prelude::*};
use serde_json::{Value, json};

use super::Shell;
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct LivingRoom {
    /// The call's room this page belongs to.
    room: Option<String>,
    view: Option<WebOverlay>,
    ready: bool,
    /// You chose to be in the room (the armchair button).
    pub open: bool,
    /// The call's venue (lounge, cinema, tabletop, boardhall, meadow, club), from the page.
    pub venue: String,
    /// What was last told to the page, and where its box was.
    sent: Option<String>,
    rect: Option<String>,
}

fn open_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("living-room-open"))
}

/// Whether you had the room open last time (the web keeps it per browser).
fn load_open() -> bool {
    // HOFFLE_DEV_LIVING=1 (tests): open, leaving the saved choice alone.
    if std::env::var("HOFFLE_DEV_LIVING").is_ok() {
        return true;
    }
    open_path().and_then(|p| std::fs::read_to_string(p).ok()).is_some_and(|s| s.trim() == "1")
}

impl LivingRoom {
    pub(super) fn new() -> Self {
        Self { open: load_open(), ..Default::default() }
    }
}

impl Shell {
    /// The call's room, when the Living Room can be used there: joined, a voice room (not Stage).
    fn living_room_for(&self) -> Option<String> {
        let call = self.call.as_ref().filter(|c| c.state == super::CallState::Connected)?;
        let kind = self.servers.iter().flat_map(|s| s.channels.iter()).find(|c| c.id == call.channel_id).map(|c| c.kind.as_str()).unwrap_or("voice");
        (kind != "stage").then(|| call.channel_id.clone())
    }

    /// The armchair shows while the module is on, or while you are in the room.
    pub(super) fn living_room_button(&self) -> bool {
        self.living_room_for().is_some() && (self.living_room.open || !self.me.disabled_modules.iter().any(|m| m == "living_room"))
    }

    /// The room is drawn over the stage of the call you are in.
    pub(super) fn living_room_showing(&self) -> bool {
        self.living_room.open && self.living_room_for().is_some() && self.stage.as_ref().map(|s| &s.channel_id) == self.call.as_ref().map(|c| &c.channel_id)
    }

    pub(super) fn toggle_living_room(&mut self, cx: &mut Context<Self>) {
        self.living_room.open = !self.living_room.open;
        if let Some(path) = open_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
            let _ = std::fs::write(path, if self.living_room.open { "1" } else { "0" });
        }
        cx.notify();
    }

    /// Each frame: follow the call, read what the page said, keep it told.
    pub(super) fn living_room_tick(&mut self, cx: &mut Context<Self>) {
        let room = self.living_room_for();
        if room != self.living_room.room {
            let open = self.living_room.open;
            self.living_room = LivingRoom { room, open, ..Default::default() };
        }
        let Some(view) = &self.living_room.view else { return };
        let mut changed = false;
        let mut sends = Vec::new();
        let mut commands = Vec::new();
        for raw in view.messages() {
            let Ok(m) = serde_json::from_str::<Value>(&raw) else { continue };
            match m["t"].as_str().unwrap_or("") {
                "ready" => {
                    self.living_room.ready = true;
                    self.living_room.sent = None;
                    self.living_room.rect = None;
                    changed = true;
                }
                "send" => sends.push(m["event"].clone()),
                "command" => commands.push(m["command"].as_str().unwrap_or("").to_string()),
                "state" => {
                    let venue = m["venue"].as_str().unwrap_or("lounge").to_string();
                    if venue != self.living_room.venue {
                        self.living_room.venue = venue;
                        changed = true;
                    }
                }
                "notice" => self.set_notice(m["message"].as_str().unwrap_or("").to_string(), cx),
                "error" => crate::trace(format!("living room page: {}", m["message"])),
                _ => {}
            }
        }
        for event in sends.into_iter().filter(|e| e.is_object()) {
            self.hub.send(event);
        }
        for command in commands.into_iter().filter(|c| c.starts_with('/')) {
            self.run_command_in_call(command, cx);
        }
        if self.living_room.ready {
            let state = self.living_room_state();
            let text = state.to_string();
            if self.living_room.sent.as_ref() != Some(&text)
                && let Some(view) = &self.living_room.view
            {
                view.eval(&format!("window.__set({text})"));
                self.living_room.sent = Some(text);
            }
        }
        if changed {
            cx.notify();
        }
    }

    /// Everything the page's LivingRoomView and useLivingRoom take, as the web passes them.
    fn living_room_state(&self) -> Value {
        let room = self.living_room.room.clone();
        let people = room.as_ref().and_then(|r| self.rooms.get(r)).cloned().unwrap_or_default();
        let participants: Vec<Value> = people
            .iter()
            .map(|p| {
                json!({
                    "id": p.id,
                    "connectionId": p.connection_id,
                    "displayName": p.display_name,
                    "username": p.username,
                    "avatar": p.avatar,
                    "avatarUrl": p.avatar_url.as_ref().map(|u| self.client.absolute(u)),
                    "color": p.color,
                    "muted": p.muted,
                    "deafened": p.deafened,
                    "bot": p.bot,
                    "joinedAt": p.joined_at,
                    "screenStreamId": p.screen_stream_id,
                    "cameraStreamId": p.camera_stream_id,
                })
            })
            .collect();
        // LiveKit identities are `userId|connectionId`; the room knows people by connection.
        let speaking: Vec<String> = self.call.as_ref().map(|c| c.speaking.iter().map(|id| id.rsplit('|').next().unwrap_or(id).to_string()).collect()).unwrap_or_default();
        let server = self.servers.iter().find(|s| s.channels.iter().any(|c| Some(&c.id) == room.as_ref()));
        // canProject: those who can make channels may run the cinema's projection booth.
        let can_project = server.is_some_and(|s| s.owner_id.as_deref() == Some(self.me.id.as_str())) || self.my_permissions() & (1 << 1) != 0;
        json!({
            "roomId": room,
            "connectionId": self.connection_id,
            "participants": participants,
            "speaking": speaking,
            "deafened": self.deafened,
            "nowPlaying": room.as_ref().and_then(|r| self.players.get(r)).cloned(),
            "canProject": can_project,
            "serverId": server.map(|s| s.id.clone()),
            "clockOffset": self.hub_now() - chrono::Utc::now().timestamp_millis() as f64,
            "theme": crate::theme::active_theme(),
            "open": true,
        })
    }

    /// Hub lounge and club events for the call's room.
    pub(super) fn on_lounge(&self, value: &Value) {
        if let Some(view) = &self.living_room.view
            && self.living_room.ready
        {
            view.eval(&format!("window.__hub({value})"));
        }
    }

    /// A dice roll in the call: the room throws it onto the table (at the tabletop). Returns whether
    /// the room shows it instead of the dice overlay (the web hides the overlay at the tabletop).
    pub(super) fn living_room_dice(&self, roll: &Value) -> bool {
        if !self.living_room_showing() {
            return false;
        }
        if let Some(view) = &self.living_room.view {
            view.eval(&format!("window.__dice({roll})"));
        }
        self.living_room.venue == "tabletop" && !roll.get("masked").and_then(Value::as_bool).unwrap_or(false)
    }

    /// `.living-room`: its box over the stage (all of it but the call bar, which stays on top).
    pub(super) fn render_living_room(&self) -> Option<AnyElement> {
        if !self.living_room_showing() {
            return None;
        }
        let covered = self.chat_covered();
        let frame = self.living_room_frame.clone();
        Some(
            div()
                .flex_1()
                .min_h_0()
                .relative()
                .child(
                    gpui::canvas(|_, _, _| {}, move |bounds, _, _, _| frame.set(Some((f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), f32::from(bounds.size.height), covered))))
                        .absolute()
                        .top_0()
                        .left_0()
                        .size_full(),
                )
                .into_any_element(),
        )
    }

    /// After drawing: the page made (it needs the window) and placed, or let go when the room closes.
    pub(super) fn place_living_room(&mut self, window: &mut Window) {
        let spot = self.living_room_frame.take();
        if !self.living_room_showing() {
            if self.living_room.view.take().is_some() {
                self.living_room.ready = false;
                self.living_room.sent = None;
                self.living_room.rect = None;
            }
            return;
        }
        if self.living_room.view.is_none() {
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.living_room.view = crate::webview::living_room_view(window, &base, session);
        }
        let Some(view) = self.living_room.view.as_mut() else { return };
        let (ww, wh) = view.parent_size();
        view.set_frame(0., 0., ww, wh);
        match spot {
            Some((x, y, w, h, covered)) => {
                view.set_region(x, y, w, h);
                let rect = format!("{x}|{y}|{w}|{h}");
                if self.living_room.ready && self.living_room.rect.as_deref() != Some(rect.as_str()) {
                    view.eval(&format!("window.__setRect({x}, {y}, {w}, {h})"));
                    self.living_room.rect = Some(rect);
                }
                view.set_hidden(covered);
            }
            None => view.set_hidden(true),
        }
    }

    pub(super) fn dev_living_room_shot(&self, path: &str) {
        if let Some(view) = &self.living_room.view {
            view.snapshot(path);
        }
    }
}
