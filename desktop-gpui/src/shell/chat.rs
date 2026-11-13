//! The conversation card (`.chat-panel`): header, messages (app/components/chat/shell/message-row.tsx)
//! and the composer (`.composer`).

use std::rc::Rc;

use gpui::{AnyElement, App, Context, FontWeight, IntoElement, ObjectFit, SharedString, div, img, list, prelude::*, px};
use serde_json::Value;

use super::Shell;
use crate::model::{self, Message};
use crate::rich;
use crate::i18n::{t, tv};
use crate::theme::{DISPLAY_FONT, MONO_FONT, Theme};
use crate::ui::{self, card_shadow, icon};

/// `.messages` padding is 36px 47.2px 8px; each `article.message` adds an 8px margin and 10px
/// padding on both sides; its grid is a 36px avatar, a 13px gap, the 434px body (at 1180 wide) and
/// 14.6px to spare on the right.
const ROW_LEFT: f32 = 47.2 + 8. + 10.;
const ROW_RIGHT: f32 = 47.2 + 8. + 10. + 14.6;

impl Shell {
    pub(super) fn render_chat_panel(&self, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        // `.chat-panel` sits 10px below the window top and runs to the bottom edge.
        div().flex_1().min_w_0().h_full().pt(px(10.)).flex().flex_col().child(
        div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .rounded_t(px(16.))
            .bg(Theme::chat_bg())
            .border_1()
            .border_color(Theme::line())
            .shadow(card_shadow())
            .overflow_hidden()
            .child(self.render_header(window, cx))
            .child(self.render_messages(cx))
            .child(self.render_composer(cx)))
    }

    fn render_header(&self, window: &gpui::Window, cx: &mut Context<Self>) -> AnyElement {
        if let Some(dm) = self.channel_id.as_ref().and_then(|c| self.dm(c)) {
            return self.render_dm_header(dm.clone(), window, cx).into_any_element();
        }
        let channel = self.channel();
        let name = channel.map(|c| c.name.clone()).unwrap_or_default();
        // An empty topic shows the default line, as chat-header.tsx does.
        let topic = channel
            .map(|c| if c.topic.trim().is_empty() { tv("header.channelDefaultTopic", &[("name", &c.name)]) } else { c.topic.clone() })
            .unwrap_or_default();
        let kind_icon = channel.map(|c| c.icon()).unwrap_or("hash");
        let tools: [(&'static str, &'static str); 6] = [
            ("user-plus", "header.findUsers"),
            ("search", "header.searchMessages"),
            ("at-sign", "header.mentions"),
            ("pin", "header.pinnedMessages"),
            ("bookmark", "header.savedMessages"),
            ("award", "header.achievements"),
        ];
        let mut right = div().flex().items_center().gap(px(3.));
        for (name, title) in tools {
            right = right.child(header_button(name, title, false));
        }
        right = right.child(
            header_button("users", "header.toggleMemberList", self.members_open).on_click(cx.listener(|this, _, _, cx| {
                this.members_open = !this.members_open;
                cx.notify();
            })),
        );
        div()
            .h(px(73.))
            .flex_none()
            .pl(px(26.))
            .pr(px(17.))
            .flex()
            .items_center()
            .gap(px(11.))
            .child(icon(kind_icon, 20., Theme::quiet()))
            .child(
                div()
                    .font_family(DISPLAY_FONT)
                    .text_size(px(22.))
                    .line_height(px(22.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::ink())
                    .child(name),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .ml(px(3.))
                    .truncate()
                    .text_size(px(13.))
                    .text_color(Theme::quiet())
                    .child(topic),
            )
            .child(right)
            .into_any_element()
    }

    /// chat-header.tsx in a DM: @ (a note in your own chat), "Just you and …", keep-on-top and the
    /// two call buttons, then the narrower tool buttons.
    fn render_dm_header(&self, dm: crate::model::DmConversation, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mine = dm.user.id == self.me.id;
        let subtitle = if mine { t("header.dmNotes") } else { tv("header.dmJustYouAnd", &[("name", dm.user.name())]) };
        let labels = [t(if dm.pinned { "header.pinned" } else { "header.pin" }), t("header.startCall"), t("header.videoCall")];
        // Chrome's flexbox outcome, computed here (GPUI's layout shrinks these differently): the
        // subtitle and the three buttons share what the icon, gaps and tools leave, each shrinking in
        // proportion to its natural width, buttons no narrower than their longest word.
        let measure = |text: &str, weight: FontWeight| ui::text_width(window, text, weight, 13.);
        let chrome = 2. + 26. + 15. + 6.;
        let header_inner = self.chat_panel_width(window) - px(2.) - px(26.) - px(18.);
        let fixed = px(20. + 25. + 8. * 4. + (28. * 5. + 3. * 4.));
        let mut natural = vec![measure(&subtitle, FontWeight::NORMAL)];
        let mut least = vec![px(0.)];
        for label in &labels {
            natural.push(measure(label, FontWeight::BOLD) + px(chrome));
            let longest = label.split_whitespace().map(|w| measure(w, FontWeight::BOLD)).fold(px(0.), |a, b| a.max(b));
            least.push(longest + px(chrome));
        }
        let widths = if mine { natural.clone() } else { ui::css_shrink(&natural, &least, header_inner - fixed) };
        let call_button = |id: &'static str, glyph: &'static str, label: String, width: gpui::Pixels| {
            div()
                .id(id)
                .flex_none()
                .w(width)
                .px(px(13.))
                .py(px(7.))
                .rounded(px(10.))
                .bg(gpui::rgba(0x1a1628d1))
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .gap(px(6.))
                .cursor_pointer()
                .hover(|s| s.bg(Theme::lavender_soft()))
                .text_size(px(13.))
                .line_height(px(19.5))
                .font_weight(FontWeight::BOLD)
                .text_color(Theme::ink())
                .child(icon(glyph, 15., Theme::ink()))
                .child(div().min_w_0().child(label))
        };
        let mut right = div().flex().items_center().gap(px(3.));
        for (name, title) in [("at-sign", "header.mentions"), ("pin", "header.pinnedMessages"), ("bookmark", "header.savedMessages"), ("award", "header.achievements")] {
            right = right.child(header_button(name, title, false).w(px(28.)));
        }
        right = right.child(
            header_button("users", "header.toggleMemberList", self.members_open).w(px(28.)).on_click(cx.listener(|this, _, _, cx| {
                this.members_open = !this.members_open;
                cx.notify();
            })),
        );
        div()
            .h(px(73.))
            .flex_none()
            .pl(px(26.))
            .pr(px(18.))
            .flex()
            .items_center()
            .gap(px(8.))
            .child(icon(if mine { "sticky-note" } else { "at-sign" }, 20., gpui::rgb(0xa39fa7)))
            // The subtitle's box shrinks but its text does not wrap: like the web, the buttons may
            // overlap its end rather than cut it.
            .child(div().flex_none().w(widths[0]).ml(px(17.)).whitespace_nowrap().text_size(px(13.)).text_color(Theme::quiet()).child(subtitle))
            .child(div().flex_1())
            .when(!mine, |d| {
                let [pin, call, video] = labels.clone();
                d.child(call_button("dm-pin", "arrow-up-to-line", pin, widths[1]).tooltip(ui::tooltip(t("header.pinConversation"))))
                    .child(call_button("dm-call", "phone-call", call, widths[2]).tooltip(ui::tooltip(t("header.startVoiceCall"))))
                    .child(call_button("dm-video", "video", video, widths[3]).tooltip(ui::tooltip(t("header.startVideoCall"))))
            })
            .child(right.flex_none())
    }

    fn render_messages(&self, cx: &mut Context<Self>) -> AnyElement {
        crate::markdown::set_channels(
            self.server()
                .map(|s| s.channels.iter().map(|c| (c.name.clone(), c.id.clone())).collect::<Vec<_>>())
                .unwrap_or_default(),
        );
        let loading = self.channel_id.as_ref().is_some_and(|c| self.loading.contains(c) && !self.messages.contains_key(c));
        if loading {
            return div()
                .flex_1()
                .flex()
                .items_center()
                .justify_center()
                .text_color(Theme::muted())
                .child("Loading messages…")
                .into_any_element();
        }
        list(self.list.current(), cx.processor(|this, ix: usize, window, cx| this.render_message(ix, window, cx)))
            .flex_1()
            .into_any_element()
    }

    fn render_message(&mut self, ix: usize, window: &mut gpui::Window, cx: &mut Context<Self>) -> AnyElement {
        let Some(list) = self.channel_id.as_ref().and_then(|c| self.messages.get(c)) else {
            return div().into_any_element();
        };
        let Some(message) = list.get(ix) else { return div().into_any_element() };
        let prev = ix.checked_sub(1).and_then(|i| list.get(i));
        let day = day_label(prev, message);
        let continuation = day.is_none() && prev.is_some_and(|p| continues(p, message));
        let mentions_me = super::mentions(&message.text, &self.me.username);
        let author = message.user_id.as_ref().and_then(|id| self.member(id));
        // In a DM the author is one of its two people: their current name and picture.
        let dm_author = message.user_id.as_ref().and_then(|id| {
            let dm = self.channel_id.as_ref().and_then(|c| self.dm(c))?;
            if *id == dm.user.id { Some(dm.user.clone()) } else if *id == self.me.id { Some(self.me.clone()) } else { None }
        });

        let mut body = div().flex_1().min_w_0().flex().flex_col();
        if let Some(command) = &message.command_text {
            // `.command-invocation`: 18px line plus 2px under it.
            body = body.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .pb(px(2.))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .text_color(Theme::muted())
                    .child(div().text_color(Theme::lavender()).child("↩"))
                    .child(div().font_weight(FontWeight::MEDIUM).child(message.command_by.clone().unwrap_or_else(|| t("message.someone"))))
                    .child(t("message.commandUsed"))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .rounded(px(5.))
                            .font_family(MONO_FONT)
                            .text_size(px(11.5))
                            .line_height(px(17.25))
                            .child(command.clone()),
                    ),
            );
        }
        if let Some(reply) = &message.reply_preview {
            body = body.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .text_color(Theme::muted())
                    .child(div().text_color(Theme::lavender()).child("↩"))
                    .child(div().font_weight(FontWeight::MEDIUM).child(reply.author.clone()))
                    .child(div().min_w_0().truncate().child(reply.text.clone())),
            );
        }
        if !continuation {
            let display = author
                .map(|a| a.name().to_string())
                .or(dm_author.as_ref().map(|u| u.name().to_string()))
                .unwrap_or_else(|| message.author.clone());
            body = body.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(
                        div()
                            .text_size(px(16.))
                            .line_height(px(24.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(Theme::ink())
                            .child({
                                let style = message.user_id.as_ref().and_then(|id| self.name_style(id));
                                crate::names::styled_name(&display, style.as_ref(), 16., FontWeight::BOLD, Theme::ink().into(), window, cx)
                            }),
                    )
                    .when(message.bot, |d| {
                        d.child(
                            div()
                                .px(px(5.))
                                .py(px(3.))
                                .rounded(px(4.))
                                .bg(Theme::lavender_soft())
                                .text_color(Theme::lavender_light())
                                .text_size(px(8.))
                                .line_height(px(12.))
                                .font_weight(FontWeight::BLACK)
                                .child("BOT"),
                        )
                    })
                    .child(
                        div()
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .text_color(Theme::muted())
                            .child(model::client_time(&message.created_at)),
                    )
                    // `.edited-tag`, beside the time.
                    .when(message.edited_at.is_some(), |d| {
                        d.child(div().text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child(t("message.edited")))
                    }),
            );
        }
        let editing = self.editing.as_ref().filter(|(id, _, _)| *id == message.id).map(|(_, editor, _)| editor.clone());
        if let Some(editor) = editing {
            // message-parts.tsx: the text in a textarea in its place, and the hint under it.
            body = body.child(
                div()
                    .mt(px(1.))
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(10.))
                    .bg(Theme::paper())
                    .border_1()
                    .border_color(Theme::line())
                    // The focus ring: `box-shadow: 0 0 0 3px` lavender at 32%.
                    .shadow(vec![gpui::BoxShadow { color: gpui::Hsla::from(Theme::lavender()).opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }])
                    .child(editor),
            );
            body = body.child(div().mt(px(3.)).text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child("Enter to save · Esc to cancel"));
        } else if !message.text.is_empty() {
            let revealed = self.revealed.contains(&message.id);
            let weak = cx.weak_entity();
            let id = message.id.clone();
            let on_spoiler: Rc<dyn Fn(&mut App)> = Rc::new(move |cx| {
                weak.update(cx, |this, cx| this.reveal(id.clone(), cx)).ok();
            });
            // Message paragraphs have a 1px top margin.
            body = body.child(
                div()
                    .pt(px(1.))
                    .text_size(px(16.))
                    .line_height(px(24.8))
                    .text_color(Theme::ink())
                    .child({
                        let (font, size) = rich::ui_font(16.);
                        let weak = cx.weak_entity();
                        let on_channel: Rc<dyn Fn(String, &mut App)> = Rc::new(move |id, cx| {
                            weak.update(cx, |this, cx| this.open_channel(id, cx)).ok();
                        });
                        let wrap = rich::Wrap { on_channel: Some(on_channel), window, width: self.text_column_width(window), font, size };
                        rich::message_body(&message.id, &message.text, &self.me.username, revealed, on_spoiler, Some(&wrap))
                    }),
            );
            if message.edited_at.is_some() && continuation {
                body = body.child(div().text_size(px(11.)).text_color(Theme::muted()).child(t("message.edited")));
            }
        }
        if let Some(card) = self.render_card(message, window) {
            body = body.child(card);
        }
        body = body.children(self.render_attachments(message));
        if !message.reactions.is_empty() {
            body = body.child(self.render_reactions(message, cx));
        }
        if let Some(count) = message.thread_count.filter(|c| *c > 0) {
            body = body.child(
                div()
                    .mt(px(4.))
                    .text_size(px(12.))
                    .text_color(Theme::lavender())
                    .child(format!("{count} {} in thread", if count == 1 { "reply" } else { "replies" })),
            );
        }

        let gutter: AnyElement = if continuation {
            div().w(px(36.)).flex_none().into_any_element()
        } else {
            let picture = author
                .and_then(|a| a.picture())
                .map(str::to_string)
                .or(dm_author.as_ref().and_then(|u| u.avatar_url.clone()))
                .or(message.avatar_url.clone());
            let face = if message.bot {
                // `.bot-avatar`: the bot's glyph on the soft accent, light accent text.
                div()
                    .size(px(36.))
                    .flex_none()
                    .rounded_full()
                    .bg(Theme::lavender_soft())
                    .text_color(Theme::lavender_light())
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(13.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .child(message.avatar.clone())
                    .into_any_element()
            } else {
                let glyph = author.map(|a| a.avatar.clone()).or(dm_author.as_ref().map(|u| u.avatar.clone())).unwrap_or(message.avatar.clone());
                let color = author.map(|a| a.color.clone()).or(dm_author.as_ref().map(|u| u.color.clone())).unwrap_or(message.color.clone());
                let frame = message.user_id.as_ref().map(|id| self.avatar_frame(id)).unwrap_or_default();
                crate::cosmetics::decorate(ui::avatar(picture.map(|p| self.client.absolute(&p)), &glyph, &color, &message.author, 36.), &frame, 36.)
            };
            div().flex_none().child(face).into_any_element()
        };

        // `article.message`: 1px margins; 7px padding at a group start, 1px on a continuation; a new
        // day is a 40px top margin with the label drawn in it; the list adds 36px above the first
        // message and 8px below the last.
        let last = ix + 1 == list.len();
        let pad = if continuation { 1. } else { 7. };
        // The list's padding and the article's margin sit outside the card that lights up on hover.
        let group = SharedString::from(format!("msg-{}", message.id));
        // Development: HOFFLE_DEV_HOVER=1 draws the last message as hovered (screenshots get no mouse).
        let forced = last && std::env::var_os("HOFFLE_DEV_HOVER").is_some();
        let article = div()
            .id(group.clone())
            .group(group.clone())
            .relative()
            .w_full()
            .px(px(10.))
            .py(px(pad))
            .rounded(px(14.))
            .flex()
            .gap(px(13.))
            .hover(|s| s.bg(Theme::card()))
            .when(forced, |d| d.bg(Theme::card()))
            .when(mentions_me, |d| d.bg(gpui::rgba(0xa78bfa14)).border_l_2().border_color(Theme::lavender()))
            .child(gutter)
            .child(body)
            .child(div().flex_none().w(px(ROW_RIGHT - 47.2 - 8. - 10.)))
            .child(self.render_actions(message, &group, forced, cx));
        let row = div()
            .w_full()
            .pl(px(ROW_LEFT - 10.))
            .pr(px(47.2 + 8.))
            .pt(px(if ix == 0 && self.channel_id.as_ref().is_none_or(|c| self.has_more.get(c).copied().unwrap_or(true)) { 36. } else { 0. }))
            .pb(px(if last { 8. } else { 0. }))
            .child(article);
        let gap = |h: f32| div().flex_none().h(px(h));
        let mut column = div().w_full().flex().flex_col();
        let channel_id = self.channel_id.clone().unwrap_or_default();
        if ix == 0 && !self.has_more.get(&channel_id).copied().unwrap_or(true) {
            column = column.child(self.render_intro(&channel_id));
        }
        if self.new_from.get(&channel_id).is_some_and(|&n| n > 0 && ix + n == list.len()) {
            column = column.child(new_divider());
        }
        if let Some(label) = day {
            column = column.child(
                div()
                    .h(px(40.))
                    .pl(px(ROW_LEFT))
                    .pr(px(ROW_RIGHT))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(div().flex_1().h(px(1.)).bg(Theme::line()))
                    .child(div().text_size(px(11.)).font_weight(FontWeight::BOLD).text_color(Theme::muted()).child(label))
                    .child(div().flex_1().h(px(1.)).bg(Theme::line())),
            );
        } else {
            column = column.child(gap(1.));
        }
        column.child(row).child(gap(1.)).into_any_element()
    }

    /// `.message-actions`: floats over the top-right of a hovered message — quick reactions, this
    /// server's own emoji (up to four), add reaction, reply, and edit on your own messages.
    fn render_actions(&self, message: &Message, group: &SharedString, forced: bool, cx: &mut Context<Self>) -> impl IntoElement {
        let quick: Vec<String> = if self.me.quick_reactions.is_empty() {
            ["👍", "❤️", "😂"].iter().map(|s| s.to_string()).collect()
        } else {
            self.me.quick_reactions.clone()
        };
        // `.message-actions button`; quick reactions use the softer `.quick-react-outline-btn` hover.
        let button = |id: String, quick: bool| {
            div()
                .id(SharedString::from(id))
                .px(px(6.))
                .py(px(4.))
                .rounded(px(if quick { 6. } else { 8. }))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_color(Theme::muted())
                .when(quick, |d| d.hover(|s| s.bg(gpui::rgba(0xffffff14))))
                .when(!quick, |d| d.hover(|s| s.bg(gpui::rgba(0x5865f233)).text_color(gpui::rgb(0xc9cdfb))))
        };
        let mut bar = div()
            .absolute()
            .top(px(-25.))
            .right(px(24.))
            .p(px(2.))
            .gap(px(2.))
            .flex()
            .items_center()
            .rounded(px(10.))
            .bg(Theme::panel())
            .border_1()
            .border_color(gpui::rgba(0xa78bfa33))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(4.)), blur_radius: px(16.), spread_radius: px(0.) }])
            .when(!forced, |d| d.invisible())
            .group_hover(group.clone(), |s| s.visible());
        for emoji in quick {
            let (id, e) = (message.id.clone(), emoji.clone());
            bar = bar.child(
                button(format!("qr-{}-{emoji}", message.id), true)
                    .tooltip(ui::tooltip(format!("React {emoji} · Shift-click to remove")))
                    .child(ui::outline_emoji(&emoji, 14.))
                    .on_click(cx.listener(move |this, _, _, cx| this.toggle_reaction(id.clone(), e.clone(), cx))),
            );
        }
        if !self.home
            && let Some(list) = self.server_id.as_ref().and_then(|s| self.emojis.get(s))
        {
            for emoji in list.iter().take(4) {
                let (id, code) = (message.id.clone(), format!(":{}:", emoji.name));
                bar = bar.child(
                    button(format!("ce-{}-{}", message.id, emoji.id), false)
                        .tooltip(ui::tooltip(format!("React {code} · Shift-click to remove")))
                        .child(gpui::img(self.client.absolute(&emoji.url)).size(px(18.)).object_fit(ObjectFit::Contain))
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_reaction(id.clone(), code.clone(), cx))),
                );
            }
        }
        bar = bar.child(button(format!("add-{}", message.id), false).tooltip(ui::tooltip(t("message.addReaction"))).child(icon("smile-plus", 16., Theme::muted())));
        let (id, author) = (message.id.clone(), message.author.clone());
        bar = bar.child(
            button(format!("reply-{}", message.id), false)
                .tooltip(ui::tooltip(t("message.reply")))
                .child(icon("reply", 16., Theme::muted()))
                .on_click(cx.listener(move |this, _, window, cx| this.start_reply(id.clone(), author.clone(), window, cx))),
        );
        let mine = message.user_id.as_deref() == Some(self.me.id.as_str());
        if mine && !message.bot {
            let (id, text) = (message.id.clone(), message.text.clone());
            bar = bar.child(
                button(format!("edit-{}", message.id), false)
                    .tooltip(ui::tooltip(t("message.edit")))
                    .child(icon("pencil", 16., Theme::muted()))
                    .on_click(cx.listener(move |this, _, window, cx| this.start_edit(id.clone(), text.clone(), window, cx))),
            );
        }
        if mine || message.sender_id.as_deref() == Some(self.me.id.as_str()) {
            let id = message.id.clone();
            bar = bar.child(
                button(format!("delete-{}", message.id), false)
                    .tooltip(ui::tooltip(t("message.delete")))
                    .child(icon("trash-2", 16., Theme::muted()))
                    .on_click(cx.listener(move |this, event: &gpui::ClickEvent, _, cx| {
                        if event.modifiers().shift {
                            this.delete_message(id.clone(), cx);
                        } else {
                            this.confirm_delete = Some(id.clone());
                            cx.notify();
                        }
                    })),
            );
        }
        bar
    }

    /// MessageReactions: one pill per emoji (yours lit), then the add button.
    fn render_reactions(&self, message: &Message, cx: &mut Context<Self>) -> impl IntoElement {
        let custom = |name: &str| {
            let name = name.trim_matches(':');
            self.server_id.as_ref().and_then(|s| self.emojis.get(s)).and_then(|l| l.iter().find(|e| e.name == name)).map(|e| self.client.absolute(&e.url))
        };
        let mut row = div().flex().flex_wrap().gap(px(5.)).mt(px(6.));
        for reaction in &message.reactions {
            let (id, e) = (message.id.clone(), reaction.emoji.clone());
            let lavender: gpui::Hsla = Theme::lavender().into();
            row = row.child(
                div()
                    .id(SharedString::from(format!("rx-{}-{}", message.id, reaction.emoji)))
                    .px(px(8.))
                    .py(px(2.))
                    .rounded(px(6.))
                    .border_1()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .text_size(px(13.))
                    .line_height(px(18.2))
                    .cursor_pointer()
                    .when(reaction.mine, |d| {
                        d.border_color(lavender.opacity(0.7)).bg(lavender.opacity(0.18)).shadow(vec![gpui::BoxShadow {
                            color: lavender.opacity(0.25),
                            offset: gpui::point(px(0.), px(0.)),
                            blur_radius: px(8.),
                            spread_radius: px(0.),
                        }])
                    })
                    .when(!reaction.mine, |d| d.border_color(Theme::line()).bg(Theme::panel()).hover(|s| s.bg(gpui::rgb(0x251f3b)).border_color(gpui::rgb(0x3b3259))))
                    .child(match custom(&reaction.emoji) {
                        Some(url) => gpui::img(url).size(px(16.)).object_fit(ObjectFit::Contain).into_any_element(),
                        None => ui::outline_emoji(&reaction.emoji, 14.),
                    })
                    .child(
                        div()
                            .text_size(px(12.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(if reaction.mine { gpui::white().into() } else { gpui::Hsla::from(Theme::muted()) })
                            .child(reaction.count.to_string()),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| this.toggle_reaction(id.clone(), e.clone(), cx))),
            );
        }
        row.child(
            div()
                .id(SharedString::from(format!("rx-add-{}", message.id)))
                .px(px(8.))
                .py(px(2.))
                .rounded(px(6.))
                .border_1()
                .border_color(Theme::line())
                .bg(Theme::panel())
                .flex()
                .items_center()
                .cursor_pointer()
                .tooltip(ui::tooltip("Add reaction · Shift-click to add to quick reactions"))
                .child(icon("smile-plus", 14., Theme::muted())),
        )
    }

    /// `.channel-intro`: Hoffy waving, then the pill that says where the conversation begins.
    fn render_intro(&self, channel_id: &str) -> impl IntoElement {
        let (glyph, text) = match self.dm(channel_id) {
            Some(dm) if dm.user.id == self.me.id => ("sticky-note", "This is your personal space for notes, drafts, and reminders.".to_string()),
            Some(dm) => ("at-sign", format!("This is the beginning of your conversation with {}", dm.user.name())),
            None => {
                let channel = self.channel();
                let name = channel.map(|c| c.name.clone()).unwrap_or_default();
                let topic = channel.map(|c| c.topic.clone()).unwrap_or_default();
                ("hash", if topic.is_empty() { format!("Welcome to #{name}") } else { format!("Welcome to #{name} — {topic}") })
            }
        };
        // Measured: Hoffy's top is 40px under the list's top, the first day line 12px under the pill.
        div()
            .pl(px(ROW_LEFT - 24.))
            .flex()
            .flex_col()
            .items_start()
            .child(div().flex_none().h(px(40.)))
            // A sized box, so the row's height is right before the picture has loaded.
            .child(div().flex_none().size(px(64.)).child(gpui::img("images/hoffy-happy-wave.svg").size(px(64.))))
            .child(div().h(px(5.)))
            .child(
                div()
                    .ml(px(6.))
                    .px(px(16.))
                    .py(px(8.))
                    .rounded(px(16.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(gpui::rgba(0xa78bfa1f))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(icon(glyph, 13., Theme::lavender()))
                    .child(div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::ink()).child(text)),
            )
            // The first day line follows 26px under the pill (it is not centred in its 40px there).
            .child(div().flex_none().h(px(6.)))
    }

    /// The conversation card's outer width: the window less the rail and sidebar, and less the
    /// members panel when it shows.
    fn chat_panel_width(&self, window: &gpui::Window) -> gpui::Pixels {
        let members = self.members_open && (!self.home || self.channel_id.is_some());
        window.bounds().size.width - px(300.) - if members { px(250.) } else { px(10.) }
    }

    /// Width of a message's text column: 434px when the conversation card is 630px wide.
    fn text_column_width(&self, window: &gpui::Window) -> gpui::Pixels {
        (self.chat_panel_width(window) - px(2.) - px(ROW_LEFT) - px(ROW_RIGHT) - px(36.) - px(13.)).max(px(120.))
    }

    /// Rich cards by message kind. Only the now-playing card is native so far.
    fn render_card(&self, message: &Message, window: &gpui::Window) -> Option<AnyElement> {
        match message.kind.as_deref()? {
            "nowplaying" => {
                let payload = message.payload.as_ref();
                let label = payload.and_then(|p| p.get("label")).and_then(Value::as_str).unwrap_or("").to_string();
                let track = payload.and_then(|p| p.get("trackId")).and_then(Value::as_str);
                let room = payload.and_then(|p| p.get("voiceChannelId")).and_then(Value::as_str);
                let playing = room
                    .and_then(|r| self.players.get(r))
                    .and_then(|p| p.pointer("/track/id"))
                    .and_then(Value::as_str)
                    .is_some_and(|id| Some(id) == track);
                // now-playing.tsx: a card for a track that is over says whether the room moved on.
                let room_has_track = room.and_then(|r| self.players.get(r)).and_then(|p| p.get("track")).is_some_and(|t| !t.is_null());
                let finished = if room_has_track { "Finished — the room has moved on." } else { "Finished." };
                let (title, sub) = if playing {
                    (label, "Playing now in the voice room.".to_string())
                } else if label.is_empty() {
                    ("That track finished.".to_string(), finished.to_string())
                } else {
                    (label, finished.to_string())
                };
                Some(
                    div()
                        .mt(px(8.))
                        .p(px(14.))
                        .rounded(px(16.))
                        .bg(gpui::rgba(0xffffff0a))
                        .border_1()
                        .border_color(gpui::rgba(0xffffff1f))
                        .flex()
                        .flex_col()
                        .child(
                            div()
                                .whitespace_nowrap()
                                .overflow_hidden()
                                .text_size(px(13.))
                                .line_height(px(19.5))
                                .font_weight(FontWeight::BOLD)
                                .text_color(Theme::muted())
                                .child(ui::fit(window, &title, FontWeight::BOLD, 13., self.text_column_width(window) - px(30.))),
                        )
                        .child(div().text_size(px(16.)).line_height(px(24.8)).text_color(Theme::ink()).child(sub))
                        .into_any_element(),
                )
            }
            _ => None,
        }
    }

    fn render_attachments(&self, message: &Message) -> Vec<AnyElement> {
        let mut out = Vec::new();
        for (n, url) in message.image.iter().chain(message.images.iter()).enumerate() {
            let link = self.client.absolute(url);
            let open = link.clone();
            out.push(
                div()
                    .id(SharedString::from(format!("img-{}-{n}", message.id)))
                    .mt(px(6.))
                    .w(px(360.))
                    .h(px(240.))
                    .rounded(px(12.))
                    .overflow_hidden()
                    .bg(Theme::card())
                    .cursor_pointer()
                    .child(
                        img(link)
                            .size_full()
                            .object_fit(ObjectFit::Contain)
                            .with_loading(|| div().size_full().into_any_element())
                            .with_fallback(|| {
                                div()
                                    .size_full()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .text_color(Theme::muted())
                                    .child("Image could not be shown")
                                    .into_any_element()
                            }),
                    )
                    .on_click(move |_, _, cx| cx.open_url(&open))
                    .into_any_element(),
            );
        }
        for (n, file) in message.files.iter().enumerate() {
            let link = self.client.absolute(&file.url);
            out.push(
                div()
                    .id(SharedString::from(format!("file-{}-{n}", message.id)))
                    .mt(px(6.))
                    .px(px(12.))
                    .py(px(8.))
                    .rounded(px(12.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(Theme::line())
                    .text_size(px(13.))
                    .text_color(Theme::ink())
                    .cursor_pointer()
                    .hover(|s| s.border_color(Theme::lavender_muted()))
                    .child(format!("📎 {}", file.name))
                    .on_click(move |_, _, cx| cx.open_url(&link))
                    .into_any_element(),
            );
        }
        out
    }

    fn render_composer(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let typing = self
            .channel_id
            .as_ref()
            .and_then(|c| self.typing.get(c))
            .filter(|l| !l.is_empty())
            .map(|l| match l.as_slice() {
                [one] => format!("{} is typing…", one.1),
                [a, b] => format!("{} and {} are typing…", a.1, b.1),
                _ => "Several people are typing…".to_string(),
            });
        let note = typing.or(self.status.as_ref().map(|s| s.to_string())).unwrap_or_default();
        let empty = self.composer.read(cx).is_empty();
        let small = |name: &'static str, title: String| {
            div()
                .id(name)
                .size(px(28.))
                .rounded(px(8.))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.bg(Theme::hover()))
                .tooltip(ui::tooltip(title))
                .child(icon(name, 18., Theme::quiet()))
        };
        let reply_bar = self.reply_to.as_ref().map(|(_, author)| {
            div()
                .mb(px(6.))
                .px(px(12.))
                .py(px(6.))
                .rounded(px(10.))
                .bg(Theme::lavender_soft())
                .flex()
                .items_center()
                .justify_between()
                .text_size(px(13.))
                .line_height(px(24.))
                .text_color(Theme::ink())
                .child(format!("Replying to {author}"))
                .child(
                    div()
                        .id("cancel-reply")
                        .px(px(4.))
                        .cursor_pointer()
                        .text_color(Theme::muted())
                        .hover(|s| s.text_color(Theme::ink()))
                        .tooltip(ui::tooltip(t("composer.cancelReply")))
                        .child("×")
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.reply_to = None;
                            cx.notify();
                        })),
                )
        });
        div()
            .flex_none()
            .pt(px(8.))
            .px(px(35.4))
            .pb(px(25.))
            .children(reply_bar)
            .child(
                div()
                    .min_h(px(52.))
                    .pl(px(7.))
                    .pr(px(6.))
                    .py(px(5.))
                    .rounded(px(16.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(gpui::rgba(0xa78bfa24))
                    .shadow(vec![gpui::BoxShadow {
                        color: gpui::hsla(0., 0., 0., 0.28),
                        offset: gpui::point(px(0.), px(4.)),
                        blur_radius: px(20.),
                        spread_radius: px(0.),
                    }])
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(
                        div()
                            .id("attach")
                            .size(px(34.))
                            .flex_none()
                            .rounded(px(10.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(20.))
                            .text_color(Theme::quiet())
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::hover()).text_color(Theme::ink()))
                            .tooltip(ui::tooltip(t("composer.attachFiles")))
                            .child("+"),
                    )
                    // The textarea: 9px 10px padding, growing to 40% of the window.
                    .child(div().flex_1().min_w_0().px(px(10.)).py(px(9.)).child(self.composer.clone()))
                    .child(small("chevron-up", t("composer.moreTools")))
                    .child(small("smile", t("composer.openEmojiPicker")))
                    .child(
                        div()
                            .id("gif")
                            .w(px(28.))
                            .h(px(27.))
                            .px(px(7.))
                            .rounded(px(10.))
                            .bg(Theme::lavender_soft())
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(9.))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(Theme::lavender())
                            .cursor_pointer()
                            .tooltip(ui::tooltip("GIFs"))
                            .child("GIF"),
                    )
                    .child(
                        div()
                            .id("send")
                            .size(px(32.))
                            .rounded(px(12.))
                            .bg(Theme::send())
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.9))
                            .tooltip(ui::tooltip(if empty { "Record a voice message".to_string() } else { t("composer.sendMessage") }))
                            .child(icon(if empty { "mic" } else { "send" }, 16., gpui::white()))
                            .on_click(cx.listener(|this, _, _, cx| this.send_composer(cx))),
                    ),
            )
            .child(
                div()
                    .h(px(0.))
                    .relative()
                    .child(
                        div()
                            .absolute()
                            .top(px(2.))
                            .left(px(10.))
                            .text_size(px(11.))
                            .line_height(px(14.))
                            .text_color(Theme::muted())
                            .child(note),
                    ),
            )
    }

    /// Who wrote a message, as this server knows them (nickname, server avatar). In DMs there is no
    /// server, so messages show the account's own name.
    pub(super) fn member(&self, user_id: &str) -> Option<&crate::model::Member> {
        if self.home {
            return None;
        }
        let server = self.server_id.as_ref()?;
        self.members.get(server)?.iter().find(|m| m.id == user_id)
    }
}

fn header_button(name: &'static str, title: &'static str, active: bool) -> gpui::Stateful<gpui::Div> {
    div()
        .id(name)
        .size(px(34.))
        .rounded(px(10.))
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .when(active, |d| d.bg(Theme::lavender_soft()))
        .hover(|s| s.bg(Theme::hover()))
        .tooltip(ui::tooltip(t(title)))
        .child(icon(name, 18., if active { Theme::lavender() } else { Theme::quiet() }))
}

/// message-row.tsx: same author (or same bot), under 7 minutes apart, not a reply, no rich card, and
/// a command answer only groups when it comes from a bot.
fn continues(prev: &Message, next: &Message) -> bool {
    let same_author = prev.bot == next.bot
        && if next.bot { prev.author == next.author } else { prev.user_id.is_some() && prev.user_id == next.user_id };
    let close = match (model::parse_time(&prev.created_at), model::parse_time(&next.created_at)) {
        (Some(a), Some(b)) => (b - a).num_milliseconds() < 7 * 60 * 1000,
        _ => true,
    };
    let plain = |m: &Message| m.kind.as_deref().is_none_or(|k| k == "voice");
    same_author && close && next.reply_preview.is_none() && (next.command_text.is_none() || next.bot) && plain(next) && plain(prev)
}

/// dayDividerLabel() in app/lib/chat/format.ts: nothing within a day; the first message loaded gets a
/// line only when it is not from today; "Today" and "Yesterday" in English (the web does not translate
/// them); otherwise the browser locale's long date, with the year only for other years.
fn day_label(prev: Option<&Message>, message: &Message) -> Option<String> {
    let when = model::parse_time(&message.created_at)?.with_timezone(&chrono::Local);
    let day = when.date_naive();
    let today = chrono::Local::now().date_naive();
    match prev {
        Some(prev) => {
            let before = model::parse_time(&prev.created_at)?.with_timezone(&chrono::Local).date_naive();
            if before == day {
                return None;
            }
        }
        None if day == today => return None,
        None => {}
    }
    Some(if day == today {
        "Today".into()
    } else if Some(day) == today.pred_opt() {
        "Yesterday".into()
    } else {
        model::long_date(&when, chrono::Datelike::year(&day) != chrono::Datelike::year(&today))
    })
}

/// `.unread-divider`: a rose line with the "New" badge at its right end.
fn new_divider() -> impl IntoElement {
    let rose = gpui::rgb(0xf43f5e);
    div()
        .h(px(24.))
        .pl(px(ROW_LEFT - 2.))
        .pr(px(ROW_RIGHT - 2.))
        .relative()
        .flex()
        .items_center()
        .child(div().flex_1().h(px(1.)).bg(rose))
        .child(
            div()
                .absolute()
                .right(px(ROW_RIGHT - 2.))
                .top(px(4.))
                .px(px(6.4))
                .h(px(16.))
                .rounded(px(4.))
                .bg(rose)
                .flex()
                .items_center()
                .text_size(px(10.4))
                .font_weight(FontWeight::BOLD)
                .text_color(gpui::white())
                .child("NEW"),
        )
}
