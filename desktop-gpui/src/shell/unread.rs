//! The unread bar (message-list.tsx `.unread-bar`, use-shell-history.ts): opening a channel with
//! unread messages lands on the first of them, with "N new messages since …" stuck to the top of
//! the list until the newest message is in view or "Mark as read" is pressed.

use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px, rgb};

use super::Shell;
use crate::theme::Theme;

pub(super) struct UnreadBar {
    pub channel: String,
    pub count: usize,
    pub more: bool,
    pub since: String,
}

impl Shell {
    /// After a channel's first page arrives: if it was opened with unread messages, scroll to the
    /// first one you did not write yourself (firstUnreadIndex) and raise the bar.
    pub(super) fn land_on_unread(&mut self, channel: &str, cx: &mut Context<Self>) {
        let Some((pending, count)) = self.unread_pending.clone() else { return };
        if pending != channel || self.channel_id.as_deref() != Some(channel) {
            return;
        }
        self.unread_pending = None;
        let Some(list) = self.messages.get(channel) else { return };
        if list.is_empty() || count == 0 {
            return;
        }
        let mut index = list.len();
        let mut others = 0;
        while index > 0 && others < count {
            index -= 1;
            if list[index].user_id.as_deref() != Some(self.me.id.as_str()) {
                others += 1;
            }
        }
        let since = list[index].created_at.clone();
        self.unread_bar = Some(UnreadBar { channel: channel.to_string(), count, more: others < count, since });
        self.list.reveal_middle(index);
        cx.notify();
    }

    /// Called from the list's scroll: the bar goes once the newest message shows.
    pub(super) fn saw_bottom(&mut self, last_visible: usize, count: usize, cx: &mut Context<Self>) {
        if self.unread_bar.is_some() && count > 0 && last_visible >= count {
            self.unread_bar = None;
            cx.notify();
        }
    }

    pub(super) fn render_unread_bar(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let bar = self.unread_bar.as_ref()?;
        if self.channel_id.as_deref() != Some(bar.channel.as_str()) {
            return None;
        }
        let count = if bar.count > 99 { "99+".to_string() } else { bar.count.to_string() };
        let label = format!(
            "{count}{} new message{}{}",
            if bar.more { "+" } else { "" },
            if bar.count == 1 { "" } else { "s" },
            since_label(&bar.since).map(|s| format!(" since {s}")).unwrap_or_default()
        );
        let button = |id: &'static str| {
            div()
                .id(id)
                .px(px(12.8))
                .py(px(5.6))
                .cursor_pointer()
                .hover(|s| s.underline())
        };
        Some(
            div()
                .absolute()
                .top(px(36.))
                .left(px(47.2 + 12.))
                .right(px(47.2 + 15. + 12.))
                .flex()
                .items_center()
                .rounded_b(px(10.))
                .bg(Theme::lavender())
                .text_color(rgb(0x15121f))
                .text_size(px(12.8))
                .line_height(px(19.2))
                .font_weight(FontWeight::SEMIBOLD)
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(8.)), blur_radius: px(24.), spread_radius: px(0.) }])
                .child(button("unread-jump").flex_1().child(label).on_click(cx.listener(|this, _, _, cx| {
                    let target = this.channel_id.as_ref().and_then(|c| {
                        let list = this.messages.get(c)?;
                        let bar = this.unread_bar.as_ref()?;
                        let mut index = list.len();
                        let mut others = 0;
                        while index > 0 && others < bar.count {
                            index -= 1;
                            if list[index].user_id.as_deref() != Some(this.me.id.as_str()) {
                                others += 1;
                            }
                        }
                        Some(index)
                    });
                    if let Some(ix) = target {
                        this.list.reveal_middle(ix);
                        cx.notify();
                    }
                })))
                .child(button("unread-dismiss").opacity(0.85).child("Mark as read").on_click(cx.listener(|this, _, _, cx| {
                    this.unread_bar = None;
                    cx.notify();
                })))
                .into_any_element(),
        )
    }
}

/// unreadSinceLabel: the time today, the weekday within six days, else the day and month.
fn since_label(iso: &str) -> Option<String> {
    let at = crate::model::parse_time(iso)?.with_timezone(&chrono::Local);
    let now = chrono::Local::now();
    let english = crate::i18n::locale().starts_with("en");
    let time = if english { at.format("%I:%M %p").to_string() } else { at.format("%H:%M").to_string() };
    if at.date_naive() == now.date_naive() {
        return Some(time);
    }
    let (loc, day, short) = match crate::i18n::locale().split('-').next().unwrap_or("en") {
        "tr" => (chrono::Locale::tr_TR, "%a", "%-d %b"),
        "de" => (chrono::Locale::de_DE, "%a", "%-d. %b"),
        "fr" => (chrono::Locale::fr_FR, "%a", "%-d %b"),
        "es" => (chrono::Locale::es_ES, "%a", "%-d %b"),
        "pt" => (chrono::Locale::pt_BR, "%a", "%-d de %b"),
        "nl" => (chrono::Locale::nl_NL, "%a", "%-d %b"),
        _ => (chrono::Locale::en_US, "%a", "%b %-d"),
    };
    let age = now.signed_duration_since(at);
    let date = if age < chrono::Duration::days(6) { at.format_localized(day, loc) } else { at.format_localized(short, loc) };
    Some(format!("{date} {time}"))
}
