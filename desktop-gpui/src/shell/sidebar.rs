//! The channel sidebar (app/components/chat/shell/panels.tsx, full mode) and the user card
//! (`.discord-user-footer`) that sits over the bottom of the rail and the sidebar.

use gpui::{AnyElement, Context, FontWeight, IntoElement, SharedString, div, prelude::*, px, rgb};

use super::Shell;
use crate::model::{Channel, VoiceParticipant};
use crate::i18n::t;
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui::{self, card_shadow, icon};

impl Shell {
    pub(super) fn render_sidebar(&self, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        let Some(server) = self.server() else {
            return div().w(px(240.)).h_full().flex_none().bg(Theme::panel()).into_any_element();
        };

        let header = div()
            .relative()
            .flex_none()
            .pt(px(13.))
            .pl(px(19.))
            .pr(px(59.))
            .pb(px(12.))
            .child(
                div()
                    .text_size(px(9.))
                    .line_height(px(13.5))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::lavender())
                    .child(t(if server.is_public { "sidebar.publicSpace" } else { "sidebar.privateSpace" })),
            )
            .child(
                div()
                    .mt(px(2.))
                    .font_family(DISPLAY_FONT)
                    .text_size(px(21.))
                    .line_height(px(24.15))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::ink())
                    .child(server.name.clone()),
            )
            .child(
                div()
                    .id("server-menu")
                    .absolute()
                    .top(px(28.))
                    .right(px(17.))
                    .size(px(34.))
                    .rounded(px(10.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(17.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::quiet())
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()).text_color(Theme::ink()))
                    .tooltip(ui::tooltip(t("sidebar.serverMenu")))
                    .child("•••"),
            );

        let mut nav = div()
            .id("channel-nav")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .pt(px(4.))
            .px(px(10.))
            .pb(px(20.))
            .flex()
            .flex_col()
            .gap(px(2.));

        nav = nav
            // Measured: the label's text box is 109–127 and the events chip starts at 134.
            .child(
                div()
                    .flex_none()
                    .pt(px(16.))
                    .pb(px(5.))
                    .pl(px(8.))
                    .h(px(39.))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::muted())
                    .child(t("sidebar.channels")),
            )
            .child(
                div().flex_none().h(px(39.)).pb(px(5.)).px(px(9.)).child(
                div()
                    .id("events")
                    .h(px(34.))
                    .px(px(10.))
                    .rounded(px(10.))
                    .border_1()
                    .border_color(gpui::transparent_black())
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .text_color(Theme::ink())
                    .hover(|s| s.bg(Theme::hover()))
                    .child(icon("calendar-days", 15., Theme::quiet()))
                    .child(div().text_size(px(13.)).line_height(px(15.6)).font_weight(FontWeight::BOLD).child(t("sidebar.events"))),
            ));

        let mut categories = server.categories.clone();
        categories.sort_by_key(|c| c.position);
        let mut channels: Vec<&Channel> = server.channels.iter().collect();
        channels.sort_by_key(|c| c.position);

        for channel in channels.iter().filter(|c| c.category_id.is_none()) {
            nav = nav.child(self.render_channel(channel, window, cx));
        }
        for category in &categories {
            let members: Vec<&&Channel> = channels.iter().filter(|c| c.category_id.as_deref() == Some(&category.id)).collect();
            let collapsed = self.collapsed.contains(&category.id);
            let id = category.id.clone();
            nav = nav.child(
                div()
                    .id(SharedString::from(format!("cat-{}", category.id)))
                    .flex_none()
                    .pt(px(7.))
                    .h(px(30.))
                    .pl(px(4.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .cursor_pointer()
                    .text_color(Theme::muted())
                    .hover(|s| s.text_color(Theme::ink()))
                    .child(
                        div()
                            .size(px(14.))
                            .when(collapsed, |d| d.child(icon("chevron-right", 14., Theme::muted())))
                            .when(!collapsed, |d| d.child(icon("chevron-down", 14., Theme::muted()))),
                    )
                    .child(
                        div()
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .font_weight(FontWeight::BOLD)
                            .child(category.name.to_uppercase()),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if !this.collapsed.remove(&id) {
                            this.collapsed.insert(id.clone());
                        }
                        cx.notify();
                    })),
            );
            if !collapsed {
                for channel in members {
                    nav = nav.child(self.render_channel(channel, window, cx));
                }
            }
        }

        // `aside.sidebar` keeps 70px under the list for the user card; the list scrolls above it.
        div()
            .w(px(240.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .pb(px(super::rail::FOOTER_ROOM))
            .bg(Theme::panel())
            .child(header)
            .child(nav)
            .children(self.render_mini_voice_bar(window, cx))
            .into_any_element()
    }

    fn render_channel(&self, channel: &Channel, window: &gpui::Window, cx: &mut Context<Self>) -> AnyElement {
        if channel.is_voice() {
            return self.render_voice_room(channel, window, cx);
        }
        // Under a voice room's stage no text channel is the one open.
        let selected = self.channel_id.as_deref() == Some(&channel.id) && self.stage.is_none();
        let unread = !selected && self.reads.get(&channel.id).is_some_and(|r| r.unread);
        let mentions = self.reads.get(&channel.id).map_or(0, |r| r.mentions);
        let id = channel.id.clone();
        let text = channel.is_text();
        let base = self.client.base().to_string();
        let server_id = channel.server_id.clone();
        div()
            .id(SharedString::from(format!("channel-{}", channel.id)))
            .relative()
            .flex_none()
            .h(px(38.))
            .px(px(10.))
            .mx(px(1.))
            .rounded(px(12.))
            .flex()
            .items_center()
            .gap(px(9.))
            .cursor_pointer()
            .text_size(px(13.))
            .line_height(px(19.5))
            .when(selected, |d| d.bg(Theme::lavender_soft()).text_color(Theme::lavender()).font_weight(FontWeight::BOLD))
            .when(!selected, |d| {
                d.text_color(if unread { Theme::ink() } else { Theme::quiet() })
                    .font_weight(if unread { FontWeight::BOLD } else { FontWeight::SEMIBOLD })
                    .hover(|s| s.bg(Theme::hover()).text_color(Theme::ink()))
            })
            .when(unread, |d| {
                d.child(div().absolute().left(px(-11.)).top(px(15.)).w(px(4.)).h(px(8.)).rounded_r(px(4.)).bg(Theme::ink()))
            })
            .child(icon(channel.icon(), 16., if selected { Theme::lavender() } else { Theme::quiet() }))
            .child(div().flex_1().min_w_0().truncate().child(channel.name.clone()))
            .when(channel.private, |d| d.child(icon("lock", 12., Theme::quiet())))
            .when(mentions > 0 && !selected, |d| d.child(ui::rail_badge(mentions)))
            .on_click(cx.listener(move |this, _, _, cx| {
                if text {
                    this.open_channel(id.clone(), cx);
                } else {
                    // Forums and the other richer kinds are not native yet: hand over to the web app.
                    cx.open_url(&format!("{base}?server={server_id}"));
                }
            }))
            .into_any_element()
    }

    fn render_voice_room(&self, channel: &Channel, window: &gpui::Window, cx: &mut Context<Self>) -> AnyElement {
        let people: &[VoiceParticipant] = self.rooms.get(&channel.id).map(|v| v.as_slice()).unwrap_or(&[]);
        let connected = self.call.as_ref().is_some_and(|c| c.channel_id == channel.id);
        let id = channel.id.clone();
        let title = if channel.topic.is_empty() { channel.name.clone() } else { format!("{} — {}", channel.name, channel.topic) };
        let row = div()
            .id(SharedString::from(format!("room-{}", channel.id)))
            .flex_none()
            .h(px(38.))
            .px(px(10.))
            .mx(px(1.))
            .rounded(px(12.))
            .flex()
            .items_center()
            .gap(px(13.))
            .cursor_pointer()
            .text_size(px(13.))
            .line_height(px(19.5))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(Theme::quiet())
            .hover(|s| s.bg(Theme::hover()).text_color(Theme::ink()))
            .when(connected, |d| d.bg(Theme::lavender_soft()))
            .tooltip(ui::tooltip(title.clone()))
            .child(icon(channel.icon(), 16., if connected { Theme::mint() } else { Theme::quiet() }))
            .child(div().flex_1().min_w_0().truncate().when(connected, |d| d.text_color(Theme::lavender_light())).child(channel.name.clone()))
            .when(connected, |d| {
                d.child(
                    div()
                        .px(px(6.))
                        .h(px(18.))
                        .rounded(px(9.))
                        .bg(gpui::rgba(0x4ade8026))
                        .text_color(Theme::mint())
                        .text_size(px(10.))
                        .font_weight(FontWeight::BOLD)
                        .flex()
                        .items_center()
                        .child(if people.is_empty() { "connected".to_string() } else { format!("{} active", people.len()) }),
                )
            })
            .when(!connected && !people.is_empty(), |d| {
                d.child(
                    div()
                        .px(px(5.))
                        .h(px(18.))
                        .rounded(px(4.))
                        .bg(Theme::live_bg())
                        .text_color(Theme::live_fg())
                        .text_size(px(8.))
                        .font_weight(FontWeight::BLACK)
                        .flex()
                        .items_center()
                        .child(t("voiceStage.live")),
                )
            })
            .on_click(cx.listener(move |this, _, window, cx| this.open_stage(id.clone(), window, cx)));

        if connected {
            // `.voice-room-wrapper.voice-active-contour`: the joined room as a card, its name in the
            // light accent (wrapping), "N active" in green, the seats under it.
            let room = div()
                .id(SharedString::from(format!("room-{}", channel.id)))
                .flex_none()
                .min_h(px(38.))
                .px(px(4.))
                .py(px(2.))
                .rounded(px(12.))
                .flex()
                .items_center()
                .gap(px(9.))
                .cursor_pointer()
                .text_size(px(13.))
                .line_height(px(19.5))
                .font_weight(FontWeight::SEMIBOLD)
                .tooltip(ui::tooltip(title.clone()))
                .child(icon(channel.icon(), 16., gpui::rgb(0x9a96a0)))
                .child(div().flex_1().min_w_0().text_color(gpui::rgb(0xc4b5fd)).child(channel.name.clone()))
                .child(
                    div()
                        .flex_none()
                        .max_w(px(42.5))
                        .px(px(6.))
                        .py(px(1.))
                        .rounded(px(6.))
                        .bg(gpui::rgba(0x10b98126))
                        .border_1()
                        .border_color(gpui::rgba(0x10b9814d))
                        .text_size(px(10.))
                        .line_height(px(15.))
                        .text_color(gpui::rgb(0x34d399))
                        .child(format!("{} active", people.len().max(1))),
                )
                .on_click({
                    let id = channel.id.clone();
                    cx.listener(move |this, _, window, cx| this.open_stage(id.clone(), window, cx))
                });
            let mut seats = div().flex().flex_col().pt(px(3.)).pb(px(7.)).pl(px(6.));
            for person in people {
                seats = seats.child(self.render_voice_member(person, true, 28., window, cx));
            }
            return div()
                .flex_none()
                .mx(px(7.))
                .my(px(4.))
                .p(px(8.))
                .rounded(px(12.))
                .bg(gpui::rgba(0x252040e0))
                .border_1()
                .border_color(gpui::rgba(0xffffff12))
                .shadow(vec![
                    gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.25), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
                    gpui::BoxShadow { color: gpui::rgba(0x10b98133).into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) },
                ])
                .child(room)
                .child(seats)
                .into_any_element();
        }
        let _ = &row;
        let mut wrapper = div().flex().flex_col().flex_none().child(row);
        if !people.is_empty() {
            // Measured: the first seat sits 3px under the room, the next channel 8px under the last seat.
            let mut list = div().flex().flex_col().pt(px(3.)).pb(px(8.)).pl(px(36.)).pr(px(1.));
            for person in people {
                list = list.child(self.render_voice_member(person, connected, 33., window, cx));
            }
            wrapper = wrapper.child(list);
        }
        wrapper.into_any_element()
    }

    fn render_voice_member(&self, person: &VoiceParticipant, in_this_room: bool, height: f32, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        let identity = format!("{}|{}", person.id, person.connection_id);
        let speaking = in_this_room && self.call.as_ref().is_some_and(|c| c.speaking.contains(&identity));
        let me = self.connection_id.as_deref() == Some(person.connection_id.as_str());
        let elapsed = ((self.hub_now() - person.joined_at) / 1000.).max(0.) as u64;
        let picture = self.picture(&person.avatar_url);
        div()
            .h(px(height))
            .flex()
            .items_center()
            .gap(px(8.))
            .rounded(px(12.))
            .text_size(px(12.))
            .line_height(px(18.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(if speaking { Theme::ink() } else { Theme::quiet() })
            .child(
                div()
                    .rounded_full()
                    .border_2()
                    .border_color(if speaking { gpui::rgba(0x10b981cc) } else { gpui::rgba(0x00000000) })
                    .child(ui::avatar(picture, &person.avatar, &person.color, person.name(), 24.)),
            )
            .child({
                // StyledName for everyone but you ("You" is plain), then " (speaking)".
                let style = if me { None } else { self.name_style(&person.id) };
                let shown = if me { "You".to_string() } else { person.name().to_string() };
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .child(crate::names::styled_name(&shown, style.as_ref(), 12., FontWeight::SEMIBOLD, if speaking { Theme::ink().into() } else { Theme::quiet().into() }, window, cx))
                    .when(speaking, |d| d.child(" (speaking)"))
            })
            .child(
                div()
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .text_color(Theme::quiet())
                    .child(duration(elapsed)),
            )
            .child(div().flex_1())
            .when(person.screen_stream_id.is_some(), |d| {
                d.child(
                    div()
                        .px(px(5.))
                        .h(px(16.))
                        .rounded(px(4.))
                        .bg(Theme::badge())
                        .text_color(gpui::white())
                        .text_size(px(8.))
                        .font_weight(FontWeight::BLACK)
                        .flex()
                        .items_center()
                        .child("LIVE"),
                )
            })
            .when(person.bot, |d| d.child(icon("audio-lines", 14., Theme::mint())))
            .when(speaking && !person.bot, |d| d.child(icon("mic", 14., Theme::mint())))
            .when(person.deafened && !person.bot, |d| d.child(icon("headphone-off", 14., Theme::badge())))
            .when(person.muted && !person.deafened && !person.bot && !speaking, |d| d.child(icon("mic-off", 14., Theme::badge())))
    }

    /// `.discord-user-footer`: avatar, name, status, then mic, headphones and settings.
    pub(super) fn render_footer(&self, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        // user-footer.tsx: your custom status, else your presence (also while in a call).
        let status = match &self.me.custom_status {
            Some(serde_json::Value::String(text)) if !text.is_empty() => text.clone(),
            Some(serde_json::Value::Object(o)) if o.get("text").and_then(|v| v.as_str()).is_some_and(|t| !t.is_empty()) => {
                o["text"].as_str().unwrap_or_default().to_string()
            }
            _ => t("presence.online"),
        };
        let control = |id: &'static str, name: &'static str, off: bool| {
            div()
                .id(id)
                .h(px(32.))
                .px(px(3.))
                .rounded(px(8.))
                .flex()
                .items_center()
                .gap(px(5.))
                .cursor_pointer()
                .hover(|s| s.bg(Theme::hover()))
                .child(icon(name, 18., if off { Theme::badge() } else { Theme::muted() }))
        };
        div()
            .absolute()
            .left(px(8.))
            .bottom(px(8.))
            .w(px(284.))
            .h(px(54.))
            .px(px(10.))
            .py(px(6.))
            .rounded(px(16.))
            .bg(Theme::card())
            .border_1()
            .border_color(Theme::line())
            .shadow(card_shadow())
            .flex()
            .items_center()
            .gap(px(8.))
            .child(
                div()
                    .relative()
                    .ml(px(6.))
                    .child(ui::avatar(self.picture(&self.me.avatar_url), &self.me.avatar, &self.me.color, self.me.name(), 32.))
                    .child(
                        div()
                            .absolute()
                            .right(px(-1.))
                            .bottom(px(-1.))
                            .child(ui::presence_dot(if self.connected { "online" } else { "offline" }, 10., rgb(0x16131f))),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        // `.user-footer-name` is 96px here; the ellipsis is measured at its 800 weight.
                        div()
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_size(px(13.))
                            .line_height(px(15.6))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(Theme::ink())
                            .child(ui::fit(window, self.me.name(), FontWeight::EXTRA_BOLD, 13., px(96.))),
                    )
                    .child(
                        div()
                            .truncate()
                            .text_size(px(11.))
                            .line_height(px(13.2))
                            .text_color(Theme::muted())
                            .child(status),
                    ),
            )
            .child(
                control("mic", if self.muted { "mic-off" } else { "mic" }, self.muted)
                    .child(icon("chevron-down", 12., Theme::muted()))
                    .tooltip(ui::tooltip(t(if self.muted { "footer.unmute" } else { "footer.mute" })))
                    .on_click(cx.listener(|this, _, _, cx| this.toggle_mute(cx))),
            )
            .child(
                control("deafen", if self.deafened { "headphone-off" } else { "headphones" }, self.deafened)
                    .child(icon("chevron-down", 12., Theme::muted()))
                    .tooltip(ui::tooltip(t(if self.deafened { "footer.undeafen" } else { "footer.deafen" })))
                    .on_click(cx.listener(|this, _, _, cx| this.toggle_deafen(cx))),
            )
            .child(
                control("settings", "settings", false)
                    .tooltip(ui::tooltip(t("footer.userSettings")))
                    .on_click(cx.listener(|this, _, _, cx| this.sign_out_menu(cx))),
            )
    }
}

/// `VoiceDuration`: 8:04, or 1:02:03 past an hour.
pub(super) fn duration(secs: u64) -> String {
    let (h, m, s) = (secs / 3600, secs / 60 % 60, secs % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m}:{s:02}") }
}
