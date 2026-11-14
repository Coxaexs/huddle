//! Who reacted (overlays.tsx ReactionViewerLayer): right-click a reaction pill for the people
//! behind it; a click on one opens their profile card.

use gpui::{AnyElement, Context, FontWeight, Hsla, ObjectFit, Pixels, SharedString, Window, div, prelude::*, px, rgba};

use super::Shell;
use crate::theme::Theme;
use crate::ui;

pub(super) struct ReactionViewer {
    pub message_id: String,
    pub emoji: String,
    pub bounds: gpui::Bounds<Pixels>,
}

impl Shell {
    /// handleOpenReactionViewer: 320px above the pill (under it when there is no room), the same
    /// pill again closes it.
    pub(super) fn open_reaction_viewer(&mut self, message_id: String, emoji: String, bounds: gpui::Bounds<Pixels>, cx: &mut Context<Self>) {
        if self.reaction_viewer.as_ref().is_some_and(|v| v.message_id == message_id && v.emoji == emoji) {
            self.reaction_viewer = None;
        } else {
            self.reaction_viewer = Some(ReactionViewer { message_id, emoji, bounds });
        }
        cx.notify();
    }

    pub(super) fn render_reaction_viewer(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let viewer = self.reaction_viewer.as_ref()?;
        let message = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| l.iter().find(|m| m.id == viewer.message_id))?;
        let users = message.reactions.iter().find(|r| r.emoji == viewer.emoji).map(|r| r.users.clone()).unwrap_or_default();
        let b = viewer.bounds;
        let mut top = f32::from(b.origin.y) - 320. - 8.;
        if top < 16. {
            top = f32::from(b.origin.y + b.size.height) + 8.;
        }
        let left = f32::from(b.origin.x).min(f32::from(window.viewport_size().width) - 260. - 16.).max(16.);
        let custom = self
            .server_id
            .as_ref()
            .and_then(|s| self.emojis.get(s))
            .and_then(|l| l.iter().find(|e| e.name == viewer.emoji.trim_matches(':')))
            .map(|e| self.client.absolute(&e.url));
        let muted: Hsla = Theme::muted().into();
        let mut list = div().p(px(6.)).flex().flex_col();
        if users.is_empty() {
            list = list.child(div().p(px(8.)).text_size(px(13.)).text_color(muted).child("No one has reacted yet."));
        }
        for user in &users {
            let id = user.id.clone();
            let picture = user.avatar_url.as_deref().map(|u| self.client.absolute(u));
            list = list.child(
                div()
                    .id(SharedString::from(format!("rv-{}", user.id)))
                    .h(px(40.))
                    .px(px(8.))
                    .py(px(6.))
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()))
                    .child(ui::avatar(picture, &user.avatar, &user.color, user.name(), 28.))
                    .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).child(user.name().to_string()))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(format!("@{}", user.username)))
                    .when(user.id == self.me.id, |d| d.child(div().text_size(px(11.)).text_color(Theme::lavender()).child("You")))
                    .child(super::profile_card::track(&self.viewer_spot))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.reaction_viewer = None;
                        let at = this.viewer_spot.get();
                        this.open_profile(&id, at, window, cx);
                    })),
            );
        }
        let count = users.len();
        Some(
            div()
                .absolute()
                .inset_0()
                .child(div().id("rv-backdrop").absolute().inset_0().on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.reaction_viewer = None;
                    cx.notify();
                })))
                .child(
                    div()
                        .id("reaction-viewer")
                        .absolute()
                        .top(px(top))
                        .left(px(left))
                        .w(px(260.))
                        .max_h(px(320.))
                        .rounded(px(14.))
                        .bg(Theme::card())
                        .border_1()
                        .border_color(rgba(0xffffff1a))
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.75), offset: gpui::point(px(0.), px(16.)), blur_radius: px(48.), spread_radius: px(0.) }])
                        .overflow_hidden()
                        .text_color(Theme::ink())
                        .child(
                            div()
                                .px(px(12.))
                                .py(px(10.))
                                .bg(rgba(0xffffff08))
                                .border_b_1()
                                .border_color(rgba(0xffffff14))
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(div().w(px(24.)).flex().justify_center().child(match custom {
                                    Some(url) => gpui::img(url).size(px(20.)).object_fit(ObjectFit::Contain).into_any_element(),
                                    None => ui::outline_emoji(&viewer.emoji, 18.),
                                }))
                                .child(div().flex_1().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).child(format!("{count} {}", if count == 1 { "reaction" } else { "reactions" })))
                                .child(
                                    div()
                                        .id("rv-close")
                                        .size(px(30.))
                                        .rounded(px(8.))
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .cursor_pointer()
                                        .hover(|s| s.bg(rgba(0xffffff14)))
                                        .child(ui::icon("x", 16., muted))
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.reaction_viewer = None;
                                            cx.notify();
                                        })),
                                ),
                        )
                        .child(list),
                )
                .into_any_element(),
        )
    }
}
