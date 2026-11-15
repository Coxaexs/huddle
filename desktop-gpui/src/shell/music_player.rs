//! The room's music, out of the chat: MiniMusicBar (components/mini-music-bar.tsx) in the sidebar
//! while your voice room's bot plays, and the full-screen MusicPlayer (components/music-player.tsx,
//! music-player.css): where it plays, the views (Lyrics, Up next, Search, Playlists, DJ), the song
//! with its cover, progress, controls and your own volume, and the chosen view beside it.

use std::cell::Cell;

use gpui::{AnimationExt as _, AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::theme::{DISPLAY_FONT, MONO_FONT, Theme};
use crate::ui;

/// One song in a room's player (lib/protocol.ts Track), as far as these views read it.
#[derive(Clone, Default)]
pub(super) struct Song {
    title: String,
    artist: String,
    thumbnail: Option<String>,
    duration: Option<f64>,
    requested_by: String,
    playlist: Option<String>,
}

impl Song {
    fn from(v: &Value) -> Option<Song> {
        let o = v.as_object()?;
        let s = |k: &str| o.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
        Some(Song {
            title: s("title"),
            artist: s("artist"),
            thumbnail: o.get("thumbnail").and_then(Value::as_str).filter(|t| !t.is_empty()).map(str::to_string),
            duration: o.get("duration").and_then(Value::as_f64),
            requested_by: s("requestedBy"),
            playlist: o.get("playlist").and_then(|p| p.get("name")).and_then(Value::as_str).map(str::to_string),
        })
    }
}

/// PlayerState, read: the song, what is up next, paused, where it is.
pub(super) struct Room {
    track: Option<Song>,
    queue: Vec<Song>,
    paused: bool,
    position_ms: f64,
    loop_mode: String,
}

/// LyricsData: timed lines (or plain text) for the playing song.
struct Lyrics {
    track: String,
    lines: Vec<(f64, String)>,
    plain: String,
}

pub(super) struct MusicPlayer {
    room: Option<String>,
    tab: &'static str,
    note: Option<(String, std::time::Instant)>,
    busy: bool,
    lyrics: Option<Lyrics>,
    lyrics_loading: Option<String>,
    finding: bool,
    lyrics_error: Option<String>,
    lyrics_scroll: gpui::ScrollHandle,
    last_line: Cell<Option<usize>>,
    lyrics_asked: std::cell::RefCell<Option<String>>,
    volume_spot: super::profile_card::Spot,
    search: gpui::Entity<crate::input::TextInput>,
    results: Option<Vec<Found>>,
    searched: String,
    searching: bool,
    search_error: Option<String>,
    /// "next" or "queue" by url, once added.
    added: std::collections::HashMap<String, &'static str>,
    _search_sub: gpui::Subscription,
}

/// SongResult: a search hit.
#[derive(Clone)]
struct Found {
    title: String,
    artist: String,
    duration: Option<f64>,
    thumbnail: Option<String>,
    url: String,
    words: bool,
}

/// clock(): m:ss, or h:mm:ss; "–:––" when unknown.
fn clock(seconds: Option<f64>) -> String {
    let Some(s) = seconds.filter(|s| s.is_finite()) else { return "–:––".into() };
    let whole = s.max(0.).floor() as i64;
    let (h, m, r) = (whole / 3600, (whole % 3600) / 60, whole % 60);
    if h > 0 { format!("{h}:{m:02}:{r:02}") } else { format!("{m}:{r:02}") }
}

const TABS: [(&str, &str, &str); 5] = [("lyrics", "Lyrics", "mic-vocal"), ("queue", "Up next", "list-music"), ("search", "Search", "search"), ("playlists", "Playlists", "library"), ("dj", "DJ", "disc-3")];

impl MusicPlayer {
    /// Typing in the search bar: Space is a space there, not play / pause.
    pub(super) fn typing(&self, window: &Window, cx: &gpui::App) -> bool {
        gpui::Focusable::focus_handle(&self.search, cx).is_focused(window)
    }

    pub(super) fn dev_search(&mut self, q: &str, cx: &mut gpui::App) {
        self.search.update(cx, |i, cx| i.set_text(q.to_string(), cx));
    }

    pub(super) fn dev_tab(&mut self, tab: &str) {
        self.tab = TABS.iter().find(|t| t.0 == tab).map(|t| t.0).unwrap_or("lyrics");
    }
}

impl Shell {
    /// heard() + playbackPosition(): a room's player as it sounds now.
    pub(super) fn room_player(&self, room: &str) -> Option<Room> {
        let v = self.players.get(room)?;
        let track = v.get("track").and_then(Song::from);
        let paused = v.get("paused").and_then(Value::as_bool).unwrap_or(false);
        let at = v.get("positionMs").and_then(Value::as_f64).unwrap_or(0.);
        let updated = v.get("updatedAt").and_then(Value::as_f64).unwrap_or(0.);
        let mut position_ms = if track.is_none() { 0. } else if paused { at } else { at + (self.hub_now() - updated).max(0.) };
        if let Some(d) = track.as_ref().and_then(|t| t.duration) {
            position_ms = position_ms.min(d * 1000.);
        }
        Some(Room {
            track,
            queue: v.get("queue").and_then(Value::as_array).map(|a| a.iter().filter_map(Song::from).collect()).unwrap_or_default(),
            paused,
            position_ms,
            loop_mode: v.get("loop").and_then(Value::as_str).unwrap_or("off").to_string(),
        })
    }

    /// Re-render four times a second while a song moves on screen (the web's 250ms clock).
    fn music_tick(&self, cx: &mut Context<Self>) {
        if self.music_tick.get() {
            return;
        }
        self.music_tick.set(true);
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(250)).await;
            this.update(cx, |this, cx| {
                this.music_tick.set(false);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn open_music_player(&mut self, room: Option<String>, cx: &mut Context<Self>) {
        let room = room.or_else(|| self.call.as_ref().map(|c| c.channel_id.clone())).or_else(|| {
            self.server().and_then(|s| s.channels.iter().find(|c| c.kind == "voice" && self.players.get(&c.id).is_some_and(|p| !p["track"].is_null())).map(|c| c.id.clone()))
        });
        let search = cx.new(|cx| {
            crate::input::TextInput::new("Songs, artists, or a YouTube / Spotify link", cx).look(crate::input::Look { size: 15., line_height: 20., height: 20., color: Theme::ink().into(), placeholder: Theme::muted().into() })
        });
        let search_sub = cx.subscribe(&search, |this, _, event, cx| match event {
            crate::input::InputEvent::Submit => this.player_search(cx),
            crate::input::InputEvent::Escape => this.close_music_player(cx),
            _ => cx.notify(),
        });
        self.music_player = Some(MusicPlayer {
            room,
            tab: "lyrics",
            note: None,
            busy: false,
            lyrics: None,
            lyrics_loading: None,
            finding: false,
            lyrics_error: None,
            lyrics_scroll: gpui::ScrollHandle::new(),
            last_line: Cell::new(None),
            lyrics_asked: std::cell::RefCell::new(None),
            volume_spot: super::profile_card::spot(),
            search,
            results: None,
            searched: String::new(),
            searching: false,
            search_error: None,
            added: Default::default(),
            _search_sub: search_sub,
        });
        cx.notify();
    }

    pub(super) fn close_music_player(&mut self, cx: &mut Context<Self>) {
        self.music_player = None;
        cx.notify();
    }

    fn music_in_room(&self) -> bool {
        let Some(p) = self.music_player.as_ref() else { return false };
        p.room.is_some() && p.room.as_deref() == self.call.as_ref().map(|c| c.channel_id.as_str())
    }

    /// command(): a silent music command in the room; you must be in it.
    fn player_command(&mut self, text: String, announce: bool, cx: &mut Context<Self>) {
        let in_room = self.music_in_room();
        let Some(p) = self.music_player.as_mut() else { return };
        let Some(room) = p.room.clone() else { return };
        if !in_room {
            let name = self.channel_by_id(&room).map(|c| c.name.clone()).unwrap_or_else(|| "the voice room".into());
            self.music_note(format!("Join {name} to control its music."), cx);
            return;
        }
        p.busy = true;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.music_command(&text, &room, None, true) }).await;
            this.update(cx, |this, cx| {
                if let Some(p) = this.music_player.as_mut() {
                    p.busy = false;
                }
                match result {
                    Ok(v) if announce => {
                        if let Some(text) = v.get("text").and_then(Value::as_str) {
                            this.music_note(text.to_string(), cx);
                        }
                    }
                    Ok(_) => {}
                    Err(e) => this.music_note(if e.to_string().is_empty() { "That did not work.".into() } else { e.to_string() }, cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// `.mp-note`: a line at the bottom for five seconds.
    fn music_note(&mut self, text: String, cx: &mut Context<Self>) {
        let Some(p) = self.music_player.as_mut() else { return };
        let at = std::time::Instant::now();
        p.note = Some((text, at));
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_secs(5)).await;
            this.update(cx, |this, cx| {
                if let Some(p) = this.music_player.as_mut()
                    && p.note.as_ref().is_some_and(|(_, t)| *t == at)
                {
                    p.note = None;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// The hub's seek, for everyone in the room.
    fn player_seek(&mut self, ms: f64, cx: &mut Context<Self>) {
        if !self.music_in_room() {
            return;
        }
        let Some(room) = self.music_player.as_ref().and_then(|p| p.room.clone()) else { return };
        let duration = self.room_player(&room).and_then(|r| r.track).and_then(|t| t.duration).map(|d| d * 1000.);
        let ms = duration.map(|d| ms.min(d - 500.)).unwrap_or(ms).max(0.).round();
        self.hub.send(json!({ "t": "player", "channelId": room, "action": { "name": "seek", "positionMs": ms } }));
        cx.notify();
    }

    pub(super) fn player_toggle(&mut self, cx: &mut Context<Self>) {
        let Some(room) = self.music_player.as_ref().and_then(|p| p.room.clone()) else { return };
        let Some(state) = self.room_player(&room) else { return };
        if state.track.is_some() && self.music_in_room() {
            self.player_command(if state.paused { "/resume" } else { "/pause" }.into(), false, cx);
        }
    }

    pub(super) fn player_search_pub(&mut self, cx: &mut Context<Self>) {
        self.player_search(cx);
    }

    /// submit(): GET /api/music/search for what was typed.
    fn player_search(&mut self, cx: &mut Context<Self>) {
        let Some(p) = self.music_player.as_mut() else { return };
        let text = p.search.read(cx).text().trim().to_string();
        if text.is_empty() || p.searching {
            return;
        }
        p.searching = true;
        p.search_error = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let q = text.clone();
            let result = cx.background_executor().spawn(async move { client.music_search(&q) }).await;
            this.update(cx, |this, cx| {
                let Some(p) = this.music_player.as_mut() else { return };
                p.searching = false;
                match result {
                    Ok(v) => {
                        p.results = Some(
                            v.get("results")
                                .and_then(Value::as_array)
                                .map(|a| {
                                    a.iter()
                                        .filter_map(|r| {
                                            Some(Found {
                                                title: r.get("title")?.as_str()?.to_string(),
                                                artist: r.get("artist").and_then(Value::as_str).unwrap_or_default().to_string(),
                                                duration: r.get("duration").and_then(Value::as_f64),
                                                thumbnail: r.get("thumbnail").and_then(Value::as_str).filter(|t| !t.is_empty()).map(str::to_string),
                                                url: r.get("url")?.as_str()?.to_string(),
                                                words: r.get("words").and_then(Value::as_bool).unwrap_or(false),
                                            })
                                        })
                                        .collect()
                                })
                                .unwrap_or_default(),
                        );
                        p.searched = text;
                        p.added.clear();
                    }
                    Err(e) => p.search_error = Some(if e.to_string().is_empty() { "Search failed.".into() } else { e.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// add(): /playnext (or /play when nothing plays) or /play to the end; marks it added.
    fn player_add(&mut self, url: String, how: &'static str, playing: bool, cx: &mut Context<Self>) {
        if !self.music_in_room() {
            return;
        }
        let command = if how == "next" && playing { "/playnext" } else { "/play" };
        if let Some(p) = self.music_player.as_mut() {
            p.added.insert(url.clone(), how);
        }
        self.player_command(format!("{command} {url}"), true, cx);
    }

    /// GET /api/music/lyrics: the saved lyrics, or (`find`) a search for them.
    fn load_player_lyrics(&mut self, find: bool, cx: &mut Context<Self>) {
        let Some(p) = self.music_player.as_mut() else { return };
        let Some(room) = p.room.clone() else { return };
        let key = format!("{room}:{}", self.players.get(&room).and_then(|v| v["track"]["id"].as_str()).unwrap_or_default());
        p.lyrics_loading = Some(key.clone());
        p.finding = find;
        p.lyrics_error = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.music_lyrics(&room, find) }).await;
            this.update(cx, |this, cx| {
                let Some(p) = this.music_player.as_mut() else { return };
                p.finding = false;
                match result {
                    Ok(body) => {
                        if body.get("unavailable").and_then(Value::as_bool).unwrap_or(false) {
                            p.lyrics_error = Some("The lyrics site didn't answer just now. Try again in a moment.".into());
                        } else {
                            let lines: Vec<(f64, String)> = body
                                .get("lines")
                                .and_then(Value::as_array)
                                .map(|a| a.iter().filter_map(|l| Some((l.get(0)?.as_f64()?, l.get(1)?.as_str()?.to_string()))).collect())
                                .unwrap_or_default();
                            let plain = body.get("lyrics").and_then(Value::as_str).unwrap_or_default().to_string();
                            p.lyrics = Some(Lyrics { track: key, lines, plain });
                            p.last_line.set(None);
                        }
                    }
                    Err(e) => p.lyrics_error = Some(e.to_string()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// MiniMusicBar: above the voice card while your room's bot plays.
    pub(super) fn render_mini_music_bar(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let room = self.call.as_ref()?.channel_id.clone();
        let state = self.room_player(&room)?;
        let track = state.track.as_ref()?;
        if !state.paused {
            self.music_tick(cx);
        }
        let muted: Hsla = Theme::muted().into();
        let duration = track.duration.unwrap_or(0.) * 1000.;
        let progress = if duration > 0. { (state.position_ms / duration).min(1.) as f32 } else { 0. };
        let label = format!("{}{} · Synced", if track.title.is_empty() { "Unknown Track" } else { &track.title }, if track.artist.is_empty() { String::new() } else { format!(" - {}", track.artist) });
        let button = |id: &'static str, icon: &'static str| {
            div().id(id).size(px(16.)).p(px(2.)).cursor_pointer().text_color(muted).hover(|s| s.text_color(gpui::white())).child(ui::icon(icon, 12., muted))
        };
        let spot = self.music_bar_spot.clone();
        let pulse = gpui::Animation::new(std::time::Duration::from_secs(2)).repeat();
        Some(
            div()
                .flex_none()
                .mx(px(8.))
                .mb(px(8.))
                .p(px(10.))
                .rounded(px(12.))
                .border_1()
                .border_color(Theme::line())
                .bg(rgb(0x252040))
                .flex()
                .flex_col()
                .child(
                    div()
                        .mb(px(6.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(8.))
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::ink())
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .min_w_0()
                                .flex_1()
                                // animate-pulse: down to half strength and back every 2s.
                                .child(div().flex_none().child(ui::icon("music-2", 14., Theme::lavender())).with_animation("mini-music-pulse", pulse, |d, t| d.opacity(1. - 0.5 * (1. - (t * std::f32::consts::TAU).cos()) / 2.)))
                                // 201px inside, less the 14px note, its gap, the three 16px buttons and their gaps.
                                .child(div().min_w_0().child(ui::fit(window, &label, FontWeight::SEMIBOLD, 11., px(113.)))),
                        )
                        .child(
                            div()
                                .flex_none()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .child(button("mini-expand", "maximize-2").tooltip(ui::tooltip("Full-screen player".to_string())).on_click(cx.listener(|this, _, _, cx| this.open_music_player(None, cx))))
                                .child(button("mini-toggle", if state.paused { "play" } else { "pause" }).tooltip(ui::tooltip(if state.paused { "Play" } else { "Pause" }.to_string())).on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(room) = this.call.as_ref().map(|c| c.channel_id.clone()) {
                                        this.hub.send(json!({ "t": "player", "channelId": room, "action": { "name": "toggle" } }));
                                    }
                                })))
                                .child(button("mini-skip", "skip-forward").tooltip(ui::tooltip("Skip track".to_string())).on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(room) = this.call.as_ref().map(|c| c.channel_id.clone()) {
                                        this.hub.send(json!({ "t": "player", "channelId": room, "action": { "name": "skip" } }));
                                    }
                                }))),
                        ),
                )
                .child(
                    div()
                        .id("mini-progress")
                        .relative()
                        .h(px(4.))
                        .rounded_full()
                        .bg(Theme::line())
                        .overflow_hidden()
                        .cursor_pointer()
                        .child(super::profile_card::track(&spot))
                        .child(div().h_full().w(gpui::relative(progress)).rounded_full().bg(gpui::linear_gradient(90., gpui::linear_color_stop(rgb(0x7c5cbf), 0.), gpui::linear_color_stop(rgb(0xc4b5fd), 1.))))
                        .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                            let b = spot.get();
                            let Some(room) = this.call.as_ref().map(|c| c.channel_id.clone()) else { return };
                            let share = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width).max(1.)).clamp(0., 1.) as f64;
                            this.hub.send(json!({ "t": "player", "channelId": room, "action": { "name": "seek", "positionMs": (share * duration).round() } }));
                        })),
                )
                .into_any_element(),
        )
    }

    pub(super) fn render_music_player(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = self.music_player.as_ref()?;
        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        self.music_window_width.set(size.width);
        let scale = window.scale_factor();
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let paper: Hsla = Theme::paper().into();
        let line: Hsla = Theme::line().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let room_name = p.room.as_ref().and_then(|r| self.channel_by_id(r)).map(|c| c.name.clone());
        let state = p.room.as_ref().and_then(|r| self.room_player(r));
        let track = state.as_ref().and_then(|s| s.track.clone());
        let paused = state.as_ref().is_none_or(|s| s.paused);
        let in_room = self.music_in_room();
        let controls = in_room && track.is_some();
        if track.is_some() && !paused {
            self.music_tick(cx);
        }

        // `.mp-top`: close, where it plays, the views.
        let pad_x = (vw * 0.03).clamp(14., 40.);
        let mut tabs = div().ml_auto().flex_none().flex().gap(px(4.)).p(px(4.)).rounded_full().border_1().border_color(line).bg(Hsla::from(Theme::panel()).opacity(0.72));
        for (id, label, icon) in TABS {
            let active = p.tab == id;
            let color = if active { on_accent } else { muted };
            let count = (id == "queue").then(|| state.as_ref().map(|s| s.queue.len()).unwrap_or(0)).filter(|n| *n > 0);
            tabs = tabs.child(
                div()
                    .id(SharedString::from(format!("mp-tab-{id}")))
                    .h(px(30.))
                    .px(px(14.))
                    .rounded_full()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(13.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(color)
                    .cursor_pointer()
                    .when(active, |d| d.bg(lavender))
                    .when(!active, |d| d.hover(|s| s.text_color(Theme::ink())))
                    .child(ui::icon(icon, 15., color))
                    .child(label)
                    .when_some(count, |d, n| d.child(div().min_w(px(6.)).px(px(5.)).rounded_full().bg(color.opacity(0.18)).text_size(px(11.)).line_height(px(16.)).flex().justify_center().child(n.to_string())))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if let Some(p) = this.music_player.as_mut() {
                            p.tab = id;
                            if id == "search" {
                                window.focus(&gpui::Focusable::focus_handle(&p.search, cx));
                            }
                            cx.notify();
                        }
                    })),
            );
        }
        let icon_btn = |id: SharedString, icon: &'static str, size: f32, icon_size: f32, color: Hsla| {
            div().id(id).flex_none().size(px(size)).rounded_full().flex().items_center().justify_center().cursor_pointer().hover(move |s| s.bg(ink.opacity(0.1))).child(ui::icon(icon, icon_size, color))
        };
        let top = div()
            .h(px(68.))
            .px(px(pad_x))
            .flex()
            .items_center()
            .gap(px(12.))
            .child(icon_btn("mp-close".into(), "chevron-down", 40., 22., ink).tooltip(ui::tooltip("Close (Esc)".to_string())).on_click(cx.listener(|this, _, _, cx| this.close_music_player(cx))))
            .child(
                div()
                    .min_w_0()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .child(div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::SEMIBOLD).text_color(muted).child(if track.is_some() { if paused { "PAUSED IN" } else { "PLAYING IN" } } else { "MUSIC IN" }))
                    .child(div().truncate().font_family(DISPLAY_FONT).text_size(px(16.)).line_height(px(19.2)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(room_name.clone().unwrap_or_else(|| "No voice room".into()))),
            )
            .child(tabs);

        // `.mp-body`: the song (a 260–400px column) and the view.
        let body_x = (vw * 0.04).clamp(14., 56.);
        let gap = (vw * 0.04).clamp(20., 56.);
        let body_bottom = (vh * 0.03).clamp(14., 32.);
        let left_w = 400f32.min(((vw - 2. * body_x - gap) / 2.).max(260.));
        let art = (vh * 0.46).min(left_w);
        let duration_ms = track.as_ref().and_then(|t| t.duration).unwrap_or(0.) * 1000.;
        let position_ms = state.as_ref().map(|s| s.position_ms).unwrap_or(0.);
        let progress = if duration_ms > 0. { (position_ms / duration_ms).min(1.) as f32 } else { 0. };

        let cover: AnyElement = match track.as_ref().and_then(|t| t.thumbnail.clone()) {
            Some(src) => gpui::img(self.client.absolute(&super::links::proxied(&src))).size_full().object_fit(gpui::ObjectFit::Cover).into_any_element(),
            None => ui::icon("music-2", 56., muted).into_any_element(),
        };
        let mut now = div()
            .w(px(left_w))
            .flex_none()
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(16.))
            .child(
                div().flex().justify_center().child(
                div()
                    .size(px(art))
                    .rounded(px(18.))
                    .overflow_hidden()
                    .bg(Hsla::from(rgb(0x252040)).opacity(0.85))
                    .shadow(vec![
                        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) },
                        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
                    ])
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(cover),
                ),
            );
        let title_size = (vw * 0.024).clamp(20., 30.);
        let mut meta = div()
            .flex()
            .flex_col()
            .child(div().font_family(DISPLAY_FONT).text_size(px(title_size)).line_height(px(title_size * 1.15)).font_weight(FontWeight::BOLD).text_color(ink).line_clamp(2).child(track.as_ref().map(|t| t.title.clone()).unwrap_or_else(|| "Nothing is playing".into())))
            .child(div().mt(px(4.)).text_size(px(15.)).line_height(px(22.5)).text_color(muted).child(match (&track, &room_name) {
                (Some(t), _) => if t.artist.is_empty() { "Unknown artist".to_string() } else { t.artist.clone() },
                (None, Some(name)) => format!("Search for a song or pick a playlist to start {name}."),
                (None, None) => "Join a voice room to play music.".into(),
            }));
        if let Some(t) = track.as_ref().filter(|t| !t.requested_by.is_empty()) {
            meta = meta.child(div().mt(px(4.)).text_size(px(12.)).line_height(px(18.)).text_color(rgb(0x8f89a7)).child(format!("Added by {}{}", t.requested_by, t.playlist.as_ref().map(|p| format!(" · from {p}")).unwrap_or_default())));
        }
        if track.is_some() {
            meta = meta.child(
                div().mt(px(10.)).flex().child(
                    div()
                        .id("mp-add-song")
                        .h(px(29.))
                        .px(px(12.))
                        .rounded_full()
                        .border_1()
                        .border_color(line)
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .text_size(px(12.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(ink)
                        .cursor_pointer()
                        .child(ui::icon("circle-plus", 14., ink))
                        .child("Add to playlist")
                        .on_click(cx.listener(|this, _, _, cx| this.music_note("Adding to playlists is not in this app yet; use the web player.".into(), cx))),
                ),
            );
        }
        now = now.child(meta);
        if let Some(t) = track.as_ref() {
            let spot = self.music_progress_spot.clone();
            now = now.child(
                div()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .id("mp-progress")
                            .relative()
                            .h(px(6.))
                            .rounded_full()
                            .overflow_hidden()
                            .bg(ink.opacity(0.14))
                            .when(controls, |d| d.cursor_pointer())
                            .child(super::profile_card::track(&spot))
                            .child(div().h_full().w(gpui::relative(progress)).rounded_full().bg(gpui::linear_gradient(90., gpui::linear_color_stop(rgb(0x7c5cbf), 0.), gpui::linear_color_stop(rgb(0xc4b5fd), 1.))))
                            .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                let b = spot.get();
                                let share = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width).max(1.)).clamp(0., 1.) as f64;
                                this.player_seek(share * duration_ms, cx);
                            })),
                    )
                    .child(
                        div()
                            .mt(px(6.))
                            .flex()
                            .justify_between()
                            .font_family(MONO_FONT)
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .text_color(muted)
                            .child(clock(Some(position_ms / 1000.)))
                            .child(clock(t.duration)),
                    ),
            );
        }
        let busy = p.busy;
        let loop_mode = state.as_ref().map(|s| s.loop_mode.clone()).unwrap_or_else(|| "off".into());
        let has_queue = state.as_ref().is_some_and(|s| !s.queue.is_empty());
        let ctl = |id: &'static str, icon: &'static str, enabled: bool, color: Hsla| {
            icon_btn(id.into(), icon, 40., 19., color).when(!enabled, |d| d.opacity(0.42).cursor_default())
        };
        let next_loop = match loop_mode.as_str() { "off" => "queue", "queue" => "track", _ => "off" };
        let loop_label = match loop_mode.as_str() { "track" => "Repeating this song", "queue" => "Repeating the queue", _ => "Repeat is off" };
        let enabled = controls && !busy;
        now = now.child(
            div()
                .flex()
                .items_center()
                .justify_center()
                .gap(px(14.))
                .child(ctl("mp-loop", if loop_mode == "track" { "repeat-1" } else { "repeat" }, enabled, if loop_mode != "off" { lavender } else { ink }).tooltip(ui::tooltip(loop_label.to_string())).when(enabled, |d| d.on_click(cx.listener(move |this, _, _, cx| this.player_command(format!("/loop {next_loop}"), false, cx)))))
                .child(ctl("mp-replay", "rotate-ccw", enabled, ink).tooltip(ui::tooltip("Start the song again".to_string())).when(enabled, |d| d.on_click(cx.listener(|this, _, _, cx| this.player_command("/replay".into(), false, cx)))))
                .child(
                    div()
                        .id("mp-play")
                        .size(px(62.))
                        .rounded_full()
                        .bg(lavender)
                        .shadow(vec![
                            gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.42), offset: gpui::point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) },
                            gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(2.)), blur_radius: px(6.), spread_radius: px(0.) },
                        ])
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(ui::icon(if paused { "play" } else { "pause" }, 26., on_accent))
                        .tooltip(ui::tooltip(if paused { "Play (Space)" } else { "Pause (Space)" }.to_string()))
                        .when(!enabled, |d| d.opacity(0.42))
                        .when(enabled, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.player_toggle(cx)))),
                )
                .child(ctl("mp-skip", "skip-forward", enabled, ink).tooltip(ui::tooltip("Skip".to_string())).when(enabled, |d| d.on_click(cx.listener(|this, _, _, cx| this.player_command("/skip".into(), false, cx)))))
                .child({
                    let ok = in_room && !busy && has_queue;
                    ctl("mp-shuffle", "shuffle", ok, ink).tooltip(ui::tooltip("Shuffle what is up next".to_string())).when(ok, |d| d.on_click(cx.listener(|this, _, _, cx| this.player_command("/shuffle".into(), true, cx))))
                }),
        );
        if in_room {
            // `.mp-volume`: your own volume for the bot (Chrome's range with the lavender accent).
            let pref = self.voice_prefs.get("bot:music").copied().unwrap_or_default();
            let fill = pref.volume.min(100) as f32 / 100.;
            let spot = p.volume_spot.clone();
            now = now.child(
                div()
                    .id("mp-volume-row")
                    .flex()
                    .items_center()
                    .justify_center()
                    .gap(px(10.))
                    .tooltip(ui::tooltip("Your volume: only you hear this change".to_string()))
                    .child(ui::icon("volume-2", 16., muted))
                    .child(
                        div()
                            .id("mp-volume")
                            .relative()
                            .w(px(160.))
                            .h(px(16.))
                            .cursor_pointer()
                            .child(div().absolute().left_0().right_0().top(px(4.)).h(px(8.)).rounded_full().bg(rgb(0x2b2a33)).border_1().border_color(rgb(0x767680)))
                            .child(div().absolute().left_0().top(px(4.)).w(px(8. + 144. * fill)).h(px(8.)).rounded_full().bg(lavender))
                            .child(div().absolute().left(px(144. * fill)).top_0().size(px(16.)).rounded_full().bg(lavender))
                            .child(super::profile_card::track(&spot))
                            .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                let b = spot.get();
                                let share = (f32::from(e.position.x - b.origin.x - px(8.)) / (f32::from(b.size.width) - 16.)).clamp(0., 1.);
                                this.save_voice_pref("bot:music".into(), Some((share * 100.).round() as u32), None, cx);
                            })),
                    ),
            );
        } else if let (Some(room), Some(name)) = (p.room.clone(), room_name.clone()) {
            now = now.child(
                div().flex().justify_center().child(
                    div()
                        .id("mp-join")
                        .px(px(18.))
                        .py(px(10.))
                        .rounded_full()
                        .border_1()
                        .border_color(lavender)
                        .bg(lavender.opacity(0.14))
                        .text_size(px(13.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(ink)
                        .cursor_pointer()
                        .child(format!("Join {name} to listen and control"))
                        .on_click(cx.listener(move |this, _, _, cx| this.join_voice(room.clone(), cx))),
                ),
            );
        }

        let pane_inner: AnyElement = match p.tab {
            "lyrics" => self.render_player_lyrics(p, track.as_ref(), position_ms, controls, vh, cx),
            "queue" => self.render_player_queue(state.as_ref(), in_room, vw - 2. * body_x - gap - left_w, window, cx),
            "search" => self.render_player_search(p, in_room, track.is_some(), vw - 2. * body_x - gap - left_w, window, cx),
            other => {
                let (icon, title) = match other {
                    "playlists" => ("library", "Playlists"),
                    _ => ("disc-3", "DJ booth"),
                };
                let base = self.client.base().to_string();
                empty_state(icon, title.to_string(), Some(format!("{title} is not in this app yet. It works in the web player.")), Some(("mp-open-web", "Open the web player", Box::new(move |_, _, cx: &mut gpui::App| cx.open_url(&base)))), None::<Click>, cx)
            }
        };
        let pane = div()
            .flex_1()
            .min_w_0()
            .rounded(px(22.))
            .border_1()
            .border_color(line)
            .bg(Hsla::from(Theme::panel()).opacity(0.58))
            .overflow_hidden()
            .flex()
            .flex_col()
            .child(pane_inner);
        let body = div()
            .flex_1()
            .min_h_0()
            .pt(px(4.))
            .px(px(body_x))
            .pb(px(body_bottom))
            .flex()
            .gap(px(gap))
            .child(now)
            .child(pane);

        let backdrop = crate::cssbg::picture(
            "radial-gradient(circle at 15% 20%, rgba(167, 139, 250, 0.22), transparent 55%), radial-gradient(circle at 85% 90%, rgba(124, 92, 191, 0.18), transparent 50%)",
            vw,
            vh,
            0.,
            scale,
        );
        let mut root = div()
            .id("music-player")
            .absolute()
            .inset_0()
            .bg(paper)
            .overflow_hidden()
            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_scroll_wheel(|_, _, cx| cx.stop_propagation())
            .children(backdrop.map(|b| gpui::img(gpui::ImageSource::Render(b)).absolute().top_0().left_0().w(px(vw)).h(px(vh))))
            // `.mp-backdrop::after`: the paper over it, 45% → 70% (at 55%) → whole.
            .child(div().absolute().top_0().left_0().w(px(vw)).h(px(vh * 0.55)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(paper.opacity(0.45), 0.), gpui::linear_color_stop(paper.opacity(0.7), 1.))))
            .child(div().absolute().left_0().top(px(vh * 0.55)).w(px(vw)).h(px(vh * 0.45)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(paper.opacity(0.7), 0.), gpui::linear_color_stop(paper, 1.))))
            .child(div().absolute().inset_0().flex().flex_col().child(top).child(body));
        if let Some((note, _)) = &p.note {
            root = root.child(
                div().absolute().left_0().right_0().bottom(px(24.)).flex().justify_center().child(
                    div()
                        .max_w(px(520f32.min(vw * 0.9)))
                        .px(px(18.))
                        .py(px(10.))
                        .rounded_full()
                        .border_1()
                        .border_color(line)
                        .bg(Theme::panel())
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.42), offset: gpui::point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) }])
                        .text_size(px(13.))
                        .text_color(ink)
                        .child(note.clone()),
                ),
            );
        }
        Some(root.into_any_element())
    }

    /// SearchPane: the search bar, then the songs with Play / Next, add to the end, and + playlist.
    fn render_player_search(&self, p: &MusicPlayer, in_room: bool, playing: bool, pane_w: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let paper: Hsla = Theme::paper().into();
        let can = !p.search.read(cx).text().trim().is_empty() && !p.searching;
        let bar = div()
            .flex_none()
            .mb(px(12.))
            .h(px(46.))
            .pl(px(16.))
            .pr(px(6.))
            .rounded_full()
            .border_1()
            .border_color(Theme::line())
            .bg(paper.opacity(0.72))
            .flex()
            .items_center()
            .gap(px(10.))
            .child(ui::icon("search", 18., muted))
            .child(div().flex_1().min_w_0().child(p.search.clone()))
            .child(
                div()
                    .id("mp-search-go")
                    .h(px(34.))
                    .px(px(16.))
                    .rounded_full()
                    .bg(lavender)
                    .flex()
                    .items_center()
                    .text_size(px(13.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(on_accent)
                    .when(!can, |d| d.opacity(0.42))
                    .when(can, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.player_search(cx))))
                    .child(if p.searching { ui::icon("loader-2", 16., on_accent).into_any_element() } else { "Search".into_any_element() }),
            );
        let mut wrap = div().id("mp-search").flex_1().min_h_0().overflow_y_scroll().p(px(16.)).flex().flex_col().child(bar);
        if !in_room {
            wrap = wrap.child(div().mx(px(16.)).mt(px(14.)).px(px(12.)).py(px(8.)).rounded(px(10.)).bg(Hsla::from(Theme::coral()).opacity(0.14)).text_size(px(13.)).line_height(px(18.2)).text_color(ink).child("Join the voice room to play songs, or press + to save one to a playlist."));
        }
        if let Some(err) = &p.search_error {
            wrap = wrap.child(div().px(px(8.)).my(px(13.)).text_size(px(13.)).text_color(Theme::coral()).child(err.clone()));
        }
        match &p.results {
            None if p.search_error.is_none() => {
                wrap = wrap.child(empty_state("search", "Find something to play".into(), Some("Search YouTube, or paste a YouTube or Spotify link (playlists too).".into()), None, None::<Click>, cx));
            }
            Some(results) if results.is_empty() && p.search_error.is_none() => {
                wrap = wrap.child(empty_state("search", format!("Nothing found for \u{201c}{}\u{201d}", p.searched), Some("Try other words, or paste a link.".into()), None, None::<Click>, cx));
            }
            Some(results) => {
                let mut list = div().flex_none().flex().flex_col().gap(px(2.));
                for (n, r) in results.iter().enumerate() {
                    let thumb: AnyElement = match &r.thumbnail {
                        Some(src) => gpui::img(self.client.absolute(&super::links::proxied(src))).size(px(44.)).flex_none().rounded(px(8.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                        None => div().size(px(44.)).flex_none().rounded(px(8.)).bg(rgb(0x252040)).flex().items_center().justify_center().child(ui::icon("music-2", 16., muted)).into_any_element(),
                    };
                    // gpui draws no ellipsis of its own: the text is cut to the room `.mp-row-text` has.
                    let row_w = pane_w - 2. - 32.;
                    let actions = match p.added.get(&r.url) {
                        Some(how) => f32::from(ui::text_width(window, if *how == "next" { "Plays next" } else { "Added" }, FontWeight::SEMIBOLD, 12.)) + 12.,
                        None => 12. + 14. + 6. + f32::from(ui::text_width(window, if playing { "Next" } else { "Play" }, FontWeight::SEMIBOLD, 12.)) + 12. + if playing { 38. } else { 0. } + 6.,
                    };
                    let time_w = r.duration.map(|d| clock(Some(d)).chars().count() as f32 * 7.2).unwrap_or(0.);
                    let text_w = row_w - 6. - actions - 6. - 32. - 10. - 44. - 12. - 12. - time_w - 10.;
                    let title_w = text_w - if r.words { 27. } else { 0. };
                    let mut title = div().flex().items_center().min_w_0().child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(ui::fit(window, &r.title, FontWeight::SEMIBOLD, 14., px(title_w))));
                    if r.words {
                        title = title.child(div().flex_none().ml(px(7.)).size(px(20.)).rounded_full().bg(lavender.opacity(0.16)).flex().items_center().justify_center().child(ui::icon("mic-vocal", 13., lavender)));
                    }
                    let mut row = div()
                        .id(SharedString::from(format!("mp-found-{n}")))
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .rounded(px(12.))
                        .hover(move |s| s.bg(ink.opacity(0.06)))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .h(px(60.))
                                .px(px(10.))
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(thumb)
                                .child(div().flex_1().min_w_0().flex().flex_col().child(title).child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(ui::fit(window, &r.artist, FontWeight::NORMAL, 12., px(text_w)))))
                                .child(div().flex_none().font_family(MONO_FONT).text_size(px(12.)).line_height(px(16.)).text_color(muted).child(r.duration.map(|d| clock(Some(d))).unwrap_or_default())),
                        );
                    if let Some(how) = p.added.get(&r.url) {
                        row = row.child(div().pr(px(12.)).text_size(px(12.)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::mint()).child(if *how == "next" { "Plays next" } else { "Added" }));
                    } else {
                        let (u1, u2) = (r.url.clone(), r.url.clone());
                        row = row.child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .pr(px(6.))
                                .child(
                                    div()
                                        .id(SharedString::from(format!("mp-found-play-{n}")))
                                        .h(px(29.))
                                        .px(px(12.))
                                        .rounded_full()
                                        .bg(lavender)
                                        .flex()
                                        .items_center()
                                        .gap(px(6.))
                                        .text_size(px(12.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(on_accent)
                                        .tooltip(ui::tooltip(if playing { "Play this after the current song" } else { "Play this now" }.to_string()))
                                        .child(ui::icon("play", 14., on_accent))
                                        .child(if playing { "Next" } else { "Play" })
                                        .when(!in_room, |d| d.opacity(0.42))
                                        .when(in_room, |d| d.cursor_pointer().on_click(cx.listener(move |this, _, _, cx| this.player_add(u1.clone(), "next", playing, cx)))),
                                )
                                .when(playing, |d| {
                                    d.child(
                                        div()
                                            .id(SharedString::from(format!("mp-found-queue-{n}")))
                                            .size(px(32.))
                                            .rounded_full()
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .tooltip(ui::tooltip("Add to the end of the queue".to_string()))
                                            .child(ui::icon("list-plus", 16., ink))
                                            .when(!in_room, |d| d.opacity(0.42))
                                            .when(in_room, |d| d.cursor_pointer().hover(move |s| s.bg(ink.opacity(0.1))).on_click(cx.listener(move |this, _, _, cx| this.player_add(u2.clone(), "queue", playing, cx)))),
                                    )
                                }),
                        );
                    }
                    row = row.child(
                        div()
                            .id(SharedString::from(format!("mp-found-save-{n}")))
                            .flex_none()
                            .size(px(32.))
                            .rounded_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(move |s| s.bg(ink.opacity(0.1)))
                            .tooltip(ui::tooltip("Add to playlist".to_string()))
                            .child(ui::icon("circle-plus", 16., ink))
                            .on_click(cx.listener(|this, _, _, cx| this.music_note("Adding to playlists is not in this app yet; use the web player.".into(), cx))),
                    );
                    list = list.child(row);
                }
                wrap = wrap.child(list);
            }
            _ => {}
        }
        wrap.into_any_element()
    }

    /// QueuePane: Up next with its count and length, each song (click plays it now, × removes it).
    fn render_player_queue(&self, state: Option<&Room>, in_room: bool, pane_w: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let queue = state.map(|s| s.queue.clone()).unwrap_or_default();
        if queue.is_empty() {
            return empty_state(
                "list-music",
                "Nothing up next".into(),
                Some("Songs you add play after this one.".into()),
                Some(("mp-find", "Find a song", Box::new(|_, _, _| {}))),
                Some(cx.listener(|this, _, _, cx| {
                    if let Some(p) = this.music_player.as_mut() {
                        p.tab = "search";
                        cx.notify();
                    }
                })),
                cx,
            );
        }
        let total: f64 = queue.iter().filter_map(|s| s.duration).sum();
        let mut list = div().flex().flex_col().gap(px(2.));
        for (n, song) in queue.iter().enumerate() {
            let thumb: AnyElement = match &song.thumbnail {
                Some(src) => gpui::img(self.client.absolute(&super::links::proxied(src))).size(px(44.)).flex_none().rounded(px(8.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                None => div().size(px(44.)).flex_none().rounded(px(8.)).bg(rgb(0x252040)).flex().items_center().justify_center().child(ui::icon("music-2", 16., muted)).into_any_element(),
            };
            let index = n + 1;
            let time_w = song.duration.map(|d| clock(Some(d)).chars().count() as f32 * 7.2).unwrap_or(0.);
            let text_w = pane_w - 2. - 32. - if in_room { 38. } else { 0. } - 10. - 22. - 12. - 44. - 12. - 12. - time_w - 10.;
            let sub = if song.artist.is_empty() { format!("Added by {}", song.requested_by) } else { song.artist.clone() };
            list = list.child(
                div()
                    .id(SharedString::from(format!("mp-row-{n}")))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .rounded(px(12.))
                    .hover(move |s| s.bg(ink.opacity(0.06)))
                    .child(
                        div()
                            .id(SharedString::from(format!("mp-row-main-{n}")))
                            .flex_1()
                            .min_w_0()
                            .h(px(60.))
                            .px(px(10.))
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .when(in_room, |d| d.cursor_pointer().tooltip(ui::tooltip("Play this now".to_string())).on_click(cx.listener(move |this, _, _, cx| this.player_command(format!("/skipto {index}"), false, cx))))
                            .child(div().w(px(22.)).flex_none().flex().justify_end().font_family(MONO_FONT).text_size(px(12.)).line_height(px(16.)).text_color(muted).child(index.to_string()))
                            .child(thumb)
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .flex()
                                    .flex_col()
                                    .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(ui::fit(window, &song.title, FontWeight::SEMIBOLD, 14., px(text_w))))
                                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(ui::fit(window, &sub, FontWeight::NORMAL, 12., px(text_w)))),
                            )
                            .child(div().flex_none().font_family(MONO_FONT).text_size(px(12.)).line_height(px(16.)).text_color(muted).child(song.duration.map(|d| clock(Some(d))).unwrap_or_default())),
                    )
                    .when(in_room, |d| {
                        d.child(
                            div()
                                .id(SharedString::from(format!("mp-remove-{n}")))
                                .flex_none()
                                .size(px(32.))
                                .rounded_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .cursor_pointer()
                                .hover(move |s| s.bg(ink.opacity(0.1)))
                                .tooltip(ui::tooltip("Remove from the queue".to_string()))
                                .child(ui::icon("x", 15., ink))
                                .on_click(cx.listener(move |this, _, _, cx| this.player_command(format!("/remove {index}"), false, cx))),
                        )
                    }),
            );
        }
        div()
            .id("mp-queue")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .p(px(16.))
            .child(
                div()
                    .pt(px(4.))
                    .px(px(8.))
                    .pb(px(10.))
                    .flex()
                    .items_baseline()
                    .justify_between()
                    .child(div().font_family(DISPLAY_FONT).text_size(px(18.)).line_height(px(23.)).font_weight(FontWeight::BOLD).text_color(ink).child("Up next"))
                    .child(div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(format!("{} {}{}", queue.len(), if queue.len() == 1 { "song" } else { "songs" }, if total > 0. { format!(" · {}", clock(Some(total))) } else { String::new() }))),
            )
            .child(list)
            .into_any_element()
    }

    /// LyricsPane: the saved lyrics, timed lines following the song (click one to go there), or
    /// the offer to search for them.
    fn render_player_lyrics(&self, p: &MusicPlayer, track: Option<&Song>, position_ms: f64, can_seek: bool, vh: f32, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let Some(track) = track else {
            return empty_state("mic-vocal", "Lyrics show up here".into(), Some("Play a song and its words scroll along with it.".into()), None, None::<Click>, cx);
        };
        let room = p.room.clone().unwrap_or_default();
        let key = format!("{room}:{}", self.players.get(&room).and_then(|v| v["track"]["id"].as_str()).unwrap_or_default());
        let have = p.lyrics.as_ref().filter(|l| l.track == key);
        if have.is_none() && p.lyrics_loading.as_deref() != Some(key.as_str()) && p.lyrics_asked.replace(Some(key.clone())).as_deref() != Some(key.as_str()) {
            // Asked for once per song, right after this frame.
            cx.spawn(async move |this, cx| {
                this.update(cx, |this, cx| this.load_player_lyrics(false, cx)).ok();
            })
            .detach();
        }
        let Some(lyrics) = have else {
            return div().flex_1().flex().items_center().justify_center().child(ui::icon("loader-2", 22., Theme::muted())).into_any_element();
        };
        if lyrics.lines.is_empty() && lyrics.plain.trim().is_empty() {
            let finding = p.finding;
            let lavender: Hsla = Theme::lavender().into();
            let link = div()
                .id("mp-pick-lyrics")
                .text_size(px(13.))
                .line_height(px(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(lavender)
                .underline()
                .cursor_pointer()
                .child("Or pick them by hand")
                .on_click(cx.listener(|this, _, _, cx| this.music_note("Picking lyrics by hand is not in this app yet; use the web player.".into(), cx)))
                .into_any_element();
            let mut el = empty_state_with(
                "mic-vocal",
                "Want the lyrics?".into(),
                Some("They aren't saved for this song yet. Search for them and they scroll along with the song.".into()),
                Some(("mp-find-lyrics", if finding { "Searching…" } else { "Search for lyrics" }, Box::new(|_, _, _| {}))),
                (!finding).then(|| cx.listener(|this, _, _, cx| this.load_player_lyrics(true, cx))),
                Some(link),
            );

            if let Some(err) = &p.lyrics_error {
                el = div().flex_1().flex().flex_col().child(div().mx(px(16.)).mt(px(14.)).px(px(12.)).py(px(8.)).rounded(px(10.)).bg(Hsla::from(Theme::coral()).opacity(0.14)).text_size(px(13.)).child(err.clone())).child(el).into_any_element();
            }
            let _ = track;
            return el;
        }
        let side = (f32::from(window_width(self)) * 0.03).clamp(16., 36.);
        if lyrics.lines.is_empty() {
            return div()
                .id("mp-plain")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(side))
                .pb(px(32.))
                .child(div().mt(px(16.)).text_size(px(18.)).line_height(px(30.6)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(lyrics.plain.clone()))
                .into_any_element();
        }
        let current = lyrics.lines.iter().rposition(|(at, _)| *at * 1000. <= position_ms + 150.);
        // Keep the sung line a little above the middle, as the web scrolls it.
        if let Some(n) = current
            && p.last_line.get() != Some(n)
            && let Some(b) = p.lyrics_scroll.bounds_for_item(n)
        {
            let view = p.lyrics_scroll.bounds();
            let offset = p.lyrics_scroll.offset();
            let item_top = b.origin.y - view.origin.y - offset.y;
            let target = item_top - view.size.height * 0.38 + b.size.height / 2.;
            p.lyrics_scroll.set_offset(gpui::point(px(0.), -target.max(px(0.))));
            p.last_line.set(Some(n));
        }
        let size = 27.14f32.clamp(20., 32.);
        let mut list = div().id("mp-lyrics").flex_1().min_h_0().overflow_y_scroll().track_scroll(&p.lyrics_scroll).pt(px(vh * 0.16)).pb(px(vh * 0.3)).px(px(side));
        for (n, (at, text)) in lyrics.lines.iter().enumerate() {
            let color = match current {
                Some(c) if c == n => ink,
                Some(c) if n < c => ink.opacity(0.55),
                _ => ink.opacity(0.36),
            };
            let at = *at;
            list = list.child(
                div()
                    .id(SharedString::from(format!("mp-line-{n}")))
                    .px(px(12.))
                    .py(px(6.))
                    .rounded(px(12.))
                    .text_size(px(size))
                    .line_height(px(size * 1.3))
                    .font_weight(FontWeight::BOLD)
                    .text_color(color)
                    .child(if text.is_empty() { "♪".to_string() } else { text.clone() })
                    .when(can_seek, |d| d.cursor_pointer().hover(move |s| s.bg(ink.opacity(0.07)).text_color(ink)).on_click(cx.listener(move |this, _, _, cx| this.player_seek(at * 1000., cx)))),
            );
        }
        list.into_any_element()
    }
}

type Click = Box<dyn Fn(&gpui::ClickEvent, &mut Window, &mut gpui::App) + 'static>;

/// Empty(): the round icon, a Fraunces title, a line, and a button.
fn empty_state(
    icon: &'static str,
    title: String,
    text: Option<String>,
    button: Option<(&'static str, &'static str, Click)>,
    listener: Option<impl Fn(&gpui::ClickEvent, &mut Window, &mut gpui::App) + 'static>,
    _cx: &mut Context<Shell>,
) -> AnyElement {
    empty_state_with(icon, title, text, button, listener, None)
}

/// Empty() with a `.mp-link` under its button.
fn empty_state_with(
    icon: &'static str,
    title: String,
    text: Option<String>,
    button: Option<(&'static str, &'static str, Click)>,
    listener: Option<impl Fn(&gpui::ClickEvent, &mut Window, &mut gpui::App) + 'static>,
    link: Option<AnyElement>,
) -> AnyElement {
    let lavender: Hsla = Theme::lavender().into();
    let muted: Hsla = Theme::muted().into();
    let on_accent: Hsla = rgb(0x15121f).into();
    let mut el = div()
        .flex_1()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(8.))
        .px(px(24.))
        .py(px(40.))
        .text_color(muted)
        .child(div().mb(px(4.)).size(px(64.)).rounded_full().bg(lavender.opacity(0.16)).flex().items_center().justify_center().child(ui::icon(icon, 28., lavender)))
        .child(div().font_family(DISPLAY_FONT).text_size(px(18.)).line_height(px(23.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(title));
    if let Some(text) = text {
        el = el.child(div().max_w(px(336.)).text_center().text_size(px(14.)).line_height(px(21.)).child(text));
    }
    if let Some((id, label, click)) = button {
        let mut b = div()
            .id(id)
            .mt(px(6.))
            .h(px(32.))
            .px(px(16.))
            .rounded_full()
            .bg(lavender)
            .flex()
            .items_center()
            .gap(px(6.))
            .text_size(px(13.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(on_accent)
            .cursor_pointer()
            .child(ui::icon("search", 16., on_accent))
            .child(label);
        b = match listener {
            Some(l) => b.on_click(l),
            None => b.on_click(click),
        };
        el = el.child(b);
    }
    if let Some(link) = link {
        el = el.child(div().mt(px(4.)).child(link));
    }
    el.into_any_element()
}


fn window_width(shell: &Shell) -> gpui::Pixels {
    shell.music_window_width.get()
}
