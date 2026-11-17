//! The 3D dice (components/dice-overlay.tsx): a roll in the open text channel or the voice room on
//! stage tumbles over the chat panel or the stage. The web's own overlay runs in a click-through web
//! view (resources/web/dice.html, tools/export-dice.sh), kept once made (three.js takes a moment
//! to start), shown while a roll plays.

use gpui::{AnyElement, Context, Window, prelude::*};
use serde_json::Value;

use super::Shell;
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct Dice {
    view: Option<WebOverlay>,
    ready: bool,
    /// The roll waiting for the page, and whether one is playing.
    pending: Option<Value>,
    showing: bool,
    last_seed: Option<String>,
}

impl Shell {
    /// Hub "dice-roll" (and your own roll's reply): shown where it is relevant, once per seed.
    pub(super) fn show_dice_roll(&mut self, channel: Option<&str>, roll: &Value, cx: &mut Context<Self>) {
        let stage = self.stage.as_ref().map(|s| s.channel_id.as_str());
        if let Some(channel) = channel
            && Some(channel) != stage
            && Some(channel) != self.channel_id.as_deref()
        {
            return;
        }
        let seed = roll.get("animationSeed").and_then(Value::as_str).map(String::from);
        if seed.is_some() && seed == self.dice.last_seed {
            return;
        }
        self.dice.last_seed = seed;
        self.dice.pending = Some(roll.clone());
        self.dice.showing = true;
        // HOFFLE_DEV_DICE_SHOT=<png>: the overlay's own picture 2.5 s in.
        if let Ok(path) = std::env::var("HOFFLE_DEV_DICE_SHOT") {
            cx.spawn(async move |this, cx| {
                cx.background_executor().timer(std::time::Duration::from_millis(2500)).await;
                this.update(cx, |this, _| {
                    if let Some(view) = &this.dice.view {
                        view.snapshot(&path);
                    }
                })
                .ok();
            })
            .detach();
        }
        cx.notify();
    }

    /// Each frame: make the page when a roll waits, feed it, hear when it is done.
    pub(super) fn dice_tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.dice.view.is_none() {
            if !self.dice.showing {
                return;
            }
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.dice.view = crate::webview::dice_view(window, &base, session);
            if self.dice.view.is_none() {
                self.dice.showing = false;
                return;
            }
        }
        let messages = self.dice.view.as_ref().map(|v| v.messages()).unwrap_or_default();
        for raw in messages {
            let Ok(m) = serde_json::from_str::<Value>(&raw) else { continue };
            match m["t"].as_str().unwrap_or("") {
                "ready" => self.dice.ready = true,
                "done" => {
                    self.dice.showing = false;
                    cx.notify();
                }
                "error" => crate::trace(format!("dice page: {}", m["message"])),
                _ => {}
            }
        }
        if self.dice.ready
            && let (Some(roll), Some(view)) = (self.dice.pending.take(), &self.dice.view)
        {
            view.eval(&format!("window.__roll({roll})"));
        }
    }

    /// `.dice-overlay`: the area it covers (inset 0 of the chat panel or the stage).
    pub(super) fn dice_area(&self) -> Option<AnyElement> {
        self.dice.view.as_ref()?;
        let frame = self.dice_frame.clone();
        Some(
            gpui::canvas(|_, _, _| {}, move |bounds, _, _, _| frame.set(Some((f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), f32::from(bounds.size.height)))))
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .into_any_element(),
        )
    }

    /// After drawing: over its area while a roll plays, hidden otherwise.
    pub(super) fn place_dice(&mut self) {
        let spot = self.dice_frame.take();
        let covered = self.chat_covered();
        let Some(view) = self.dice.view.as_mut() else { return };
        match spot {
            Some((x, y, w, h)) if self.dice.showing && !covered => {
                view.set_frame(x, y, w, h);
                view.set_hidden(false);
            }
            _ => view.set_hidden(true),
        }
    }
}
