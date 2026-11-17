//! The voice room's battlemap (hooks/use-battlemap.ts, components/battlemap.tsx): the web's own
//! board and hook run in a web view over the stage (resources/web/battlemap.html, built by
//! tools/export-battlemap.sh). The app passes in the hub's "battlemap" events, opens its own prompt,
//! confirm and picture picker when the GM starts a map, and keeps room at the top of the stage for
//! the board while it shows.

use base64::Engine;
use gpui::{AnyElement, Context, Window, div, prelude::*, px};
use serde_json::{Value, json};

use super::Shell;
use super::channel_tools::PromptKind;
use super::context_menu::{Confirm, ConfirmAction};
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct Battlemap {
    room: Option<String>,
    view: Option<WebOverlay>,
    ready: bool,
    /// The board is on screen, how tall it is, and whether you run the table.
    pub shown: bool,
    height: f32,
    gm: bool,
    rect: Option<String>,
}

impl Shell {
    /// Each frame: follow the open stage, read what the page said.
    pub(super) fn battlemap_tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let room = self.stage.as_ref().map(|s| s.channel_id.clone());
        if room != self.battlemap.room {
            self.battlemap = Battlemap { room: room.clone(), ..Default::default() };
        }
        if self.battlemap.room.is_none() {
            return;
        }
        if self.battlemap.view.is_none() {
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.battlemap.view = crate::webview::battlemap_view(window, &base, session);
        }
        let Some(messages) = self.battlemap.view.as_ref().map(|v| v.messages()) else { return };
        let mut changed = false;
        for raw in messages {
            let Ok(m) = serde_json::from_str::<Value>(&raw) else { continue };
            let id = m["id"].as_u64().unwrap_or(0);
            let text = |k: &str| m[k].as_str().unwrap_or("").to_string();
            match m["t"].as_str().unwrap_or("") {
                "ready" => {
                    let init = json!({
                        "channelId": self.battlemap.room,
                        "userId": self.me.id,
                        "displayName": self.me.name(),
                        "color": self.me.color,
                        "avatarUrl": self.me.avatar_url,
                        "theme": crate::theme::active_theme(),
                    });
                    if let Some(view) = &self.battlemap.view {
                        view.eval(&format!("window.__init({init})"));
                    }
                    self.battlemap.ready = true;
                    self.battlemap.rect = None;
                }
                "state" => {
                    self.battlemap.shown = m["shown"].as_bool().unwrap_or(false);
                    self.battlemap.gm = m["gm"].as_bool().unwrap_or(false);
                    self.battlemap.height = m["height"].as_f64().unwrap_or(0.) as f32;
                    changed = true;
                }
                "notice" => self.set_notice(text("message"), cx),
                "prompt" => {
                    let (title, message, default, ok) = (text("title"), text("message"), text("defaultValue"), text("confirmText"));
                    self.open_prompt(PromptKind::Battlemap(id), title, message, default, "", if ok.is_empty() { "OK" } else { ok.as_str() }, None, window, cx);
                }
                "confirm" => {
                    let cancel = text("cancelText");
                    self.confirm = Some(Confirm {
                        title: text("title"),
                        text: text("message"),
                        ok: if text("confirmText").is_empty() { "OK".into() } else { text("confirmText") },
                        cancel: if cancel.is_empty() { crate::i18n::t("common.cancel") } else { cancel },
                        action: ConfirmAction::Battlemap(id),
                    });
                    changed = true;
                }
                "pick" => self.battlemap_pick(id, cx),
                "error" => crate::trace(format!("battlemap page: {}", m["message"])),
                _ => {}
            }
        }
        if changed {
            cx.notify();
        }
    }

    /// The page's question `id` answered.
    pub(super) fn battlemap_answer(&self, id: u64, value: Value) {
        if let Some(view) = &self.battlemap.view {
            view.eval(&format!("window.__answer({id}, {value})"));
        }
    }

    /// pickImageFile(): a picture from disk, handed over as base64.
    fn battlemap_pick(&mut self, id: u64, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        cx.spawn(async move |this, cx| {
            let path = picked.await.ok().and_then(|r| r.ok()).flatten().and_then(|p| p.into_iter().next());
            let file = path.and_then(|p| {
                let bytes = std::fs::read(&p).ok()?;
                let name = p.file_name()?.to_string_lossy().into_owned();
                let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                let kind = match ext.as_str() {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => return None,
                };
                Some(json!({ "name": name, "type": kind, "data": base64::engine::general_purpose::STANDARD.encode(bytes) }))
            });
            this.update(cx, |this, _| this.battlemap_answer(id, file.unwrap_or(Value::Null))).ok();
        })
        .detach();
    }

    /// Hub "battlemap": a map opened, changed or closed in some room.
    pub(super) fn on_battlemap(&mut self, value: &Value) {
        if let Some(view) = &self.battlemap.view {
            let channel = value.get("channelId").cloned().unwrap_or(Value::Null);
            view.eval(&format!("window.__socket && window.__socket({channel}, {value})"));
        }
    }

    /// The stage's map button and ⋯ Battlemap: open a map (GM), or show / hide the one there.
    pub(super) fn toggle_battlemap(&mut self) {
        if let Some(view) = &self.battlemap.view {
            view.eval("window.__toggle && window.__toggle()");
        }
    }

    /// The board's room at the top of the stage (when it shows); places the web view.
    pub(super) fn render_battlemap(&self, stage_total: f32) -> Option<AnyElement> {
        let view = self.battlemap.view.as_ref()?;
        if !self.battlemap.shown || self.chat_covered() {
            view.set_hidden(true);
            return None;
        }
        let frame = self.battlemap_frame.clone();
        let height = self.battlemap.height.max(1.);
        Some(
            div()
                .flex_none()
                .h(px(height))
                .relative()
                .child(
                    gpui::canvas(|_, _, _| {}, move |bounds, _, _, _| frame.set(Some((f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), stage_total))))
                        .absolute()
                        .top_0()
                        .left_0()
                        .size_full(),
                )
                .into_any_element(),
        )
    }

    /// After drawing: the view over the window, the page told where the stage column is.
    pub(super) fn place_battlemap(&mut self) {
        let spot = self.battlemap_frame.take();
        let Some(view) = self.battlemap.view.as_mut() else { return };
        let (ww, wh) = view.parent_size();
        view.set_frame(0., 0., ww, wh);
        match spot {
            Some((x, y, w, column)) if self.battlemap.shown => {
                view.set_region(x, y, w, self.battlemap.height);
                let rect = format!("{x}|{y}|{w}|{column}");
                if self.battlemap.ready && self.battlemap.rect.as_deref() != Some(rect.as_str()) {
                    view.eval(&format!("window.__setRect({x}, {y}, {w}, {column})"));
                    self.battlemap.rect = Some(rect);
                }
                view.set_hidden(false);
            }
            _ => {
                view.set_region(0., 0., 0., 0.);
                view.set_hidden(true);
            }
        }
    }

    pub(super) fn dev_web_shots(&self, dir: &str) {
        if let Some(view) = &self.battlemap.view {
            view.snapshot(&format!("{dir}/battlemap.png"));
        }
        self.dev_activities_shot(&format!("{dir}/activities.png"));
        self.dev_living_room_shot(&format!("{dir}/livingroom.png"));
    }
}
