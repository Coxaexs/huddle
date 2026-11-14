//! `.system-message` (message-row.tsx): a one-line notice in the message flow — who pinned a
//! message, who joined, left or renamed a group — with its icon and time.

use gpui::{AnyElement, Context, FontWeight, HighlightStyle, Hsla, InteractiveText, SharedString, StyledText, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::model::{self, Message};
use crate::theme::Theme;
use crate::ui;

/// The winkies an MSN-themed message can carry (msn-chrome.tsx MSN_WINKS): id, name, emoji.
const WINKS: [(&str, &str, &str); 39] = [
    ("kiss", "Kiss", "💋"), ("heart", "Heart", "💗"), ("laugh", "Laughing Face", "😆"), ("laughing-girl", "Laughing Girl", "🤣"),
    ("guitar-smash", "Guitar Smash", "🎸"), ("frog", "Frog", "🐸"), ("bow", "Bow", "🙇"), ("knock", "Knock", "✊"),
    ("dancing-pig", "Dancing Pig", "🐷"), ("love-letter", "Love Letter", "💌"), ("birthday", "Birthday Cake", "🎂"),
    ("water-balloon", "Water Balloon", "💦"), ("fartguy", "Fart Guy", "💨"), ("ufo", "UFO", "🛸"), ("sleepy", "Sleepy Guard", "💂"),
    ("yawning-moon", "Yawning Moon", "🌙"), ("waiting", "Waiting", "⏳"), ("busy", "Busy", "📞"), ("cry", "Crying Dog", "😭"),
    ("punch", "Punch", "🥊"), ("dart", "Bullseye", "🎯"), ("bouncy-ball", "Bouncy Smiley", "🙂"), ("silly-face", "Silly Face", "🤪"),
    ("eyeball", "Eyeball", "👁️"), ("lightbulb", "Bright Idea", "💡"), ("imissyou", "I Miss You", "🥺"), ("heartkey", "Key to My Heart", "🗝️"),
    ("lipstick-girl", "Lipstick", "💄"), ("rich", "Gold Coins", "💰"), ("drink", "Cheers", "🍻"), ("sunflower", "Sunflower", "🌻"),
    ("stars", "Shooting Stars", "✨"), ("notes", "Music Notes", "🎵"), ("dance", "Dancing Bunny", "🐰"), ("dancer", "Dancer", "🕺"),
    ("snowboarder-girl", "Snowboarder", "🏂"), ("taxi", "Rocket Taxi", "🚀"), ("hello", "Hello!", "👋"), ("byebye", "Bye Bye", "🪂"),
];

pub(super) enum Line {
    Nudge,
    Wink(&'static str, &'static str),
}

/// findWink, with the old ids that still replay.
pub(super) fn nudge_or_wink(message: &Message) -> Option<Line> {
    let payload = message.payload.as_ref()?;
    if payload.get("nudge").and_then(serde_json::Value::as_bool) == Some(true) {
        return Some(Line::Nudge);
    }
    let id = payload.get("wink").and_then(serde_json::Value::as_str)?;
    let id = match id {
        "hearts" => "heart",
        "cake" => "birthday",
        "storm" => "water-balloon",
        "fireworks" => "stars",
        "guitar" => "guitar-smash",
        "flowers" => "sunflower",
        "ghost" => "ufo",
        other => other,
    };
    WINKS.iter().find(|(w, _, _)| *w == id).map(|(_, name, emoji)| Line::Wink(name, emoji))
}

/// A row's vertical margin: articles 1px, system lines 2px, Nudge / winkie lines 8px.
pub(super) fn row_margin(message: &Message) -> f32 {
    if nudge_or_wink(message).is_some() {
        8.
    } else if message.kind.as_deref().is_some_and(|k| k.starts_with("system-")) {
        2.
    } else {
        1.
    }
}

impl Shell {
    /// `.nudge-line`: a rule, "{name} just sent you a Nudge!" (or the winkie and Play), a rule.
    pub(super) fn render_nudge_line(&self, message: &Message, cx: &mut Context<Self>) -> AnyElement {
        let muted: Hsla = Theme::muted().into();
        let mine = message.user_id.as_deref() == Some(self.me.id.as_str());
        let name = message.user_id.as_ref().and_then(|id| self.member(id)).map(|m| m.display_name_or_name()).filter(|n| !n.is_empty()).unwrap_or_else(|| message.author.clone());
        let rule = || div().flex_1().h(px(1.)).bg(Theme::line());
        let mut row = div().w_full().h(px(18.)).flex().items_center().gap(px(10.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(rule());
        match nudge_or_wink(message) {
            Some(Line::Wink(wink, emoji)) => {
                row = row
                    .child(div().text_size(px(15.)).child(emoji))
                    .child(if mine { crate::i18n::tv("msn.winkSent", &[("name", wink)]) } else { crate::i18n::tv("msn.winkReceived", &[("name", &name), ("wink", wink)]) })
                    .child(
                        div()
                            .id(SharedString::from(format!("wink-{}", message.id)))
                            .px(px(6.))
                            .rounded(px(3.))
                            .border_1()
                            .border_color(Theme::lavender())
                            .text_size(px(11.))
                            .text_color(Theme::lavender())
                            .cursor_pointer()
                            .child(crate::i18n::t("msn.winkPlay"))
                            .on_click(cx.listener(|this, _, _, cx| this.set_notice("Winkies do not play in this app yet.", cx))),
                    );
            }
            _ => {
                row = row.child(if mine { crate::i18n::t("msn.nudged") } else { crate::i18n::tv("msn.receivedNudge", &[("name", &name)]) });
            }
        }
        row.child(rule()).into_any_element()
    }

    pub(super) fn render_system_message(&self, message: &Message, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let kind = message.kind.as_deref().unwrap_or_default();
        let muted: Hsla = Theme::muted().into();
        let actor = message.user_id.as_ref().and_then(|id| self.member(id).or_else(|| self.member_anywhere(id)));
        let actor_name = actor.map(|m| m.display_name_or_name()).filter(|n| !n.is_empty()).unwrap_or_else(|| message.author.clone());
        let pinned_id = (kind == "system-pin").then(|| message.payload.as_ref().and_then(|p| p.get("messageId")).and_then(|v| v.as_str()).map(str::to_string)).flatten();
        let (icon, icon_color): (&str, Hsla) = match kind {
            "system-pin" => ("pin", muted),
            "system-group-leave" | "system-group-remove" => ("log-out", rgb(0xf23f43).into()),
            "system-group-rename" => ("pencil", muted),
            "system-activity" => (if message.payload.as_ref().and_then(|p| p.get("kind")).and_then(|v| v.as_str()) == Some("reels") { "smartphone" } else { "clapperboard" }, muted),
            "system-group-add" | "system-group-create" => ("user-plus", rgb(0x23a55a).into()),
            _ => ("user-plus", muted),
        };
        // The text, with the parts drawn bold in ink: (range, clickable link number).
        let mut text = actor_name.clone();
        let mut bold = vec![0..text.len()];
        if kind == "system-pin" {
            text.push_str(" pinned ");
            let start = text.len();
            text.push_str("a message");
            bold.push(start..text.len());
            text.push_str(" to this channel. See all ");
            let start = text.len();
            text.push_str("pinned messages");
            bold.push(start..text.len());
            // The link is an inline-block button: the line may break right after it.
            text.push('\u{200b}');
            text.push('.');
        } else {
            // The stored text starts with the name it had when posted: keep the rest of it.
            match message.text.strip_prefix(message.author.as_str()) {
                Some(rest) => text.push_str(rest),
                None => {
                    text.push(' ');
                    text.push_str(&message.text);
                }
            }
        }
        // `<time>` sits on the line 8px after the text, 11px at 75%: a run of no-break spaces holds
        // its place and the time is drawn into it.
        let time = model::client_time(&message.created_at);
        let font = gpui::font(crate::theme::UI_FONT);
        let measure = |s: &str, size: f32| {
            window
                .text_system()
                .shape_line(SharedString::from(s.to_string()), px(size), &[gpui::TextRun { len: s.len(), font: font.clone(), color: muted, background_color: None, underline: None, strikethrough: None }], None)
                .width
        };
        let time_width = f32::from(measure(&time, 11.));
        // Where "pinned messages" ends, the line may break before ".": it does when the period and
        // the time no longer fit after it (GPUI does not break at a zero-width space).
        if let Some(cut) = text.find('\u{200b}') {
            let head = &text[..cut];
            let width = self.chat_panel_width(window) - px(2. + super::chat::ROW_LEFT + super::chat::ROW_RIGHT + 38.);
            let runs: Vec<gpui::TextRun> = {
                let mut runs = Vec::new();
                let mut at = 0;
                for r in &bold {
                    if r.start > at {
                        runs.push(gpui::TextRun { len: r.start - at, font: font.clone(), color: muted, background_color: None, underline: None, strikethrough: None });
                    }
                    runs.push(gpui::TextRun { len: r.end - r.start, font: gpui::Font { weight: FontWeight::SEMIBOLD, ..font.clone() }, color: muted, background_color: None, underline: None, strikethrough: None });
                    at = r.end;
                }
                runs
            };
            let end_x = window
                .text_system()
                .shape_text(SharedString::from(head.to_string()), px(14.), &runs, Some(width), None)
                .ok()
                .and_then(|lines| lines.into_iter().next())
                .and_then(|line| line.position_for_index(head.len(), px(19.25)))
                .map(|p| f32::from(p.x))
                .unwrap_or(0.);
            let tail = f32::from(measure(".", 14.)) + 8. + time_width;
            let replacement = if end_x + tail > f32::from(width) { "\n" } else { "" };
            text.replace_range(cut..cut + '\u{200b}'.len_utf8(), replacement);
        }
        // Invisible underscores, not spaces: a line may not let spaces hang past its edge.
        let glyph = f32::from(measure("_", 14.)).max(1.);
        let slot_at = text.len();
        text.push_str(&"_".repeat(((8. + time_width) / glyph).ceil() as usize));
        let ink: Hsla = Theme::ink().into();
        let mut highlights: Vec<_> = bold.iter().map(|r| (r.clone(), HighlightStyle { color: Some(ink), font_weight: Some(FontWeight::SEMIBOLD), ..Default::default() })).collect();
        highlights.push((slot_at..text.len(), HighlightStyle { fade_out: Some(1.), ..Default::default() }));
        let styled = StyledText::new(text).with_highlights(highlights);
        let layout = styled.layout().clone();
        let links = bold.clone();
        let actor_id = message.user_id.clone();
        let weak = cx.weak_entity();
        let paragraph = InteractiveText::new(SharedString::from(format!("sys-{}", message.id)), styled).on_click(links, move |n, window, cx| {
            let pinned_id = pinned_id.clone();
            let actor_id = actor_id.clone();
            weak.update(cx, |this, cx| match n {
                0 => {
                    if let Some(id) = actor_id {
                        this.open_user_menu(id, window.mouse_position(), cx);
                    }
                }
                1 => {
                    if let (Some(id), Some(channel)) = (pinned_id, this.channel_id.clone()) {
                        let server = this.server_id.clone();
                        this.jump_to_message(server, channel, id, window, cx);
                    }
                }
                _ => this.toggle_panel(super::side_panels::Panel::Pins, cx),
            })
            .ok();
        });
        let painter = gpui::canvas(
            |_, _, _| {},
            move |_, _, window, cx| {
                let Some(at) = layout.position_for_index(slot_at) else { return };
                let run = gpui::TextRun { len: time.len(), font: gpui::font(crate::theme::UI_FONT), color: muted.opacity(0.75), background_color: None, underline: None, strikethrough: None };
                let line = window.text_system().shape_line(SharedString::from(time.clone()), px(11.), &[run], None);
                // `<time>` sits on the paragraph's baseline: 3px lower than a 14px line's top.
                let _ = line.paint(gpui::point(at.x + px(8.), at.y + px(3.)), px(15.125), window, cx);
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        div()
            .id(SharedString::from(format!("sysmsg-{}", message.id)))
            .w_full()
            .pt(px(4.))
            .pb(px(4.))
            .pl(px(26.))
            .pr(px(16.))
            .flex()
            .items_start()
            .gap(px(12.))
            .text_size(px(14.))
            .line_height(px(19.25))
            .text_color(muted)
            .hover(|s| s.bg(rgba(0x0000000f)))
            .child(div().flex_none().w(px(20.)).pt(px(2.)).flex().justify_center().child(ui::icon(icon, 15., icon_color)))
            .child(div().relative().flex_1().min_w_0().child(paragraph).child(painter))
            .into_any_element()
    }
}
