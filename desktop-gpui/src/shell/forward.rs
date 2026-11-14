//! ForwardMessageDialog (components/forward-message-dialog.tsx): pick a DM or a text channel, add a
//! comment if you like, and the message goes there as a `forwardedFrom` card. Also the card itself
//! (forwarded-message-card.tsx) as messages show it.

use gpui::{AnyElement, Context, Entity, Focusable, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::model::Message;
use crate::textarea::{AreaEvent, TextArea};
use crate::theme::Theme;
use crate::ui;

pub(super) struct Forward {
    /// The `forwardedFrom` the new message carries.
    target: Value,
    author: String,
    avatar: String,
    avatar_url: Option<String>,
    color: String,
    text: String,
    file_name: Option<String>,
    has_image: bool,
    channel_name: Option<String>,
    server_name: Option<String>,
    search: Entity<TextInput>,
    comment: Entity<TextArea>,
    selected: Option<String>,
    submitting: bool,
    _subs: Vec<Subscription>,
}

struct Destination {
    id: String,
    name: String,
    sub: String,
    dm: Option<crate::model::User>,
}

impl Shell {
    pub(super) fn open_forward(&mut self, message: &Message, window: &mut Window, cx: &mut Context<Self>) {
        let member = message.user_id.as_ref().and_then(|id| self.member(id)).cloned();
        let dm = self.channel_id.as_ref().and_then(|c| self.dm(c)).cloned();
        let (channel_name, server_name) = match &dm {
            Some(dm) => (Some(dm.user.display_name.clone()), None),
            None => (self.channel().map(|c| c.name.clone()), self.server().map(|s| s.name.clone())),
        };
        let author = member.as_ref().map(|m| m.display_name_or_name()).filter(|n| !n.is_empty()).unwrap_or_else(|| message.author.clone());
        let avatar = member.as_ref().map(|m| m.avatar.clone()).filter(|a| !a.is_empty()).unwrap_or_else(|| message.avatar.clone());
        let avatar_url = member.as_ref().and_then(|m| m.avatar_url.clone()).or_else(|| message.avatar_url.clone());
        let color = member.as_ref().map(|m| m.color.clone()).filter(|c| !c.is_empty()).unwrap_or_else(|| message.color.clone());
        let file = message.files.first().map(|f| json!({ "url": f.url, "name": f.name, "type": "pdf" }));
        let target = json!({
            "id": message.id,
            "author": author,
            "avatar": avatar,
            "avatarUrl": avatar_url,
            "color": color,
            "text": message.text,
            "createdAt": message.created_at,
            "image": message.image,
            "images": message.images,
            "file": file,
            "channelName": channel_name,
            "serverName": server_name,
        });
        let search = cx.new(|cx| {
            TextInput::new(t("forward.searchPlaceholder"), cx).look(Look {
                size: 13.,
                line_height: 19.5,
                height: 19.5,
                color: gpui::white(),
                placeholder: rgb(0x92909e).into(),
            })
        });
        let comment = cx.new(|cx| {
            TextArea::new(t("forward.commentPlaceholder"), cx).text(13., 19.5).min_height(39.).max_lines(2).color(gpui::white()).placeholder_color(rgb(0x92909e)).enter_newline()
        });
        let subs = vec![
            cx.subscribe_in(&search, window, |this, _, event, window, cx| match event {
                InputEvent::Escape => this.close_forward(window, cx),
                InputEvent::Changed => cx.notify(),
                InputEvent::Submit => {}
            }),
            cx.subscribe_in(&comment, window, |this, _, event, window, cx| match event {
                AreaEvent::Escape => this.close_forward(window, cx),
                AreaEvent::Submit => this.send_forward(window, cx),
                AreaEvent::Changed => {}
            }),
        ];
        window.focus(&gpui::Focusable::focus_handle(&search, cx));
        self.ctx_menu = None;
        self.forward = Some(Forward {
            target,
            author,
            avatar,
            avatar_url,
            color,
            text: message.text.clone(),
            file_name: message.files.first().map(|f| f.name.clone()),
            has_image: message.image.is_some() || !message.images.is_empty(),
            channel_name,
            server_name,
            search,
            comment,
            selected: None,
            submitting: false,
            _subs: subs,
        });
        cx.notify();
    }

    pub(super) fn close_forward(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.forward.take().is_some() {
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
        }
    }

    pub(super) fn dev_forward_pick(&mut self, n: usize) {
        let id = self.forward_destinations().get(n).map(|d| d.id.clone());
        if let Some(fw) = self.forward.as_mut() {
            fw.selected = id;
        }
    }

    /// DMs first, then every server's text channels.
    fn forward_destinations(&self) -> Vec<Destination> {
        let mut list: Vec<Destination> = self
            .dms
            .iter()
            .filter(|d| !d.user.id.is_empty())
            .map(|d| Destination { id: d.channel_id.clone(), name: d.user.display_name.clone(), sub: format!("@{}", d.user.username), dm: Some(d.user.clone()) })
            .collect();
        for server in &self.servers {
            for channel in server.channels.iter().filter(|c| c.kind == "text") {
                list.push(Destination { id: channel.id.clone(), name: channel.name.clone(), sub: server.name.clone(), dm: None });
            }
        }
        list
    }

    pub(super) fn send_forward(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(forward) = self.forward.as_mut() else { return };
        let Some(dest_id) = forward.selected.clone() else { return };
        if forward.submitting {
            return;
        }
        forward.submitting = true;
        let comment = forward.comment.read(cx).value().trim().to_string();
        let payload = json!({ "forwardedFrom": forward.target });
        let dest_name = self
            .forward_destinations()
            .into_iter()
            .find(|d| d.id == dest_id)
            .map(|d| if d.dm.is_some() { format!("@{}", d.name) } else { format!("#{}", d.name) })
            .unwrap_or_else(|| "channel".into());
        let client = self.client.clone();
        let id = dest_id.clone();
        cx.spawn_in(window, async move |this, cx| {
            let sent = cx.background_executor().spawn(async move { client.send_payload(&id, &comment, payload) }).await;
            this.update_in(cx, |this, window, cx| {
                match sent {
                    Ok(message) => {
                        this.toast(format!("Forwarded message to {dest_name}"), cx);
                        if this.channel_id.as_deref() == Some(dest_id.as_str()) {
                            this.add_message(message, cx);
                        }
                    }
                    Err(_) => this.toast("Failed to forward message", cx),
                }
                this.close_forward(window, cx);
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_forward(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let fw = self.forward.as_ref()?;
        let muted: Hsla = rgb(0x8b83a7).into();
        let lavender: Hsla = Theme::lavender().into();
        let destinations = self.forward_destinations();
        let query = fw.search.read(cx).text().trim().to_lowercase();
        let shown: Vec<&Destination> = destinations.iter().filter(|d| query.is_empty() || d.name.to_lowercase().contains(&query) || d.sub.to_lowercase().contains(&query)).collect();
        let selected = fw.selected.as_ref().and_then(|id| destinations.iter().find(|d| &d.id == id));

        let header = div()
            .flex()
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(div().size(px(36.)).flex_none().rounded(px(10.)).bg(lavender.opacity(0.15)).flex().items_center().justify_center().child(ui::icon("forward", 18., lavender)))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(t("forward.title")))
                            .child(div().mt(px(2.)).text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xa19bb6)).child(t("forward.subtitle"))),
                    ),
            )
            .child(
                div()
                    .id("fw-close")
                    .flex_none()
                    .size(px(24.))
                    .p(px(4.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .text_color(muted)
                    .hover(|s| s.bg(rgba(0xffffff14)).text_color(gpui::white()))
                    .child(ui::icon("x", 16., muted))
                    .on_click(cx.listener(|this, _, window, cx| this.close_forward(window, cx))),
            );

        let preview_text = if !fw.text.is_empty() {
            // JavaScript's length and slice count UTF-16 units.
            if fw.text.encode_utf16().count() > 220 {
                let mut units = 0;
                let cut: String = fw.text.chars().take_while(|c| {
                    units += c.len_utf16();
                    units <= 220
                }).collect();
                format!("{cut}…")
            } else {
                fw.text.clone()
            }
        } else if let Some(name) = &fw.file_name {
            tv("forward.sharedDoc", &[("name", name)])
        } else if fw.has_image {
            t("forward.sharedImage")
        } else {
            t("forward.content")
        };
        let origin = (fw.server_name.is_some() || fw.channel_name.is_some()).then(|| {
            format!("in {}#{}", fw.server_name.as_ref().map(|s| format!("{s} • ")).unwrap_or_default(), fw.channel_name.clone().unwrap_or_else(|| "chat".into()))
        });
        let preview = div()
            .max_h(px(100.))
            .overflow_hidden()
            .py(px(10.))
            .pl(px(12.))
            .pr(px(12.))
            .rounded(px(8.))
            .bg(rgba(0xffffff0a))
            .border_1()
            .border_l(px(3.))
            .border_color(rgba(0xffffff14))
            // The 3px lavender edge on the left.
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .mb(px(4.))
                    .child(ui::avatar_with(self.picture(&fw.avatar_url), &fw.avatar, &fw.color, &fw.author, 20., 10., FontWeight::NORMAL, rgb(0xe8e3f5).into()))
                    .child(div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xe2def0)).child(fw.author.clone()))
                    .when_some(origin, |d, o| d.child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(o))),
            )
            .child(div().text_size(px(12.)).line_height(px(16.8)).text_color(rgb(0xc4bfd6)).child(preview_text));
        // GPUI paints one colour for all four edges: the lavender one goes on top.
        let preview = div().relative().child(preview).child(div().absolute().left_0().top_0().bottom_0().w(px(3.)).rounded_l(px(8.)).bg(lavender));

        let search_focused = fw.search.read(cx).focus_handle(cx).is_focused(window);
        let search = div()
            .relative()
            .h(px(39.5))
            .pl(px(34.))
            .pr(px(12.))
            .flex()
            .items_center()
            .rounded(px(10.))
            .bg(rgb(0x171423))
            .border_1()
            .border_color(if search_focused { lavender } else { rgba(0xffffff14).into() })
            .when(search_focused, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }]))
            .child(div().absolute().left(px(11.)).top(px(11.75)).child(ui::icon("search", 14., muted)))
            .child(div().flex_1().child(fw.search.clone()));

        let mut list = div().id("fw-list").h(px(190.)).overflow_y_scroll().pr(px(4.)).flex().flex_col().gap(px(3.));
        if shown.is_empty() {
            list = list.child(div().p(px(18.)).text_center().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(t("forward.empty")));
        }
        for dest in shown {
            let is_selected = fw.selected.as_deref() == Some(dest.id.as_str());
            let is_current = self.channel_id.as_deref() == Some(dest.id.as_str());
            let face = match &dest.dm {
                Some(user) => ui::avatar_with(self.picture(&user.avatar_url), if user.avatar.is_empty() { "✦" } else { &user.avatar }, if user.color.is_empty() { "#a78bfa" } else { &user.color }, user.name(), 26., 11., FontWeight::NORMAL, rgb(0xe8e3f5).into()),
                None => div().size(px(26.)).flex_none().rounded(px(6.)).bg(rgba(0xffffff0f)).flex().items_center().justify_center().child(ui::icon("hash", 14., lavender)).into_any_element(),
            };
            let id = dest.id.clone();
            list = list.child(
                div()
                    .id(SharedString::from(format!("fw-{}", dest.id)))
                    .flex_none()
                    .h(px(52.))
                    .px(px(10.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(if is_selected { lavender.opacity(0.35) } else { gpui::transparent_black() })
                    .when(is_selected, |d| d.bg(lavender.opacity(0.15)))
                    .when(!is_selected, |d| d.hover(|s| s.bg(rgba(0xffffff0d))))
                    .cursor_pointer()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .min_w_0()
                            .flex_1()
                            .child(face)
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .min_w_0()
                                    .flex_1()
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(6.))
                                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(ui::fit(window, &dest.name, FontWeight::SEMIBOLD, 13., px(if is_current { 298. } else { 350. }))))
                                            .when(is_current, |d| {
                                                d.child(div().flex_none().px(px(5.)).py(px(1.)).rounded(px(4.)).bg(rgba(0xffffff14)).text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::MEDIUM).text_color(rgb(0xa19bb6)).child(t("forward.current")))
                                            }),
                                    )
                                    .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(ui::fit(window, &dest.sub, FontWeight::NORMAL, 11., px(350.)))),
                            ),
                    )
                    .child(
                        div()
                            .size(px(18.))
                            .flex_none()
                            .rounded_full()
                            .border(px(1.5))
                            .border_color(if is_selected { lavender } else { rgba(0xffffff33).into() })
                            .when(is_selected, |d| d.bg(lavender))
                            .flex()
                            .items_center()
                            .justify_center()
                            .when(is_selected, |d| d.child(ui::icon("check-bold", 12., rgb(0x1e1b2e)))),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(fw) = this.forward.as_mut() {
                            fw.selected = Some(id.clone());
                            cx.notify();
                        }
                    })),
            );
        }

        let comment_focused = fw.comment.read(cx).focus_handle(cx).is_focused(window);
        let comment = div()
            .pb(px(6.))
            .child(
                div()
                    .h(px(57.))
                    .px(px(12.))
                    .py(px(8.))
                    .rounded(px(10.))
                    .bg(rgba(0x00000040))
                    .border_1()
                    .border_color(if comment_focused { lavender } else { rgba(0xffffff14).into() })
                    .overflow_hidden()
                    .child(fw.comment.clone()),
            );

        let can_send = fw.selected.is_some() && !fw.submitting;
        let label = if fw.submitting {
            t("forward.forwarding")
        } else {
            match selected {
                Some(d) => tv("forward.forwardTo", &[("target", &if d.dm.is_some() { d.name.clone() } else { format!("#{}", d.name) })]),
                None => t("forward.action"),
            }
        };
        let ink: Hsla = rgb(0x15121f).into();
        let footer = div()
            .flex()
            .items_center()
            .justify_end()
            .gap(px(10.))
            .child(
                div()
                    .id("fw-cancel")
                    .px(px(14.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(rgba(0xffffff1a))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(rgb(0xb8b0cf))
                    .cursor_pointer()
                    .hover(|s| s.bg(rgba(0xffffff0f)).text_color(gpui::white()))
                    .child(t("common.cancel"))
                    .on_click(cx.listener(|this, _, window, cx| this.close_forward(window, cx))),
            )
            .child(
                div()
                    .id("fw-send")
                    .px(px(16.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .bg(lavender)
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(ink)
                    .when(!can_send, |d| d.opacity(0.5))
                    .when(can_send, |d| {
                        d.cursor_pointer()
                            .hover(|s| s.bg(crate::theme::mix(Theme::lavender(), 0.82, gpui::black())))
                            .on_click(cx.listener(|this, _, window, cx| this.send_forward(window, cx)))
                    })
                    .child(ui::icon(if fw.submitting { "loader-2" } else { "forward" }, 14., ink))
                    .child(label),
            );

        Some(
            div()
                .id("fw-backdrop")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, window, cx| this.close_forward(window, cx)))
                .child(
                    div()
                        .id("fw-card")
                        .w(px(480.))
                        .p(px(20.))
                        .rounded(px(16.))
                        .bg(rgb(0x1e1b2e))
                        .border_1()
                        .border_color(rgba(0xffffff1a))
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(20.)), blur_radius: px(40.), spread_radius: px(0.) }])
                        .text_color(rgb(0xe8e3f5))
                        .flex()
                        .flex_col()
                        .gap(px(14.))
                        .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .child(header)
                        .child(preview)
                        .child(search)
                        .child(list)
                        .child(comment)
                        .child(footer),
                )
                .into_any_element(),
        )
    }

    /// ForwardedMessageCard: the sender's comment, then the card with where it came from, who wrote
    /// it and when, and what they wrote.
    pub(super) fn render_forwarded(&self, message: &Message, text_width: gpui::Pixels, window: &mut Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let data = message.payload.as_ref()?.get("forwardedFrom").filter(|v| v.is_object())?;
        let field = |k: &str| data.get(k).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let lavender: Hsla = Theme::lavender().into();
        let comment = message.text.trim();
        let (server, channel) = (field("serverName"), field("channelName"));
        let origin = (!server.is_empty() || !channel.is_empty()).then(|| {
            format!("from {}#{}", if server.is_empty() { String::new() } else { format!("{server} · ") }, if channel.is_empty() { "chat".into() } else { channel })
        });
        let body = |id: &str, text: &str, size: f32, line: f32, color: Hsla, width: gpui::Pixels, window: &mut Window, cx: &mut Context<Self>| {
            let (font, fsize) = crate::rich::ui_font(size);
            let weak = cx.weak_entity();
            let on_channel: std::rc::Rc<dyn Fn(String, &mut gpui::App)> = std::rc::Rc::new(move |id, cx| {
                weak.update(cx, |this, cx| this.open_channel(id, cx)).ok();
            });
            let wrap = crate::rich::Wrap { on_channel: Some(on_channel), window, width, font, size: fsize };
            div()
                .text_size(px(size))
                .line_height(px(line))
                .text_color(color)
                .child(crate::rich::message_body(id, text, &self.me.username, true, std::rc::Rc::new(|_| {}), Some(&wrap)))
        };
        let mut card = div()
            .flex()
            .flex_col()
            .gap(px(6.))
            .pt(px(8.))
            .pb(px(10.))
            .pl(px(12.))
            .pr(px(12.))
            .rounded_tl(px(4.))
            .rounded_bl(px(4.))
            .rounded_tr(px(10.))
            .rounded_br(px(10.))
            .bg(lavender.opacity(0.05))
            .border_1()
            .border_color(lavender.opacity(0.12))
            .relative()
            .child(div().absolute().left(px(-1.)).top(px(-1.)).bottom(px(-1.)).w(px(3.)).rounded_l(px(4.)).bg(lavender))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .text_color(lavender)
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(ui::icon("forward", 13., lavender))
                    .child(div().text_size(px(10.)).font_weight(FontWeight::BOLD).child("FORWARDED"))
                    .when_some(origin, |d, o| d.child(div().ml(px(2.)).font_weight(FontWeight::MEDIUM).text_color(Theme::muted()).child(o))),
            );
        let created = field("createdAt");
        let mut inner = div().flex().flex_col().gap(px(6.)).child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .text_size(px(12.))
                .line_height(px(18.))
                .child(ui::avatar_with(
                    data.get("avatarUrl").and_then(|v| v.as_str()).filter(|u| !u.is_empty()).map(|u| self.client.absolute(u)),
                    &field("avatar"),
                    &field("color"),
                    &field("author"),
                    20.,
                    10.,
                    FontWeight::NORMAL,
                    Theme::ink().into(),
                ))
                .child(div().font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xe5e0f3)).child(field("author")))
                .when(!created.is_empty(), |d| d.child(div().text_size(px(11.)).line_height(px(16.5)).text_color(rgb(0x8b83a7)).child(crate::model::client_time(&created)))),
        );
        let text = field("text");
        if !text.is_empty() {
            // MessageBody's paragraphs keep their own 16/24.8 and colour, with a 1px top margin.
            inner = inner.child(body(&format!("fw-{}", message.id), &text, 16., 24.8, Theme::ink().into(), text_width - px(28.), window, cx).pt(px(1.)));
        }
        let mut pictures: Vec<String> = data.get("image").and_then(|v| v.as_str()).map(|s| vec![s.to_string()]).unwrap_or_default();
        pictures.extend(data.get("images").and_then(|v| v.as_array()).into_iter().flatten().filter_map(|v| v.as_str().map(str::to_string)));
        for (n, url) in pictures.into_iter().enumerate() {
            inner = inner.child(self.render_forwarded_image(message, n, &url, window, cx));
        }
        card = card.child(inner);
        Some(
            div()
                .mt(px(4.))
                .flex()
                .flex_col()
                .gap(px(6.))
                .when(!comment.is_empty() && comment != "Forwarded a message", |d| d.child(body(&message.id, comment, 16., 24.8, Theme::ink().into(), text_width, window, cx).pt(px(1.))))
                .child(card)
                .into_any_element(),
        )
    }

    /// `.forwarded-attachment`: at most 320 wide and 220 tall, filled, 8px corners.
    fn render_forwarded_image(&self, message: &Message, n: usize, url: &str, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let link = self.client.absolute(url);
        let resource = gpui::Resource::Uri(link.clone().into());
        let (width, height) = match ui::image_size(&resource, window, cx) {
            Some((w, h)) if w > 0. && h > 0. => {
                let scale = (320. / w).min(220. / h).min(1.);
                (w * scale, h * scale)
            }
            _ => (320., 192.),
        };
        if ui::image_size(&resource, window, cx).is_some() && self.sized.borrow_mut().insert(format!("{}-fw{n}", message.id)) {
            let id = message.id.clone();
            cx.defer_in(window, move |this, _, cx| {
                this.refresh_message(&id);
                cx.notify();
            });
        }
        div()
            .id(SharedString::from(format!("fwimg-{}-{n}", message.id)))
            .w(px(width))
            .h(px(height))
            .cursor_pointer()
            .hover(|s| s.opacity(0.92))
            .child(gpui::img(ui::cover(resource, width / height.max(1.))).w(px(width)).h(px(height)).rounded(px(8.)).object_fit(gpui::ObjectFit::Cover).with_loading(|| div().into_any_element()))
            .on_click(move |_, _, cx| cx.open_url(&link))
            .into_any_element()
    }
}
