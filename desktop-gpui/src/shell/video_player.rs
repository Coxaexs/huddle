//! InlineVideoAttachment (message-file-card.tsx): a video file in a message plays here. The web
//! uses Chrome's <video controls>; this draws those controls the same way (play, time, mute, full
//! window, ⋮ with Download and speed, the seek bar over a dark fade), shown while paused or under
//! the pointer. Pictures come from AVFoundation (video_clip.rs) paced to a clock that starts with
//! the sound, which is decoded and played like a voice message.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use gpui::{AnyElement, Context, FontWeight, Hsla, RenderImage, SharedString, Window, div, prelude::*, px, rgb};

use super::Shell;
use crate::model::{FileRef, Message};
use crate::ui;
use crate::video_clip::{self, Frame, Info};

#[derive(Default)]
pub(super) struct Videos {
    /// Per file: downloaded to, what it is, its first picture, or that it cannot be played here.
    files: HashMap<String, Clip>,
    /// Per player: where it was left, the picture showing there, its speed, muted.
    left: HashMap<String, f32>,
    still: HashMap<String, Arc<RenderImage>>,
    speed: HashMap<String, f32>,
    muted: HashMap<String, bool>,
    playing: Option<Playing>,
    hovered: Option<String>,
    menu: Option<String>,
    /// The player shown over the whole window (Chrome's full screen).
    full: Option<(String, String, Info)>,
    spots: HashMap<String, std::rc::Rc<std::cell::Cell<gpui::Bounds<gpui::Pixels>>>>,
}

#[derive(Default)]
struct Clip {
    loading: bool,
    path: Option<PathBuf>,
    info: Option<Info>,
    poster: Option<Arc<RenderImage>>,
    failed: bool,
}

struct Playing {
    key: String,
    url: String,
    from: f32,
    speed: f32,
    since: Instant,
    total: f32,
    stop: Arc<AtomicBool>,
    frames: std::sync::mpsc::Receiver<Frame>,
    queued: VecDeque<Frame>,
    sound: Option<std::process::Child>,
}

impl Playing {
    fn clock(&self) -> f32 {
        (self.from + self.since.elapsed().as_secs_f32() * self.speed).min(self.total)
    }
}

fn picture(frame: Frame) -> Option<Arc<RenderImage>> {
    let image = image::RgbaImage::from_raw(frame.width, frame.height, frame.bgra)?;
    Some(Arc::new(RenderImage::new(smallvec::smallvec![image::Frame::new(image)])))
}

fn mmss(s: f32) -> String {
    let s = s.max(0.).floor() as u64;
    format!("{}:{:02}", s / 60, s % 60)
}

/// The widest picture worth decoding: the card at 2× (520 × 2).
const DECODE_WIDTH: u32 = 1040;

impl Shell {
    /// Downloads the file once, then reads its size and first picture.
    fn video_load(&mut self, url: String, cx: &mut Context<Self>) {
        let clip = self.film.files.entry(url.clone()).or_default();
        if clip.loading || clip.path.is_some() || clip.failed {
            return;
        }
        clip.loading = true;
        let client = self.client.clone();
        let ext = url.rsplit('.').next().unwrap_or("mp4").split(['?', '#']).next().unwrap_or("mp4").to_lowercase();
        let key = url.clone();
        cx.spawn(async move |this, cx| {
            let loaded = cx
                .background_executor()
                .spawn(async move {
                    let (status, bytes) = client.fetch(&key).ok()?;
                    if status >= 400 {
                        return None;
                    }
                    use std::hash::{Hash, Hasher};
                    let mut h = std::collections::hash_map::DefaultHasher::new();
                    key.hash(&mut h);
                    let path = std::env::temp_dir().join(format!("hoffle-video-{:x}.{ext}", h.finish()));
                    std::fs::write(&path, &bytes).ok()?;
                    let info = video_clip::info(&path)?;
                    let poster = video_clip::picture_at(&path, 0., DECODE_WIDTH);
                    Some((path, info, poster))
                })
                .await;
            this.update(cx, |this, cx| {
                let clip = this.film.files.entry(url).or_default();
                clip.loading = false;
                match loaded {
                    Some((path, info, poster)) => {
                        clip.path = Some(path);
                        clip.info = Some(info);
                        clip.poster = poster.and_then(picture);
                    }
                    None => clip.failed = true,
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn video_stop(&mut self, cx: &mut Context<Self>) {
        if let Some(mut p) = self.film.playing.take() {
            p.stop.store(true, Ordering::Relaxed);
            if let Some(mut child) = p.sound.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            let at = p.clock();
            self.film.left.insert(p.key.clone(), if at >= p.total - 0.05 { p.total } else { at });
        }
        cx.notify();
    }

    /// Plays `key` (a file of a message) from `from`, its sound with it once that is decoded.
    fn video_play(&mut self, key: String, url: String, from: f32, cx: &mut Context<Self>) {
        self.video_stop(cx);
        let Some(clip) = self.film.files.get(&url) else { return };
        let (Some(path), Some(info)) = (clip.path.clone(), clip.info) else { return };
        // The sound first (decoded once, like a voice message); the pictures start with it.
        if !self.voice_msgs.clips.contains_key(&url) && !self.film.files.get(&url).is_some_and(|c| c.failed) {
            let (k, u, p) = (key.clone(), url.clone(), path.clone());
            cx.spawn(async move |this, cx| {
                let pcm = cx.background_executor().spawn(async move { std::fs::read(&p).ok().and_then(|b| crate::voice_clip::decode(&b)) }).await;
                this.update(cx, |this, cx| {
                    // No sound track: a silent one of the same length, so it plays at all.
                    let pcm = pcm.unwrap_or(crate::voice_clip::Pcm { samples: vec![0; (info.seconds * 48_000.) as usize], channels: 1 });
                    this.voice_msgs.clips.insert(u.clone(), Arc::new(pcm));
                    this.video_play(k, u, from, cx);
                })
                .ok();
            })
            .detach();
            return;
        }
        let total = info.seconds;
        let from = if from >= total - 0.05 { 0. } else { from.max(0.) };
        let speed = self.film.speed.get(&key).copied().unwrap_or(1.);
        let muted = self.film.muted.get(&key).copied().unwrap_or(false) || std::env::var("HOFFLE_DEV_MUTED").is_ok();
        let stop = Arc::new(AtomicBool::new(false));
        let (tx, rx) = std::sync::mpsc::sync_channel::<Frame>(6);
        {
            let (stop, path) = (stop.clone(), path.clone());
            std::thread::spawn(move || {
                video_clip::decode(&path, from, DECODE_WIDTH, stop, |frame| tx.send(frame).is_ok());
            });
        }
        let sound = self.voice_msgs.clips.get(&url).and_then(|pcm| {
            let file = std::env::temp_dir().join(format!("hoffle-video-sound-{}.wav", std::process::id()));
            std::fs::write(&file, pcm.wav_from(from)).ok()?;
            let mut command = std::process::Command::new("/usr/bin/afplay");
            command.arg("-r").arg(format!("{speed}")).arg("-q").arg("1");
            if muted {
                command.arg("-v").arg("0");
            }
            command.arg(&file).spawn().ok()
        });
        self.film.playing = Some(Playing { key: key.clone(), url, from, speed, since: Instant::now(), total, stop, frames: rx, queued: VecDeque::new(), sound });
        // The pump: the picture due now, about sixty times a second.
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(std::time::Duration::from_millis(16)).await;
                let go = this
                    .update(cx, |this, cx| {
                        let Some(p) = this.film.playing.as_mut() else { return false };
                        if p.key != key {
                            return false;
                        }
                        let clock = p.clock();
                        // A few pictures ahead at most: the decoder waits on the channel meanwhile.
                        while p.queued.len() < 6 {
                            match p.frames.try_recv() {
                                Ok(frame) => p.queued.push_back(frame),
                                Err(_) => break,
                            }
                        }
                        let mut due = None;
                        while p.queued.front().is_some_and(|f| f.at <= clock + 0.008) {
                            due = p.queued.pop_front();
                        }
                        let ended = clock >= p.total - 0.01;
                        let key = p.key.clone();
                        if let Some(frame) = due
                            && let Some(image) = picture(frame)
                            && let Some(old) = this.film.still.insert(key.clone(), image)
                        {
                            cx.drop_image(old, None);
                        }
                        if ended {
                            this.video_stop(cx);
                            this.film.left.insert(key, f32::MAX);
                        }
                        cx.notify();
                        !ended
                    })
                    .unwrap_or(false);
                if !go {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    /// Paused somewhere else: the picture there.
    fn video_seek(&mut self, key: String, url: String, to: f32, cx: &mut Context<Self>) {
        if self.film.playing.as_ref().is_some_and(|p| p.key == key) {
            self.video_play(key, url, to, cx);
            return;
        }
        self.film.left.insert(key.clone(), to);
        let Some(path) = self.film.files.get(&url).and_then(|c| c.path.clone()) else { return };
        cx.spawn(async move |this, cx| {
            let frame = cx.background_executor().spawn(async move { video_clip::picture_at(&path, to, DECODE_WIDTH) }).await;
            this.update(cx, |this, cx| {
                if let Some(image) = frame.and_then(picture)
                    && let Some(old) = this.film.still.insert(key, image)
                {
                    cx.drop_image(old, None);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// Quitting: the sound must not play on after the app.
    pub(super) fn halt_video(&mut self) {
        if let Some(mut p) = self.film.playing.take() {
            p.stop.store(true, Ordering::Relaxed);
            if let Some(mut child) = p.sound.take() {
                let _ = child.kill();
            }
        }
    }

    /// The video area with Chrome's controls, `w` × `h`.
    #[allow(clippy::too_many_arguments)]
    fn video_surface(&self, key: &str, url: &str, info: Info, w: f32, h: f32, full: bool, cx: &mut Context<Self>) -> AnyElement {
        let clip = self.film.files.get(url);
        let playing = self.film.playing.as_ref().filter(|p| p.key == key);
        let at = match playing {
            Some(p) => p.clock(),
            None => self.film.left.get(key).copied().map(|t| t.min(info.seconds)).unwrap_or(0.),
        };
        let ended = playing.is_none() && self.film.left.get(key).is_some_and(|t| *t >= info.seconds - 0.05) && at > 0.;
        let image = self.film.still.get(key).cloned().or_else(|| clip.and_then(|c| c.poster.clone()));
        // object-contain: the picture as big as fits, centred on black.
        let ratio = info.width as f32 / info.height.max(1) as f32;
        let (iw, ih) = if w / h > ratio { (h * ratio, h) } else { (w, w / ratio) };
        let share = if info.seconds > 0. { (at / info.seconds).clamp(0., 1.) } else { 0. };
        let shown = playing.is_none() || self.film.hovered.as_deref() == Some(key) || self.film.menu.as_deref() == Some(key);
        let muted = self.film.muted.get(key).copied().unwrap_or(false);
        let speed = self.film.speed.get(key).copied().unwrap_or(1.);
        let spot = self.film.spots.get(key).cloned().unwrap_or_default();
        let control = |id: String, icon: &'static str, size: f32| {
            div().id(SharedString::from(id)).size(px(40.)).flex().items_center().justify_center().cursor_pointer().child(ui::icon(icon, size, gpui::white()))
        };
        let (k1, u1) = (key.to_string(), url.to_string());
        let toggle = cx.listener(move |this, _, _, cx| {
            cx.stop_propagation();
            if this.film.playing.as_ref().is_some_and(|p| p.key == k1) {
                this.video_stop(cx);
            } else {
                let from = this.film.left.get(&k1).copied().unwrap_or(0.);
                this.video_play(k1.clone(), u1.clone(), from, cx);
            }
        });
        let (k2, u2, k3, k4, k5) = (key.to_string(), url.to_string(), key.to_string(), key.to_string(), key.to_string());
        let mut surface = div()
            .id(SharedString::from(format!("{key}-surface")))
            .relative()
            .w(px(w))
            .h(px(h))
            .bg(gpui::black())
            .flex()
            .items_center()
            .justify_center()
            .on_hover(cx.listener(move |this, over: &bool, _, cx| {
                let now = if *over { Some(k4.clone()) } else { None };
                if this.film.hovered != now && (*over || this.film.hovered.as_deref() == Some(k4.as_str())) {
                    this.film.hovered = now;
                    cx.notify();
                }
            }))
            .on_click(toggle)
            .when(!full, |d| d.rounded(px(11.)))
            // The picture keeps the box's corners where it reaches them.
            .children(image.map(|img| gpui::img(img).w(px(iw)).h(px(ih)).when(!full && iw >= w - 0.5 && ih >= h - 0.5, |d| d.rounded(px(11.)))));
        if shown {
            let k6 = key.to_string();
            surface = surface
                // The dark fade under the controls, darkest under the seek bar.
                .child(div().absolute().left_0().right_0().bottom_0().h(px(90.)).when(!full, |d| d.rounded_b(px(11.))).bg(gpui::linear_gradient(180., gpui::linear_color_stop(gpui::hsla(0., 0., 0., 0.), 0.), gpui::linear_color_stop(gpui::hsla(0., 0., 0., 0.5), 1.))))
                .child(div().absolute().left_0().right_0().bottom_0().h(px(56.)).when(!full, |d| d.rounded_b(px(11.))).bg(gpui::linear_gradient(180., gpui::linear_color_stop(gpui::hsla(0., 0., 0., 0.), 0.), gpui::linear_color_stop(gpui::hsla(0., 0., 0., 0.95), 1.))))
                .child(
                    div()
                        .absolute()
                        .left(px(4.))
                        .right(px(4.))
                        .bottom(px(27.))
                        .h(px(40.))
                        .flex()
                        .items_center()
                        .child(control(format!("{key}-play"), if playing.is_some() { "pause-filled" } else if ended { "rotate-ccw" } else { "play-filled" }, 14.).on_click({
                            let (k, u) = (key.to_string(), url.to_string());
                            cx.listener(move |this, _, _, cx| {
                                cx.stop_propagation();
                                if this.film.playing.as_ref().is_some_and(|p| p.key == k) {
                                    this.video_stop(cx);
                                } else {
                                    let from = this.film.left.get(&k).copied().unwrap_or(0.);
                                    this.video_play(k.clone(), u.clone(), from, cx);
                                }
                            })
                        }))
                        .child(div().ml(px(3.)).text_size(px(13.)).line_height(px(20.)).text_color(gpui::white()).child(format!("{} / {}", mmss(at), mmss(info.seconds))))
                        .child(div().flex_1())
                        .child(control(format!("{key}-mute"), if muted { "volume-x" } else { "volume-2" }, 18.).on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            let m = this.film.muted.entry(k2.clone()).or_default();
                            *m = !*m;
                            // Heard again (or not) from here on.
                            if this.film.playing.as_ref().is_some_and(|p| p.key == k2) {
                                let from = this.film.playing.as_ref().map(|p| p.clock()).unwrap_or(0.);
                                this.video_play(k2.clone(), u2.clone(), from, cx);
                            }
                            cx.notify();
                        })))
                        .child(control(format!("{key}-full"), if full { "minimize" } else { "maximize" }, 16.).on_click({
                            let (k, u) = (key.to_string(), url.to_string());
                            cx.listener(move |this, _, _, cx| {
                                cx.stop_propagation();
                                this.film.full = if this.film.full.is_some() { None } else { this.film.files.get(&u).and_then(|c| c.info).map(|i| (k.clone(), u.clone(), i)) };
                                cx.notify();
                            })
                        }))
                        .child(control(format!("{key}-more"), "ellipsis-vertical", 18.).on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            this.film.menu = if this.film.menu.as_deref() == Some(k3.as_str()) { None } else { Some(k3.clone()) };
                            cx.notify();
                        }))),
                )
                // The seek bar.
                .child(
                    div()
                        .id(SharedString::from(format!("{key}-bar")))
                        .absolute()
                        .left(px(16.))
                        .right(px(16.))
                        .bottom(px(12.))
                        .h(px(16.))
                        .flex()
                        .items_center()
                        .cursor_pointer()
                        .child(div().relative().w_full().h(px(4.)).rounded_full().bg(gpui::white().opacity(0.5)).child(div().absolute().left_0().top_0().h_full().w(gpui::relative(share)).rounded_full().bg(gpui::white())))
                        .child(super::profile_card::track(&spot))
                        .on_mouse_down(gpui::MouseButton::Left, {
                            let (k, u) = (key.to_string(), url.to_string());
                            cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                cx.stop_propagation();
                                let Some(total) = this.film.files.get(&u).and_then(|c| c.info).map(|i| i.seconds) else { return };
                                let b = this.film.spots.get(&k).map(|s| s.get()).unwrap_or_default();
                                let to = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width).max(1.)).clamp(0., 1.) * total;
                                this.video_seek(k.clone(), u.clone(), to, cx);
                            })
                        })
                        .on_click(|_, _, cx| cx.stop_propagation()),
                );
            // ⋮: Download and Playback speed.
            if self.film.menu.as_deref() == Some(key) {
                let link = self.client.absolute(url);
                let item = |id: String, icon: &'static str, label: String| {
                    div()
                        .id(SharedString::from(id))
                        .h(px(36.))
                        .px(px(16.))
                        .flex()
                        .items_center()
                        .gap(px(16.))
                        .text_size(px(14.))
                        .text_color(gpui::black().opacity(0.87))
                        .cursor_pointer()
                        .hover(|s| s.bg(gpui::black().opacity(0.06)))
                        .child(ui::icon(icon, 18., gpui::black().opacity(0.6)))
                        .child(label)
                };
                let mut menu = div()
                    .id(SharedString::from(format!("{key}-menu")))
                    .occlude()
                    .absolute()
                    .right(px(8.))
                    .bottom(px(70.))
                    .w(px(200.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .bg(gpui::white())
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(2.)), blur_radius: px(6.), spread_radius: px(0.) }])
                    .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                        this.film.menu = None;
                        cx.notify();
                    }))
                    .child(item(format!("{key}-dl"), "download", "Download".into()).on_click(move |_, _, cx| cx.open_url(&link)));
                for s in [0.5f32, 1., 1.5, 2.] {
                    let (k, u) = (k6.clone(), url.to_string());
                    menu = menu.child(
                        item(format!("{key}-speed-{s}"), if (speed - s).abs() < 0.01 { "check" } else { "gauge" }, if (s - 1.).abs() < 0.01 { "Normal speed".into() } else { format!("{s}× speed") }).on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            this.film.speed.insert(k.clone(), s);
                            this.film.menu = None;
                            if this.film.playing.as_ref().is_some_and(|p| p.key == k) {
                                let from = this.film.playing.as_ref().map(|p| p.clock()).unwrap_or(0.);
                                this.video_play(k.clone(), u.clone(), from, cx);
                            }
                            cx.notify();
                        })),
                    );
                }
                surface = surface.child(menu);
            }
        }
        let _ = k5;
        surface.into_any_element()
    }

    /// The card under a message: name and Download above the video.
    pub(super) fn render_inline_video(&self, message: &Message, n: usize, file: &FileRef, column: f32, cx: &mut Context<Self>) -> AnyElement {
        let url = file.url.clone();
        let key = format!("video:{}:{n}", message.id);
        if !self.film.files.contains_key(&url) {
            let u = url.clone();
            cx.spawn(async move |this, cx| this.update(cx, |this, cx| this.video_load(u, cx)).ok()).detach();
        }
        let clip = self.film.files.get(&url);
        let clean = {
            let lower = file.name.to_lowercase();
            if lower.starts_with("spoiler_") || lower.starts_with("spoiler-") { file.name[8..].to_string() } else { file.name.clone() }
        };
        let width = column.min(520.);
        let white = |a: f32| -> Hsla { gpui::white().opacity(a) };
        let link = self.client.absolute(&url);
        let head = div()
            .px(px(4.))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(8.))
            .text_size(px(12.))
            .line_height(px(16.))
            .text_color(white(0.7))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .min_w_0()
                    .child(div().flex_none().size(px(20.)).rounded(px(6.)).bg(gpui::hsla(271. / 360., 0.91, 0.65, 0.2)).flex().items_center().justify_center().child(ui::icon("film", 12., rgb(0xc084fc))))
                    .child(div().truncate().font_weight(FontWeight::MEDIUM).text_color(white(0.9)).child(clean.clone())),
            )
            .child(
                div()
                    .id(SharedString::from(format!("{key}-download")))
                    .flex_none()
                    .p(px(4.))
                    .rounded(px(4.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(11.))
                    .line_height(px(14.67))
                    .text_color(white(0.5))
                    .cursor_pointer()
                    .hover(|s| s.bg(gpui::white().opacity(0.1)).text_color(gpui::white()))
                    .child(ui::icon("download", 13., white(0.5)))
                    .child("Download")
                    .on_click({
                        let link = link.clone();
                        move |_, _, cx| cx.open_url(&link)
                    }),
            );
        let body: AnyElement = match clip.and_then(|c| c.info) {
            Some(info) => {
                // w-full, max-h 380: as tall as its shape says.
                let inner = width - 2.;
                let h = (inner * info.height as f32 / info.width.max(1) as f32).min(380.);
                if !self.film.spots.contains_key(&key) {
                    let k = key.clone();
                    cx.spawn(async move |this, cx| this.update(cx, |this, _| { this.film.spots.entry(k).or_default(); }).ok()).detach();
                }
                div()
                    .w(px(width))
                    .rounded(px(12.))
                    .overflow_hidden()
                    .border_1()
                    .border_color(white(0.1))
                    .bg(gpui::black().opacity(0.9))
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.1), offset: gpui::point(px(0.), px(4.)), blur_radius: px(6.), spread_radius: px(-1.) }])
                    .child(self.video_surface(&key, &url, info, inner, h, false, cx))
                    .into_any_element()
            }
            None if clip.is_some_and(|c| c.failed) => div()
                .w(px(width))
                .p(px(24.))
                .rounded(px(12.))
                .border_1()
                .border_color(white(0.1))
                .bg(gpui::black().opacity(0.4))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(8.))
                .child(div().mb(px(2.)).child(ui::icon("film", 26., white(0.4))))
                .child(div().text_size(px(12.)).font_weight(FontWeight::MEDIUM).text_color(white(0.8)).child("Video playback unavailable here"))
                .child(
                    div()
                        .id(SharedString::from(format!("{key}-fallback")))
                        .px(px(12.))
                        .py(px(6.))
                        .rounded(px(8.))
                        .bg(white(0.1))
                        .hover(|s| s.bg(gpui::white().opacity(0.2)))
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .text_size(px(12.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(gpui::white())
                        .cursor_pointer()
                        .child(ui::icon("download", 13., gpui::white()))
                        .child(format!("Download {clean}"))
                        .on_click(move |_, _, cx| cx.open_url(&link)),
                )
                .into_any_element(),
            // Still loading: a black box of the usual shape.
            None => div().w(px(width)).h(px((width - 2.) * 9. / 16.)).rounded(px(12.)).border_1().border_color(white(0.1)).bg(gpui::black().opacity(0.9)).into_any_element(),
        };
        div().mt(px(8.)).w(px(width)).flex().flex_col().gap(px(6.)).child(head).child(body).into_any_element()
    }

    /// Full screen: the playing video over the whole window, contained on black.
    pub(super) fn render_video_full(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (key, url, info) = self.film.full.clone()?;
        let size = window.viewport_size();
        let (w, h) = (f32::from(size.width), f32::from(size.height));
        Some(div().absolute().inset_0().bg(gpui::black()).occlude().child(self.video_surface(&key, &url, info, w, h, true, cx)).into_any_element())
    }

    /// Development: HOFFLE_DEV_VIDEO_AT=<s>: the newest video in the channel paused there.
    pub(super) fn dev_video(&mut self, cx: &mut Context<Self>) {
        // HOFFLE_DEV_VIDEO_PLAY=1: the newest video plays (muted with HOFFLE_DEV_MUTED).
        static PLAYED: AtomicBool = AtomicBool::new(false);
        if std::env::var_os("HOFFLE_DEV_VIDEO_PLAY").is_some()
            && let Some((key, url)) = self
                .channel_id
                .as_ref()
                .and_then(|c| self.messages.get(c))
                .and_then(|l| l.iter().rev().find_map(|m| m.files.iter().position(|f| f.name.to_lowercase().ends_with(".mp4")).map(|n| (format!("video:{}:{n}", m.id), m.files[n].url.clone()))))
            && self.film.files.get(&url).is_some_and(|c| c.info.is_some())
            && !PLAYED.swap(true, Ordering::Relaxed)
        {
            self.video_play(key, url, 0., cx);
        }
        let Some(at) = std::env::var("HOFFLE_DEV_VIDEO_AT").ok().and_then(|v| v.parse::<f32>().ok()) else { return };
        let Some((key, url)) = self
            .channel_id
            .as_ref()
            .and_then(|c| self.messages.get(c))
            .and_then(|l| l.iter().rev().find_map(|m| m.files.iter().position(|f| f.name.to_lowercase().ends_with(".mp4")).map(|n| (format!("video:{}:{n}", m.id), m.files[n].url.clone()))))
        else {
            return;
        };
        if self.film.left.contains_key(&key) || !self.film.files.get(&url).is_some_and(|c| c.info.is_some()) {
            return;
        }
        self.video_seek(key, url, at, cx);
    }
}
