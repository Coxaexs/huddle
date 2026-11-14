//! The music bot's cards (music-cards.tsx): room stats / Wrapped, the queue and the room settings.
//! Their buttons run music commands in the card's voice room (`/api/music/command`).

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde_json::Value;

use super::Shell;
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

pub const KINDS: [&str; 5] = ["music-settings", "music-stats", "music-queue", "music-history", "music-search"];

/// CSS grid `repeat(auto-fit, minmax(min, 1fr))`: how many columns `n` items get in `width`.
fn auto_fit(width: f32, min: f32, gap: f32, n: usize) -> usize {
    (((width + gap) / (min + gap)).floor() as usize).clamp(1, n.max(1))
}

/// Flex-wrap by hand: items of these widths into rows no wider than `width`.
fn pack(widths: &[f32], width: f32, gap: f32) -> Vec<Vec<usize>> {
    let mut rows: Vec<Vec<usize>> = Vec::new();
    let mut used = 0.;
    for (i, w) in widths.iter().enumerate() {
        match rows.last_mut() {
            Some(row) if used + gap + w <= width + 0.5 => {
                row.push(i);
                used += gap + w;
            }
            _ => {
                rows.push(vec![i]);
                used = *w;
            }
        }
    }
    rows
}

impl Shell {
    /// runMusicUiCommand: in the card's voice room (or the one we're in, or one playing, or the first).
    fn run_music_command(&mut self, command: String, room: Option<String>, cx: &mut Context<Self>) {
        self.run_music_command_for(command, room, None, cx);
    }

    /// The same, and the room's new settings land on this settings card.
    fn run_music_command_for(&mut self, command: String, room: Option<String>, card: Option<String>, cx: &mut Context<Self>) {
        let rooms: Vec<String> = self.server().map(|s| s.channels.iter().filter(|c| c.kind == "voice").map(|c| c.id.clone()).collect()).unwrap_or_default();
        let target = room
            .or_else(|| self.call.as_ref().map(|c| c.channel_id.clone()))
            .or_else(|| rooms.iter().find(|r| self.players.get(*r).and_then(|p| p.get("track")).is_some_and(|t| !t.is_null())).cloned())
            .or_else(|| rooms.first().cloned());
        let Some(target) = target else {
            self.set_notice("This server does not have a voice room yet.", cx);
            return;
        };
        let name = command.trim().split_whitespace().next().unwrap_or_default().trim_start_matches('/').to_string();
        let silent = ["autoplay", "radio", "automix", "artistdiversity", "vibematch", "automixblend", "crossfade", "filter"].contains(&name.as_str());
        let text_channel = self.channel_id.clone();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.music_command(&command, &target, text_channel.as_deref(), silent) }).await;
            this.update(cx, |this, cx| match result {
                Ok(reply) => {
                    if let (Some(card), Some(state)) = (card, reply.get("state").and_then(Value::as_object)) {
                        let entry = this.music_settings.entry(card).or_default();
                        for (k, v) in state {
                            entry.insert(k.clone(), v.clone());
                        }
                        cx.notify();
                    }
                }
                Err(e) => this.set_notice(if e.to_string().is_empty() { "That music control failed.".into() } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_music_card(&self, message: &Message, width: f32, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let kind = message.kind.as_deref()?;
        let payload = message.payload.as_ref()?;
        match kind {
            "music-stats" => Some(self.render_music_stats(message, payload, width, window, cx)),
            "music-queue" => Some(self.render_music_queue(message, payload, width, window, cx)),
            "music-settings" => Some(self.render_music_settings(message, payload, width, window, cx)),
            _ => None,
        }
    }

    /// The card's frame: 16px corners, 20px padding, a lavender-tinted edge and background.
    pub(super) fn music_frame(wrapped: bool, width: f32) -> gpui::Div {
        let css: &'static str = if wrapped {
            "radial-gradient(circle at 90% 10%, rgba(255, 157, 108, 0.208), rgba(0, 0, 0, 0) 35%), radial-gradient(circle at 10% 90%, rgba(167, 139, 250, 0.3), rgba(0, 0, 0, 0) 40%), #1d192a"
        } else {
            "linear-gradient(145deg, rgba(167, 139, 250, 0.12), rgba(0, 0, 0, 0) 45%), #1c1828"
        };
        div()
            .relative()
            .mt(px(10.))
            .w(px(width.min(720.)))
            .p(px(20.))
            .rounded(px(16.))
            .border_1()
            .border_color(if wrapped { rgba(0xffa67a71) } else { rgba(0xb9a2fb46) })
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.094), offset: gpui::point(px(0.), px(14.)), blur_radius: px(34.), spread_radius: px(0.) }])
            .overflow_hidden()
            .child(ui::css_background(css, 16.))
    }

    fn music_header(icon: &'static str, title: &str, small: &str, pill: Option<(&str, Hsla)>, window: &Window) -> gpui::Div {
        let muted: Hsla = Theme::muted().into();
        div()
            .relative()
            .mb(px(16.))
            .flex()
            .items_center()
            .gap(px(12.))
            .child(
                div()
                    .relative()
                    .flex_none()
                    .size(px(42.))
                    .rounded(px(14.))
                    .shadow(vec![gpui::BoxShadow { color: Hsla::from(Theme::lavender()).opacity(0.4), offset: gpui::point(px(0.), px(8.)), blur_radius: px(20.), spread_radius: px(0.) }])
                    .child(ui::css_background("linear-gradient(135deg, #a78bfa, #ca84e5)", 14.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(ui::icon(icon, 18., gpui::white())),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(3.))
                    .child(div().text_size(px(17.)).line_height(px(25.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::ink()).child(title.to_string()))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(small.to_string())),
            )
            .when_some(pill, |d, (label, color)| {
                let edged = label == "WRAPPED";
                // Letter-spacing 0.08em, which GPUI cannot draw: the pill keeps its width anyway.
                let spacing = label.chars().count() as f32 * 0.8;
                let text = f32::from(ui::text_width(window, label, FontWeight::BLACK, 10.));
                d.child(
                    div()
                        .flex_none()
                        .w(px(text + spacing + 22. + if edged { 2. } else { 0. }))
                        .py(px(5.))
                        .rounded_full()
                        .bg(color.opacity(0.15))
                        // `.wrapped-pill` has an edge and a wider glow; `.live` neither.
                        .when(edged, |d| d.border_1().border_color(color.opacity(0.3)))
                        .shadow(vec![gpui::BoxShadow { color: color.opacity(if edged { 0.3 } else { 0.25 }), offset: gpui::point(px(0.), px(0.)), blur_radius: px(if edged { 12. } else { 10. }), spread_radius: px(0.) }])
                        .flex()
                        .justify_center()
                        .text_size(px(10.))
                        .line_height(px(15.))
                        .font_weight(FontWeight::BLACK)
                        .text_color(color)
                        .child(label.to_string()),
                )
            })
    }

    fn music_section_title(label: &str) -> gpui::Div {
        div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::muted()).child(label.to_uppercase())
    }

    /// `.music-quick-actions`: a rule, then the shortcut buttons.
    fn music_actions(&self, message: &Message, buttons: Vec<(&'static str, &'static str, &'static str)>, width: f32, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let room = message.payload.as_ref().and_then(|p| p.get("voiceChannelId")).and_then(Value::as_str).map(str::to_string);
        let widths: Vec<f32> = buttons.iter().map(|(_, _, label)| 12. + 14. + 4. + f32::from(ui::text_width(window, label, FontWeight::EXTRA_BOLD, 11.)) + 12. + 2.).collect();
        let mut out = div().mt(px(18.)).pt(px(14.)).border_t_1().border_color(Theme::line()).flex().flex_col().gap(px(8.));
        for row in pack(&widths, width, 8.) {
            let mut line = div().flex().gap(px(8.));
            for i in row {
                let (command, icon, label) = buttons[i];
                let room = room.clone();
                line = line.child(
                    div()
                        .id(SharedString::from(format!("mq-{}-{i}", message.id)))
                        .px(px(12.))
                        .py(px(8.))
                        .rounded(px(10.))
                        .bg(rgba(0x1a1628d9))
                        .border_1()
                        .border_color(Theme::line())
                        .flex()
                        .items_center()
                        .gap(px(4.))
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(Theme::muted())
                        .cursor_pointer()
                        .hover(|s| s.text_color(Theme::ink()).border_color(Theme::lavender()).bg(crate::theme::mix(Theme::lavender(), 0.16, Theme::panel())))
                        .child(ui::icon(icon, 14., Theme::muted()))
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| this.run_music_command(command.to_string(), room.clone(), cx))),
                );
            }
            out = out.child(line);
        }
        out
    }

    /// MusicStatsCard: Room listening stats, or the Wrapped recap.
    fn render_music_stats(&self, message: &Message, p: &Value, width: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let wrapped = p.get("wrapped").and_then(Value::as_bool).unwrap_or(false);
        let s = |k: &str| p.get(k).and_then(|v| match v {
            Value::String(s) if !s.is_empty() => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        });
        let muted: Hsla = Theme::muted().into();
        let ink: Hsla = Theme::ink().into();
        let inner = width.min(720.) - 40. - 2.;
        let label = s("label").unwrap_or_else(|| if wrapped { "Annual music recap & highlights".into() } else { "All time in this room".into() });
        let mut card = Self::music_frame(wrapped, width).child(Self::music_header(
            if wrapped { "sparkles" } else { "bar-chart-2" },
            if wrapped { "Room Wrapped 2026" } else { "Room listening stats" },
            &label,
            Some(if wrapped { ("WRAPPED", rgb(0xff9d6c).into()) } else { ("LIVE STATS", Theme::mint().into()) }),
            window,
        ));
        let highlights: Vec<(&str, &str, String)> = [("sparkles", "Room Personality", s("personality")), ("crown", "Top Artist", s("topArtist")), ("music-2", "Top Genre", s("topGenre")), ("moon-star", "Peak Listening", s("peakHour"))]
            .into_iter()
            .filter_map(|(i, l, v)| v.map(|v| (i, l, v)))
            .collect();
        let has_highlights = wrapped || s("personality").is_some() || s("topArtist").is_some() || s("topGenre").is_some();
        if has_highlights && !highlights.is_empty() {
            let cols = auto_fit(inner, 130., 8., highlights.len());
            let cell = (inner - 8. * (cols as f32 - 1.)) / cols as f32;
            let mut grid = div().relative().mb(px(16.)).flex().flex_col().gap(px(8.));
            for row in highlights.chunks(cols) {
                let mut line = div().flex().gap(px(8.));
                for (icon, label, value) in row {
                    line = line.child(
                        div()
                            .w(px(cell))
                            .px(px(12.))
                            .py(px(10.))
                            .rounded(px(12.))
                            .bg(rgb(0x2b2441))
                            .border_1()
                            .border_color(rgba(0xb39bfb59))
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .child(ui::icon(icon, 16., ink))
                            .child(
                                div()
                                    .min_w_0()
                                    .flex()
                                    .flex_col()
                                    .child(div().text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(label.to_uppercase()))
                                    .child(div().h(px(24.)).pt(px(4.5)).text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child(value.clone())),
                            ),
                    );
                }
                grid = grid.child(line);
            }
            card = card.child(grid);
        }
        // Totals: plays, unique, hours (and the streak).
        let mut totals: Vec<(String, &str)> = vec![(s("plays").unwrap_or_else(|| "0".into()), "Total Plays"), (s("unique").unwrap_or_else(|| "0".into()), "Unique Tracks"), (s("hours").unwrap_or_else(|| "0".into()), "Listening Hours")];
        if let Some(days) = s("streakDays").filter(|d| d != "0") {
            totals.push((format!("{days}d"), "Active Streak"));
        }
        let cols = auto_fit(inner, 100., 10., totals.len());
        let cell = (inner - 10. * (cols as f32 - 1.)) / cols as f32;
        let mut grid = div().relative().flex().flex_col().gap(px(10.));
        for row in totals.chunks(cols) {
            let mut line = div().flex().gap(px(10.));
            for (value, label) in row {
                line = line.child(
                    div()
                        .w(px(cell))
                        .p(px(12.))
                        .rounded(px(13.))
                        .bg(rgba(0x1a1628e6))
                        .border_1()
                        .border_color(Theme::line())
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(div().text_size(px(22.)).line_height(px(33.)).font_weight(FontWeight::BLACK).text_color(ink).child(value.clone()))
                        .child(div().text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(label.to_uppercase())),
                );
            }
            grid = grid.child(line);
        }
        card = card.child(grid);
        // Top tracks with their bars and a Play button each.
        let songs: Vec<(String, f64)> = p
            .get("topSongs")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|e| Some((e.get(0)?.as_str()?.to_string(), e.get(1)?.as_f64()?))).collect())
            .unwrap_or_default();
        let maximum = songs.iter().map(|(_, c)| *c).fold(1., f64::max);
        let room = p.get("voiceChannelId").and_then(Value::as_str).map(str::to_string);
        let mut chart = div().relative().mt(px(18.)).flex().flex_col().child(Self::music_section_title("Top tracks").mb(px(10.)));
        if songs.is_empty() {
            chart = chart.child(div().text_size(px(12.)).italic().text_color(muted).child("Play a few tracks and your top room history will appear here."));
        }
        let button_w = 10. + 13. + 5. + f32::from(ui::text_width(window, "Play", FontWeight::EXTRA_BOLD, 11.)) + 10. + 2.;
        let info_w = inner - 12. - 28. - 40. - button_w - 30.;
        for (n, (title, count)) in songs.iter().enumerate() {
            let rank: AnyElement = if n < 3 { ui::icon("trophy", 14., rgb(0xf3bd5d)).into_any_element() } else { div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BLACK).text_color(muted).child((n + 1).to_string()).into_any_element() };
            let bar = (count / maximum * 100.).max(10.) as f32 / 100. * info_w;
            let (command, room) = (format!("/play {title}"), room.clone());
            chart = chart.child(
                div()
                    .id(SharedString::from(format!("mc-{}-{n}", message.id)))
                    .min_h(px(38.))
                    .px(px(6.))
                    .py(px(4.))
                    .rounded(px(8.))
                    .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.08)))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(div().w(px(28.)).flex_none().flex().justify_center().child(rank))
                    .child(
                        div()
                            .w(px(info_w))
                            .flex_none()
                            .flex()
                            .flex_col()
                            .gap(px(4.))
                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(ink).child(ui::fit(window, title, FontWeight::BOLD, 13., px(info_w))))
                            .child(div().relative().w(px(bar)).h(px(4.)).rounded_full().child(ui::css_background("linear-gradient(90deg, #a78bfa, #dc96a5)", 2.))),
                    )
                    .child(div().w(px(40.)).flex_none().flex().justify_end().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(format!("{}×", *count as i64)))
                    .child(
                        div()
                            .id(SharedString::from(format!("mp-{}-{n}", message.id)))
                            .flex_none()
                            .px(px(10.))
                            .py(px(4.))
                            .rounded(px(8.))
                            .bg(rgb(0x2f2848))
                            .border_1()
                            .border_color(rgba(0xaf96fa71))
                            .flex()
                            .items_center()
                            .gap(px(5.))
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(ink)
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::lavender()).text_color(gpui::white()))
                            .child(ui::icon("play", 13., ink))
                            .child("Play")
                            .on_click(cx.listener(move |this, _, _, cx| this.run_music_command(command.clone(), room.clone(), cx))),
                    ),
            );
        }
        card = card.child(chart);
        // Top listeners as chips.
        let listeners: Vec<(String, f64)> = p
            .get("topRequesters")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|e| Some((e.get(0)?.as_str()?.to_string(), e.get(1)?.as_f64()?))).collect())
            .unwrap_or_default();
        if !listeners.is_empty() {
            let chips: Vec<(String, String)> = listeners.iter().map(|(name, count)| (name.clone(), format!("{} plays", *count as i64))).collect();
            let widths: Vec<f32> = chips
                .iter()
                .map(|(name, plays)| 12. + 13. + 6. + f32::from(ui::text_width(window, &format!(" {name}"), FontWeight::BOLD, 12.)) + 6. + 6. + f32::from(ui::text_width(window, plays, FontWeight::BLACK, 12.)) + 12. + 2.)
                .collect();
            let mut tags = div().flex().flex_col().gap(px(8.));
            for row in pack(&widths, inner, 8.) {
                let mut line = div().flex().gap(px(8.));
                for i in row {
                    let (name, plays) = &chips[i];
                    line = line.child(
                        div()
                            .px(px(12.))
                            .py(px(6.))
                            .rounded_full()
                            .bg(rgb(0x2b2441))
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(ink)
                            .child(ui::icon("user", 13., muted))
                            .child(format!(" {name}"))
                            .child(div().ml(px(6.)).font_weight(FontWeight::BLACK).text_color(Theme::lavender()).child(plays.clone())),
                    );
                }
                tags = tags.child(line);
            }
            card = card.child(div().relative().mt(px(18.)).flex().flex_col().gap(px(8.)).child(Self::music_section_title("Top listeners").mb(px(10.))).child(tags));
        }
        let actions = if wrapped {
            vec![("/stats", "bar-chart-2", "Listening Stats"), ("/settings", "settings", "Room Settings"), ("/lyricsnow", "music-2", "Lyrics")]
        } else {
            vec![("/wrapped", "sparkles", "Room Wrapped"), ("/settings", "settings", "Room Settings"), ("/lyricsnow", "music-2", "Lyrics")]
        };
        card = card.child(self.music_actions(message, actions, inner, window, cx).relative());
        card.into_any_element()
    }

    /// The small bordered button of the chart rows (`.music-play-track-btn`).
    fn music_small_button(&self, id: String, icon: &'static str, label: &'static str, command: String, room: Option<String>, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let ink: Hsla = Theme::ink().into();
        div()
            .id(SharedString::from(id))
            .flex_none()
            .px(px(10.))
            .py(px(4.))
            .rounded(px(8.))
            .bg(rgb(0x2f2848))
            .border_1()
            .border_color(rgba(0xaf96fa71))
            .flex()
            .items_center()
            .gap(px(5.))
            .text_size(px(11.))
            .line_height(px(16.5))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(ink)
            .cursor_pointer()
            .hover(|s| s.bg(Theme::lavender()).text_color(gpui::white()))
            .child(ui::icon(icon, 13., ink))
            .child(label)
            .on_click(cx.listener(move |this, _, _, cx| this.run_music_command(command.clone(), room.clone(), cx)))
    }

    /// MusicQueueCard: what is playing (Skip), what is next (Jump, remove) and the queue tools.
    /// Its header is not the stats card's: the title and the line under it run on as one inline
    /// text, and the three parts shrink together like Chrome's flexbox (the READY pill wraps).
    fn render_music_queue(&self, message: &Message, p: &Value, width: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let muted: Hsla = Theme::muted().into();
        let ink: Hsla = Theme::ink().into();
        let lavender: Hsla = Theme::lavender().into();
        let mint: Hsla = Theme::mint().into();
        let inner = width.min(720.) - 40. - 2.;
        let room = p.get("voiceChannelId").and_then(Value::as_str).map(str::to_string);
        let queue: Vec<Value> = p.get("queue").and_then(Value::as_array).cloned().unwrap_or_default();
        let n = queue.len();
        let title = "Room Music Queue";
        let small = if n > 0 { format!("{n} track{} waiting in queue", if n == 1 { "" } else { "s" }) } else { "The queue is currently empty".into() };
        let pill = if n > 0 { format!("{n} QUEUED") } else { "READY".into() };
        let title_w = f32::from(ui::text_width(window, title, FontWeight::BOLD, 16.));
        let small_w = f32::from(ui::text_width(window, &small, FontWeight::NORMAL, 12.8));
        let pill_text = f32::from(ui::text_width(window, &pill, FontWeight::BLACK, 10.)) + pill.chars().count() as f32 * 0.8;
        let widths = ui::css_shrink(&[px(42.), px(title_w + small_w), px(pill_text + 22.)], &[px(18.), px(0.), px(22. + 8.)], px(inner - 24.));
        let (icon_w, text_w, pill_w) = (f32::from(widths[0]), f32::from(widths[1]), f32::from(widths[2]));
        // The inline text, line by line: the title, then as many of the line's words as fit after it.
        let mut lines: Vec<(bool, String)> = Vec::new();
        let mut used = title_w;
        let mut current = String::new();
        let mut first = true;
        for word in small.split(' ') {
            let candidate = if current.is_empty() { word.to_string() } else { format!("{current} {word}") };
            let w = f32::from(ui::text_width(window, &candidate, FontWeight::NORMAL, 12.8));
            if used + w <= text_w + 0.5 || (current.is_empty() && !first) {
                current = candidate;
            } else {
                lines.push((first, current.clone()));
                first = false;
                used = 0.;
                current = word.to_string();
            }
        }
        lines.push((first, current));
        let mut text = div().w(px(text_w)).flex_none().flex().flex_col();
        for (with_title, part) in lines {
            text = text.child(
                div()
                    .h(px(24.))
                    .flex()
                    .items_baseline()
                    .when(with_title, |d| d.child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(title)))
                    .child(div().text_size(px(12.8)).line_height(px(19.2)).text_color(ink).child(part)),
            );
        }
        // The pill's text breaks anywhere when it does not fit (READ / Y).
        let room_for = pill_w - 22.;
        let mut pill_lines: Vec<String> = Vec::new();
        let mut cur = String::new();
        for ch in pill.chars() {
            let next = format!("{cur}{ch}");
            let w = f32::from(ui::text_width(window, &next, FontWeight::BLACK, 10.)) + next.chars().count() as f32 * 0.8;
            if w > room_for + 0.5 && !cur.is_empty() {
                pill_lines.push(std::mem::take(&mut cur));
                cur.push(ch);
            } else {
                cur = next;
            }
        }
        pill_lines.push(cur);
        let header = div()
            .relative()
            .mb(px(16.))
            .flex()
            .items_center()
            .gap(px(12.))
            .child(
                div()
                    .relative()
                    .flex_none()
                    .w(px(icon_w))
                    .h(px(42.))
                    .rounded(px(14.))
                    .shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.4), offset: gpui::point(px(0.), px(8.)), blur_radius: px(20.), spread_radius: px(0.) }])
                    .child(ui::css_background("linear-gradient(135deg, #a78bfa, #ca84e5)", 14.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(ui::icon("list", 18., gpui::white())),
            )
            .child(text)
            .child(
                div()
                    .flex_none()
                    .w(px(pill_w))
                    .py(px(5.))
                    .px(px(11.))
                    .rounded_full()
                    .bg(mint.opacity(0.15))
                    .shadow(vec![gpui::BoxShadow { color: mint.opacity(0.25), offset: gpui::point(px(0.), px(0.)), blur_radius: px(10.), spread_radius: px(0.) }])
                    .flex()
                    .flex_col()
                    .text_size(px(10.))
                    .line_height(px(15.))
                    .font_weight(FontWeight::BLACK)
                    .text_color(mint)
                    .children(pill_lines.into_iter().map(|l| div().child(l))),
            );
        let mut card = Self::music_frame(false, width).child(header);
        if let Some(track) = p.get("currentTrack").filter(|t| t.is_object()) {
            let title = track.get("title").and_then(Value::as_str).unwrap_or_default().to_string();
            let artist = track.get("artist").and_then(Value::as_str).filter(|a| !a.is_empty()).map(str::to_string);
            let skip_w = 10. + 13. + 5. + f32::from(ui::text_width(window, "Skip", FontWeight::EXTRA_BOLD, 11.)) + 10. + 2.;
            let details_w = inner - 28. - 2. - 18. - 24. - skip_w;
            card = card.child(
                div()
                    .relative()
                    .px(px(14.))
                    .py(px(12.))
                    .rounded(px(12.))
                    .bg(rgb(0x2f2848))
                    .border_1()
                    .border_color(rgba(0xb198fb65))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(ui::icon("music-2", 18., lavender))
                    .child(
                        div()
                            .w(px(details_w))
                            .flex()
                            .flex_col()
                            .gap(px(2.))
                            .child(div().text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::EXTRA_BOLD).text_color(lavender).child("NOW PLAYING"))
                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child(ui::fit(window, &title, FontWeight::EXTRA_BOLD, 13., px(details_w))))
                            .when_some(artist, |d, a| d.child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(a))),
                    )
                    .child(self.music_small_button(format!("mskip-{}", message.id), "skip-forward", "Skip", "/skip".into(), room.clone(), cx)),
            );
        }
        let mut chart = div().relative().mt(px(18.)).flex().flex_col().child(Self::music_section_title(&format!("Up Next ({n})")).mb(px(10.)));
        if queue.is_empty() {
            // `p.music-empty` takes the message paragraph's 16px italic, with the command in mono.
            let (before, code, after) = ("The queue is empty. Use ", "/play song name", " to add tracks.");
            let mut text = format!("{before}{code}{after}");
            let ui_font = gpui::Font { style: gpui::FontStyle::Italic, ..gpui::font(crate::theme::UI_FONT) };
            // Message paragraphs wrap with `text-wrap: pretty`: no one-word last line.
            crate::rich::pretty(&mut text, &crate::rich::Wrap { on_channel: None, window, width: px(inner), font: ui_font.clone(), size: px(16.) });
            let mono = gpui::Font { style: gpui::FontStyle::Italic, ..gpui::font(crate::theme::MONO_FONT) };
            let run = |len: usize, font: gpui::Font| gpui::TextRun { len, font, color: ink, background_color: None, underline: None, strikethrough: None };
            let runs = vec![run(before.len(), ui_font.clone()), run(code.len(), mono), run(after.len(), ui_font)];
            chart = chart.child(div().pt(px(1.)).text_size(px(16.)).line_height(px(24.8)).text_color(ink).child(gpui::StyledText::new(text).with_runs(runs)));
        }
        let jump_w = 10. + 13. + 5. + f32::from(ui::text_width(window, "Jump", FontWeight::EXTRA_BOLD, 11.)) + 10. + 2.;
        let info_w = inner - 12. - 28. - (jump_w + 6. + 32.) - 20.;
        for item in &queue {
            let index = item.get("index").and_then(Value::as_i64).unwrap_or(0);
            let title = item.get("title").and_then(Value::as_str).unwrap_or_default().to_string();
            let artist = item.get("artist").and_then(Value::as_str).filter(|a| !a.is_empty()).map(str::to_string);
            let (remove, room2) = (format!("/remove {index}"), room.clone());
            chart = chart.child(
                div()
                    .min_h(px(38.))
                    .px(px(6.))
                    .py(px(4.))
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(div().w(px(28.)).flex_none().flex().justify_center().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BLACK).text_color(muted).child(format!("#{index}")))
                    .child(
                        div()
                            .w(px(info_w))
                            .flex_none()
                            .flex()
                            .flex_col()
                            .gap(px(4.))
                            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(ink).child(ui::fit(window, &title, FontWeight::BOLD, 13., px(info_w))))
                            .when_some(artist, |d, a| d.child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(ui::fit(window, &a, FontWeight::NORMAL, 11., px(info_w))))),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .child(self.music_small_button(format!("mjump-{}-{index}", message.id), "play", "Jump", format!("/skipto {index}"), room.clone(), cx))
                            .child(
                                div()
                                    .id(SharedString::from(format!("mrm-{}-{index}", message.id)))
                                    .px(px(8.))
                                    .py(px(4.))
                                    .rounded(px(8.))
                                    .bg(muted.opacity(0.12))
                                    .border_1()
                                    .border_color(Theme::line())
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Hsla::from(rgb(0xff5555)).opacity(0.2)).border_color(rgba(0xff555566)))
                                    .child(ui::icon("x", 14., muted))
                                    .on_click(cx.listener(move |this, _, _, cx| this.run_music_command(remove.clone(), room2.clone(), cx))),
                            ),
                    ),
            );
        }
        card = card.child(chart);
        let actions = vec![("/shuffle", "shuffle", "Shuffle"), ("/removedupes", "rotate-ccw", "Remove Dupes"), ("/clear", "trash-2", "Clear Queue"), ("/settings", "settings", "Settings")];
        card = card.child(self.music_actions(message, actions, inner, window, cx).relative());
        card.into_any_element()
    }

    /// `.music-card-section-label`: 14px above (collapsing with what is before), 8px below.
    fn music_label(label: &str) -> gpui::Div {
        Self::music_section_title(label)
    }

    /// One `.music-setting-toggle`: label and hint, the switch on the right.
    fn music_toggle(id: String, label: &str, hint: &str, on: bool, cell: f32, height: f32) -> gpui::Stateful<gpui::Div> {
        let lavender: Hsla = Theme::lavender().into();
        let text_w = cell - 28. - 2. - 36. - 10.;
        div()
            .id(SharedString::from(id))
            .w(px(cell))
            .h(px(height))
            .px(px(14.))
            .py(px(12.))
            .rounded(px(13.))
            .border_1()
            .when(on, |d| d.bg(rgb(0x2e2645)).border_color(rgba(0xaa8efab8)))
            .when(!on, |d| d.bg(rgba(0x1a1628eb)).border_color(Theme::line()).hover(|s| s.bg(rgb(0x2e2645)).border_color(rgba(0xaa8efab8))))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(10.))
            .cursor_pointer()
            .child(
                div()
                    .w(px(text_w))
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(label.to_string()))
                    .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child(hint.to_string())),
            )
            .child(
                div()
                    .relative()
                    .flex_none()
                    .w(px(36.))
                    .h(px(20.))
                    .rounded_full()
                    .bg(if on { lavender } else { Hsla::from(Theme::line()) })
                    .child(
                        div()
                            .absolute()
                            .top(px(2.))
                            .left(px(if on { 18. } else { 2. }))
                            .size(px(16.))
                            .rounded_full()
                            .bg(gpui::white())
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.2), offset: gpui::point(px(0.), px(1.)), blur_radius: px(4.), spread_radius: px(0.) }]),
                    ),
            )
    }

    /// How tall a toggle is: its label and hint wrapped in the room beside the switch.
    fn toggle_height(window: &Window, label: &str, hint: &str, cell: f32) -> f32 {
        let text_w = px(cell - 28. - 2. - 36. - 10.);
        let lines = |text: &str, weight: FontWeight, size: f32| {
            let mut face = gpui::font(crate::theme::UI_FONT);
            face.weight = weight;
            let mut wrapper = window.text_system().line_wrapper(face, px(size));
            wrapper.wrap_line(&[gpui::LineFragment::text(text)], text_w).count() + 1
        };
        12. + lines(label, FontWeight::BOLD, 16.) as f32 * 24. + 2. + lines(hint, FontWeight::NORMAL, 11.) as f32 * 16.5 + 12. + 2.
    }

    /// `.music-filter-row`: buttons that wrap, the active one raised 1px in the accent.
    fn music_filter_row(&self, message: &Message, prefix: &str, items: Vec<(String, String, bool)>, room: Option<String>, inner: f32, window: &Window, cx: &mut Context<Self>) -> gpui::Div {
        let widths: Vec<f32> = items.iter().map(|(_, label, _)| 12. + f32::from(ui::text_width(window, label, FontWeight::EXTRA_BOLD, 11.)) + 12. + 2.).collect();
        let mut out = div().relative().flex().flex_col().gap(px(8.));
        for row in pack(&widths, inner, 8.) {
            let mut line = div().flex().gap(px(8.));
            for i in row {
                let (command, label, active) = items[i].clone();
                let (room, card) = (room.clone(), message.id.clone());
                line = line.child(
                    div()
                        .id(SharedString::from(format!("{prefix}-{}-{i}", message.id)))
                        .px(px(12.))
                        .py(px(8.))
                        .rounded(px(10.))
                        .border_1()
                        .when(active, |d| d.mt(px(-1.)).mb(px(1.)).bg(rgb(0x31294a)).border_color(Theme::lavender()).text_color(Theme::ink()))
                        .when(!active, |d| {
                            d.bg(rgba(0x1a1628d9))
                                .border_color(Theme::line())
                                .text_color(Theme::muted())
                                .hover(|s| s.text_color(Theme::ink()).border_color(Theme::lavender()).bg(rgb(0x31294a)))
                        })
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .cursor_pointer()
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| this.run_music_command_for(command.clone(), room.clone(), Some(card.clone()), cx))),
                );
            }
            out = out.child(line);
        }
        out
    }

    /// MusicSettingsCard: the room's playback switches, mood radio, crossfade, filters and the
    /// singing voice for your own mic.
    fn render_music_settings(&self, message: &Message, p: &Value, width: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let muted: Hsla = Theme::muted().into();
        let ink: Hsla = Theme::ink().into();
        let inner = width.min(720.) - 40. - 2.;
        let mut settings = p.as_object().cloned().unwrap_or_default();
        if let Some(over) = self.music_settings.get(&message.id) {
            for (k, v) in over {
                settings.insert(k.clone(), v.clone());
            }
        }
        let flag = |k: &str| settings.get(k).and_then(Value::as_bool).unwrap_or(false);
        let room = settings.get("voiceChannelId").and_then(Value::as_str).map(str::to_string);
        let disabled = room.is_none();
        let mut card = Self::music_frame(false, width).child(Self::music_header(
            "settings",
            "Music room settings",
            "Configure audio, playback, and AI DJ features for this room",
            Some(if disabled { ("JOIN VOICE", muted) } else { ("LIVE ROOM", Theme::mint().into()) }),
            window,
        ));
        let cell = (inner - 10.) / 2.;
        // Playback & AI controls, two to a row; a row is as tall as its taller toggle.
        let toggles: Vec<(&str, &str, &str, &str)> = vec![
            ("autoplay", "Smart Autoplay", "Keep room playing related tracks", "/autoplay"),
            ("automix", "AutoMix DJ", "Spotify-style auto transitions", "/automix"),
            ("artist_diversity", "Artist diversity", "Avoid repeat artist tracks", "/artistdiversity"),
            ("vibe_match", "Vibe matching", "Maintain mood energy", "/vibematch"),
        ];
        let mut grid = div().relative().flex().flex_col().gap(px(10.));
        for (r, pair) in toggles.chunks(2).enumerate() {
            let height = pair.iter().map(|(_, l, h, _)| Self::toggle_height(window, l, h, cell)).fold(0., f32::max);
            let mut line = div().flex().gap(px(10.));
            for (c, (key, label, hint, command)) in pair.iter().enumerate() {
                let on = flag(key);
                let command = format!("{command} {}", if on { "off" } else { "on" });
                let (room, card_id) = (room.clone(), message.id.clone());
                line = line.child(
                    Self::music_toggle(format!("mt-{}-{r}-{c}", message.id), label, hint, on, cell, height)
                        .on_click(cx.listener(move |this, _, _, cx| this.run_music_command_for(command.clone(), room.clone(), Some(card_id.clone()), cx))),
                );
            }
            grid = grid.child(line);
        }
        card = card.child(Self::music_label("Playback & AI Controls").relative().mb(px(8.))).child(grid);
        // Mood radio, when the bot has stations with songs.
        let stations: Vec<Value> = settings.get("radio_stations").and_then(Value::as_array).map(|a| a.iter().filter(|s| s.get("songs").and_then(Value::as_f64).unwrap_or(0.) > 0.).cloned().collect()).unwrap_or_default();
        let radio = settings.get("radio").and_then(Value::as_str).map(str::to_string);
        if !stations.is_empty() {
            let mut items: Vec<(String, String, bool)> = stations
                .iter()
                .map(|s| {
                    let id = s.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
                    let on = radio.as_deref() == Some(id.as_str());
                    let label = format!("{} {}", s.get("emoji").and_then(Value::as_str).unwrap_or_default(), s.get("label").and_then(Value::as_str).unwrap_or_default());
                    (format!("/radio {}", if on { "off".to_string() } else { id }), label, on)
                })
                .collect();
            if radio.is_some() {
                items.push(("/radio off".into(), "Off".into(), false));
            }
            card = card.child(Self::music_label("Mood Radio").relative().mt(px(14.)).mb(px(8.))).child(self.music_filter_row(message, "mr", items, room.clone(), inner, window, cx));
        }
        // Crossfade: 0–10 s, in the first of two columns.
        let crossfade = settings.get("crossfade_seconds").and_then(Value::as_f64).unwrap_or(0.).clamp(0., 10.);
        let slider_w = (inner - 16.) / 2.;
        let fill = (crossfade / 10.) as f32;
        let (room2, card_id) = (room.clone(), message.id.clone());
        let spot = super::profile_card::spot();
        card = card.child(Self::music_label("Mix & Transition Timings").relative().mt(px(14.)).mb(px(10.))).child(
            div()
                .relative()
                .w(px(slider_w))
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .flex()
                        .justify_between()
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(muted)
                        .child("Crossfade")
                        .child(div().font_weight(FontWeight::BLACK).text_color(ink).child(format!("{}s", crossfade as i64))),
                )
                .child(
                    div()
                        .id(SharedString::from(format!("mcf-{}", message.id)))
                        .relative()
                        .w(px(slider_w))
                        .h(px(16.))
                        .cursor_pointer()
                        .child(div().absolute().left_0().right_0().top(px(4.)).h(px(8.)).rounded_full().bg(rgb(0x2b2a33)).border_1().border_color(rgb(0x767680)))
                        .child(div().absolute().left_0().top(px(4.)).w(px(slider_w * fill)).h(px(8.)).rounded_full().bg(Theme::lavender()))
                        .child(div().absolute().left(px((slider_w - 16.) * fill)).top_0().size(px(16.)).rounded_full().bg(Theme::lavender()))
                        .child(super::profile_card::track(&spot))
                        .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                            let b = spot.get();
                            let share = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width)).clamp(0., 1.);
                            let seconds = (share * 10.).round() as i64;
                            this.music_settings.entry(card_id.clone()).or_default().insert("crossfade_seconds".into(), Value::from(seconds));
                            this.run_music_command_for(format!("/crossfade {seconds}"), room2.clone(), Some(card_id.clone()), cx);
                            cx.notify();
                        })),
                ),
        );
        // Audio effects & filters.
        let filter = settings.get("audio_filter").and_then(Value::as_str).filter(|f| !f.is_empty()).unwrap_or("off").to_string();
        let presets = [("off", "Clean"), ("bassboost", "Bass Boost"), ("nightcore", "Nightcore"), ("slowed", "Slowed"), ("8d", "8D Spatial"), ("karaoke", "Karaoke")];
        let items: Vec<(String, String, bool)> = presets.iter().map(|(id, label)| (format!("/filter {id}"), label.to_string(), filter == *id)).collect();
        card = card.child(Self::music_label("Audio Effects & Filters").relative().mt(px(14.)).mb(px(8.))).child(self.music_filter_row(message, "mf", items, room.clone(), inner, window, cx));
        // Your mic: the singing voice (autotune) is not in this app's voice chain yet.
        let hint = if filter == "karaoke" { "Sing along with autotune" } else { "Autotune on your mic" };
        let height = Self::toggle_height(window, "Singing voice", hint, cell);
        card = card.child(Self::music_label("Your Mic").relative().mt(px(14.)).mb(px(8.))).child(
            div().relative().flex().child(
                Self::music_toggle(format!("msing-{}", message.id), "Singing voice", hint, false, cell, height)
                    .on_click(cx.listener(|this, _, _, cx| this.set_notice("The singing voice is not in this app yet.", cx))),
            ),
        );
        let actions = vec![
            ("/wrapped", "sparkles", "Wrapped"),
            ("/stats", "bar-chart-2", "Stats"),
            ("/like", "heart", "Like"),
            ("/dislike", "thumbs-down", "Avoid"),
            ("/lyricsnow", "music-2", "Lyrics"),
            ("/queue", "list", "Queue"),
            ("/shuffle", "shuffle", "Shuffle"),
        ];
        card = card.child(self.music_actions(message, actions, inner, window, cx).relative());
        card.into_any_element()
    }
}
