//! ThreadPanel (panels.tsx): a message's replies beside the chat, 420px wide, with the root on top,
//! "N replies", the replies and a composer. Opened by Create Thread, the Shift toolbar's thread
//! button or a message's "N replies" pill.

use std::rc::Rc;

use gpui::{AnyElement, App, Context, Entity, FontWeight, Hsla, ScrollHandle, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::i18n::{t, tv};
use crate::model::{self, Message};
use crate::textarea::{AreaEvent, TextArea};
use crate::theme::Theme;
use crate::ui;

pub(super) const THREAD_WIDTH: f32 = 420.;

pub(super) struct Thread {
    pub root: Message,
    pub replies: Vec<Message>,
    pub composer: Entity<TextArea>,
    scroll: ScrollHandle,
    _sub: Subscription,
}

impl Shell {
    /// openThread: the panel at once, its replies when they arrive; the members list makes room
    /// when the window is under 1300px.
    pub(super) fn open_thread(&mut self, root: Message, window: &mut Window, cx: &mut Context<Self>) {
        if f32::from(window.viewport_size().width) < 1300. {
            self.members_open = false;
        }
        let composer = cx.new(|cx| TextArea::new(t("thread.placeholder"), cx).text(13., 18.2).min_height(30.).color(rgb(0xf2f3f5)).placeholder_color(rgb(0x80848e)));
        let sub = cx.subscribe_in(&composer, window, |this, _, event, window, cx| match event {
            AreaEvent::Submit => this.send_thread_reply(cx),
            AreaEvent::Escape => this.close_thread(window, cx),
            AreaEvent::Changed => cx.notify(),
        });
        let id = root.id.clone();
        self.ctx_menu = None;
        self.thread = Some(Thread { root, replies: Vec::new(), composer, scroll: ScrollHandle::new(), _sub: sub });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let fetched = cx.background_executor().spawn({
                let id = id.clone();
                async move { client.thread(&id) }
            });
            let replies = fetched.await.unwrap_or_default();
            this.update(cx, |this, cx| {
                if let Some(thread) = this.thread.as_mut().filter(|t| t.root.id == id) {
                    thread.replies = replies;
                    thread.scroll.scroll_to_bottom();
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn close_thread(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.thread.take().is_some() {
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
        }
    }

    /// A reply from the hub (or our own send): into the open thread, and one more on its root.
    pub(super) fn add_thread_reply(&mut self, reply: Message, cx: &mut Context<Self>) {
        let Some(root_id) = reply.thread_id.clone() else { return };
        if let Some(thread) = self.thread.as_mut().filter(|t| t.root.id == root_id)
            && !thread.replies.iter().any(|m| m.id == reply.id)
        {
            thread.replies.push(reply.clone());
            thread.scroll.scroll_to_bottom();
        }
        if self.counted_replies.insert(reply.id.clone()) {
            let channel = reply.channel_id.clone().or_else(|| self.channel_id.clone());
            if let Some(list) = channel.and_then(|c| self.messages.get_mut(&c))
                && let Some(ix) = list.iter().position(|m| m.id == root_id)
            {
                let root = &mut list[ix];
                root.thread_count = Some(root.thread_count.unwrap_or(0) + 1);
                if let Some(thread) = self.thread.as_mut().filter(|t| t.root.id == root_id) {
                    thread.root.thread_count = root.thread_count;
                }
                self.list.splice(ix..ix + 1, 1);
            }
        }
        cx.notify();
    }

    pub(super) fn send_thread_reply(&mut self, cx: &mut Context<Self>) {
        let Some(thread) = self.thread.as_ref() else { return };
        let text = thread.composer.read(cx).value().trim().to_string();
        let Some(channel) = self.channel_id.clone() else { return };
        if text.is_empty() {
            return;
        }
        thread.composer.update(cx, |c, cx| c.set_value("", cx));
        let root = thread.root.id.clone();
        let composer = thread.composer.clone();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let sent = cx.background_executor().spawn({
                let text = text.clone();
                async move { client.send_thread(&channel, &text, &root) }
            });
            let sent = sent.await;
            this.update(cx, |this, cx| match sent {
                Ok(message) => this.add_thread_reply(message, cx),
                Err(e) => {
                    composer.update(cx, |c, cx| c.set_value(text.clone(), cx));
                    this.set_notice(if e.to_string().is_empty() { "Reply did not send.".to_string() } else { e.to_string() }, cx);
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// roleColorFor: the colour of their highest role here that has one.
    pub(super) fn role_color(&self, member: &crate::model::Member) -> Option<Hsla> {
        let server = self.server()?;
        let held: Vec<String> = member.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
        server
            .roles
            .iter()
            .filter(|r| held.contains(&r.id))
            .filter_map(|r| crate::theme::css_color(&r.color).map(|c| (r.position, c)))
            .max_by_key(|(p, _)| *p)
            .map(|(_, c)| c)
    }

    /// `.thread-link`: the "N replies" pill under a message.
    pub(super) fn render_thread_link(&self, message: &Message, cx: &mut Context<Self>) -> Option<AnyElement> {
        let count = message.thread_count.filter(|c| *c > 0 && message.kind.as_deref() != Some("ai"))?;
        let m = message.clone();
        Some(
            div()
                .flex()
                .child(
                    div()
                        .id(SharedString::from(format!("tl-{}", message.id)))
                        .mt(px(6.))
                        .px(px(10.))
                        .py(px(3.))
                        .rounded_full()
                        .border_1()
                        .border_color(Theme::line())
                        .bg(Theme::panel())
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .font_weight(FontWeight(650.))
                        .text_color(Theme::lavender())
                        .cursor_pointer()
                        .hover(|s| s.bg(Theme::lavender_soft()))
                        .child(ui::icon("message-square", 14., Theme::lavender()))
                        .child(format!("{count} {}", if count == 1 { "reply" } else { "replies" }))
                        .on_click(cx.listener(move |this, _, window, cx| this.open_thread(m.clone(), window, cx))),
                )
                .into_any_element(),
        )
    }

    /// One message in the panel: its avatar, name in their role colour, time and text.
    fn render_thread_message(&self, message: &Message, root: bool, width: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let member = message.user_id.as_ref().and_then(|id| self.member(id));
        let avatar = member.map(|m| m.avatar.clone()).filter(|a| !a.is_empty()).unwrap_or_else(|| message.avatar.clone());
        let picture = member.and_then(|m| m.avatar_url.clone()).filter(|u| !u.is_empty()).map(|u| self.client.absolute(&u));
        let color = member.map(|m| m.color.clone()).filter(|c| !c.is_empty()).unwrap_or_else(|| message.color.clone());
        let name = if root { message.author.clone() } else { member.map(|m| m.display_name_or_name()).filter(|n| !n.is_empty()).unwrap_or_else(|| message.author.clone()) };
        let name_color: Hsla = member.and_then(|m| self.role_color(m)).unwrap_or_else(|| Theme::ink().into());
        let body_width = width - if root { 20. } else { 0. } - 36. - 13.;
        let mut body = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(name_color).child(name))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child(model::client_time(&message.created_at))),
            );
        // Only replies show a forward as its card; the root shows its text.
        if let Some(card) = (!root).then(|| self.render_forwarded(message, px(body_width), window, cx)).flatten() {
            body = body.child(card);
        } else if !message.text.is_empty() {
            let (font, size) = crate::rich::ui_font(16.);
            let weak = cx.weak_entity();
            let on_channel: Rc<dyn Fn(String, &mut App)> = Rc::new(move |id, cx| {
                weak.update(cx, |this, cx| this.open_channel(id, cx)).ok();
            });
            let wrap = crate::rich::Wrap { on_channel: Some(on_channel), window, width: px(body_width), font, size };
            body = body.child(
                div()
                    .pt(px(1.))
                    .text_size(px(16.))
                    .line_height(px(24.8))
                    .text_color(Theme::ink())
                    .child(crate::rich::message_body(&format!("th-{}", message.id), &message.text, &self.me.username, true, Rc::new(|_| {}), Some(&wrap))),
            );
        }
        body = body.children(self.render_attachments(message, body_width, window, cx));
        let frame = message.user_id.as_ref().map(|id| self.avatar_frame(id)).unwrap_or_default();
        let face = crate::cosmetics::decorate(ui::avatar(picture, &avatar, &color, &message.author, 36.), &frame, 36.);
        div()
            .mx(px(8.))
            .my(px(1.))
            // The root keeps `.message`'s 7px 10px 14px; a reply is `padding: 4px 0`.
            .pt(px(if root { 7. } else { 4. }))
            .px(px(if root { 10. } else { 0. }))
            .pb(px(if root { 14. } else { 4. }))
            .rounded(px(14.))
            .when(root, |d| d.border_b_1().border_color(rgba(0xffffff14)))
            .flex()
            .gap(px(13.))
            .child(face)
            .child(body)
            .into_any_element()
    }

    pub(super) fn render_thread(&self, window: &mut Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let thread = self.thread.as_ref()?;
        let muted: Hsla = rgb(0x949ba4).into();
        let line: Hsla = rgba(0xffffff14).into();
        let bg: Hsla = rgb(0x2b2d31).into();
        let root = &thread.root;
        let title = if !root.text.is_empty() {
            root.text.encode_utf16().take(36).collect::<Vec<u16>>()
        } else {
            Vec::new()
        };
        let title = if !title.is_empty() {
            String::from_utf16_lossy(&title)
        } else if root.image.is_some() {
            t("thread.image")
        } else {
            t("thread.label")
        };
        let channel = self.channel().filter(|_| !self.channel_id.as_ref().is_some_and(|c| self.dm(c).is_some())).map(|c| c.name.clone()).unwrap_or_else(|| t("thread.channel"));
        let inner = THREAD_WIDTH - 1. - 28. - 16.;

        let head = div()
            .flex_none()
            .min_h(px(48.))
            .px(px(16.))
            .py(px(10.))
            .border_b_1()
            .border_color(line)
            .bg(bg)
            .flex()
            .items_center()
            .justify_between()
            .gap(px(10.))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(1.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .child(ui::icon("message-square", 16., muted))
                            .child(div().text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::BOLD).text_color(rgb(0xf2f3f5)).child(ui::fit(window, &title, FontWeight::BOLD, 15., px(349. - 22.)))),
                    )
                    .child(div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::MEDIUM).text_color(muted).child(format!("#{channel}"))),
            )
            .child(
                div()
                    .id("thread-close")
                    .flex_none()
                    .size(px(28.))
                    .rounded_full()
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(|s| s.bg(rgba(0xffffff1a)))
                    .tooltip(ui::tooltip(t("thread.close")))
                    .child(ui::icon("x", 18., muted))
                    .on_click(cx.listener(|this, _, window, cx| this.close_thread(window, cx))),
            );

        let count = thread.replies.len();
        let replies_label = tv(if count == 1 { "thread.replies.one" } else { "thread.replies.other" }, &[("count", &count.to_string())]).to_uppercase();
        let rule = || div().flex_1().h(px(1.)).bg(line);
        let mut body = div()
            .id("thread-body")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .track_scroll(&thread.scroll)
            .px(px(14.))
            .py(px(16.))
            .flex()
            .flex_col()
            .gap(px(12.))
            .child(self.render_thread_message(root, true, THREAD_WIDTH - 1. - 28. - 16., window, cx))
            .child(
                div()
                    .my(px(6.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .font_weight(FontWeight::BOLD)
                    .text_color(muted)
                    .child(rule())
                    .child(replies_label)
                    .child(rule()),
            );
        if thread.replies.is_empty() {
            body = body.child(
                div()
                    .px(px(16.))
                    .py(px(30.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(6.))
                    .text_color(muted)
                    .child(div().mb(px(4.)).opacity(0.4).child(ui::icon("message-square", 24., muted)))
                    .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(t("thread.empty")))
                    .child(div().text_size(px(12.)).line_height(px(18.)).child(t("thread.emptyHint"))),
            );
        }
        for reply in &thread.replies {
            body = body.child(self.render_thread_message(reply, false, inner, window, cx));
        }

        let can_send = !thread.composer.read(cx).value().trim().is_empty();
        let focused = gpui::Focusable::focus_handle(thread.composer.read(cx), cx).is_focused(window);
        let composer = div()
            .flex_none()
            .pt(px(12.))
            .px(px(14.))
            .pb(px(14.))
            .border_t_1()
            .border_color(line)
            .bg(bg)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .px(px(10.))
                    .py(px(6.))
                    .rounded(px(8.))
                    .bg(rgba(0x00000040))
                    .border_1()
                    .border_color(if focused { rgba(0xffffff40) } else { rgba(0xffffff1a) })
                    .child(div().flex_1().min_w_0().py(px(2.)).child(thread.composer.clone()))
                    .child(
                        div()
                            .id("thread-send")
                            .flex_none()
                            .size(px(28.))
                            .rounded_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .tooltip(ui::tooltip(t("thread.send")))
                            .when(can_send, |d| d.bg(Theme::lavender()).cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.send_thread_reply(cx))))
                            .child(ui::icon("send", 15., if can_send { gpui::white() } else { rgb(0x80848e).into() })),
                    ),
            );

        Some(
            div()
                .id("thread-panel")
                .relative()
                .flex_none()
                .w(px(THREAD_WIDTH))
                .h_full()
                .flex()
                .flex_col()
                .bg(bg)
                .border_l_1()
                .border_color(line)
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.2), offset: gpui::point(px(-4.), px(0.)), blur_radius: px(16.), spread_radius: px(0.) }])
                .overflow_hidden()
                .child(head)
                .child(body)
                .child(composer)
                .into_any_element(),
        )
    }
}
