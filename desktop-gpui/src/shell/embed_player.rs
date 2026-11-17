//! Link players (lib/embed-players.ts, link-preview.tsx's PlayerCard and YouTubeEmbed): Spotify,
//! SoundCloud, Apple Music, Deezer, Vimeo, Streamable, TikTok and Twitch links get a card with a
//! play button, and YouTube's play button plays in place. Pressing it swaps in the site's own
//! player, an iframe in a web view (src/webview.rs) kept over the card and clipped to the message
//! list; a player that is no longer drawn (scrolled away, another channel) is taken down, as the
//! web unmounts its iframe.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use gpui::{AnyElement, Context, FontWeight, Hsla, ObjectFit, SharedString, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use super::links::{Preview, proxied};
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;
use crate::webview::{ClipHost, WebOverlay};

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Shape {
    Video,
    Portrait,
    Audio,
}

#[derive(Clone)]
pub(super) struct EmbedPlayer {
    pub site: &'static str,
    pub src: String,
    pub shape: Shape,
    pub height: Option<f32>,
    pub color: u32,
    pub allow: &'static str,
}

const MEDIA_ALLOW: &str = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";

const TWITCH_RESERVED: [&str; 18] =
    ["directory", "downloads", "jobs", "p", "search", "settings", "subscriptions", "turbo", "wallet", "inventory", "drops", "friends", "messages", "videos", "store", "prime", "login", "signup"];

fn word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}
fn word_dash(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}
fn digits(s: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit())
}

/// playerFor(): the player for a link, or None when Hoffle cannot embed it. `page_host` is where
/// Hoffle runs (Twitch asks).
pub(super) fn player_for(raw: &str, page_host: &str) -> Option<EmbedPlayer> {
    let url = url::Url::parse(raw).ok()?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return None;
    }
    let host_full = url.host_str()?.to_lowercase();
    let host = host_full.strip_prefix("www.").or_else(|| host_full.strip_prefix("m.")).unwrap_or(&host_full).to_string();
    let path = url.path().trim_end_matches('/').to_string();
    let parts: Vec<&str> = path.split('/').skip(1).collect();
    let enc = |v: &str| url::form_urlencoded::byte_serialize(v.as_bytes()).collect::<String>();
    match host.as_str() {
        "open.spotify.com" => {
            let rest: &[&str] = if parts.first().is_some_and(|p| p.starts_with("intl-") && p.len() > 5 && p[5..].chars().all(|c| c.is_ascii_lowercase() || c == '-')) { &parts[1..] } else { &parts[..] };
            let [kind, id] = rest else { return None };
            if !["track", "album", "playlist", "episode", "show", "artist"].contains(kind) || !(10..=32).contains(&id.len()) || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
                return None;
            }
            let compact = *kind == "track" || *kind == "episode";
            Some(EmbedPlayer {
                site: "Spotify",
                src: format!("https://open.spotify.com/embed/{kind}/{id}?utm_source=hoffle&autoplay=1"),
                shape: Shape::Audio,
                height: Some(if compact { 152. } else { 352. }),
                color: 0x1db954,
                allow: MEDIA_ALLOW,
            })
        }
        "soundcloud.com" => {
            let (user, set, track) = match parts.as_slice() {
                [u, t] => (*u, false, *t),
                [u, "sets", t] => (*u, true, *t),
                _ => return None,
            };
            if !word_dash(user) || !word_dash(track) || ["discover", "stream", "you", "search", "upload", "charts"].contains(&user) {
                return None;
            }
            let clean = format!("https://soundcloud.com{path}");
            Some(EmbedPlayer {
                site: "SoundCloud",
                src: format!("https://w.soundcloud.com/player/?url={}&color=%23ff5500&auto_play=true&hide_related=true&show_comments=false&visual=false", enc(&clean)),
                shape: Shape::Audio,
                height: Some(if set { 352. } else { 166. }),
                color: 0xff5500,
                allow: "autoplay",
            })
        }
        "music.apple.com" => {
            let [country, kind, _, id] = parts.as_slice() else { return None };
            if country.len() != 2 || !country.chars().all(|c| c.is_ascii_lowercase()) || !["album", "playlist", "song", "music-video"].contains(kind) {
                return None;
            }
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-') {
                return None;
            }
            let single = *kind == "song" || (*kind == "album" && url.query_pairs().any(|(k, _)| k == "i"));
            let search = url.query().map(|q| format!("?{q}")).unwrap_or_default();
            Some(EmbedPlayer {
                site: "Apple Music",
                src: format!("https://embed.music.apple.com{path}{search}"),
                shape: Shape::Audio,
                height: Some(if single { 175. } else { 450. }),
                color: 0xfa243c,
                allow: "autoplay *; encrypted-media *; fullscreen *; clipboard-write",
            })
        }
        "deezer.com" => {
            let rest: &[&str] = if parts.len() == 3 && parts[0].len() == 2 && parts[0].chars().all(|c| c.is_ascii_lowercase()) { &parts[1..] } else { &parts[..] };
            let [kind, id] = rest else { return None };
            if !["track", "album", "playlist"].contains(kind) || id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            Some(EmbedPlayer {
                site: "Deezer",
                src: format!("https://widget.deezer.com/widget/auto/{kind}/{id}?autoplay=true"),
                shape: Shape::Audio,
                height: Some(if *kind == "track" { 152. } else { 300. }),
                color: 0xa238ff,
                allow: "encrypted-media; clipboard-write; autoplay",
            })
        }
        "vimeo.com" => {
            let (id, hash) = match parts.as_slice() {
                [id] => (*id, None),
                [id, h] => (*id, Some(*h)),
                _ => return None,
            };
            if !digits(id, 5, 12) || hash.is_some_and(|h| !(6..=20).contains(&h.len()) || !h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())) {
                return None;
            }
            Some(EmbedPlayer {
                site: "Vimeo",
                src: format!("https://player.vimeo.com/video/{id}?autoplay=1{}", hash.map(|h| format!("&h={h}")).unwrap_or_default()),
                shape: Shape::Video,
                height: None,
                color: 0x1ab7ea,
                allow: MEDIA_ALLOW,
            })
        }
        "streamable.com" => {
            let [id] = parts.as_slice() else { return None };
            if !(4..=12).contains(&id.len()) || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
                return None;
            }
            Some(EmbedPlayer { site: "Streamable", src: format!("https://streamable.com/e/{id}?autoplay=1"), shape: Shape::Video, height: None, color: 0x2c67ff, allow: MEDIA_ALLOW })
        }
        "tiktok.com" => {
            let [user, "video", id] = parts.as_slice() else { return None };
            let name = user.strip_prefix('@')?;
            if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-') || !digits(id, 10, 25) {
                return None;
            }
            Some(EmbedPlayer {
                site: "TikTok",
                src: format!("https://www.tiktok.com/player/v1/{id}?autoplay=1&music_info=1&description=1"),
                shape: Shape::Portrait,
                height: None,
                color: 0xff0050,
                allow: MEDIA_ALLOW,
            })
        }
        "twitch.tv" | "clips.twitch.tv" => {
            // Twitch only plays inside the page it was told about.
            if page_host.is_empty() || !page_host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
                return None;
            }
            let parent = format!("parent={}", enc(page_host));
            let player = |src: String| Some(EmbedPlayer { site: "Twitch", src, shape: Shape::Video, height: None, color: 0x9146ff, allow: MEDIA_ALLOW });
            if host == "clips.twitch.tv" {
                let slug = path.trim_start_matches('/');
                return if (4..=100).contains(&slug.len()) && word_dash(slug) { player(format!("https://clips.twitch.tv/embed?clip={slug}&{parent}&autoplay=true")) } else { None };
            }
            match parts.as_slice() {
                [user, "clip", clip] if word(user) && (4..=100).contains(&clip.len()) && word_dash(clip) => player(format!("https://clips.twitch.tv/embed?clip={clip}&{parent}&autoplay=true")),
                ["videos", id] if digits(id, 5, 15) => player(format!("https://player.twitch.tv/?video=v{id}&{parent}&autoplay=true")),
                [channel] if word(channel) && (3..=25).contains(&channel.len()) && !TWITCH_RESERVED.contains(&channel.to_lowercase().as_str()) => {
                    player(format!("https://player.twitch.tv/?channel={channel}&{parent}&autoplay=true"))
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// youtubeStart(): `t=` or `start=` as seconds (90, 1m30s).
pub(super) fn youtube_start(raw: &str) -> u64 {
    let Ok(url) = url::Url::parse(raw) else { return 0 };
    let Some(value) = url.query_pairs().find(|(k, _)| k == "t" || k == "start").map(|(_, v)| v.to_string()) else { return 0 };
    if let Ok(n) = value.parse::<u64>() {
        return n;
    }
    let (mut total, mut num) = (0u64, String::new());
    for c in value.chars() {
        match c {
            '0'..='9' => num.push(c),
            'h' | 'm' | 's' => {
                let n: u64 = num.parse().unwrap_or(0);
                total += n * match c {
                    'h' => 3600,
                    'm' => 60,
                    _ => 1,
                };
                num.clear();
            }
            _ => return 0,
        }
    }
    total
}

struct Playing {
    src: String,
    allow: String,
    overlay: Option<WebOverlay>,
    seen: u64,
}

/// The players that are playing, the view that clips them to the message list, and a frame count
/// for noticing ones that stopped being drawn.
#[derive(Default)]
pub(super) struct Players {
    host: Option<ClipHost>,
    playing: HashMap<String, Playing>,
    frame: u64,
}

pub(super) type SharedPlayers = Rc<RefCell<Players>>;

impl Shell {
    pub(super) fn start_player(&mut self, key: String, src: String, allow: &str, cx: &mut Context<Self>) {
        self.link_players.borrow_mut().playing.insert(key.clone(), Playing { src, allow: allow.to_string(), overlay: None, seen: u64::MAX });
        // HOFFLE_DEV_PLAYER_SHOT=<png>: the player's own picture 8 s later (the window snapshot has
        // only GPUI's drawing).
        if let Ok(path) = std::env::var("HOFFLE_DEV_PLAYER_SHOT") {
            let shared = self.link_players.clone();
            cx.spawn(async move |_, cx| {
                cx.background_executor().timer(std::time::Duration::from_secs(8)).await;
                if let Some(o) = shared.borrow().playing.get(&key).and_then(|p| p.overlay.as_ref()) {
                    o.snapshot(&path);
                }
            })
            .detach();
        }
        cx.notify();
    }

    /// HOFFLE_DEV_PLAY=<message id prefix>: press play on that message's first player, once it is
    /// on screen.
    pub(super) fn dev_play(&mut self, cx: &mut Context<Self>) {
        static DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        let Ok(prefix) = std::env::var("HOFFLE_DEV_PLAY") else { return };
        if DONE.load(std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        let Some(message) = self.messages.values().flatten().find(|m| m.id.starts_with(&prefix)).cloned() else { return };
        let url = crate::markdown::link_parts(&message.text).1.into_iter().next();
        let Some(url) = url else { return };
        DONE.store(true, std::sync::atomic::Ordering::Relaxed);
        let key = format!("{}-0", message.id);
        if let Some(id) = super::links::youtube_id(&url) {
            self.start_player(key, format!("https://www.youtube-nocookie.com/embed/{id}?autoplay=1"), "autoplay; encrypted-media; picture-in-picture; fullscreen", cx);
        } else if let Some(p) = player_for(&url, "hoffle.online") {
            self.start_player(key, p.src, p.allow, cx);
        }
    }

    fn is_playing(&self, key: &str) -> bool {
        self.link_players.borrow().playing.contains_key(key)
    }

    /// Once a frame, before drawing: players not drawn last frame are taken down, and all of them
    /// hide while something covers the chat (they sit above GPUI's drawing).
    /// Something is drawn over the chat and stage (a dialog, a menu, settings): web views, which
    /// sit above GPUI's drawing, hide meanwhile.
    pub(super) fn chat_covered(&self) -> bool {
        self.settings.is_some()
            || self.server_settings.is_some()
            || self.forward.is_some()
            || self.group_dialog.is_some()
            || self.confirm.is_some()
            || self.lightbox.is_some()
            || self.profile.is_some()
            || self.user_menu.is_some()
            || self.ctx_menu.is_some()
            || self.picker.is_some()
            || self.gif_picker.is_some()
            || self.invite.is_some()
            || self.poll_dialog.is_some()
            || self.music_player.is_some()
    }

    pub(super) fn players_tick(&self, window: &mut Window) {
        let covered = self.chat_covered() || self.stage.is_some();
        let mut players = self.link_players.borrow_mut();
        let frame = players.frame;
        players.playing.retain(|_, p| p.seen == u64::MAX || p.seen + 1 >= frame);
        for p in players.playing.values_mut() {
            if p.seen == u64::MAX {
                p.seen = frame;
            }
        }
        players.frame += 1;
        if players.playing.is_empty() {
            players.host = None;
        } else if let Some(host) = &players.host {
            host.set_hidden(covered);
        }
        if !players.playing.is_empty() {
            // Keep frames coming while something plays, so the views follow scrolling.
            window.request_animation_frame();
        }
    }

    /// Laid over the message list: where players may show.
    pub(super) fn players_area(&self) -> Option<AnyElement> {
        if self.link_players.borrow().playing.is_empty() {
            return None;
        }
        let shared = self.link_players.clone();
        Some(
            gpui::canvas(
                |_, _, _| {},
                move |bounds, _, window, _| {
                    let mut players = shared.borrow_mut();
                    if players.host.is_none() {
                        players.host = crate::webview::clip_host(window);
                    }
                    if let Some(host) = players.host.as_mut() {
                        host.set_frame(f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), f32::from(bounds.size.height));
                    }
                },
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .into_any_element(),
        )
    }

    /// The box a playing player fills: its web view is kept on it.
    fn player_slot(&self, key: &str) -> AnyElement {
        let shared = self.link_players.clone();
        let key = key.to_string();
        gpui::canvas(
            |_, _, _| {},
            move |bounds, _, _, _| {
                let mut players = shared.borrow_mut();
                let frame = players.frame;
                let Players { host, playing, .. } = &mut *players;
                let (Some(host), Some(p)) = (host.as_mut(), playing.get_mut(&key)) else { return };
                p.seen = frame;
                if p.overlay.is_none() {
                    p.overlay = crate::webview::player_overlay(host, &p.src, &p.allow);
                }
                let (hx, hy, _, _) = host.frame();
                if let Some(o) = p.overlay.as_mut() {
                    o.set_frame(f32::from(bounds.origin.x) - hx, f32::from(bounds.origin.y) - hy, f32::from(bounds.size.width), f32::from(bounds.size.height));
                }
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full()
        .into_any_element()
    }

    /// `.link-preview-player` with YouTube's player in it once playing.
    pub(super) fn youtube_player(&self, message: &Message, n: usize, url: &str, id: &str, thumb: String, inner: f32, cx: &mut Context<Self>) -> AnyElement {
        let key = format!("{}-{n}", message.id);
        let playing = self.is_playing(&key);
        let start = youtube_start(url);
        let src = format!("https://www.youtube-nocookie.com/embed/{id}?autoplay=1{}", if start > 0 { format!("&start={start}") } else { String::new() });
        div()
            .id(SharedString::from(format!("yt-{key}")))
            .ml(px(4.))
            .mt(px(6.))
            .w(px(inner))
            .h(px(inner * 9. / 16.))
            .rounded(px(6.))
            .bg(gpui::black())
            .relative()
            .when(playing, |d| d.child(self.player_slot(&key)))
            .when(!playing, |d| {
                d.cursor_pointer()
                    .group("yt-play")
                    .child(gpui::img(ui::cover(gpui::Resource::Uri(self.client.absolute(&thumb).into()), 16. / 9.)).size_full().rounded(px(6.)).object_fit(ObjectFit::Cover))
                    .child(play_circle("yt-play", 0xff0033))
                    .on_click(cx.listener(move |this, _, _, cx| this.start_player(key.clone(), src.clone(), "autoplay; encrypted-media; picture-in-picture; fullscreen", cx)))
            })
            .into_any_element()
    }

    /// PlayerCard: site, author, title, then the player (or what stands for it until played).
    pub(super) fn render_player_card(&self, message: &Message, n: usize, url: &str, player: EmbedPlayer, preview: Option<Preview>, column: f32, cx: &mut Context<Self>) -> AnyElement {
        let width = column.min(480.);
        let inner = width - 4. - 12. - 14.;
        let key = format!("{}-{n}", message.id);
        let playing = self.is_playing(&key);
        let title = preview.as_ref().map(|p| p.title.clone()).filter(|t| !t.is_empty()).unwrap_or_else(|| format!("{} link", player.site));
        let open_title = url.to_string();
        let color: Hsla = rgb(player.color).into();
        let group = SharedString::from(format!("player-{key}"));
        let start = {
            let (key, src, allow) = (key.clone(), player.src.clone(), player.allow);
            cx.listener(move |this: &mut Self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>| this.start_player(key.clone(), src.clone(), allow, cx))
        };
        let frame_w = if player.shape == Shape::Portrait { inner.min(325.) } else { inner };
        let frame_h = match (player.shape, player.height) {
            (_, Some(h)) => h,
            (Shape::Portrait, _) => frame_w * 16. / 9.,
            _ => frame_w * 9. / 16.,
        };
        let body: AnyElement = if playing {
            div()
                .ml(px(4.))
                .mt(px(6.))
                .w(px(frame_w))
                .h(px(frame_h))
                .rounded(px(if player.shape == Shape::Audio { 12. } else { 6. }))
                .when(player.shape != Shape::Audio, |d| d.bg(gpui::black()))
                .relative()
                .child(self.player_slot(&key))
                .into_any_element()
        } else if player.shape == Shape::Audio {
            // `.link-preview-audio`: the cover, the description and "Play here".
            div()
                .ml(px(4.))
                .mt(px(6.))
                .flex()
                .items_center()
                .gap(px(12.))
                .when_some(preview.as_ref().and_then(|p| p.image.clone()), |d, image| {
                    d.child(gpui::img(ui::cover(gpui::Resource::Uri(self.client.absolute(&image).into()), 1.)).flex_none().size(px(72.)).rounded(px(8.)).object_fit(ObjectFit::Cover))
                })
                .child(
                    div()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .items_start()
                        .gap(px(8.))
                        .when_some(preview.as_ref().and_then(|p| p.description.clone()).filter(|d| !d.is_empty()), |d, desc| {
                            d.child(div().text_size(px(13.)).line_height(px(18.2)).text_color(Theme::ink()).opacity(0.85).line_clamp(2).child(desc))
                        })
                        .child(
                            div()
                                .id(SharedString::from(format!("listen-{key}")))
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .px(px(14.))
                                .py(px(6.))
                                .rounded_full()
                                .bg(color)
                                .text_size(px(13.))
                                .line_height(px(19.5))
                                .font_weight(FontWeight::BOLD)
                                .text_color(gpui::white())
                                .cursor_pointer()
                                .hover(|s| s.opacity(0.92).top(px(-1.)))
                                .child(ui::icon("play-filled", 14., gpui::white()))
                                .child("Play here")
                                .on_click(start),
                        ),
                )
                .into_any_element()
        } else {
            div()
                .id(SharedString::from(format!("play-{key}")))
                .ml(px(4.))
                .mt(px(6.))
                .w(px(frame_w))
                .h(px(frame_h))
                .rounded(px(6.))
                .bg(gpui::black())
                .relative()
                .cursor_pointer()
                .group(group.clone())
                .when_some(preview.as_ref().and_then(|p| p.image.clone()), |d, image| {
                    d.child(gpui::img(ui::cover(gpui::Resource::Uri(self.client.absolute(&proxied(&image)).into()), frame_w / frame_h)).size_full().rounded(px(6.)).object_fit(ObjectFit::Cover))
                })
                .child(play_circle(group, player.color))
                .on_click(start)
                .into_any_element()
        };
        Self::card_frame(color)
            .w(px(width))
            .flex()
            .flex_col()
            .gap(px(4.))
            .child(div().pl(px(4.)).text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child(player.site))
            .when_some(preview.as_ref().and_then(|p| p.author.clone()), |d, author| {
                d.child(div().pl(px(4.)).text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(Theme::ink()).child(author))
            })
            .child(
                div()
                    .id(SharedString::from(format!("player-title-{key}")))
                    .pl(px(4.))
                    .text_size(px(14.))
                    .line_height(px(18.2))
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0x3b9ef5))
                    .cursor_pointer()
                    .hover(|s| s.underline())
                    .child(title)
                    .on_click(move |_, _, cx| cx.open_url(&open_title)),
            )
            .child(body)
            .into_any_element()
    }
}

/// `.link-preview-play span`: the round play button, the player's colour on hover.
fn play_circle(group: impl Into<SharedString>, color: u32) -> impl IntoElement {
    let group = group.into();
    div().absolute().inset_0().flex().items_center().justify_center().child(
        div()
            .size(px(60.))
            .rounded_full()
            .bg(rgba(0x000000a6))
            .group_hover(group, move |s| s.bg(rgb(color)))
            .flex()
            .items_center()
            .justify_center()
            .child(ui::icon("play-filled", 26., gpui::white())),
    )
}
