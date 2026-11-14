//! The pieces only the Simple interface draws (app/components/chat/shell/simple-parts.tsx, easy.css):
//! the header's faces, Invite and "More", and Hoffy's one-at-a-time tips above the message box.

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, div, prelude::*, px};

use super::Shell;
use crate::i18n::{t, tv};
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui::{self, icon};

/// Where the tips you have dismissed are counted (the web keeps `huddle-simple-tips` in localStorage).
fn tips_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("simple-tips"))
}

pub(super) fn load_tips_seen() -> usize {
    tips_path().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| s.trim().parse().ok()).unwrap_or(0)
}


impl Shell {
    /// chat-header.tsx with `simpleHeader`: the channel's name, a few online faces (they open the
    /// member list), Invite for those allowed, mentions only while some are unread, and "More".
    pub(super) fn render_simple_header(&self, cx: &mut Context<Self>) -> AnyElement {
        let channel = self.channel();
        let name = channel.map(|c| c.name.clone()).unwrap_or_default();
        let kind_icon = channel.map(|c| c.icon()).unwrap_or("hash");
        let online: Vec<&crate::model::Member> = self
            .server_id
            .as_ref()
            .and_then(|s| self.members.get(s))
            .map(|all| all.iter().filter(|m| self.presence_of(&m.id) != "offline").collect())
            .unwrap_or_default();
        let chat_bg: Hsla = Theme::chat_bg().into();
        let ink: Hsla = Theme::ink().into();
        let mut faces = div()
            .id("simple-faces")
            .flex_none()
            .flex()
            .items_center()
            .cursor_pointer()
            .tooltip(ui::tooltip(t("simple.whoIsHere")))
            .on_click(cx.listener(|this, _, _, cx| {
                this.members_open = !this.members_open;
                cx.notify();
            }));
        for (n, member) in online.iter().take(3).enumerate() {
            faces = faces.child(
                div()
                    .when(n > 0, |d| d.ml(px(-6.)))
                    .size(px(26.))
                    .flex_none()
                    .rounded_full()
                    .border_2()
                    .border_color(chat_bg)
                    .child(ui::avatar(self.picture(&member.avatar_url), &member.avatar, &member.color, member.name(), 22.)),
            );
        }
        let mentions: u32 = self.reads.values().map(|r| r.mentions).sum();
        let mut right = div().flex().items_center().gap(px(3.));
        let mut left_part = div().flex_none().flex().items_center().gap(px(8.));
        if !online.is_empty() {
            left_part = left_part.child(faces);
        }
        if self.can_invite() {
            left_part = left_part.child(
                div()
                    .id("simple-invite")
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .px(px(12.))
                    .py(px(5.))
                    .rounded_full()
                    .border_1()
                    .border_color(ink.opacity(0.24))
                    .text_size(px(12.5))
                    .line_height(px(18.75))
                    .text_color(ink)
                    .cursor_pointer()
                    .hover(|s| s.bg(ink.opacity(0.06)))
                    .child(icon("user-plus", 15., ink))
                    .child(t("simple.invite"))
                    .on_click(cx.listener(|this, _, _, cx| this.set_notice("Invites are not in this app yet.", cx))),
            );
        }
        right = right.child(left_part);
        if mentions > 0 {
            right = right.child(
                div()
                    .relative()
                    .child(super::chat::header_button("at-sign", "header.mentions", self.panels.open == Some(super::side_panels::Panel::Mentions)).on_click(
                        cx.listener(|this, _, _, cx| this.toggle_panel(super::side_panels::Panel::Mentions, cx)),
                    ))
                    .child(div().absolute().right(px(-2.)).top(px(-2.)).child(ui::rail_badge(mentions))),
            );
        }
        right = right.child(self.render_header_more(cx));
        div()
            .h(px(73.))
            .flex_none()
            .pl(px(26.))
            .pr(px(18.))
            .flex()
            .items_center()
            .gap(px(11.))
            .child(icon(kind_icon, 20., Theme::quiet()))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .font_family(DISPLAY_FONT)
                    .text_size(px(22.))
                    .line_height(px(22.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::ink())
                    .child(name),
            )
            .child(right.flex_none())
            .into_any_element()
    }

    /// `.header-more` and its menu: on a desktop in Simple it lists search, mentions and the member list.
    fn render_header_more(&self, cx: &mut Context<Self>) -> AnyElement {
        let open = self.header_more;
        let muted: Hsla = Theme::quiet().into();
        let button = div()
            .id("header-more")
            .size(px(34.))
            .rounded(px(10.))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .opacity(0.85)
            .when(open, |d| d.bg(Theme::lavender_soft()))
            .hover(|s| s.bg(Theme::hover()))
            .tooltip(ui::tooltip(t("header.more")))
            .child(icon("ellipsis", 18., if open { Theme::lavender().into() } else { muted }))
            .on_click(cx.listener(|this, _, _, cx| {
                this.header_more = !this.header_more;
                cx.notify();
            }));
        let mut wrap = div().flex_none().relative().child(button);
        if open {
            let item = |id: &'static str, glyph: &'static str, label: String| {
                div()
                    .id(id)
                    .min_h(px(46.))
                    .px(px(12.))
                    .rounded(px(10.))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .text_size(px(15.))
                    .line_height(px(22.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::ink())
                    .cursor_pointer()
                    .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.16)))
                    .child(icon(glyph, 18., Theme::ink()))
                    .child(label)
            };
            let mut menu = div()
                .id("header-more-menu")
                .absolute()
                .top(px(40.))
                .right_0()
                .min_w(px(210.))
                .p(px(6.))
                .rounded(px(14.))
                .border_1()
                .border_color(Theme::line())
                .bg(Theme::panel())
                .shadow(vec![gpui::BoxShadow {
                    color: gpui::hsla(0., 0., 0., 0.45),
                    offset: gpui::point(px(0.), px(14.)),
                    blur_radius: px(40.),
                    spread_radius: px(0.),
                }])
                .flex()
                .flex_col()
                .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                    this.header_more = false;
                    cx.notify();
                }));
            if !self.home {
                menu = menu.child(item("more-search", "search", t("header.searchMessages")).on_click(cx.listener(|this, _, window, cx| {
                    this.header_more = false;
                    this.toggle_search(window, cx);
                })));
            }
            menu = menu.child(item("more-mentions", "at-sign", t("header.mentions")).on_click(cx.listener(|this, _, _, cx| {
                this.header_more = false;
                this.toggle_panel(super::side_panels::Panel::Mentions, cx);
            })));
            menu = menu.child(item("more-members", "users", t("header.toggleMemberList")).on_click(cx.listener(|this, _, _, cx| {
                this.header_more = false;
                this.members_open = !this.members_open;
                cx.notify();
            })));
            wrap = wrap.child(gpui::deferred(menu).with_priority(1));
        }
        wrap.into_any_element()
    }

    /// SimpleTips: Hoffy and one tip at a time; "Got it" moves on and each shows once.
    pub(super) fn render_simple_tip(&self, panel: f32, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.simple() || self.home || self.channel_id.is_none() {
            return None;
        }
        let in_room = self.call.as_ref().map(|c| c.channel_id.clone());
        let live_room = self.server().and_then(|server| {
            server
                .channels
                .iter()
                .find(|c| Some(&c.id) != in_room.as_ref() && self.rooms.get(&c.id).is_some_and(|seats| seats.iter().any(|s| !s.bot)))
                .map(|c| c.name.clone())
        });
        let mut tips: Vec<(&'static str, String)> = vec![
            ("arrow-left", match &live_room {
                Some(room) => tv("simple.tip.talkLive", &[("room", room)]),
                None => t("simple.tip.talk"),
            }),
            ("arrow-down", t("simple.tip.picture")),
        ];
        if self.can_invite() {
            tips.push(("arrow-up-right", t("simple.tip.invite")));
        }
        tips.push(("arrow-down-left", t("simple.tip.you")));
        let seen = self.tips_seen;
        let (arrow, text) = tips.get(seen)?.clone();
        let total = tips.len();
        let ink: Hsla = Theme::ink().into();
        let bg = crate::theme::mix(Theme::lavender(), 0.14, Theme::chat_bg());
        Some(
            div()
                .flex_none()
                // `margin: 0 16px`; from 1100px wide, at most 880px across, centred.
                .mx(px(16_f32.max((panel - 880.) / 2.)))
                .mb(px(10.))
                .px(px(12.))
                .py(px(10.))
                .rounded(px(10.))
                .bg(bg)
                .flex()
                .items_start()
                .gap(px(10.))
                .child(div().flex_none().size(px(44.)).child(gpui::img("images/hoffy-happy-point.svg").size(px(44.))))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .child(div().mt(px(2.)).text_size(px(13.5)).line_height(px(20.25)).text_color(ink).child(text))
                        .child(
                            div()
                                .mt(px(4.))
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .text_size(px(12.5))
                                .line_height(px(18.75))
                                .text_color(ink.opacity(0.85))
                                .child(icon(arrow, 14., ink.opacity(0.85)))
                                .child(tv("simple.tipCount", &[("n", &(seen + 1).to_string()), ("total", &total.to_string())]))
                                .child("·")
                                .child(
                                    div()
                                        .id("tip-got-it")
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .underline()
                                        .cursor_pointer()
                                        .child(SharedString::from(t("simple.gotIt")))
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.tips_seen += 1;
                                            if let Some(path) = tips_path() {
                                                let _ = std::fs::write(path, this.tips_seen.to_string());
                                            }
                                            cx.notify();
                                        })),
                                ),
                        ),
                )
                .into_any_element(),
        )
    }
}
