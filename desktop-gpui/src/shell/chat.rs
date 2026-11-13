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
    pub(super) fn render_chat_panel(&self, cx: &mut Context<Self>) -> impl IntoElement {
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
            .child(self.render_header(cx))
            .child(self.render_messages(cx))
            .child(self.render_composer(cx)))
    }

    fn render_header(&self, cx: &mut Context<Self>) -> impl IntoElement {
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
    }

    fn render_messages(&self, cx: &mut Context<Self>) -> AnyElement {
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
        list(self.list.clone(), cx.processor(|this, ix: usize, window, cx| this.render_message(ix, window, cx)))
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
            let display = author.map(|a| a.name().to_string()).unwrap_or_else(|| message.author.clone());
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
                            .child(display),
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
                    ),
            );
        }
        if !message.text.is_empty() {
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
                        let wrap = rich::Wrap { window, width: self.text_column_width(window), font, size };
                        rich::message_body(&message.id, &message.text, &self.me.username, revealed, on_spoiler, Some(&wrap))
                    }),
            );
            if message.edited_at.is_some() {
                body = body.child(div().text_size(px(10.)).text_color(Theme::muted()).child(t("message.edited")));
            }
        }
        if let Some(card) = self.render_card(message, window) {
            body = body.child(card);
        }
        body = body.children(self.render_attachments(message));
        if !message.reactions.is_empty() {
            let mut row = div().flex().flex_wrap().gap(px(4.)).mt(px(4.));
            for reaction in &message.reactions {
                row = row.child(
                    div()
                        .px(px(8.))
                        .h(px(24.))
                        .flex()
                        .items_center()
                        .gap(px(4.))
                        .rounded(px(12.))
                        .text_size(px(12.))
                        .bg(if reaction.mine { Theme::lavender_soft() } else { Theme::card() })
                        .border_1()
                        .border_color(if reaction.mine { Theme::lavender_muted() } else { Theme::line() })
                        .child(reaction.emoji.clone())
                        .child(div().text_color(Theme::muted()).child(reaction.count.to_string())),
                );
            }
            body = body.child(row);
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
            let picture = author.and_then(|a| a.picture()).map(str::to_string).or(message.avatar_url.clone());
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
                let glyph = author.map(|a| a.avatar.clone()).unwrap_or(message.avatar.clone());
                let color = author.map(|a| a.color.clone()).unwrap_or(message.color.clone());
                ui::avatar(picture.map(|p| self.client.absolute(&p)), &glyph, &color, &message.author, 36.)
            };
            div().flex_none().child(face).into_any_element()
        };

        // `article.message`: 1px margins; 7px padding at a group start, 1px on a continuation; a new
        // day is a 40px top margin with the label drawn in it; the list adds 36px above the first
        // message and 8px below the last.
        let last = ix + 1 == list.len();
        let pad = if continuation { 1. } else { 7. };
        let row = div()
            .w_full()
            .pl(px(ROW_LEFT))
            .pr(px(ROW_RIGHT))
            .pt(px(pad + if ix == 0 { 36. } else { 0. }))
            .pb(px(pad + if last { 8. } else { 0. }))
            .flex()
            .gap(px(13.))
            .when(mentions_me, |d| d.bg(gpui::rgba(0xa78bfa14)).border_l_2().border_color(Theme::lavender()))
            .child(gutter)
            .child(body);
        let gap = |h: f32| div().flex_none().h(px(h));
        let mut column = div().w_full().flex().flex_col();
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

    /// Width of a message's text column: 434px when the conversation card is 630px wide.
    fn text_column_width(&self, window: &gpui::Window) -> gpui::Pixels {
        let window_width = window.bounds().size.width;
        let side = px(300.) + if self.members_open { px(250.) } else { px(0.) };
        (window_width - side - px(2.) - px(ROW_LEFT) - px(ROW_RIGHT) - px(36.) - px(13.)).max(px(120.))
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
        div()
            .flex_none()
            .pt(px(8.))
            .px(px(35.4))
            .pb(px(25.))
            .child(
                div()
                    .h(px(52.))
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
                    .child(div().flex_1().min_w_0().child(self.composer.clone()))
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

    pub(super) fn member(&self, user_id: &str) -> Option<&crate::model::Member> {
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

/// "Today", "Yesterday" or the date, when a message starts a new day.
fn day_label(prev: Option<&Message>, message: &Message) -> Option<String> {
    let day = model::parse_time(&message.created_at)?.with_timezone(&chrono::Local).date_naive();
    if let Some(prev) = prev {
        let before = model::parse_time(&prev.created_at)?.with_timezone(&chrono::Local).date_naive();
        if before == day {
            return None;
        }
    }
    let today = chrono::Local::now().date_naive();
    Some(if day == today {
        t("message.today")
    } else if Some(day) == today.pred_opt() {
        t("message.yesterday")
    } else {
        day.format("%B %-d, %Y").to_string()
    })
}
