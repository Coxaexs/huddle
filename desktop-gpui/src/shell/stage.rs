//! The voice room view (app/components/voice-stage.tsx, voice-stage/*): the header's view switcher
//! and chat button, avatar tiles, the bottom control bar, the room's own chat
//! (components/voice-chat-panel.tsx); and in the sidebar the joined room's card and the
//! "voice connected" bar (components/chat/mini-voice-bar.tsx).

use gpui::{
    AnimationExt as _, AnyElement, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba,
};

use super::{CallState, Shell};
use crate::i18n::{t, tc, tv};
use crate::model::VoiceParticipant;
use crate::textarea::{AreaEvent, TextArea};
use crate::theme::Theme;
use crate::ui;

/// The room being looked at, and its chat box.
pub(super) struct Stage {
    pub channel_id: String,
    pub chat_open: bool,
    pub view: &'static str,
    composer: Entity<TextArea>,
    _sub: Subscription,
}

impl Shell {
    /// openVoiceChannel: show the room, and join it unless already there.
    pub(super) fn open_stage(&mut self, channel_id: String, window: &mut Window, cx: &mut Context<Self>) {
        if self.call.as_ref().is_none_or(|c| c.channel_id != channel_id) {
            self.join_voice(channel_id.clone(), cx);
        }
        if self.stage.as_ref().is_some_and(|s| s.channel_id == channel_id) {
            cx.notify();
            return;
        }
        let name = self.channel_by_id(&channel_id).map(|c| c.name.clone()).unwrap_or_default();
        let composer = cx.new(|cx| {
            TextArea::new(format!("Message {name}"), cx).text(14., 21.).max_lines(6).placeholder_color(rgb(0x5a5275))
        });
        let id = channel_id.clone();
        let sub = cx.subscribe_in(&composer, window, move |this, composer, event, _window, cx| match event {
            AreaEvent::Submit => {
                let text = composer.read(cx).value();
                if text.trim().is_empty() {
                    return;
                }
                composer.update(cx, |c, cx| c.clear(cx));
                let (client, channel) = (this.client.clone(), id.clone());
                cx.spawn(async move |this, cx| {
                    let sent = cx.background_executor().spawn(async move { client.send(&channel, text.trim(), None) }).await;
                    this.update(cx, |this, cx| {
                        if let Err(e) = sent {
                            this.set_notice(e.to_string(), cx);
                        }
                    })
                    .ok();
                })
                .detach();
            }
            AreaEvent::Escape => {
                if let Some(stage) = this.stage.as_mut() {
                    stage.chat_open = false;
                    cx.notify();
                }
            }
            AreaEvent::Changed => {}
        });
        if !self.messages.contains_key(&channel_id) {
            self.fetch_messages(channel_id.clone(), None, cx);
        }
        self.stage = Some(Stage { channel_id, chat_open: true, view: "grid", composer, _sub: sub });
        cx.notify();
    }

    pub(super) fn close_stage(&mut self) {
        self.stage = None;
    }

    /// The stage's header controls: grid / table / map, and the chat toggle.
    pub(super) fn render_stage_controls(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let stage = self.stage.as_ref()?;
        let mut switcher = div().flex().items_center().p(px(3.)).rounded(px(12.)).bg(Theme::paper());
        for view in ["grid", "table", "map"] {
            let active = stage.view == view;
            switcher = switcher.child(
                div()
                    .id(SharedString::from(format!("view-{view}")))
                    .px(px(10.))
                    .py(px(5.))
                    .rounded(px(9.))
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .font_weight(FontWeight::BOLD)
                    .cursor_pointer()
                    .when(active, |d| d.bg(Theme::card()).text_color(Theme::lavender()))
                    .when(!active, |d| d.text_color(Theme::quiet()).hover(|s| s.text_color(Theme::ink())))
                    .child(view)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(stage) = this.stage.as_mut() {
                            stage.view = view;
                            cx.notify();
                        }
                    })),
            );
        }
        let chat_open = stage.chat_open;
        Some(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .mr(px(4.))
                .flex_none()
                .child(switcher)
                .child(
                    div()
                        .id("stage-chat")
                        .size(px(30.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .when(chat_open, |d| d.bg(Hsla::from(rgb(0xb59dfb)).opacity(0.33)))
                        .hover(|s| s.bg(Theme::hover()))
                        .tooltip(ui::tooltip(if chat_open { t("header.hideChat") } else { t("header.showChat") }))
                        .child(ui::icon("message-circle", 16., Theme::ink()))
                        .on_click(cx.listener(|this, _, _, cx| {
                            if let Some(stage) = this.stage.as_mut() {
                                stage.chat_open = !stage.chat_open;
                                cx.notify();
                            }
                        })),
                )
                .child(div().w(px(1.)).h(px(20.)).ml(px(2.)).bg(Theme::line()).opacity(0.6))
                .into_any_element(),
        )
    }

    /// Under the header: the tiles and the control bar, and the room's chat on the right.
    pub(super) fn render_stage_body(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let stage = self.stage.as_ref()?;
        let people: Vec<VoiceParticipant> = self.rooms.get(&stage.channel_id).cloned().unwrap_or_default();
        let card_width = f32::from(self.chat_panel_width(window)) - 2.;
        let chat_width = if stage.chat_open { (card_width * 0.3).clamp(300., 440.) } else { 0. };
        let stage_width = card_width - chat_width;
        let body_height = f32::from(window.viewport_size().height) - 10. - 1. - 73. - 126.;

        // `.voice-grid`: one tile up to 720 wide, two side by side, else as many 220px+ columns as fit.
        let inner = stage_width - 40.;
        let gap = 16.;
        let n = people.len().max(1);
        let (cols, tile_w) = match n {
            1 => (1, inner.clamp(280., 720.)),
            2 => (2, ((inner - gap) / 2.).max(220.)),
            _ => {
                let cols = (((inner + gap) / (220. + gap)).floor() as usize).max(1).min(n);
                (cols, (inner - gap * (cols as f32 - 1.)) / cols as f32)
            }
        };
        let tile_h = tile_w * 10. / 16.;
        let rows = n.div_ceil(cols);
        let grid_h = rows as f32 * tile_h + gap * (rows as f32 - 1.);
        let mut grid = div().flex().flex_col().gap(px(gap)).items_center();
        let mut people_iter = people.iter().peekable();
        while people_iter.peek().is_some() {
            let row: Vec<_> = people_iter.by_ref().take(cols).map(|p| self.render_tile(p, tile_w, tile_h, window, cx)).collect();
            grid = grid.child(div().flex().gap(px(gap)).children(row));
        }
        let tiles = div()
            .id("stage-body")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .p(px(20.))
            .child(div().pt(px(((body_height - 40. - grid_h) / 2.).max(0.))).child(grid));

        let left = div().w(px(stage_width)).h_full().flex().flex_col().child(tiles).child(self.render_stage_bar(stage_width, cx));
        let mut split = div().flex_1().min_h_0().flex().child(left);
        if stage.chat_open {
            split = split.child(self.render_voice_chat(stage, chat_width, cx));
        }
        Some(split.into_any_element())
    }

    fn render_tile(&self, person: &VoiceParticipant, w: f32, h: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let identity = format!("{}|{}", person.id, person.connection_id);
        let speaking = self.call.as_ref().is_some_and(|c| c.speaking.contains(&identity));
        let me = self.connection_id.as_deref() == Some(person.connection_id.as_str());
        let elapsed = ((self.hub_now() - person.joined_at) / 1000.).max(0.) as u64;
        let face = ui::avatar_with(self.picture(&person.avatar_url), &person.avatar, &person.color, person.name(), 88., 34., FontWeight::BOLD, rgb(0x1c1c22).into());
        let name = if me { "You".to_string() } else { person.name().to_string() };
        let style = if me { None } else { self.name_style(&person.id) };
        let tile = div()
            .id(SharedString::from(format!("tile-{}", person.connection_id)))
            .relative()
            .w(px(w))
            .h(px(h))
            .rounded(px(16.))
            .bg(Theme::card())
            .border_1()
            .border_color(if speaking { rgb(0x23a55a).into() } else { Hsla::from(rgba(0xffffff12)) })
            .shadow(vec![
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(1.)), blur_radius: px(2.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.25), offset: gpui::point(px(0.), px(1.)), blur_radius: px(3.), spread_radius: px(0.) },
            ])
            .flex()
            .items_center()
            .justify_center()
            // The soft accent glow behind the avatar.
            .children(
                crate::cssbg::picture("radial-gradient(70% 80% at 50% 42%, rgba(167, 139, 250, 0.16), transparent 70%)", w - 2., h - 2., 15., window.scale_factor())
                    .map(|glow| gpui::img(gpui::ImageSource::Render(glow)).absolute().top_0().left_0().w(px(w - 2.)).h(px(h - 2.))),
            )
            .child(face)
            .child(
                div().absolute().left(px(10.)).right(px(10.)).bottom(px(8.)).flex().justify_center().child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(10.))
                        .py(px(4.))
                        .rounded_full()
                        .bg(Hsla::from(rgb(0x1a1628)).opacity(0.85))
                        .border_1()
                        .border_color(rgba(0xffffff12))
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::ink())
                        .child(crate::names::styled_name(&name, style.as_ref(), 13., FontWeight::SEMIBOLD, Theme::ink().into(), window, cx))
                        .when(person.muted || person.deafened, |d| {
                            d.child(ui::icon(if person.deafened { "headphone-off" } else { "mic-off" }, 12., Theme::badge()))
                        })
                        .child(div().text_size(px(11.)).line_height(px(16.5)).opacity(0.8).child(super::sidebar::duration(elapsed))),
                ),
            );
        if speaking {
            // speakingPulse: a green ring breathing between 2px and 5px every 1.4s.
            tile.with_animation(
                SharedString::from(format!("pulse-{}", person.connection_id)),
                gpui::Animation::new(std::time::Duration::from_millis(1400)).repeat(),
                |d, t| {
                    let k = 1. - (2. * t - 1.).abs();
                    d.shadow(vec![
                        gpui::BoxShadow { color: Hsla::from(rgb(0x23a55a)).opacity(0.6 + 0.3 * k), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2. + 3. * k) },
                        gpui::BoxShadow { color: Hsla::from(rgb(0x23a55a)).opacity(0.4 + 0.3 * k), offset: gpui::point(px(0.), px(0.)), blur_radius: px(12. + 12. * k), spread_radius: px(0.) },
                    ])
                },
            )
            .into_any_element()
        } else {
            tile.into_any_element()
        }
    }

    /// `.voice-ctrls-centered`: the control buttons in a floating card, wrapping onto two rows.
    fn render_stage_bar(&self, width: f32, cx: &mut Context<Self>) -> impl IntoElement {
        let button = |id: &'static str, name: &'static str| {
            div()
                .id(id)
                .relative()
                .size(px(44.))
                .flex_none()
                .rounded(px(14.))
                .bg(Theme::card())
                .border_1()
                .border_color(Hsla::from(Theme::lavender()).opacity(0.12))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.bg(Theme::lavender_soft()))
                .child(ui::icon(name, if matches!(name, "external-link" | "maximize-2") { 17. } else { 18. }, Theme::ink()))
        };
        let off = |d: gpui::Stateful<gpui::Div>| d.bg(rgba(0xf8717126)).border_color(rgba(0xf871714d));
        let divider = || div().w(px(1.)).h(px(24.)).mx(px(4.)).bg(Hsla::from(Theme::lavender()).opacity(0.15));
        let muted = self.muted;
        let deafened = self.deafened;
        let row1 = div()
            .flex()
            .items_center()
            .gap(px(6.))
            .child(button("sb-settings", "sliders-horizontal"))
            .child(button("sb-seat", "armchair"))
            .child(button("sb-soundboard", "megaphone"))
            .child(divider())
            .child(
                button("sb-mic", if muted { "mic-off" } else { "mic" })
                    .when(muted, off)
                    .on_click(cx.listener(|this, _, _, cx| this.toggle_mute(cx))),
            )
            .child(
                button("sb-deafen", if deafened { "headphone-off" } else { "headphones" })
                    .when(deafened, off)
                    .on_click(cx.listener(|this, _, _, cx| this.toggle_deafen(cx))),
            )
            .child(
                button("sb-camera", "video").child(
                    div()
                        .absolute()
                        .top(px(-5.))
                        .right(px(-5.))
                        .size(px(20.))
                        .rounded(px(8.))
                        .bg(Theme::paper())
                        .border_1()
                        .border_color(rgba(0xffffff12))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(ui::icon("sparkles", 11., Theme::muted())),
                ),
            )
            .child(button("sb-screen", "monitor"))
            .child(divider())
            .child(button("sb-grid", "layout-grid"))
            .child(button("sb-games", "gamepad-2"));
        let row2 = div()
            .flex()
            .items_center()
            .gap(px(6.))
            .child(button("sb-more", "more-horizontal"))
            .child(divider())
            .child(
                div()
                    .id("sb-leave")
                    .w(px(56.))
                    .h(px(44.))
                    .rounded(px(14.))
                    .bg(rgb(0xd93a3a))
                    .border_1()
                    .border_color(rgb(0xd93a3a))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(|s| s.bg(rgb(0xef4444)))
                    .tooltip(ui::tooltip(t("voiceStage.disconnect")))
                    .child(ui::icon("phone-off", 18., gpui::white()))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.leave_voice(cx);
                    })),
            )
            .child(divider())
            .child(button("sb-popout", "external-link"))
            .child(button("sb-fullscreen", "maximize-2"));
        div().flex_none().w(px(width)).px(px(12.)).pb(px(14.)).child(
            div()
                .w_full()
                .px(px(10.))
                .py(px(8.))
                .rounded(px(20.))
                .bg(Hsla::from(rgb(0x1a1628)).opacity(0.92))
                .border_1()
                .border_color(rgba(0xffffff12))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.28), offset: gpui::point(px(0.), px(12.)), blur_radius: px(32.), spread_radius: px(0.) }])
                .flex()
                .flex_col()
                .items_center()
                .gap(px(6.))
                .child(row1)
                .child(row2),
        )
    }

    /// VoiceChatPanel: the room's messages (system lines centred), and a box to write in.
    fn render_voice_chat(&self, stage: &Stage, width: f32, cx: &mut Context<Self>) -> impl IntoElement {
        let name = self.channel_by_id(&stage.channel_id).map(|c| c.name.clone()).unwrap_or_default();
        let muted: Hsla = Theme::muted().into();
        let messages = self.messages.get(&stage.channel_id).cloned().unwrap_or_default();
        let mut scroll = div().id("voice-chat-scroll").flex_1().min_h_0().overflow_y_scroll().pt(px(12.)).pb(px(8.)).flex().flex_col();
        if messages.is_empty() && !self.loading.contains(&stage.channel_id) {
            scroll = scroll.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(8.))
                    .px(px(24.))
                    .py(px(40.))
                    .text_size(px(13.))
                    .text_color(muted)
                    .child(ui::icon("message-circle", 32., muted))
                    .child(div().text_size(px(15.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(format!("Welcome to the chat of {name}")))
                    .child(div().text_center().child("Messages here stay with the voice channel, so anyone who joins later can read them.")),
            );
        }
        let mut previous: Option<&crate::model::Message> = None;
        let mut previous_day = String::new();
        let mut after_system = false;
        for message in &messages {
            let at = crate::model::parse_time(&message.created_at).map(|t| t.with_timezone(&chrono::Local));
            let day = at.map(|t| t.format("%Y-%m-%d").to_string()).unwrap_or_else(|| previous_day.clone());
            if let Some(at) = at
                && day != previous_day
            {
                // Margins collapse on the web: after a system line (6px under it) the day's 14px is 8 more.
                let top = if after_system { 8. } else { 14. };
                scroll = scroll.child(
                    div()
                        .mt(px(top))
                        .mb(px(6.))
                        .mx(px(16.))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(muted)
                        .child(div().flex_1().h(px(1.)).bg(Theme::line()))
                        .child(day_label(&at))
                        .child(div().flex_1().h(px(1.)).bg(Theme::line())),
                );
            }
            let stamp = at.map(|t| crate::model::client_time(&t.to_rfc3339())).unwrap_or_default();
            if message.kind.as_deref().is_some_and(|k| k.starts_with("system-")) {
                let shown = message.user_id.as_ref().and_then(|id| self.member_anywhere(id)).map(|m| m.display_name_or_name()).unwrap_or_else(|| message.author.clone());
                let rest = message.text.strip_prefix(message.author.as_str()).map(str::to_string).unwrap_or_else(|| format!(" {}", message.text));
                scroll = scroll.child(
                    div()
                        .mb(px(6.))
                        .mx(px(12.))
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .justify_center()
                        .gap(px(6.))
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .text_color(muted)
                        .child(ui::icon("sparkles", 13., Theme::lavender()))
                        .child(div().flex().child(div().font_weight(FontWeight::SEMIBOLD).text_color(Theme::ink()).child(shown)).child(rest))
                        .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(rgb(0x5a5275)).child(stamp)),
                );
                previous = None;
                previous_day = day;
                after_system = true;
                continue;
            }
            let grouped = previous.is_some_and(|p| {
                p.user_id == message.user_id
                    && p.author == message.author
                    && day == previous_day
                    && crate::model::parse_time(&p.created_at).zip(crate::model::parse_time(&message.created_at)).is_some_and(|(a, b)| (b - a).num_seconds() < 7 * 60)
            });
            let author = message.user_id.as_ref().and_then(|id| self.member_anywhere(id));
            let face = if grouped {
                div().w(px(36.)).flex_none().into_any_element()
            } else {
                let picture = author.and_then(|a| a.picture()).map(|p| self.client.absolute(p));
                ui::avatar(picture, &author.map(|a| a.avatar.clone()).unwrap_or(message.avatar.clone()), &author.map(|a| a.color.clone()).unwrap_or(message.color.clone()), &message.author, 36.)
            };
            let mut content = div().flex_1().min_w_0().flex().flex_col();
            if !grouped {
                content = content.child(
                    div()
                        .flex()
                        .items_baseline()
                        .gap(px(8.))
                        .child(div().text_size(px(14.)).line_height(px(18.2)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(author.map(|a| a.display_name_or_name()).unwrap_or(message.author.clone())))
                        .when(message.bot, |d| {
                            d.child(div().px(px(4.)).rounded(px(4.)).bg(Theme::lavender()).text_color(gpui::white()).text_size(px(10.)).font_weight(FontWeight::BOLD).child("BOT"))
                        })
                        .child(div().text_size(px(11.)).text_color(muted).child(stamp)),
                );
            }
            if !message.text.is_empty() {
                content = content.child(div().text_size(px(14.)).line_height(px(19.6)).text_color(Theme::ink()).child(message.text.clone()));
            }
            scroll = scroll.child(
                div()
                    .id(SharedString::from(format!("vc-{}", message.id)))
                    .mt(px(if grouped { 0. } else { 8. }))
                    .px(px(16.))
                    .pt(px(if grouped { 1. } else { 6. }))
                    .pb(px(2.))
                    .flex()
                    .gap(px(12.))
                    .hover(|s| s.bg(Hsla::from(Theme::ink()).opacity(0.04)))
                    .child(face)
                    .child(content),
            );
            previous = Some(message);
            previous_day = day;
            after_system = false;
        }
        div()
            .w(px(width))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .border_l_1()
            .border_color(Theme::line())
            .child(
                div()
                    .h(px(48.))
                    .flex_none()
                    .pl(px(16.))
                    .pr(px(12.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .border_b_1()
                    .border_color(Theme::line())
                    .child(ui::icon("message-circle", 18., Theme::ink()))
                    .child(div().flex_1().min_w_0().truncate().text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::BOLD).child(name))
                    .child(
                        div()
                            .id("voice-chat-close")
                            .size(px(30.))
                            .rounded(px(8.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::line()))
                            .child(ui::icon("x", 18., muted))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(stage) = this.stage.as_mut() {
                                    stage.chat_open = false;
                                    cx.notify();
                                }
                            })),
                    ),
            )
            .child(scroll)
            .child(
                div().flex_none().px(px(12.)).pb(px(12.)).child(
                    div()
                        .flex()
                        .items_end()
                        .gap(px(6.))
                        .pl(px(6.))
                        .pr(px(10.))
                        .py(px(6.))
                        .rounded(px(10.))
                        .bg(rgb(0x262234))
                        .shadow(vec![gpui::BoxShadow { color: Hsla::from(Theme::lavender()).opacity(0.45), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) }])
                        .child(
                            div()
                                .id("voice-chat-attach")
                                .size(px(32.))
                                .flex_none()
                                .rounded_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .cursor_pointer()
                                .child(ui::icon("plus", 20., muted)),
                        )
                        .child(div().flex_1().min_w_0().py(px(6.)).child(stage.composer.clone())),
                ),
            )
    }

    /// MiniVoiceBar: the joined room, its connection, and quick controls (above the user card).
    pub(super) fn render_mini_voice_bar(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let call = self.call.as_ref()?;
        let name = self.channel_by_id(&call.channel_id).map(|c| c.name.clone()).unwrap_or_default();
        let status = match call.state {
            CallState::Connected => match call.region.as_deref() {
                Some(region) => tv("voiceStage.connectedRegion", &[("region", if region == "de" { "Germany" } else { "Netherlands" })]),
                None => t("voiceStage.connected"),
            },
            CallState::Joining => "connecting…".into(),
            CallState::Reconnecting => "reconnecting…".into(),
        };
        let green = rgb(0x4ade80);
        let small = |id: &'static str, icon: &'static str| {
            div()
                .id(id)
                .size(px(32.))
                .rounded(px(9.))
                .bg(Hsla::from(Theme::ink()).opacity(0.04))
                .border_1()
                .border_color(rgba(0xffffff12))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(|s| s.bg(Theme::hover()))
                .child(ui::icon(icon, 14., Theme::ink()))
        };
        let room = call.channel_id.clone();
        Some(
            div()
                .flex_none()
                .ml(px(8.))
                .mr(px(9.))
                .mb(px(8.))
                .pt(px(10.))
                .px(px(10.))
                .pb(px(8.))
                .rounded(px(14.))
                .bg(Theme::card())
                .border_1()
                .border_color(rgba(0xffffff12))
                .flex()
                .flex_col()
                .gap(px(6.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(
                            div()
                                .size(px(28.))
                                .flex_none()
                                .rounded(px(6.))
                                .bg(rgba(0x23a55a1f))
                                .border_1()
                                .border_color(rgba(0x23a55a40))
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(ui::icon("radio", 16., rgb(0x23a55a))),
                        )
                        .child(
                            div()
                                .id("mini-voice-info")
                                .flex_1()
                                .min_w_0()
                                .cursor_pointer()
                                .child(div().truncate().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).child(name))
                                .child(
                                    div()
                                        .w_full()
                                        .flex()
                                        .items_center()
                                        .gap(px(6.))
                                        .text_size(px(11.5))
                                        .line_height(px(13.8))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(green)
                                        .child(
                                            div().size(px(7.)).flex_none().rounded_full().bg(green).with_animation(
                                                "mini-voice-dot",
                                                gpui::Animation::new(std::time::Duration::from_secs(2)).repeat(),
                                                |d, t| d.opacity(0.5 + 0.5 * (1. - (2. * t - 1.).abs())),
                                            ),
                                        )
                                        // 152px beside the dot, cut with "…" like the web's.
                                        .child(div().flex_1().min_w_0().whitespace_nowrap().overflow_hidden().child(ui::fit(window, &status, FontWeight::MEDIUM, 11.5, px(152.)))),
                                )
                                .on_click(cx.listener(move |this, _, window, cx| this.open_stage(room.clone(), window, cx))),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(small("mv-sound", "volume-2"))
                        .child(small("mv-screen", "monitor"))
                        .child(small("mv-camera", "video"))
                        .child(
                            div()
                                .id("mv-leave")
                                .size(px(32.))
                                .rounded(px(9.))
                                .bg(Hsla::from(Theme::coral()).opacity(0.1))
                                .border_1()
                                .border_color(Hsla::from(Theme::coral()).opacity(0.45))
                                .flex()
                                .items_center()
                                .justify_center()
                                .cursor_pointer()
                                .child(ui::icon("phone-off", 14., Theme::coral()))
                                .on_click(cx.listener(|this, _, _, cx| this.leave_voice(cx))),
                        ),
                )
                .into_any_element(),
        )
    }

    /// "· 2 in call" under a room's name in the stage header.
    pub(super) fn stage_subtitle(&self) -> Option<String> {
        let stage = self.stage.as_ref()?;
        let n = self.rooms.get(&stage.channel_id).map_or(0, Vec::len) as i64;
        Some(tc("voiceStage.inCall", n, &[]))
    }
}

/// `Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })`.
fn day_label(at: &chrono::DateTime<chrono::Local>) -> String {
    let (loc, pattern) = match crate::i18n::locale().split('-').next().unwrap_or("en") {
        "tr" => (chrono::Locale::tr_TR, "%-d %B %Y"),
        "de" => (chrono::Locale::de_DE, "%-d. %B %Y"),
        "fr" => (chrono::Locale::fr_FR, "%-d %B %Y"),
        "es" => (chrono::Locale::es_ES, "%-d de %B de %Y"),
        "pt" => (chrono::Locale::pt_BR, "%-d de %B de %Y"),
        "nl" => (chrono::Locale::nl_NL, "%-d %B %Y"),
        _ => (chrono::Locale::en_US, "%B %-d, %Y"),
    };
    at.format_localized(pattern, loc).to_string()
}
