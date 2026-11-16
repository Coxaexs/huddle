//! Live captions in a call (hooks/use-live-captions.ts, components/live-captions.tsx): the lines
//! others share arrive over the hub ("caption"), one per speaker, the newest four kept, each gone
//! seven seconds after its speaker last said anything; shown over the stage when "Show captions" is
//! on (remembered on this computer). Captioning your own voice needs a speech recognizer this app
//! does not have yet, so that item stays hidden here, as the web hides it where unsupported.

use std::time::{Duration, Instant};

use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px, rgb, rgba};
use serde_json::Value;

use super::Shell;

/// LINE_TTL_MS.
const LINE_TTL: Duration = Duration::from_millis(7000);

struct Line {
    connection: String,
    name: String,
    text: String,
    final_: bool,
    at: Instant,
}

pub(super) struct Captions {
    pub showing: bool,
    lines: Vec<Line>,
}

impl Default for Captions {
    fn default() -> Self {
        Self { showing: load_showing(), lines: Vec::new() }
    }
}

fn show_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("captions-show"))
}

fn load_showing() -> bool {
    show_path().and_then(|p| std::fs::read_to_string(p).ok()).is_some_and(|v| v.trim() == "1")
}

impl Shell {
    /// Hub "caption": someone's line in the room you are in.
    pub(super) fn on_caption(&mut self, value: &Value, cx: &mut Context<Self>) {
        let room = self.call.as_ref().map(|c| c.channel_id.clone()).or_else(|| std::env::var_os("HOFFLE_DEV_STAGE_ONLY").and(self.stage.as_ref().map(|s| s.channel_id.clone())));
        if room.is_none() || value.get("channelId").and_then(Value::as_str) != room.as_deref() {
            return;
        }
        let s = |k: &str| value.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let line = Line { connection: s("connectionId"), name: s("displayName"), text: s("text"), final_: value.get("final").and_then(Value::as_bool).unwrap_or(false), at: Instant::now() };
        let lines = &mut self.captions.lines;
        lines.retain(|l| l.connection != line.connection && l.at.elapsed() < LINE_TTL);
        lines.push(line);
        let extra = lines.len().saturating_sub(4);
        lines.drain(..extra);
        cx.notify();
    }

    /// Once a second: old lines fade out; leaving the room clears the board.
    pub(super) fn captions_tick(&mut self, cx: &mut Context<Self>) {
        let before = self.captions.lines.len();
        if self.call.is_none() && std::env::var_os("HOFFLE_DEV_STAGE_ONLY").is_none() {
            self.captions.lines.clear();
        }
        self.captions.lines.retain(|l| l.at.elapsed() < LINE_TTL);
        if self.captions.lines.len() != before {
            cx.notify();
        }
    }

    pub(super) fn toggle_captions(&mut self, cx: &mut Context<Self>) {
        self.captions.showing = !self.captions.showing;
        if let Some(path) = show_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
            let _ = std::fs::write(path, if self.captions.showing { "1" } else { "0" });
        }
        cx.notify();
    }

    /// `.live-captions`: centred over the stage, 96px up from its bottom.
    pub(super) fn render_captions(&self, width: f32) -> Option<AnyElement> {
        if !self.captions.showing || self.captions.lines.is_empty() {
            return None;
        }
        let mut column = div().w(px((width - 32.).min(760.))).flex().flex_col().gap(px(4.));
        for line in &self.captions.lines {
            column = column.child(
                div()
                    .px(px(12.))
                    .py(px(6.))
                    .rounded(px(10.))
                    .bg(rgba(0x000000b8))
                    .text_color(gpui::white())
                    .text_size(px(16.))
                    .line_height(px(21.6))
                    .text_center()
                    .when(!line.final_, |d| d.opacity(0.85))
                    .child(
                        gpui::StyledText::new(format!("{}\u{00A0}\u{2002}{}", line.name, line.text)).with_highlights(vec![(
                            0..line.name.len(),
                            gpui::HighlightStyle { color: Some(rgb(0xc4b5fd).into()), font_weight: Some(FontWeight::BOLD), ..Default::default() },
                        )]),
                    ),
            );
        }
        Some(div().absolute().left_0().right_0().bottom(px(96.)).flex().justify_center().child(column).into_any_element())
    }
}
