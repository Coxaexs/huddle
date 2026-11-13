//! The header's popovers and search (app/components/chat/shell/side-panels.tsx): pinned messages,
//! saved messages, mentions, and the search strip above the messages; and jumping to a message
//! they point at (use-shell-history.ts jumpToMessage).

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde::Deserialize;

use super::Shell;
use crate::input::{InputEvent, TextInput};
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Panel {
    Pins,
    Saved,
    Mentions,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SavedEntry {
    pub message_id: String,
    pub channel_id: String,
    pub server_id: Option<String>,
    pub channel_name: Option<String>,
    pub server_name: Option<String>,
    pub author: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MentionEntry {
    pub message: Message,
    pub channel_name: String,
    pub server_id: Option<String>,
    pub server_name: Option<String>,
    pub read: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchResult {
    pub id: String,
    pub channel_id: String,
    pub channel_name: String,
    pub author: String,
    pub snippet: String,
}

/// What the panels show; `None` while loading.
#[derive(Default)]
pub(super) struct Panels {
    pub open: Option<Panel>,
    pub pins: Vec<Message>,
    pub saved: Option<Vec<SavedEntry>>,
    pub mentions: Option<Vec<MentionEntry>>,
    pub mentions_unread_tab: bool,
    pub search: Option<(Entity<TextInput>, Subscription)>,
    pub results: Vec<SearchResult>,
    search_seq: u64,
    /// A message to scroll to once it is loaded: (channel, message, older pages fetched for it).
    pub jump: Option<(String, String, u32)>,
    /// The message flashed after a jump, and when.
    pub flash: Option<(String, std::time::Instant)>,
}

impl Shell {
    pub(super) fn toggle_panel(&mut self, panel: Panel, cx: &mut Context<Self>) {
        if self.panels.open == Some(panel) {
            self.panels.open = None;
            cx.notify();
            return;
        }
        self.panels.open = Some(panel);
        let client = self.client.clone();
        match panel {
            Panel::Pins => {
                let Some(channel) = self.channel_id.clone() else { return };
                cx.spawn(async move |this, cx| {
                    let id = channel.clone();
                    let pins = cx.background_executor().spawn(async move { client.pinned(&id) }).await.unwrap_or_default();
                    this.update(cx, |this, cx| {
                        if this.channel_id.as_deref() == Some(&channel) {
                            this.panels.pins = pins;
                            cx.notify();
                        }
                    })
                    .ok();
                })
                .detach();
            }
            Panel::Saved => {
                cx.spawn(async move |this, cx| {
                    let list = cx.background_executor().spawn(async move { client.saved_list() }).await;
                    this.update(cx, |this, cx| {
                        if let Ok(list) = list {
                            this.saved = list.iter().map(|e| e.message_id.clone()).collect();
                            this.panels.saved = Some(list);
                            cx.notify();
                        }
                    })
                    .ok();
                })
                .detach();
            }
            Panel::Mentions => {
                cx.spawn(async move |this, cx| {
                    let list = cx.background_executor().spawn(async move { client.mention_inbox() }).await;
                    this.update(cx, |this, cx| {
                        this.panels.mentions = Some(list.unwrap_or_default());
                        cx.notify();
                    })
                    .ok();
                })
                .detach();
            }
        }
        cx.notify();
    }

    pub(super) fn toggle_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.panels.search.take().is_some() {
            self.panels.results.clear();
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
            return;
        }
        let channel = self.channel().map(|c| c.name.clone()).unwrap_or_default();
        let input = cx.new(|cx| {
            TextInput::new(format!("Search #{channel}'s server…"), cx).look(crate::input::Look {
                size: 16.,
                line_height: 24.,
                height: 24.,
                color: Theme::ink().into(),
                placeholder: Hsla::from(Theme::ink()).opacity(0.5),
            })
        });
        window.focus(&gpui::Focusable::focus_handle(&input, cx));
        let sub = cx.subscribe_in(&input, window, |this, input, event, window, cx| match event {
            InputEvent::Changed => {
                let query = input.read(cx).text();
                this.run_search(query, cx);
            }
            InputEvent::Escape => this.toggle_search(window, cx),
            InputEvent::Submit => {}
        });
        self.panels.search = Some((input, sub));
        cx.notify();
    }

    pub(super) fn run_search_now(&mut self, query: String, cx: &mut Context<Self>) {
        self.run_search(query, cx);
    }

    /// runSearch: two letters at least, after a 250ms pause, answers to older queries ignored.
    fn run_search(&mut self, query: String, cx: &mut Context<Self>) {
        self.panels.search_seq += 1;
        let seq = self.panels.search_seq;
        let server = if self.home { None } else { self.server_id.clone() };
        let (Some(server), true) = (server, query.trim().chars().count() >= 2) else {
            self.panels.results.clear();
            cx.notify();
            return;
        };
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(250)).await;
            if this.update(cx, |this, _| this.panels.search_seq != seq).unwrap_or(true) {
                return;
            }
            let results = cx.background_executor().spawn(async move { client.search(&server, &query) }).await.unwrap_or_default();
            this.update(cx, |this, cx| {
                if this.panels.search_seq == seq {
                    this.panels.results = results;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// jumpToMessage: open its channel, page back until it is loaded, scroll it to the middle and
    /// flash it.
    pub(super) fn jump_to_message(&mut self, server_id: Option<String>, channel_id: String, message_id: String, window: &mut Window, cx: &mut Context<Self>) {
        self.panels.open = None;
        if self.panels.search.take().is_some() {
            self.panels.results.clear();
        }
        self.panels.jump = Some((channel_id.clone(), message_id, 0));
        if self.channel_id.as_deref() != Some(&channel_id) {
            match server_id {
                Some(server) if Some(&server) != self.server_id.as_ref() || self.home => self.open_server_channel(server, channel_id, cx),
                None if !self.home => {
                    self.open_home(cx);
                    self.open_channel(channel_id, cx);
                }
                _ => self.open_channel(channel_id, cx),
            }
        }
        let _ = window;
        self.continue_jump(cx);
    }

    /// Called whenever messages arrive: finishes a pending jump, or fetches the page before.
    pub(super) fn continue_jump(&mut self, cx: &mut Context<Self>) {
        let Some((channel, message, pages)) = self.panels.jump.clone() else { return };
        if self.channel_id.as_deref() != Some(&channel) || self.loading.contains(&channel) {
            return;
        }
        let Some(list) = self.messages.get(&channel) else { return };
        if let Some(ix) = list.iter().position(|m| m.id == message) {
            self.panels.jump = None;
            self.list.reveal_middle(ix);
            self.panels.flash = Some((message.clone(), std::time::Instant::now()));
            self.refresh_message(&message);
            // The flash fades over 2s; redraw it as it does.
            cx.spawn(async move |this, cx| {
                for _ in 0..25 {
                    cx.background_executor().timer(std::time::Duration::from_millis(80)).await;
                    if this.update(cx, |this, cx| {
                        this.refresh_message(&message);
                        cx.notify();
                    }).is_err() {
                        return;
                    }
                }
                this.update(cx, |this, cx| {
                    this.panels.flash = None;
                    this.refresh_message(&message);
                    cx.notify();
                })
                .ok();
            })
            .detach();
            cx.notify();
            return;
        }
        let more = self.has_more.get(&channel).copied().unwrap_or(false);
        if !more || pages >= 20 {
            self.panels.jump = None;
            return;
        }
        let first = list.first().map(|m| m.id.clone());
        self.panels.jump = Some((channel.clone(), message, pages + 1));
        self.fetch_messages(channel, first, cx);
    }

    /// The jump flash on a message's card: `rgba(88,101,242,.45)` fading out over 2s.
    pub(super) fn flash_color(&self, message_id: &str) -> Option<Hsla> {
        let (id, at) = self.panels.flash.as_ref()?;
        if id != message_id {
            return None;
        }
        let t = (at.elapsed().as_secs_f32() / 2.).min(1.);
        // ease-out
        let k = 1. - (1. - t) * (1. - t);
        Some(Hsla::from(rgba(0x5865f2ff)).opacity(0.45 * (1. - k)))
    }

    /// `.pins-panel`: 380 wide, 64px under the chat card's top, 36px in from its right edge.
    pub(super) fn render_panel(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let panel = self.panels.open?;
        let muted: Hsla = Theme::muted().into();
        let close = |label: &'static str| {
            div()
                .id(label)
                .size(px(30.))
                .flex_none()
                .rounded(px(8.))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.bg(rgba(0xffffff14)))
                .child(ui::icon("x", 16., rgb(0xaaaeba)))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.panels.open = None;
                    cx.notify();
                }))
        };
        let head = |title: String, close_id: &'static str| {
            div()
                .flex_none()
                .mb(px(8.))
                .h(px(30.))
                .flex()
                .items_center()
                .justify_between()
                .text_color(rgb(0xf5f3ee))
                .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).child(title))
                .child(close(close_id))
        };
        let empty = |text: &str| div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(text.to_string());
        let meta = |text: String| div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(text);
        let mut body = div().id("panel-body").flex().flex_col();
        match panel {
            Panel::Pins => {
                let title = self.channel().map(|c| c.name.clone()).unwrap_or_default();
                body = body.child(head(format!("Pinned in {title}"), "pins-close"));
                if self.panels.pins.is_empty() {
                    body = body.child(empty("Nothing pinned yet. Hover a message and press the pin."));
                }
                let can_pin = self.can_pin();
                for (n, pin) in self.panels.pins.iter().enumerate() {
                    let (channel, id) = (self.channel_id.clone().unwrap_or_default(), pin.id.clone());
                    let unpin = pin.clone();
                    body = body.child(
                        div()
                            .id(SharedString::from(format!("pin-{}", pin.id)))
                            .flex_none()
                            .mt(px(if n == 0 { 0. } else { 4. }))
                            .px(px(10.))
                            .py(px(8.))
                            .rounded(px(8.))
                            .relative()
                            .border_1()
                            .border_color(gpui::transparent_black())
                            .cursor_pointer()
                            .hover(|s| s.bg(rgba(0xffffff12)).border_color(rgba(0xffffff1a)))
                            .child(
                                div()
                                    .mb(px(4.))
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(pin.author.clone()))
                                    .when(can_pin, |d| {
                                        d.child(
                                            div()
                                                .id(SharedString::from(format!("unpin-{}", pin.id)))
                                                .px(px(6.))
                                                .py(px(2.))
                                                .rounded(px(4.))
                                                .bg(rgba(0xef44441a))
                                                .border_1()
                                                .border_color(rgba(0xef444433))
                                                .text_size(px(12.))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(rgb(0xf87171))
                                                .child("Unpin")
                                                .on_click(cx.listener(move |this, _, _, cx| {
                                                    cx.stop_propagation();
                                                    this.unpin_from_panel(unpin.clone(), cx);
                                                })),
                                        )
                                    }),
                            )
                            .child(div().mb(px(4.)).text_size(px(12.)).line_height(px(17.4)).text_color(rgb(0xd1d5db)).line_clamp(3).child(pin.text.clone()))
                            .on_click(cx.listener(move |this, _, window, cx| this.jump_to_message(None, channel.clone(), id.clone(), window, cx)))
                            // `.pin-item`'s top rule; its other sides are transparent.
                            .child(div().absolute().top(px(-1.)).left(px(-1.)).right(px(-1.)).h(px(1.)).bg(rgb(0x41434f)))
                            .relative(),
                    );
                }
            }
            Panel::Saved => {
                body = body.child(head("Saved messages".into(), "saved-close"));
                match &self.panels.saved {
                    None => body = body.child(empty("Loading…")),
                    Some(list) if list.is_empty() => {
                        body = body.child(empty("Nothing saved yet. Hover a message and press the bookmark to keep it here."))
                    }
                    Some(list) => {
                        for entry in list {
                            let place = match (&entry.server_name, &entry.channel_name) {
                                (Some(s), Some(c)) => format!("{s} · #{c}"),
                                _ => "Direct message".into(),
                            };
                            let (server, channel, id, remove) =
                                (entry.server_id.clone(), entry.channel_id.clone(), entry.message_id.clone(), entry.message_id.clone());
                            body = body.child(
                                div()
                                    .flex()
                                    .items_start()
                                    .gap(px(4.))
                                    .rounded(px(10.))
                                    .hover(|s| s.bg(Theme::lavender_soft()))
                                    .child(
                                        div()
                                            .id(SharedString::from(format!("saved-{}", entry.message_id)))
                                            .flex_1()
                                            .min_w_0()
                                            .p(px(8.))
                                            .flex()
                                            .flex_col()
                                            .cursor_pointer()
                                            .child(meta(format!("{place} · {}", date_time(&entry.created_at))))
                                            .child(div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(muted).child(entry.author.clone()))
                                            .child(div().text_size(px(14.)).line_height(px(21.)).text_color(Theme::ink()).truncate().child(entry.text.clone()))
                                            .on_click(cx.listener(move |this, _, window, cx| {
                                                this.jump_to_message(server.clone(), channel.clone(), id.clone(), window, cx)
                                            })),
                                    )
                                    .child(
                                        div()
                                            .id(SharedString::from(format!("unsave-{}", entry.message_id)))
                                            .p(px(8.))
                                            .cursor_pointer()
                                            .child(ui::icon("x", 14., muted))
                                            .on_click(cx.listener(move |this, _, _, cx| {
                                                if let Some(list) = this.panels.saved.as_mut() {
                                                    list.retain(|e| e.message_id != remove);
                                                }
                                                this.saved.insert(remove.clone());
                                                this.unsave(remove.clone(), cx);
                                            })),
                                    ),
                            );
                        }
                    }
                }
            }
            Panel::Mentions => {
                body = body.child(head("Mentions".into(), "mentions-close"));
                let unread = self.panels.mentions.as_ref().map(|l| l.iter().filter(|e| !e.read).count()).unwrap_or(0);
                let tab = |id: &'static str, label: String, active: bool, unread_tab: bool| {
                    div()
                        .id(id)
                        .px(px(12.))
                        .py(px(3.))
                        .rounded_full()
                        .border_1()
                        .border_color(if active { gpui::transparent_black() } else { rgba(0xffffff12).into() })
                        .when(active, |d| d.bg(Hsla::from(Theme::lavender()).opacity(0.25)))
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .font_weight(FontWeight::BOLD)
                        .text_color(if active { Hsla::from(gpui::white()) } else { muted })
                        .cursor_pointer()
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.panels.mentions_unread_tab = unread_tab;
                            cx.notify();
                        }))
                };
                let on_unread = self.panels.mentions_unread_tab;
                body = body.child(
                    div()
                        .flex()
                        .gap(px(6.))
                        .mb(px(8.))
                        .child(tab("tab-all", "All".into(), !on_unread, false))
                        .child(tab("tab-unread", if unread > 0 { format!("Unread ({unread})") } else { "Unread".into() }, on_unread, true)),
                );
                match &self.panels.mentions {
                    None => body = body.child(empty("Loading…")),
                    Some(list) => {
                        let shown: Vec<_> = list.iter().filter(|e| !on_unread || !e.read).collect();
                        if shown.is_empty() {
                            body = body.child(empty(if on_unread { "You're all caught up." } else { "Nobody has mentioned you yet." }));
                        }
                        for entry in shown {
                            let place = match &entry.server_name {
                                Some(s) => format!("{s} · #{}", entry.channel_name),
                                None => "Direct message".into(),
                            };
                            let (server, channel, id) =
                                (entry.server_id.clone(), entry.message.channel_id.clone().unwrap_or_default(), entry.message.id.clone());
                            body = body.child(
                                div()
                                    .id(SharedString::from(format!("mention-{}", entry.message.id)))
                                    .px(px(10.))
                                    .py(px(8.))
                                    .rounded(px(10.))
                                    .flex()
                                    .flex_col()
                                    .gap(px(2.))
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Theme::lavender_soft()))
                                    .when(!entry.read, |d| d.border_l(px(3.)).border_color(Theme::lavender()))
                                    .child(meta(format!("{place} · {}", date_time(&entry.message.created_at))))
                                    .child(div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(muted).child(entry.message.author.clone()))
                                    .child(div().text_size(px(14.)).line_height(px(21.)).text_color(Theme::ink()).truncate().child(entry.message.text.clone()))
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.jump_to_message(server.clone(), channel.clone(), id.clone(), window, cx)
                                    })),
                            );
                        }
                    }
                }
            }
        }
        let right = f32::from(window.viewport_size().width) - (300. + f32::from(self.chat_panel_width(window))) + 36.;
        Some(
            div()
                .id("pins-panel")
                .absolute()
                .top(px(75.))
                .right(px(right))
                .w(px(380.))
                .max_h(px(320.))
                .overflow_y_scroll()
                .px(px(14.))
                .py(px(12.))
                .rounded(px(14.))
                .bg(Theme::panel())
                .border_1()
                .border_color(rgb(0x41434f))
                .border_b_1()
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .child(body)
                .into_any_element(),
        )
    }

    /// `.search-panel`: the field, the filter pills, and up to 320px of results, above the messages.
    pub(super) fn render_search(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (input, _) = self.panels.search.as_ref()?;
        let muted: Hsla = Theme::muted().into();
        let pill = |id: &'static str, label: &'static str, add: &'static str| {
            div()
                .id(id)
                .px(px(9.))
                .py(px(3.))
                .rounded_full()
                .bg(rgba(0xffffff14))
                .border_1()
                .border_color(rgba(0xffffff1f))
                .text_size(px(11.))
                .line_height(px(16.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(rgb(0x5865f2))
                .cursor_pointer()
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| this.search_pill(add, cx)))
        };
        let query = input.read(cx).text();
        let mut results = div().id("search-results").max_h(px(320.)).overflow_y_scroll().px(px(8.)).pb(px(10.)).flex().flex_col();
        for result in &self.panels.results {
            let (channel, id) = (result.channel_id.clone(), result.id.clone());
            let server = self.server_id.clone();
            results = results.child(
                div()
                    .id(SharedString::from(format!("result-{}", result.id)))
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(10.))
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::lavender_soft()))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .text_color(muted)
                            .child(div().text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::MEDIUM).text_color(rgb(0xaca8af)).child("#"))
                            .child(format!("{} · ", result.channel_name))
                            .child(div().font_weight(FontWeight::BOLD).child(result.author.clone())),
                    )
                    // The snippet as the server sends it (its <mark> tags show as text on the web too).
                    .child(div().text_size(px(14.)).line_height(px(21.)).text_color(Theme::ink()).truncate().child(result.snippet.clone()))
                    .on_click(cx.listener(move |this, _, window, cx| this.jump_to_message(server.clone(), channel.clone(), id.clone(), window, cx))),
            );
        }
        if query.chars().count() >= 2 && self.panels.results.is_empty() {
            results = results.child(div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child("Nothing matched that."));
        }
        Some(
            div()
                .flex_none()
                .bg(Theme::panel())
                .border_b_1()
                .border_color(rgba(0xffffff12))
                .child(
                    div()
                        .flex()
                        .gap(px(8.))
                        .px(px(14.))
                        .py(px(10.))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .h(px(42.))
                                .px(px(12.))
                                .py(px(8.))
                                .rounded(px(10.))
                                .bg(Theme::paper())
                                .border_1()
                                .border_color(rgba(0xffffff12))
                                // The focused field's 3px ring.
                                .shadow(vec![gpui::BoxShadow {
                                    color: Hsla::from(Theme::lavender()).opacity(0.32),
                                    offset: gpui::point(px(0.), px(0.)),
                                    blur_radius: px(0.),
                                    spread_radius: px(3.),
                                }])
                                .child(input.clone()),
                        )
                        .child(
                            div()
                                .id("search-close")
                                .flex()
                                .items_center()
                                .text_size(px(18.))
                                .line_height(px(27.))
                                .text_color(muted)
                                .cursor_pointer()
                                .child("×")
                                .on_click(cx.listener(|this, _, window, cx| this.toggle_search(window, cx))),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .gap(px(6.))
                        .px(px(12.))
                        .py(px(8.))
                        .border_b_1()
                        .border_color(rgba(0xffffff14))
                        .child(pill("pill-from", "from:", "from:"))
                        .child(pill("pill-in", "in:", "in:"))
                        .child(pill("pill-link", "has:link", "has:link"))
                        .child(pill("pill-file", "has:file", "has:file")),
                )
                .child(results)
                .into_any_element(),
        )
    }

    /// The filter pills: `from:` and `in:` go in front (without searching), `has:` at the end.
    fn search_pill(&mut self, add: &'static str, cx: &mut Context<Self>) {
        let Some((input, _)) = self.panels.search.as_ref() else { return };
        let query = input.read(cx).text();
        let next = if query.contains(add) {
            query.clone()
        } else if add.starts_with("has:") {
            format!("{query} {add}").trim().to_string()
        } else {
            format!("{add} {query}").trim().to_string()
        };
        let input = input.clone();
        input.update(cx, |i, cx| i.set_text(next.clone(), cx));
        if add.starts_with("has:") {
            self.run_search(next, cx);
        }
        cx.notify();
    }

    fn unpin_from_panel(&mut self, message: Message, cx: &mut Context<Self>) {
        self.panels.pins.retain(|m| m.id != message.id);
        let client = self.client.clone();
        let id = message.id.clone();
        cx.background_executor().spawn(async move { client.pin_message(&id, false) }).detach();
        self.set_pinned(&message.id, false);
        cx.notify();
    }

    fn unsave(&mut self, id: String, cx: &mut Context<Self>) {
        self.saved.remove(&id);
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.set_saved(&id, false) }).detach();
        cx.notify();
    }
}

/// formatClientDateTime: `dateStyle: "medium", timeStyle: "short"` in the system's language.
pub fn date_time(value: &str) -> String {
    let Some(t) = crate::model::parse_time(value) else { return String::new() };
    let local = t.with_timezone(&chrono::Local);
    let (loc, pattern) = match crate::i18n::locale().split('-').next().unwrap_or("en") {
        "tr" => (chrono::Locale::tr_TR, "%-d %b %Y %H:%M"),
        "de" => (chrono::Locale::de_DE, "%d.%m.%Y, %H:%M"),
        "fr" => (chrono::Locale::fr_FR, "%-d %b %Y, %H:%M"),
        "es" => (chrono::Locale::es_ES, "%-d %b %Y, %H:%M"),
        "pt" => (chrono::Locale::pt_BR, "%-d de %b de %Y %H:%M"),
        "nl" => (chrono::Locale::nl_NL, "%-d %b %Y, %H:%M"),
        _ => (chrono::Locale::en_US, "%b %-d, %Y, %-I:%M %p"),
    };
    local.format_localized(pattern, loc).to_string()
}
