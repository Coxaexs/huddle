//! Room Activities (components/room-activities.tsx and every activity in it). The room's activity
//! comes from GET /api/activities when its stage opens and from hub "activity" events; the panel
//! itself is the web's own, running in a web view (resources/web/activities.html, built by
//! tools/export-activities.sh) placed where the web puts it: the picker across the top of the
//! stage at 68% of its height, and a running activity taking the stage over (voice-stage.tsx
//! `activity-takeover`). The page tells the app when it is collapsed or the activity changes.

use gpui::{AnyElement, Context, Window, div, prelude::*, px};
use serde_json::{Value, json};

use super::Shell;
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct Activities {
    /// The room whose activity this is (the open stage).
    room: Option<String>,
    pub activity: Option<Value>,
    /// The panel is open (voice-stage.tsx activitiesOpen).
    pub open: bool,
    /// During a takeover: the people strip shown under the activity.
    pub people_open: bool,
    view: Option<WebOverlay>,
    ready: bool,
    /// What was last told to the page, so it is told again only on change.
    sent: Option<String>,
    /// The panel's box as last told to the page.
    rect: Option<String>,
}

impl Shell {
    /// A running activity fills the stage while the panel is open.
    pub(super) fn activity_takeover(&self) -> bool {
        self.activities.open && self.activities.activity.is_some()
    }

    /// Each frame: follow the open stage (load its activity), read what the page said, keep it told.
    pub(super) fn activities_tick(&mut self, cx: &mut Context<Self>) {
        let room = self.stage.as_ref().map(|s| s.channel_id.clone());
        if room != self.activities.room {
            self.activities = Activities { room: room.clone(), ..Default::default() };
            if let Some(room) = room {
                let client = self.client.clone();
                let path = format!("/api/activities?channelId={}", url::form_urlencoded::byte_serialize(room.as_bytes()).collect::<String>());
                cx.spawn(async move |this, cx| {
                    let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
                    this.update(cx, |this, cx| {
                        if this.activities.room.as_deref() != Some(room.as_str()) {
                            return;
                        }
                        let activity = result.ok().map(|v| v["activity"].clone()).filter(|a| a.is_object());
                        // A running activity opens the panel (RoomActivities' effect).
                        this.activities.open = activity.is_some();
                        this.activities.activity = activity;
                        cx.notify();
                    })
                    .ok();
                })
                .detach();
            }
            return;
        }
        let Some(view) = &self.activities.view else { return };
        let mut changed = false;
        for raw in view.messages() {
            let Ok(message) = serde_json::from_str::<Value>(&raw) else { continue };
            match message["t"].as_str().unwrap_or("") {
                "ready" => {
                    self.activities.ready = true;
                    self.activities.sent = None;
                    self.activities.rect = None;
                    changed = true;
                }
                "open" => {
                    self.activities.open = message["open"].as_bool().unwrap_or(false);
                    changed = true;
                }
                "activity" => {
                    let activity = message["activity"].clone();
                    self.activities.activity = activity.is_object().then_some(activity);
                    // Already the page's own state: no need to tell it back.
                    self.activities.sent = Some(self.activities_state());
                    changed = true;
                }
                "error" => crate::trace(format!("activities page: {}", message["message"])),
                _ => {}
            }
        }
        if self.activities.ready {
            let state = self.activities_state();
            if self.activities.sent.as_ref() != Some(&state) {
                if self.activities.sent.is_none() {
                    let init = json!({
                        "channelId": self.activities.room,
                        "channelName": self.stage_channel_name(),
                        "userId": self.me.id,
                        "userName": self.me.name(),
                        "theme": crate::theme::active_theme(),
                        "clockOffset": self.hub_now() - chrono::Utc::now().timestamp_millis() as f64,
                    });
                    view.eval(&format!("window.__init({init})"));
                }
                let kind = self.activities.activity.as_ref().and_then(|a| a["kind"].as_str()).unwrap_or("");
                let dark = matches!(kind, "deeppixel" | "richup");
                view.eval(&format!(
                    "window.__setActivity({}); window.__setOpen({}); window.__setTakeover && window.__setTakeover({}, {dark})",
                    self.activities.activity.clone().unwrap_or(Value::Null),
                    self.activities.open,
                    self.activity_takeover()
                ));
                self.activities.sent = Some(state);
            }
        }
        if changed {
            cx.notify();
        }
    }

    fn activities_state(&self) -> String {
        format!("{}|{}", self.activities.open, self.activities.activity.clone().unwrap_or(Value::Null))
    }

    fn stage_channel_name(&self) -> String {
        let room = self.activities.room.clone().unwrap_or_default();
        self.servers.iter().flat_map(|s| s.channels.iter()).find(|c| c.id == room).map(|c| c.name.clone()).unwrap_or_default()
    }

    /// Hub "activity": opened, changed or closed in the room on stage.
    pub(super) fn on_activity(&mut self, value: &Value, cx: &mut Context<Self>) {
        if value.get("channelId").and_then(Value::as_str) != self.activities.room.as_deref() {
            return;
        }
        if value.get("action").and_then(Value::as_str) == Some("close") {
            self.activities.activity = None;
        } else if let Some(activity) = value.get("activity").filter(|a| a.is_object()) {
            if self.activities.activity.is_none() {
                self.activities.open = true;
            }
            self.activities.activity = Some(activity.clone());
        }
        cx.notify();
    }

    /// The games button: the panel open or folded away.
    pub(super) fn toggle_activities(&mut self, cx: &mut Context<Self>) {
        self.activities.open = !self.activities.open;
        cx.notify();
    }

    /// Where the panel shows: `height` for the picker across the top, None to fill (takeover).
    /// The web view is made on first use and kept while there is an activity (so a game, a beat or
    /// a film keeps going while folded away), hidden whenever the panel is not showing.
    pub(super) fn render_activities(&self, height: Option<f32>) -> Option<AnyElement> {
        if !self.activities.open || self.activities.room.is_none() {
            if let Some(view) = &self.activities.view {
                view.set_hidden(true);
            }
            return None;
        }
        let covered = self.chat_covered();
        let frame = self.activities_frame.clone();
        let place = gpui::canvas(
            |_, _, _| {},
            move |bounds, _, _, _| {
                frame.set(Some((f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), f32::from(bounds.size.height), covered)));
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        Some(match height {
            Some(h) => div().flex_none().mx(px(14.)).mt(px(12.)).h(px(h)).relative().child(place).into_any_element(),
            None => div().flex_1().min_h_0().relative().child(place).into_any_element(),
        })
    }

    /// After drawing: the web view made (it needs the window) and moved to where the panel was laid out.
    pub(super) fn place_activities(&mut self, window: &mut Window) {
        let spot = self.activities_frame.take();
        let keep = self.activities.room.is_some() && (self.activities.open || self.activities.activity.is_some());
        if !keep {
            self.activities.view = None;
            self.activities.ready = false;
            self.activities.sent = None;
            return;
        }
        let Some((x, y, w, h, covered)) = spot else {
            if let Some(view) = &self.activities.view {
                view.set_hidden(true);
            }
            return;
        };
        if self.activities.view.is_none() {
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.activities.view = crate::webview::activities_view(window, &base, session);
        }
        if let Some(view) = self.activities.view.as_mut() {
            // The view covers the window; the page draws the panel in its box, which alone takes clicks.
            let (ww, wh) = view.parent_size();
            view.set_frame(0., 0., ww, wh);
            view.set_region(x, y, w, h);
            let rect = format!("{x}|{y}|{w}|{h}");
            if self.activities.rect.as_deref() != Some(rect.as_str()) {
                view.eval(&format!("window.__setRect && window.__setRect({x}, {y}, {w}, {h})"));
                self.activities.rect = Some(rect);
            }
            view.set_hidden(covered);
        }
    }

    pub(super) fn dev_activities_shot(&self, path: &str) {
        if let Some(view) = &self.activities.view {
            view.snapshot(path);
        }
    }
}
