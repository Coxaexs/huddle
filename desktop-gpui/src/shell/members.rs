//! The members panel (`.member-panel`, panels.tsx): search, then online members (34px avatars, a
//! status line) and offline members (28px, dimmed names), and the window layout around it.

use gpui::{AnyElement, Context, FontWeight, IntoElement, SharedString, Window, div, prelude::*, px};

use super::Shell;
use crate::model::Member;
use crate::i18n::{t, tv};
use crate::theme::Theme;
use crate::ui;

impl Shell {
    fn render_members(&self, _cx: &mut Context<Self>) -> AnyElement {
        let Some(server_id) = self.server_id.as_ref() else { return div().into_any_element() };
        let all: &[Member] = self.members.get(server_id).map(|m| m.as_slice()).unwrap_or(&[]);
        let (online, offline): (Vec<&Member>, Vec<&Member>) =
            all.iter().partition(|m| self.presence_of(&m.id) != "offline");

        let mut list = div()
            .id("members")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .child(group_label(tv("members.online", &[("count", &online.len().to_string())])))
            .child(div().flex_none().h(px(11.)));
        for member in &online {
            list = list.child(self.render_member(member, true));
        }
        list = list
            .child(div().flex_none().h(px(23.)))
            .child(group_label(tv("members.offline", &[("count", &offline.len().to_string())])))
            .child(div().flex_none().h(px(11.)));
        for member in &offline {
            list = list.child(self.render_member(member, false));
        }

        div()
            .w(px(250.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .pt(px(30.))
            .px(px(16.))
            .child(
                div()
                    .flex_none()
                    .mx(px(13.))
                    .h(px(30.))
                    .px(px(10.))
                    .rounded(px(10.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .items_center()
                    .text_size(px(13.))
                    .text_color(Theme::quiet())
                    .child(t("members.search")),
            )
            .child(div().flex_none().h(px(32.)))
            .child(list)
            .into_any_element()
    }

    fn render_member(&self, member: &Member, online: bool) -> impl IntoElement {
        let size = if online { 34. } else { 28. };
        let picture = member.picture().map(|p| self.client.absolute(p));
        let status = self.presence_of(&member.id);
        let line = if member.id == self.me.id {
            t("members.hereNow")
        } else {
            member.status_text().unwrap_or_else(|| match status.as_str() {
                "idle" => t("presence.idle"),
                "dnd" => t("presence.dnd"),
                _ => t("presence.online"),
            })
        };
        let face = div()
            .relative()
            .flex_none()
            .when(!online, |d| d.opacity(0.45))
            .child(if online {
                ui::avatar(picture, &member.avatar, &member.color, member.name(), size)
            } else {
                ui::grey_avatar(picture, &member.avatar, member.name(), size)
            })
            .when(online, |d| {
                d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(ui::presence_dot(&status, 17., Theme::panel())))
            });
        div()
            .id(SharedString::from(format!("member-{}", member.id)))
            .flex_none()
            .h(px(if online { 47. } else { 34. }))
            .px(px(3.))
            .rounded(px(8.))
            .flex()
            .items_center()
            .gap(px(10.))
            .cursor_pointer()
            .hover(|s| s.bg(Theme::hover()))
            .child(face)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .truncate()
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .font_weight(if online { FontWeight::BOLD } else { FontWeight::MEDIUM })
                            .text_color(if online { Theme::ink() } else { Theme::muted() })
                            .child(member.name().to_string()),
                    )
                    .when(online, |d| {
                        d.child(div().truncate().text_size(px(8.)).line_height(px(12.)).text_color(Theme::muted()).child(line))
                    }),
            )
    }

    fn render_footer_menu(&self, cx: &mut Context<Self>) -> AnyElement {
        if !self.footer_menu {
            return div().into_any_element();
        }
        div()
            .absolute()
            .left(px(160.))
            .bottom(px(70.))
            .w(px(180.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::card())
            .border_1()
            .border_color(Theme::line())
            .shadow(ui::card_shadow())
            .child(
                div()
                    .id("sign-out")
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .text_size(px(13.))
                    .text_color(Theme::badge())
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()))
                    .child("Sign out")
                    .on_click(cx.listener(|this, _, _, cx| this.sign_out(cx))),
            )
            .into_any_element()
    }

    pub(super) fn sign_out_menu(&mut self, cx: &mut Context<Self>) {
        self.footer_menu = !self.footer_menu;
        cx.notify();
    }
}

fn group_label(text: String) -> impl IntoElement {
    div()
        .flex_none()
        .h(px(15.))
        .px(px(3.))
        .text_size(px(12.))
        .line_height(px(15.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(Theme::muted())
        .child(text)
}

impl gpui::Render for Shell {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Typing goes to the composer unless something else has focus.
        if window.focused(cx).is_none() {
            window.focus(&self.composer.focus_handle(cx));
        }
        let members_open = self.members_open;
        div()
            .size_full()
            .flex()
            .bg(Theme::panel())
            .text_color(Theme::ink())
            .child(
                // The rail and the sidebar share the user card, which overlaps both.
                div()
                    .relative()
                    .h_full()
                    .flex_none()
                    .flex()
                    .child(self.render_rail(cx))
                    .child(if self.home { self.render_home_sidebar(cx).into_any_element() } else { self.render_sidebar(cx).into_any_element() })
                    .child(self.render_footer(cx))
                    .child(self.render_footer_menu(cx)),
            )
            .when(self.home && self.channel_id.is_none(), |d| {
                // The friends view sits in the same card, with a 10px gap on the right (no members panel).
                d.child(
                    div().flex_1().min_w_0().h_full().pt(px(10.)).pr(px(10.)).child(
                        div()
                            .size_full()
                            .rounded_t(px(16.))
                            .bg(Theme::chat_bg())
                            .border_1()
                            .border_color(Theme::line())
                            .overflow_hidden()
                            .child(self.render_friends_view(cx)),
                    ),
                )
            })
            .when(!(self.home && self.channel_id.is_none()), |d| d.child(self.render_chat_panel(cx)))
            .when(members_open && !self.home, |d| d.child(self.render_members(cx)))
    }
}

use gpui::Focusable as _;
