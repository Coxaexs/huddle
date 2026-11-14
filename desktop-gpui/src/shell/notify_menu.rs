//! Right-click on a channel (menus.tsx ChannelMenuLayer) or a server icon (RailMenuLayer): the
//! notification level with timed mutes, Mark as read for a server, and the channel tools for
//! those who manage channels.

use gpui::{AnyElement, Context, FontWeight, Hsla, Pixels, Point, SharedString, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::i18n::t;
use crate::theme::Theme;
use crate::ui;

#[derive(Clone)]
pub(super) enum NotifyTarget {
    Channel(String),
    Server(String),
}

pub(super) struct NotifyMenu {
    pub target: NotifyTarget,
    pub at: Point<Pixels>,
}

impl Shell {
    pub(super) fn open_notify_menu(&mut self, target: NotifyTarget, at: Point<Pixels>, cx: &mut Context<Self>) {
        self.notify_menu = Some(NotifyMenu { target, at });
        cx.notify();
    }

    /// setNotifyLevel with an optional mute length.
    fn set_level_for(&mut self, key: String, level: &'static str, duration_ms: Option<u64>, cx: &mut Context<Self>) {
        if level == "all" && duration_ms.is_none() {
            self.channel_prefs.remove(&key);
        } else {
            self.channel_prefs.insert(key.clone(), level.to_string());
        }
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.set_channel_pref_for(&key, level, duration_ms) }).detach();
        cx.notify();
    }

    pub(super) fn render_notify_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let menu = self.notify_menu.as_ref()?;
        let muted: Hsla = Theme::muted().into();
        let (key, head) = match &menu.target {
            NotifyTarget::Channel(id) => {
                let channel = self.channel_by_id(id)?;
                (
                    id.clone(),
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .text_size(px(16.))
                                .line_height(px(24.))
                                .font_weight(FontWeight::BOLD)
                                .child(ui::icon(channel.icon(), 14., rgb(0xf5f3ee)))
                                .child(format!(" {}", channel.name)),
                        )
                        .child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(t("railMenu.notifications")))
                        .into_any_element(),
                )
            }
            NotifyTarget::Server(id) => {
                let server = self.servers.iter().find(|s| &s.id == id)?;
                (format!("server:{id}"), div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).child(server.name.clone()).into_any_element())
            }
        };
        let head_box = |content: AnyElement| div().mb(px(6.)).px(px(8.)).pt(px(6.)).pb(px(10.)).border_b_1().border_color(rgb(0x41434f)).child(content);
        let item = |id: SharedString, label: String, active: bool| {
            div()
                .id(id)
                .p(px(8.))
                .rounded(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .font_weight(if active { FontWeight(750.) } else { FontWeight::NORMAL })
                .text_color(if active { Hsla::from(Theme::ink()) } else { Hsla::from(rgb(0xe6e7ee)) })
                .cursor_pointer()
                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                .child(label)
        };
        let mut card = div().flex().flex_col().child(head_box(head));
        if let NotifyTarget::Server(id) = &menu.target {
            let server = id.clone();
            let any_unread = self.servers.iter().find(|s| &s.id == id).is_some_and(|s| s.channels.iter().any(|c| self.reads.get(&c.id).is_some_and(|r| r.unread || r.count > 0)));
            card = card
                .child(
                    item("nm-read".into(), t("railMenu.markServerRead"), false)
                        .when(!any_unread, |d| d.opacity(0.45))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.notify_menu = None;
                            this.mark_server_read_id(&server, cx);
                        })),
                )
                .child(div().my(px(6.)).h(px(1.)).bg(rgb(0x41434f)))
                .child(head_box(div().text_size(px(12.)).text_color(muted).child(t("railMenu.notifications")).into_any_element()));
        }
        let current = self.channel_prefs.get(&key).cloned().unwrap_or_else(|| "all".into());
        for (level, label) in [("all", "railMenu.allMessages"), ("mentions", "railMenu.onlyMentions"), ("nothing", "railMenu.nothing")] {
            let active = current == level;
            let k = key.clone();
            card = card.child(
                item(SharedString::from(format!("nm-{level}")), format!("{}{}", if active { "● " } else { "○ " }, t(label)), active).on_click(cx.listener(move |this, _, _, cx| {
                    this.set_level_for(k.clone(), level, None, cx);
                    if level != "nothing" {
                        this.notify_menu = None;
                    }
                })),
            );
            if level == "nothing" {
                // "Mute:" 15m / 1h / 8h / 24h / ∞, on a darker strip.
                let mut strip = div()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .px(px(12.))
                    .py(px(4.))
                    .bg(rgba(0x00000040))
                    .child(div().text_size(px(10.)).line_height(px(15.)).text_color(rgba(0xffffff66)).child(t("railMenu.mute").to_uppercase()));
                for (label, ms) in [("15m", Some(15 * 60_000)), ("1h", Some(3_600_000)), ("8h", Some(8 * 3_600_000)), ("24h", Some(24 * 3_600_000)), ("∞", None)] {
                    let k = key.clone();
                    strip = strip.child(
                        div()
                            .id(SharedString::from(format!("nm-mute-{label}")))
                            .flex_none()
                            .p(px(8.))
                            .rounded(px(8.))
                            .text_size(px(13.))
                            .line_height(px(19.5))
                            .text_color(rgb(0xe6e7ee))
                            .cursor_pointer()
                            .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                            .child(label)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.set_level_for(k.clone(), "nothing", ms, cx);
                                this.notify_menu = None;
                            })),
                    );
                }
                card = card.child(strip);
            }
        }
        if matches!(menu.target, NotifyTarget::Channel(_)) && self.my_permissions() & (1 << 1) != 0 {
            card = card.child(div().my(px(6.)).h(px(1.)).bg(rgb(0x41434f)));
            for (n, label) in ["channelMenu.rename", "channelMenu.permissions", "channelMenu.editTopic", "channelMenu.setSlowmode", "channelMenu.delete"].into_iter().enumerate() {
                card = card.child(item(SharedString::from(format!("nm-tool-{n}")), t(label), false).when(label == "channelMenu.delete", |d| d.text_color(Theme::coral())));
            }
        }
        // left: min(x, innerWidth − 240); top: min(y, innerHeight − 280).
        let size = window.viewport_size();
        let left = f32::from(menu.at.x).min(f32::from(size.width) - 240.);
        let top = f32::from(menu.at.y).min(f32::from(size.height) - 280.);
        let at = menu.at;
        Some(
            div()
                .id("notify-menu")
                .absolute()
                .left(px(left))
                .top(px(top))
                .w(px(230.))
                .p(px(8.))
                .rounded(px(14.))
                .bg(rgb(0x202129))
                .border_1()
                .border_color(rgb(0x41434f))
                .overflow_hidden()
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .text_color(rgb(0xf5f3ee))
                .child(card)
                .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                    if this.notify_menu.as_ref().is_some_and(|m| m.at == at) {
                        this.notify_menu = None;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        )
    }
}
