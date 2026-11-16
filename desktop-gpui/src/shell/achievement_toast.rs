//! The unlock popup (components/achievement-toast.tsx, achievement-center.tsx): unlocks from the
//! hub, from the board, or the periodic re-check queue up, rarest first, three per batch with
//! "+N more"; each shows for a while and leaves on its own. Every theme gets the medal that pops
//! and unrolls into a pill, except Vampire, where bats carry the card down. Each has its jingle.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};

use super::Shell;
use super::achievements::{Def, find_def, medal, sound_on, tier_label};
use crate::theme::{DISPLAY_FONT, Theme, mix};
use crate::ui;

/// At most this many popups per batch of unlocks; the rest are "+N more".
const BURST: usize = 3;
/// How often the full board is re-checked (voice time, friends, anniversaries…).
const POLL: Duration = Duration::from_secs(10 * 60);

#[derive(Clone, Copy, PartialEq)]
enum Variant {
    Pop,
    Bats,
    Mc,
    Owl,
    Msn,
    Zombie,
    Cyber,
    Matrix,
    Galaxy,
    Campfire,
    Retro,
}

impl Variant {
    /// toastVariantFor(): each theme's delivery.
    fn current() -> Self {
        let id = crate::theme::active_theme();
        match id.as_str() {
            "minecraft" => Variant::Mc,
            "vampire" => Variant::Bats,
            "dark-academia" => Variant::Owl,
            "zombie" => Variant::Zombie,
            "cyberpunk" => Variant::Cyber,
            "matrix" => Variant::Matrix,
            "star-wars" => Variant::Galaxy,
            "amber" => Variant::Campfire,
            "winamp" | "teamspeak" => Variant::Retro,
            _ if id.starts_with("msn") => Variant::Msn,
            _ => Variant::Pop,
        }
    }
    /// DURATION: how long each stays up before leaving on its own; and how long leaving takes.
    fn stay(self) -> f32 {
        match self {
            Variant::Mc => 5.2,
            Variant::Bats => 7.6,
            Variant::Owl => 7.8,
            Variant::Msn | Variant::Cyber => 6.5,
            Variant::Zombie | Variant::Matrix | Variant::Campfire | Variant::Retro => 7.0,
            Variant::Galaxy => 7.6,
            Variant::Pop => 6.2,
        }
    }
    fn leave(self) -> f32 {
        match self {
            Variant::Bats => 0.55,
            Variant::Owl | Variant::Zombie | Variant::Galaxy => 0.5,
            Variant::Cyber => 0.4,
            Variant::Retro => 0.25,
            _ => 0.45,
        }
    }
}

#[derive(Default)]
pub(super) struct Toasts {
    queue: Vec<Def>,
    overflow: usize,
    seen: HashSet<String>,
    /// The one showing: when it came, its look, and when it began to leave.
    shown: Option<(Instant, Variant, Option<Instant>)>,
}

// ---------- easing ----------

/// cubic-bezier(x1, y1, x2, y2) at progress x (Newton on x, then y).
fn bezier(x1: f32, y1: f32, x2: f32, y2: f32, x: f32) -> f32 {
    let x = x.clamp(0., 1.);
    let curve = |a: f32, b: f32, t: f32| 3. * a * t * (1. - t) * (1. - t) + 3. * b * t * t * (1. - t) + t * t * t;
    let mut t = x;
    for _ in 0..8 {
        let dx = curve(x1, x2, t) - x;
        let d = 3. * x1 * (1. - t) * (1. - t) + 6. * (x2 - x1) * t * (1. - t) + 3. * (1. - x2) * t * t;
        if d.abs() < 1e-5 {
            break;
        }
        t = (t - dx / d).clamp(0., 1.);
    }
    curve(y1, y2, t)
}

fn phase(t: f32, start: f32, len: f32) -> f32 {
    ((t - start) / len).clamp(0., 1.)
}

// ---------- sound ----------

/// JINGLES: the oscillator, its level and the notes (Hz, start s, length s).
fn jingle(variant: Variant, tier: &str) {
    if !sound_on() || std::env::var_os("HOFFLE_DEV_MUTED").is_some() {
        return;
    }
    let (wave, gain, notes): (&str, f32, Vec<(f32, f32, f32)>) = match variant {
        // The bright rising chime of a Minecraft advancement.
        Variant::Mc => ("square", 0.05, vec![(784., 0., 0.12), (988., 0.09, 0.12), (1175., 0.18, 0.14), (1568., 0.28, 0.32)]),
        // A minor organ swell.
        Variant::Bats => ("saw", 0.035, vec![(220., 0., 1.1), (261.6, 0., 1.1), (329.6, 0., 1.1), (440., 0.35, 0.9)]),
        // Plucked, harpsichord-ish arpeggio.
        Variant::Owl => ("triangle", 0.12, vec![(523.3, 0., 0.3), (659.3, 0.12, 0.3), (784., 0.24, 0.3), (1046.5, 0.36, 0.6)]),
        Variant::Msn => ("sine", 0.16, vec![(880., 0., 0.18), (1318.5, 0.14, 0.4)]),
        Variant::Zombie => ("saw", 0.05, vec![(110., 0., 0.5), (103.8, 0.25, 0.5), (146.8, 0.55, 0.7)]),
        Variant::Cyber => ("square", 0.04, vec![(1396.9, 0., 0.06), (1046.5, 0.07, 0.06), (1568., 0.14, 0.06), (2093., 0.21, 0.25)]),
        Variant::Matrix => ("square", 0.03, vec![(1200., 0., 0.04), (900., 0.06, 0.04), (1500., 0.12, 0.04), (600., 0.18, 0.04), (1800., 0.26, 0.2)]),
        // A short brass call: up a fifth, then the octave.
        Variant::Galaxy => ("saw", 0.04, vec![(261.6, 0., 0.22), (392., 0.2, 0.22), (523.3, 0.4, 1.1), (659.3, 0.4, 1.1), (784., 0.4, 1.1)]),
        Variant::Campfire => ("triangle", 0.12, vec![(392., 0., 0.5), (493.9, 0.18, 0.5), (587.3, 0.36, 0.8)]),
        Variant::Retro => ("square", 0.04, vec![(659.3, 0., 0.1), (880., 0.1, 0.25)]),
        Variant::Pop => ("sine", 0.14, vec![(659.3, 0., 0.16), (987.8, 0.1, 0.5)]),
    };
    // Platinum gets the tune an octave up as well.
    let notes: Vec<(f32, f32, f32)> = if tier == "platinum" { notes.iter().copied().chain(notes.iter().map(|&(f, s, d)| (f * 2., s + 0.04, d))).collect() } else { notes };
    let rate = 44_100usize;
    let end = notes.iter().map(|(_, s, d)| s + d + 0.07).fold(0f32, f32::max) + 0.02;
    let mut buf = vec![0f32; (end * rate as f32) as usize];
    for (freq, start, dur) in notes {
        let from = ((start + 0.02) * rate as f32) as usize;
        let n = ((dur + 0.05) * rate as f32) as usize;
        for i in 0..n {
            let t = i as f32 / rate as f32;
            // exponentialRamp from 0.0001 up to gain in 15 ms, then down to 0.0001 at dur.
            let env = if t < 0.015 { 0.0001 * (gain / 0.0001).powf(t / 0.015) } else if t < dur { gain * (0.0001 / gain).powf((t - 0.015) / (dur - 0.015).max(0.001)) } else { 0.0001 };
            let p = (freq * t).fract();
            let v = match wave {
                "saw" => 2. * p - 1.,
                "square" => if p < 0.5 { 1. } else { -1. },
                "triangle" => 1. - 4. * (p - 0.5).abs(),
                _ => (p * std::f32::consts::TAU).sin(),
            };
            if let Some(s) = buf.get_mut(from + i) {
                *s += v * env;
            }
        }
    }
    let mut wav = Vec::with_capacity(44 + buf.len() * 2);
    let data = (buf.len() * 2) as u32;
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&(rate as u32).to_le_bytes());
    wav.extend_from_slice(&(rate as u32 * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data.to_le_bytes());
    for s in buf {
        wav.extend_from_slice(&((s.clamp(-1., 1.) * 32767.) as i16).to_le_bytes());
    }
    std::thread::spawn(move || {
        let file = std::env::temp_dir().join(format!("hoffle-achievement-{}.wav", std::process::id()));
        if std::fs::write(&file, &wav).is_ok() {
            let _ = std::process::Command::new("/usr/bin/afplay").arg(&file).status();
        }
    });
}

// ---------- bats ----------

/// The bat (achievement-toast.tsx Bat), wings at `flap` of their height, drawn at twice its size.
fn bat_svg(width: f32, flap: f32) -> Arc<gpui::Image> {
    // gpui decodes SVG colours with red and blue swapped.
    let c = |rgb: u32| format!("#{:02x}{:02x}{:02x}", rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff);
    let wing = "M32 15 C27 8 19 5 5 7 C9 10 9 13 7 16 C11 15 14 17 15 20 C18 17 22 17 25 19 C26 17 29 16 32 17Z";
    let w = width * 2.;
    let h = w * 30. / 64.;
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 64 30"><g fill="{body}" stroke="{edge}" stroke-opacity="0.75" stroke-width="0.7"><g transform="translate(0 15) scale(1 {flap}) translate(0 -15)"><path d="{wing}"/><g transform="translate(64 0) scale(-1 1)"><path d="{wing}"/></g></g><ellipse cx="32" cy="16" rx="3.6" ry="5.6"/><path d="M29.2 11.5 L29.8 7.2 L31.4 10.6 L32.6 10.6 L34.2 7.2 L34.8 11.5Z"/></g><circle cx="30.7" cy="13.4" r="0.7" fill="{eye}"/><circle cx="33.3" cy="13.4" r="0.7" fill="{eye}"/></svg>"##,
        body = c(0x1a0509),
        edge = c(0xff465a),
        eye = c(0xff2a3c),
    );
    Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Svg, svg.into_bytes()))
}

/// achFlap: 0.16 s each way between 1.1 and 0.25 of the wings' height (a few steps, cached).
fn bat(width: f32, t: f32) -> AnyElement {
    thread_local! {
        static CACHE: std::cell::RefCell<std::collections::HashMap<(u32, u32), Arc<gpui::Image>>> = Default::default();
    }
    let cycle = (t / 0.16) % 2.;
    let k = if cycle < 1. { cycle } else { 2. - cycle };
    let step = (k * 6.).round() as u32;
    let flap = 1.1 + (0.25 - 1.1) * step as f32 / 6.;
    let image = CACHE.with(|c| c.borrow_mut().entry((width as u32, step)).or_insert_with(|| bat_svg(width, flap)).clone());
    gpui::img(image).w(px(width)).h(px(width * 30. / 64.)).into_any_element()
}


// ---------- art for the other themes ----------

/// A colour for an SVG that gpui decodes with red and blue swapped.
fn sc(rgb: u32) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff)
}

fn svg_image(svg: String) -> Arc<gpui::Image> {
    Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Svg, svg.into_bytes()))
}

/// The owl (achievement-toast.tsx Owl), wings `flap` of the way up, drawn at twice its size.
fn owl_svg(flap: f32) -> Arc<gpui::Image> {
    let a = -38. * flap;
    svg_image(format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="156" height="140" viewBox="0 0 80 72"><g transform="rotate({a} 24 38)"><path fill="{wing}" d="M24 34 C10 30 2 40 1 52 C8 47 13 48 17 51 C18 46 21 44 25 46Z"/></g><g transform="rotate({b} 56 38)"><path fill="{wing}" d="M56 34 C70 30 78 40 79 52 C72 47 67 48 63 51 C62 46 59 44 55 46Z"/></g><path fill="{body}" d="M40 14 C26 14 21 24 21 36 C21 52 29 64 40 64 C51 64 59 52 59 36 C59 24 54 14 40 14Z"/><path fill="{belly}" d="M40 36 C32 36 29 44 30 52 C32 59 36 62 40 62 C44 62 48 59 50 52 C51 44 48 36 40 36Z"/><path fill="{body}" d="M24 22 L22 10 L31 18Z M56 22 L58 10 L49 18Z"/><circle fill="{disc}" cx="32.5" cy="28" r="8"/><circle fill="{disc}" cx="47.5" cy="28" r="8"/><circle fill="{iris}" cx="32.5" cy="28" r="5"/><circle fill="{iris}" cx="47.5" cy="28" r="5"/><circle fill="{pupil}" cx="32.5" cy="28" r="2.4"/><circle fill="{pupil}" cx="47.5" cy="28" r="2.4"/><path fill="{beak}" d="M37.5 33 L42.5 33 L40 39Z"/><path stroke="{beak}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M34 63 l-2 4 M36 63 l0 4.5 M38 63 l2 4 M42 63 l-2 4 M44 63 l0 4.5 M46 63 l2 4"/></svg>"##,
        b = -a,
        wing = sc(0x5e3f22),
        body = sc(0x7a5634),
        belly = sc(0xd8bf94),
        disc = sc(0xefe1c4),
        iris = sc(0xf2a516),
        pupil = sc(0x1a0f06),
        beak = sc(0x3a2614),
    ))
}

/// The zombie's hand and sleeve.
fn hand_svg() -> Arc<gpui::Image> {
    svg_image(format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138" viewBox="0 0 60 90"><path fill="{hand}" d="M18 90 L20 52 C14 46 10 38 12 33 C14 30 18 33 20 38 L21 18 C21 14 26 14 26 18 L27 34 L28 10 C28 6 33 6 33 10 L34 34 L36 14 C36 10 41 10 41 14 L40 36 L44 22 C45 18 50 19 49 23 L45 48 C44 54 42 60 40 64 L42 90Z"/><path fill="{sleeve}" d="M14 72 L46 70 L48 90 L12 90Z"/></svg>"##,
        hand = sc(0x6f8f52),
        sleeve = sc(0x3a2c22),
    ))
}

/// `.ach-zombie-tape`: yellow and black stripes at -45°, 10 px each.
fn tape_svg(width: f32) -> Arc<gpui::Image> {
    let mut stripes = String::new();
    let mut x = -20.;
    while x < width + 20. {
        stripes.push_str(&format!(r##"<path fill="{}" d="M{x} 10 L{} 0 L{} 0 L{} 10Z"/>"##, sc(0x111111), x + 10., x + 10. + 14.142 / 2., x + 14.142 / 2.));
        x += 28.284 / 2.;
    }
    svg_image(format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="20" viewBox="0 0 {width} 10"><rect width="{width}" height="10" fill="{}"/>{stripes}</svg>"##, width * 2., sc(0xf2c94c)))
}

/// useDecode(): the name scrambles into place two frames a letter, 45 ms a frame.
fn decode(text: &str, t: f32) -> String {
    let glyphs: Vec<char> = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789#$%&*+=<>".chars().collect();
    let frame = (t / 0.045) as usize;
    let settled = frame / 2;
    text.chars()
        .enumerate()
        .map(|(i, ch)| if i < settled || ch == ' ' { ch } else { glyphs[(i * 7 + frame * 13) % glyphs.len()] })
        .collect()
}

impl Shell {
    /// announceUnlocked(): new ids (each once) join the queue, rarest first.
    pub(super) fn announce_unlocked(&mut self, ids: Vec<String>, cx: &mut Context<Self>) {
        let fresh: Vec<String> = ids.into_iter().filter(|id| self.unlocks.seen.insert(id.clone())).collect();
        if fresh.is_empty() {
            return;
        }
        let mut defs: Vec<Def> = fresh.iter().filter_map(|id| find_def(id)).collect();
        let order = |tier: &str| match tier {
            "platinum" => 0,
            "gold" => 1,
            "silver" => 2,
            _ => 3,
        };
        defs.sort_by_key(|d| order(&d.tier));
        if defs.len() > BURST {
            self.unlocks.overflow += defs.len() - BURST;
        }
        self.unlocks.queue.extend(defs.into_iter().take(BURST));
        cx.notify();
    }

    /// previewAchievement(): jumps the queue and plays even an unlock already seen.
    pub(super) fn preview_unlock(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(def) = find_def(id) {
            self.unlocks.queue = vec![def];
            self.unlocks.overflow = 0;
            self.unlocks.shown = None;
            cx.notify();
        }
    }

    /// The periodic full check: 6 s after start, then every ten minutes.
    pub(super) fn start_achievement_checks(&mut self, cx: &mut Context<Self>) {
        cx.spawn(async move |this, cx| {
            let mut wait = Duration::from_secs(6);
            loop {
                cx.background_executor().timer(wait).await;
                wait = POLL;
                let Ok(client) = this.update(cx, |this, _| this.client.clone()) else { break };
                let result = cx.background_executor().spawn(async move { client.settings_get("/api/achievements") }).await;
                let ids: Vec<String> = result.ok().and_then(|v| serde_json::from_value(v["newlyEarned"].clone()).ok()).unwrap_or_default();
                if this.update(cx, |this, cx| this.announce_unlocked(ids, cx)).is_err() {
                    break;
                }
            }
        })
        .detach();
    }

    fn toast_leave(&mut self, cx: &mut Context<Self>) {
        if let Some((_, _, leaving)) = self.unlocks.shown.as_mut()
            && leaving.is_none()
        {
            *leaving = Some(Instant::now());
            cx.notify();
        }
    }

    pub(super) fn render_achievement_toast(&mut self, window: &mut Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let def = self.unlocks.queue.first()?.clone();
        let (start, variant, leaving) = *self.unlocks.shown.get_or_insert_with(|| {
            let v = Variant::current();
            jingle(v, &def.tier);
            (Instant::now(), v, None)
        });
        // HOFFLE_DEV_UNLOCK_AT=<s>: held at that moment, to compare with the web.
        let frozen = std::env::var("HOFFLE_DEV_UNLOCK_AT").ok().and_then(|v| v.parse::<f32>().ok());
        let t = frozen.unwrap_or_else(|| start.elapsed().as_secs_f32());
        // Leaves on its own after a while; gone once leaving has played.
        if leaving.is_none() && t >= variant.stay() && frozen.is_none() {
            self.unlocks.shown = Some((start, variant, Some(Instant::now())));
        }
        let gone = self.unlocks.shown.and_then(|s| s.2).map(|l| l.elapsed().as_secs_f32());
        if gone.is_some_and(|g| g >= variant.leave() + 0.07) {
            self.unlocks.queue.remove(0);
            if self.unlocks.queue.is_empty() {
                self.unlocks.overflow = 0;
            }
            self.unlocks.shown = None;
            window.request_animation_frame();
            return None;
        }
        window.request_animation_frame();
        let out = gone.map(|g| (g / variant.leave()).clamp(0., 1.)).unwrap_or(0.);
        let more = self.unlocks.queue.len() - 1 + self.unlocks.overflow;
        let vw = f32::from(window.viewport_size().width);
        let vh = f32::from(window.viewport_size().height);
        Some(match variant {
            Variant::Pop => self.toast_pop(&def, t, out, more, vw, window, cx),
            Variant::Bats => self.toast_bats(&def, t, out, more, vw, window, cx),
            other => self.toast_themed(other, &def, t, out, more, vw, vh, window, cx),
        })
    }

    fn toast_close(&self, color: Hsla, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("ach-toast-close")
            .absolute()
            .top(px(6.))
            .right(px(6.))
            .size(px(22.))
            .rounded(px(6.))
            .flex()
            .items_center()
            .justify_center()
            .opacity(0.55)
            .cursor_pointer()
            .hover(|s| s.opacity(1.).bg(gpui::hsla(0., 0., 0.5, 0.18)))
            .child(ui::icon("x", 14., color))
            .on_click(cx.listener(|this, _, _, cx| {
                cx.stop_propagation();
                this.toast_leave(cx);
            }))
    }

    /// Clicking the card opens the board.
    fn toast_open(this: &mut Shell, cx: &mut Context<Shell>) {
        this.open_achievements(cx);
        this.toast_leave(cx);
    }

    /// The default: the medal pops, unrolls into a pill, a shine runs across; text fades in.
    #[allow(clippy::too_many_arguments)]
    fn toast_pop(&self, def: &Def, t: f32, out: f32, more: usize, vw: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let full = 420f32.min(vw - 32.);
        // achPopIn 0.5 s (overshooting), achUnroll 0.45–1.0 s.
        let pop = bezier(0.2, 1.4, 0.4, 1., phase(t, 0., 0.5));
        let unroll = bezier(0.3, 0.9, 0.3, 1., phase(t, 0.45, 0.55));
        let scale = 0.2 + 0.8 * pop;
        let width = (68. + (full - 68.) * unroll) * if t < 0.5 { scale } else { 1. };
        let height = 68. * if t < 0.5 { scale } else { 1. };
        let fade_text = phase(t, 0.8, 0.3);
        let opacity = phase(t, 0., 0.5).min(1.) * (1. - out);
        let lift = -30. * out;
        let lavender: Hsla = Theme::lavender().into();
        let shine = phase(t, 1., 1.1);
        let ink: Hsla = Theme::ink().into();
        let mut card = div()
            .id("ach-toast")
            .relative()
            .w(px(width))
            .h(px(height))
            .flex_none()
            .rounded_full()
            .overflow_hidden()
            .bg(mix(Theme::panel(), 0.92, gpui::black()))
            .border_1()
            .border_color(lavender.opacity(0.45))
            .shadow(vec![
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(12.)), blur_radius: px(40.), spread_radius: px(0.) },
                gpui::BoxShadow { color: lavender.opacity(0.14), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(4.) },
            ])
            .flex()
            .items_center()
            .gap(px(12.))
            .pl(px(8.))
            .pr(px(34.))
            .text_color(ink)
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| Self::toast_open(this, cx)))
            .child(div().flex_none().child(medal(def, true, 52., window.scale_factor())))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .min_w_0()
                    .opacity(fade_text)
                    .child(div().text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::EXTRA_BOLD).text_color(lavender).child(format!("Achievement unlocked · {}", tier_label(&def.tier)).to_uppercase()))
                    .child(div().whitespace_nowrap().overflow_hidden().text_ellipsis().font_family(DISPLAY_FONT).text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::EXTRA_BOLD).child(def.label.clone()))
                    .child(div().whitespace_nowrap().overflow_hidden().text_ellipsis().text_size(px(11.5)).line_height(px(17.25)).text_color(Theme::muted()).child(def.description.clone())),
            )
            .when(more > 0, |d| {
                d.child(
                    div()
                        .absolute()
                        .right(px(30.))
                        .top(px(height / 2. - 8.))
                        .px(px(7.))
                        .py(px(1.))
                        .rounded_full()
                        .bg(gpui::hsla(0., 0., 0., 0.35))
                        .text_size(px(10.))
                        .line_height(px(14.))
                        .font_weight(FontWeight::BOLD)
                        .text_color(gpui::white())
                        .child(format!("+{more} more")),
                )
            });
        if t >= 0.5 {
            card = card.child(self.toast_close(ink, cx));
        }
        // achShine: a light band sweeping across once.
        if shine > 0. && shine < 1. {
            let x = -1.1 + 2.2 * (1. - (1. - shine).powi(2));
            card = card.child(
                div()
                    .absolute()
                    .top_0()
                    .bottom_0()
                    .left(px(width * x))
                    .w(px(width))
                    .bg(gpui::linear_gradient(
                        105.,
                        gpui::linear_color_stop(gpui::hsla(0., 0., 1., 0.), 0.35),
                        gpui::linear_color_stop(gpui::hsla(0., 0., 1., 0.22), 0.5),
                    )),
            );
        }
        // Gold and platinum: sparks fly out of the medal.
        let mut sparks = div().absolute().top_0().left_0();
        if matches!(def.tier.as_str(), "gold" | "platinum") {
            for i in 0..12 {
                let p = phase(t, 0.35 + i as f32 * 0.03, 1.);
                if p <= 0. || p >= 1. {
                    continue;
                }
                let angle = (i as f32 * 30.).to_radians();
                let dist = 70. * p;
                let size = 6. * (1. - 0.7 * p);
                sparks = sparks.child(
                    div()
                        .absolute()
                        .left(px(34. + angle.cos() * dist - size / 2. + 3.))
                        .top(px(34. + angle.sin() * dist - size / 2. + 3.))
                        .size(px(size))
                        .rounded_full()
                        .bg(rgb(0xfde68a))
                        .opacity(1. - p)
                        .shadow(vec![gpui::BoxShadow { color: rgb(0xfde68a).into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(8.), spread_radius: px(0.) }]),
                );
            }
        }
        div()
            .absolute()
            .top(px(18. + lift))
            .left_0()
            .right_0()
            .flex()
            .justify_center()
            .opacity(opacity)
            .child(div().relative().w(px(full)).h(px(68.)).flex().items_center().justify_center().child(card).child(sparks))
            .into_any_element()
    }

    /// Vampire: two bats carry the card down on threads, a swarm crosses the screen.
    #[allow(clippy::too_many_arguments)]
    fn toast_bats(&self, def: &Def, t: f32, out: f32, more: usize, vw: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let width = 380f32.min(vw - 32.);
        // achBatsDrop 1.2 s from 220 px up (visible by 60%), then achSway; away: 260 px up.
        let drop = bezier(0.25, 0.8, 0.35, 1., phase(t, 0., 1.2));
        let shown = phase(t, 0., 0.72);
        let sway = if t > 1.2 { 3. * (((t - 1.2) / 3.2 * std::f32::consts::TAU).cos() * -0.5 + 0.5) } else { 0. };
        let away = bezier(0.42, 0., 1., 1., out);
        let dy = -220. * (1. - drop) + sway - 260. * away;
        let opacity = shown * (1. - away);
        let hover = |delay: f32| if t > delay { -5. * (((t - delay) / 0.9 * std::f32::consts::PI).sin().abs()) } else { 0. };
        let red: Hsla = rgb(0x7e1b26).into();
        let thread = |left: bool| {
            div()
                .absolute()
                .top(px(-40.))
                .when(left, |d| d.left(px(width * 0.22)))
                .when(!left, |d| d.right(px(width * 0.22)))
                .w(px(1.))
                .h(px(42.))
                .bg(gpui::linear_gradient(180., gpui::linear_color_stop(red.opacity(0.), 0.), gpui::linear_color_stop(red, 1.)))
        };
        let carrier = |left: bool, delay: f32| {
            div()
                .absolute()
                .top(px(-66. + hover(delay)))
                .when(left, |d| d.left(px(width * 0.22 - 42.)))
                .when(!left, |d| d.right(px(width * 0.22 - 42.)))
                .child(bat(84., t))
        };
        let card = div()
            .id("ach-toast")
            .relative()
            .w(px(width))
            .px(px(16.))
            .py(px(14.))
            .rounded(px(6.))
            .border_1()
            .border_color(rgb(0x6b0f1a))
            .bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0x2a070b), 0.), gpui::linear_color_stop(rgb(0x0a0204), 1.)))
            .shadow(vec![
                gpui::BoxShadow { color: gpui::black(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) },
                gpui::BoxShadow { color: gpui::hsla(352. / 360., 1., 0.33, 0.35), offset: gpui::point(px(0.), px(0.)), blur_radius: px(30.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.6), offset: gpui::point(px(0.), px(18.)), blur_radius: px(40.), spread_radius: px(0.) },
            ])
            .text_color(rgb(0xf3e6e6))
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| Self::toast_open(this, cx)))
            .child(thread(true))
            .child(thread(false))
            .child(div().mb(px(8.)).text_size(px(10.)).line_height(px(15.)).text_color(rgb(0xc2414f)).flex().justify_center().child("A DARK GIFT IS DELIVERED"))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(medal(def, true, 44., window.scale_factor()))
                    .child(
                        div()
                            .min_w_0()
                            .child(div().font_family(DISPLAY_FONT).text_size(px(22.)).line_height(px(23.1)).text_color(rgb(0xff4057)).child(def.label.clone()))
                            .child(div().mt(px(2.)).text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xc9b3b5)).child(def.description.clone()))
                            .child(div().mt(px(4.)).text_size(px(10.)).line_height(px(15.)).text_color(rgb(0x8d5b61)).child(tier_label(&def.tier).to_uppercase())),
                    ),
            )
            .when(more > 0, |d| {
                d.child(
                    div()
                        .absolute()
                        .right(px(10.))
                        .bottom(px(8.))
                        .px(px(7.))
                        .py(px(1.))
                        .rounded_full()
                        .bg(gpui::hsla(0., 0., 0., 0.35))
                        .text_size(px(10.))
                        .font_weight(FontWeight::BOLD)
                        .text_color(gpui::white())
                        .child(format!("+{more} more")),
                )
            })
            .child(self.toast_close(rgb(0xf3e6e6).into(), cx));
        // The swarm: five bats across the screen in 2.6 s.
        let vh = f32::from(window.viewport_size().height);
        let mut swarm = div().absolute().inset_0().overflow_hidden();
        for (top, size, delay) in [(0.08, 56., 0.), (0.16, 34., 0.15), (0.04, 28., 0.35), (0.22, 56., 0.5), (0.12, 24., 0.7)] {
            let p = bezier(0.42, 0., 1., 1., phase(t, delay, 2.6));
            if p <= 0. || p >= 1. {
                continue;
            }
            let keys = [(0., 0., 0.), (0.3, 0.35, 0.06), (0.6, 0.65, -0.02), (1., 1.15, 0.08)];
            let (mut x, mut y) = (0., 0.);
            for w in keys.windows(2) {
                if p >= w[0].0 && p <= w[1].0 {
                    let k = (p - w[0].0) / (w[1].0 - w[0].0);
                    x = w[0].1 + (w[1].1 - w[0].1) * k;
                    y = w[0].2 + (w[1].2 - w[0].2) * k;
                }
            }
            swarm = swarm.child(div().absolute().left(px(-60. + x * vw)).top(px(top * vh + y * vh)).opacity(0.9).child(bat(size, t)));
        }
        div()
            .absolute()
            .inset_0()
            .child(swarm)
            .child(
                div()
                    .absolute()
                    .top(px(74. + dy))
                    .left_0()
                    .right_0()
                    .flex()
                    .justify_center()
                    .opacity(opacity)
                    .child(div().relative().child(carrier(true, 1.2)).child(carrier(false, 1.4)).child(card)),
            )
            .into_any_element()
    }


    /// The other themes' deliveries (achievement-toast.tsx, achievements.css). gpui draws no
    /// rotations, scales, clip-path animations or text shadows: those motions become slides and
    /// fades.
    #[allow(clippy::too_many_arguments)]
    fn toast_themed(&self, variant: Variant, def: &Def, t: f32, out: f32, more: usize, vw: f32, vh: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let scale = window.scale_factor();
        let icon_name = super::achievements::icon_file(&def.icon);
        let tier = tier_label(&def.tier);
        let chip = |bg: Hsla, fg: Hsla, round: bool| {
            div()
                .px(px(7.))
                .py(px(1.))
                .when(round, |d| d.rounded_full())
                .bg(bg)
                .text_size(px(10.))
                .line_height(px(14.))
                .font_weight(FontWeight::BOLD)
                .text_color(fg)
                .child(format!("+{more} more"))
        };
        let open = cx.listener(|this, _, _, cx| Self::toast_open(this, cx));
        let at_top = |top: f32, width: f32, card: AnyElement| div().absolute().top(px(top)).left_0().right_0().flex().justify_center().child(div().relative().w(px(width.min(vw - 32.))).child(card)).into_any_element();
        match variant {
            Variant::Mc => {
                // Slides in from the right in nine steps; out the same way.
                let inn = (phase(t, 0., 0.45) * 9.).floor() / 9.;
                let gone = (out * 9.).floor() / 9.;
                let dx = 340. * (1. - inn) + 340. * gone;
                let (title, color) = match def.tier.as_str() {
                    "platinum" => ("Challenge Complete!", rgb(0xff55ff)),
                    "gold" => ("Goal Reached!", rgb(0xffff55)),
                    _ => ("Advancement Made!", rgb(0xffff55)),
                };
                let glyph = match def.tier.as_str() {
                    "gold" => rgb(0xffff55),
                    "platinum" => rgb(0xff55ff),
                    _ => rgb(0xffffff),
                };
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .h(px(64.))
                    .pl(px(10.))
                    .pr(px(12.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .bg(rgb(0x212121))
                    .border_2()
                    .border_color(gpui::black())
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(0.), spread_radius: px(0.) }])
                    .font_family(crate::theme::MONO_FONT)
                    .cursor_pointer()
                    .on_click(open)
                    .child(div().flex_none().size(px(40.)).bg(rgb(0x8b8b8b)).border_2().border_color(rgb(0x373737)).flex().items_center().justify_center().child(ui::icon(&icon_name, 22., glyph)))
                    .child(
                        div()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(4.))
                            .child(div().text_size(px(15.)).line_height(px(18.)).text_color(color).child(title))
                            .child(div().truncate().text_size(px(14.)).line_height(px(17.)).text_color(gpui::white()).child(def.label.clone())),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(4.)).bottom(px(4.)).child(chip(gpui::black().into(), rgb(0xaaaaaa).into(), false))));
                div().absolute().top(px(12.)).right(px(12.)).w(px(320f32.min(vw - 24.))).child(div().relative().left(px(dx)).child(card)).into_any_element()
            }
            Variant::Owl => {
                // The owl swoops in (1.15 s); the letter unfolds from 0.9 s.
                let swoop = bezier(0.3, 0.7, 0.3, 1., phase(t, 0., 1.15));
                let (ox, oy) = if swoop < 0.7 { let k = swoop / 0.7; (240. + (-10. - 240.) * k, -200. + (10. + 200.) * k) } else { let k = (swoop - 0.7) / 0.3; (-10. * (1. - k), 10. * (1. - k)) };
                let leave_owl = bezier(0.42, 0., 1., 1., out);
                let (ox, oy) = (ox + 260. * leave_owl, oy - 220. * leave_owl);
                let unfold = bezier(0.3, 1.2, 0.4, 1., phase(t, 0.9, 0.6));
                let card_opacity = phase(t, 0.9, 0.18) * (1. - out);
                let card_dy = -20. * (1. - unfold) - 10. * out;
                // Five flaps of 0.22 s each way while it flies.
                let flap = if t < 1.1 { let c = (t / 0.22) % 2.; if c < 1. { c } else { 2. - c } } else { 0. };
                let flap = (flap * 4.).round() / 4.;
                thread_local! { static OWLS: std::cell::RefCell<std::collections::HashMap<u32, Arc<gpui::Image>>> = Default::default(); }
                let owl = OWLS.with(|c| c.borrow_mut().entry((flap * 4.) as u32).or_insert_with(|| owl_svg(flap)).clone());
                let ink = rgb(0x3b2a1a);
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .top(px(card_dy))
                    .opacity(card_opacity)
                    .pt(px(12.))
                    .px(px(18.))
                    .pb(px(14.))
                    .rounded(px(2.))
                    .border_1()
                    .border_color(rgb(0xa8885a))
                    .bg(gpui::linear_gradient(170., gpui::linear_color_stop(rgb(0xefe2c4), 0.), gpui::linear_color_stop(rgb(0xdcc79f), 1.)))
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.5), offset: gpui::point(px(0.), px(16.)), blur_radius: px(34.), spread_radius: px(0.) }])
                    .text_color(ink)
                    .cursor_pointer()
                    .on_click(open)
                    // The inset frame 4 px in.
                    .child(div().absolute().inset(px(4.)).border_1().border_color(rgb(0xb8975f)))
                    .child(div().pb(px(6.)).mb(px(9.)).border_b_1().border_color(rgb(0xb8975f)).flex().justify_center().font_family(DISPLAY_FONT).italic().text_size(px(13.)).line_height(px(19.5)).text_color(rgb(0x7a2e22)).child("By owl post"))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(14.))
                            .child(
                                div()
                                    .flex_none()
                                    .size(px(46.))
                                    .rounded_full()
                                    .bg(gpui::linear_gradient(160., gpui::linear_color_stop(rgb(0xb4342a), 0.), gpui::linear_color_stop(rgb(0x7a1712), 0.7)))
                                    .shadow(vec![gpui::BoxShadow { color: rgb(0x4f0d09).into(), offset: gpui::point(px(0.), px(2.)), blur_radius: px(0.), spread_radius: px(0.) }])
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(ui::icon(&icon_name, 18., rgb(0xf2c9a1))),
                            )
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().font_family(DISPLAY_FONT).text_size(px(21.)).line_height(px(23.1)).font_weight(FontWeight::BOLD).text_color(rgb(0x2d1f12)).child(def.label.clone()))
                                    .child(div().italic().text_size(px(13.5)).line_height(px(20.)).text_color(rgb(0x5b4630)).child(def.description.clone()))
                                    .child(div().mt(px(4.)).text_size(px(10.5)).line_height(px(15.)).text_color(rgb(0x8a6d3b)).child(format!("— {} distinction —", tier).to_uppercase())),
                            ),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(10.)).bottom(px(8.)).child(chip(rgb(0x7a2e22).into(), gpui::white(), true))))
                    // The owl sits on the top-right corner, so the close button is on the left.
                    .child(self.toast_close(rgb(0x5b4630).into(), cx).left(px(8.)).top(px(8.)));
                let width = 390f32.min(vw - 32.);
                div()
                    .absolute()
                    .top(px(60.))
                    .left_0()
                    .right_0()
                    .flex()
                    .justify_center()
                    .child(div().relative().w(px(width)).child(card).child(div().absolute().top(px(-50. + oy)).right(px(-14. - ox)).child(gpui::img(owl).w(px(78.)).h(px(70.2)))))
                    .into_any_element()
            }
            Variant::Msn => {
                // Up from the bottom-right corner in 0.5 s; down again when it leaves.
                let up = 1. - (1. - phase(t, 0., 0.5)).powi(2);
                let dy = 160. * (1. - up) + 170. * out * out;
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .top(px(dy))
                    .w(px(280.))
                    .overflow_hidden()
                    .rounded_t(px(6.))
                    .rounded_b(px(3.))
                    .border_1()
                    .border_color(rgb(0x3c6ea8))
                    .bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0xffffff), 0.), gpui::linear_color_stop(rgb(0xe7f0fb), 1.)))
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(214. / 360., 0.8, 0.2, 0.35), offset: gpui::point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) }])
                    .font_family("Tahoma")
                    .text_color(rgb(0x1a2f4b))
                    .cursor_pointer()
                    .on_click(open)
                    .child(
                        div()
                            .relative()
                            .h(px(22.))
                            .pl(px(24.))
                            .pr(px(6.))
                            .flex()
                            .items_center()
                            .bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0x5d9ad8), 0.), gpui::linear_color_stop(rgb(0x2c64a8), 1.)))
                            .text_size(px(11.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(gpui::white())
                            .child(div().absolute().left(px(6.)).top(px(5.)).size(px(12.)).rounded_full().bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(0xb8f08a), 0.), gpui::linear_color_stop(rgb(0x3aa31a), 1.))))
                            .child("Hoffle")
                            .child(self.toast_close(gpui::white(), cx).top_0().right(px(2.)).opacity(0.9)),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(10.))
                            .pt(px(12.))
                            .px(px(10.))
                            .pb(px(6.))
                            .child(medal(def, true, 40., scale))
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().text_size(px(11.)).line_height(px(15.)).text_color(rgb(0x5a6f88)).child("You earned an achievement!"))
                                    .child(div().text_size(px(13.)).line_height(px(17.)).font_weight(FontWeight::BOLD).text_color(rgb(0x0b4a96)).child(def.label.clone()))
                                    .child(div().text_size(px(11.)).line_height(px(15.)).text_color(rgb(0x33475f)).child(def.description.clone())),
                            ),
                    )
                    .child(div().pt(px(4.)).px(px(10.)).pb(px(8.)).text_size(px(10.5)).line_height(px(14.)).text_color(rgb(0x0b5fc4)).underline().child(format!("{}Click here to see all achievements", if more > 0 { format!("+{more} more · ") } else { String::new() })));
                div().absolute().bottom(px(16.)).right(px(16.)).child(card).into_any_element()
            }
            Variant::Zombie => {
                // The hand rises (0.9 s, overshooting), the sign after it; both sink when leaving.
                let hand = bezier(0.3, 1.4, 0.5, 1., phase(t, 0., 0.9));
                let rise = bezier(0.3, 1.3, 0.5, 1., phase(t, 0.4, 0.9));
                let sink = 200. * bezier(0.42, 0., 1., 1., out);
                let width = 380f32.min(vw - 32.);
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .top(px(120. * (1. - rise) + sink))
                    .opacity(phase(t, 0.4, 0.3) * (1. - out))
                    .overflow_hidden()
                    .border_1()
                    .border_color(rgb(0x355d23))
                    .bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0x0d120b), 0.4), gpui::linear_color_stop(rgb(0x1a2e13), 1.)))
                    .shadow(vec![
                        gpui::BoxShadow { color: gpui::hsla(103. / 360., 1., 0.62, 0.25), offset: gpui::point(px(0.), px(0.)), blur_radius: px(26.), spread_radius: px(0.) },
                        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.6), offset: gpui::point(px(0.), px(18.)), blur_radius: px(40.), spread_radius: px(0.) },
                    ])
                    .text_color(rgb(0xd6f5c9))
                    .cursor_pointer()
                    .on_click(open)
                    .child(gpui::img(tape_svg(width)).w(px(width)).h(px(10.)).opacity(0.9))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .px(px(14.))
                            .py(px(10.))
                            .child(medal(def, true, 44., scale))
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().font_family(crate::theme::MONO_FONT).text_size(px(11.)).line_height(px(16.)).text_color(rgb(0x9ae66e)).child("SURVIVED"))
                                    .child(div().font_family(DISPLAY_FONT).text_size(px(24.)).line_height(px(25.2)).text_color(rgb(0x7dff4a)).child(def.label.clone()))
                                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xa7c79a)).child(def.description.clone())),
                            ),
                    )
                    .child(gpui::img(tape_svg(width)).w(px(width)).h(px(10.)).opacity(0.9))
                    .when(more > 0, |d| d.child(div().absolute().right(px(10.)).bottom(px(14.)).child(chip(gpui::hsla(0., 0., 0., 0.35), gpui::white(), true))))
                    .child(self.toast_close(rgb(0xd6f5c9).into(), cx));
                div()
                    .absolute()
                    .top(px(66.))
                    .left_0()
                    .right_0()
                    .flex()
                    .justify_center()
                    .child(div().relative().w(px(width)).child(card).child(div().absolute().left(px(18.)).bottom(px(-44. - 160. * (1. - hand) - sink)).child(gpui::img(hand_svg()).w(px(46.)).h(px(69.)))))
                    .into_any_element()
            }
            Variant::Cyber => {
                // Glitches in (five steps, jumping sideways) and out (four steps).
                let step = (phase(t, 0., 0.5) * 5.).floor();
                let dx = [-12., 8., 8., -4., -4., 0.][step as usize] + 20. * (out * 4.).floor() / 4.;
                let shown = if t < 0.5 { [0.15, 0.4, 0.4, 0.6, 0.8, 1.][step as usize] } else { 1. };
                let yellow = rgb(0xfcee0a);
                let plate = |color: gpui::Rgba| {
                    gpui::canvas(
                        |_, _, _| {},
                        move |b, _, window, _| {
                            let (o, w, h) = (b.origin, b.size.width, b.size.height);
                            let c = px(18.);
                            let mut p = gpui::PathBuilder::fill();
                            p.move_to(o);
                            p.line_to(gpui::point(o.x + w - c, o.y));
                            p.line_to(gpui::point(o.x + w, o.y + c));
                            p.line_to(gpui::point(o.x + w, o.y + h));
                            p.line_to(gpui::point(o.x + c, o.y + h));
                            p.line_to(gpui::point(o.x, o.y + h - c));
                            p.close();
                            if let Ok(path) = p.build() {
                                window.paint_path(path, color);
                            }
                        },
                    )
                    .absolute()
                    .size_full()
                };
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .left(px(dx))
                    .opacity(shown * (1. - out))
                    .pt(px(10.))
                    .px(px(16.))
                    .pb(px(12.))
                    .text_color(rgb(0x050505))
                    .cursor_pointer()
                    .on_click(open)
                    // (Its cyan drop-shadow is clipped away by the clip-path on the web too.)
                    .child(div().absolute().top_0().left_0().size_full().child(plate(yellow)))
                    .child(
                        div()
                            .relative()
                            .flex()
                            .font_family(crate::theme::MONO_FONT)
                            .text_size(px(10.5))
                            .line_height(px(15.))
                            .font_weight(FontWeight::BOLD)
                            .child("// ACHIEVEMENT_UNLOCKED ")
                            .child(div().text_color(rgb(0xd6001c)).child(format!("[{}]", tier.to_uppercase()))),
                    )
                    .child(
                        div()
                            .relative()
                            .mt(px(6.))
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(div().flex_none().size(px(42.)).bg(rgb(0x050505)).flex().items_center().justify_center().child(ui::icon(&icon_name, 22., rgb(0x00f0ff))))
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().text_size(px(22.)).line_height(px(22.)).font_weight(FontWeight::EXTRA_BOLD).child(def.label.to_uppercase()))
                                    .child(div().mt(px(3.)).text_size(px(12.5)).line_height(px(18.)).font_weight(FontWeight::SEMIBOLD).child(def.description.clone())),
                            ),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(22.)).bottom(px(8.)).child(chip(rgb(0x050505).into(), yellow.into(), false))))
                    .child(self.toast_close(rgb(0x050505).into(), cx).right(px(16.)));
                at_top(18., 420., card.into_any_element())
            }
            Variant::Matrix => {
                let caret = ((t / 0.45) as u32).is_multiple_of(2);
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .opacity(phase(t, 0., 0.3) * (1. - out))
                    .top(px(-10. * out))
                    .py(px(10.))
                    .px(px(14.))
                    .bg(gpui::hsla(120. / 360., 1., 0.016, 0.94))
                    .border_1()
                    .border_color(rgb(0x1d7a33))
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(136. / 360., 1., 0.5, 0.25), offset: gpui::point(px(0.), px(0.)), blur_radius: px(22.), spread_radius: px(0.) }])
                    .font_family(crate::theme::MONO_FONT)
                    .text_color(rgb(0x6dff8a))
                    .cursor_pointer()
                    .on_click(open)
                    .child(div().text_size(px(11.)).line_height(px(16.)).text_color(rgb(0x2fbf52)).child(format!("> achievement.unlock(\"{}\")", def.id)))
                    .child(
                        div()
                            .mt(px(6.))
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(div().flex_none().size(px(38.)).border_1().border_color(rgb(0x1d7a33)).flex().items_center().justify_center().child(ui::icon(&icon_name, 20., rgb(0xb6ffc5))))
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().text_size(px(18.)).line_height(px(24.)).text_color(rgb(0xd4ffdd)).child(decode(&def.label, t)))
                                    .child(div().text_size(px(11.5)).line_height(px(16.)).text_color(rgb(0x43d466)).child(def.description.clone())),
                            ),
                    )
                    .child(
                        div()
                            .mt(px(6.))
                            .flex()
                            .items_center()
                            .text_size(px(11.))
                            .line_height(px(16.))
                            .text_color(rgb(0x2fbf52))
                            .child(format!("[ OK ] {} · wake up, achiever…", tier.to_lowercase()))
                            .child(div().ml(px(3.)).w(px(7.)).h(px(12.)).when(caret, |d| d.bg(rgb(0x6dff8a)))),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(10.)).bottom(px(8.)).child(chip(rgb(0x0b2e14).into(), rgb(0x6dff8a).into(), false))))
                    .child(self.toast_close(rgb(0x6dff8a).into(), cx));
                at_top(18., 420., card.into_any_element())
            }
            Variant::Galaxy => {
                let ignite = bezier(0.2, 0.7, 0.3, 1., phase(t, 0.15, 0.4));
                let width = 400f32.min(vw - 32.);
                let away = bezier(0.42, 0., 1., 1., out);
                // A few stars and the blue glow at the bottom.
                let mut stars = div().absolute().inset_0();
                for (x, y, size, color) in [(0.10, 0.20, 1., 0xffffff), (0.24, 0.78, 1., 0xcfe0ff), (0.40, 0.12, 1.5, 0xffffff), (0.63, 0.64, 1., 0xffffff), (0.78, 0.26, 1., 0xffe9c4), (0.91, 0.82, 1.5, 0xffffff), (0.52, 0.44, 1., 0xb4cdff)] {
                    stars = stars.child(div().absolute().left(gpui::relative(x)).top(gpui::relative(y)).size(px(size)).rounded_full().bg(rgb(color)));
                }
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .top(px(-40. * away))
                    .opacity(phase(t, 0., 0.35) * (1. - away))
                    .overflow_hidden()
                    .pt(px(14.))
                    .px(px(18.))
                    .pb(px(16.))
                    .rounded(px(6.))
                    .border_1()
                    .border_color(gpui::hsla(54. / 360., 1., 0.56, 0.35))
                    .bg(gpui::linear_gradient(180., gpui::linear_color_stop(rgb(0x020309), 0.55), gpui::linear_color_stop(rgb(0x0d1233), 1.)))
                    .shadow(vec![
                        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.7), offset: gpui::point(px(0.), px(18.)), blur_radius: px(50.), spread_radius: px(0.) },
                        gpui::BoxShadow { color: gpui::hsla(206. / 360., 1., 0.61, 0.18), offset: gpui::point(px(0.), px(0.)), blur_radius: px(30.), spread_radius: px(0.) },
                    ])
                    .text_color(rgb(0xffe81f))
                    .flex()
                    .flex_col()
                    .items_center()
                    .cursor_pointer()
                    .on_click(open)
                    .child(stars)
                    .child(
                        div()
                            .absolute()
                            .top_0()
                            .left(px(12.))
                            .w(px((width - 24.) * ignite))
                            .h(px(2.))
                            .rounded(px(2.))
                            .bg(rgb(0xeaf6ff))
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(206. / 360., 1., 0.61, 0.8), offset: gpui::point(px(0.), px(0.)), blur_radius: px(14.), spread_radius: px(0.) }]),
                    )
                    .child(div().opacity(phase(t, 0.2, 0.6)).text_size(px(11.5)).line_height(px(17.)).text_color(rgb(0x4bd5ee)).child("A long time ago, in a channel far, far away...."))
                    .child(
                        div()
                            .mt(px(8.))
                            .flex()
                            .flex_col()
                            .items_center()
                            .child(div().opacity(phase(t, 1.1, 0.5)).text_size(px(10.5)).line_height(px(15.)).font_weight(FontWeight::BOLD).child(format!("EPISODE {}", match def.tier.as_str() { "silver" => "II", "gold" => "III", "platinum" => "IV", _ => "I" })))
                            // The title arrives and settles back into the stars.
                            .child(div().opacity(phase(t, 0.5, 0.22)).top(px(-8. * (1. - bezier(0.2, 0.6, 0.3, 1., phase(t, 0.5, 1.1))))).relative().text_size(px(22.)).line_height(px(24.2)).font_weight(FontWeight::BOLD).child(def.label.to_uppercase()))
                            .child(div().mt(px(4.)).opacity(phase(t, 1.3, 0.6)).text_size(px(12.5)).line_height(px(18.)).text_color(rgb(0xf4e27a)).child(def.description.clone())),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(10.)).bottom(px(8.)).child(chip(gpui::hsla(54. / 360., 1., 0.56, 0.15), rgb(0xffe81f).into(), true))))
                    .child(self.toast_close(rgb(0xffe81f).into(), cx));
                at_top(22., 400., card.into_any_element())
            }
            Variant::Campfire => {
                let rise = bezier(0.2, 1.2, 0.4, 1., phase(t, 0., 0.5));
                let flicker = 0.5 + 0.5 * ((t / 1.6) * std::f32::consts::TAU).sin();
                let mut embers = div().absolute().inset_0();
                for i in 0..10 {
                    let start = i as f32 * 0.27;
                    if t < start {
                        continue;
                    }
                    let p = ((t - start) / 2.6).fract();
                    let k = 1. - (1. - p).powi(2);
                    let opacity = if p < 0.15 { p / 0.15 } else { 1. - (p - 0.15) / 0.85 };
                    let size = 4. * (1. - 0.7 * k);
                    embers = embers.child(
                        div()
                            .absolute()
                            .left(gpui::relative(0.08 + i as f32 * 0.09))
                            .bottom(px(6. + 110. * k))
                            .ml(px((i as f32 - 5.) * 4. * k))
                            .size(px(size))
                            .rounded_full()
                            .bg(rgb(0xffb347))
                            .opacity(opacity)
                            .shadow(vec![gpui::BoxShadow { color: rgb(0xff8a00).into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(6.), spread_radius: px(0.) }]),
                    );
                }
                let card = div()
                    .id("ach-toast")
                    .relative()
                    .top(px(20. * (1. - rise) - 10. * out))
                    .opacity(phase(t, 0., 0.3) * (1. - out))
                    .overflow_hidden()
                    .px(px(16.))
                    .py(px(14.))
                    .rounded(px(16.))
                    .border_1()
                    .border_color(gpui::hsla(32. / 360., 1., 0.64, 0.35))
                    .bg(gpui::linear_gradient(160., gpui::linear_color_stop(rgb(0x2a1d14), 0.), gpui::linear_color_stop(rgb(0x17100b), 1.)))
                    .shadow(vec![
                        gpui::BoxShadow { color: gpui::hsla(28. / 360., 1., 0.54, 0.28), offset: gpui::point(px(0.), px(0.)), blur_radius: px(40.), spread_radius: px(0.) },
                        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(18.)), blur_radius: px(40.), spread_radius: px(0.) },
                    ])
                    .text_color(rgb(0xfdf0dc))
                    .cursor_pointer()
                    .on_click(open)
                    // The fire under it, bottom left (a radial glow on the web).
                    .child(div().absolute().inset_0().bg(gpui::linear_gradient(35., gpui::linear_color_stop(gpui::hsla(28. / 360., 1., 0.56, 0.4), 0.), gpui::linear_color_stop(gpui::hsla(28. / 360., 1., 0.56, 0.), 0.55))))
                    .child(
                        div()
                            .relative()
                            .flex()
                            .items_center()
                            .gap(px(14.))
                            .child(
                                div()
                                    .rounded_full()
                                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(32. / 360., 1., 0.58, 0.6 + 0.3 * flicker), offset: gpui::point(px(0.), px(0.)), blur_radius: px(8. + 8. * flicker), spread_radius: px(0.) }])
                                    .child(medal(def, true, 46., scale)),
                            )
                            .child(
                                div()
                                    .min_w_0()
                                    .child(div().text_size(px(10.5)).line_height(px(15.)).text_color(rgb(0xffb35c)).child("TOLD AROUND THE FIRE"))
                                    .child(div().font_family(DISPLAY_FONT).text_size(px(19.)).line_height(px(25.)).font_weight(FontWeight::BOLD).text_color(rgb(0xfff2dc)).child(def.label.clone()))
                                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xd8bfa0)).child(def.description.clone())),
                            ),
                    )
                    .when(more > 0, |d| d.child(div().absolute().right(px(10.)).bottom(px(8.)).child(chip(gpui::hsla(0., 0., 0., 0.35), gpui::white(), true))))
                    .child(self.toast_close(rgb(0xfdf0dc).into(), cx));
                let width = 420f32.min(vw - 32.);
                div().absolute().top(px(60.)).left_0().right_0().flex().justify_center().child(div().relative().w(px(width)).child(card).child(embers)).into_any_element()
            }
            Variant::Retro => {
                // Windows 98: appears in four steps, goes the same way.
                let shown = (phase(t, 0., 0.25) * 4.).ceil() / 4. * (1. - (out * 4.).floor() / 4.);
                let bevel = |d: gpui::Div| d.bg(rgb(0xc0c0c0)).border_1().border_color(gpui::black());
                let card = bevel(div())
                    .relative()
                    .opacity(shown)
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(3.), px(3.)), blur_radius: px(0.), spread_radius: px(0.) }])
                    .font_family("Tahoma")
                    .text_size(px(11.))
                    .line_height(px(14.))
                    .text_color(gpui::black())
                    .child(
                        div()
                            .relative()
                            .m(px(2.))
                            .h(px(20.))
                            .px(px(4.))
                            .flex()
                            .items_center()
                            .bg(gpui::linear_gradient(90., gpui::linear_color_stop(rgb(0x000080), 0.), gpui::linear_color_stop(rgb(0x1084d0), 1.)))
                            .text_color(gpui::white())
                            .font_weight(FontWeight::BOLD)
                            .child("Achievement Unlocked")
                            .child(
                                div()
                                    .id("ach-toast-close")
                                    .absolute()
                                    .top(px(2.))
                                    .right(px(2.))
                                    .w(px(16.))
                                    .h(px(14.))
                                    .bg(rgb(0xc0c0c0))
                                    .border_1()
                                    .border_color(rgb(0x808080))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .cursor_pointer()
                                    .child(ui::icon("x", 11., gpui::black()))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        cx.stop_propagation();
                                        this.toast_leave(cx);
                                    })),
                            ),
                    )
                    .child(
                        div()
                            .id("ach-toast")
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .pt(px(12.))
                            .px(px(12.))
                            .pb(px(6.))
                            .cursor_pointer()
                            .on_click(open)
                            .child(div().flex_none().size(px(34.)).flex().items_center().justify_center().child(ui::icon(&icon_name, 26., rgb(0x000080))))
                            .child(div().min_w_0().child(div().font_weight(FontWeight::BOLD).text_size(px(12.)).line_height(px(16.)).child(def.label.clone())).child(div().child(def.description.clone()))),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_end()
                            .gap(px(8.))
                            .pt(px(4.))
                            .px(px(12.))
                            .pb(px(10.))
                            .when(more > 0, |d| d.child(div().mr_auto().text_color(rgb(0x404040)).child(format!("+{more} more"))))
                            .child(
                                bevel(div())
                                    .id("ach-retro-ok")
                                    .min_w(px(72.))
                                    .py(px(3.))
                                    .flex()
                                    .justify_center()
                                    .cursor_pointer()
                                    .child("OK")
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        cx.stop_propagation();
                                        this.toast_leave(cx);
                                    })),
                            ),
                    );
                div().absolute().bottom(px(18.)).right(px(18.)).w(px(300.)).child(card).into_any_element()
            }
            Variant::Pop | Variant::Bats => {
                let _ = (vh, out);
                div().into_any_element()
            }
        }
    }

    /// Development: HOFFLE_DEV_UNLOCK=<id>[,<id>…] shows those as just unlocked.
    pub(super) fn dev_achievement(&mut self, cx: &mut Context<Self>) {
        static DONE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if let Ok(ids) = std::env::var("HOFFLE_DEV_UNLOCK")
            && !DONE.swap(true, std::sync::atomic::Ordering::Relaxed)
        {
            self.announce_unlocked(ids.split(',').map(String::from).collect(), cx);
        }
    }
}

#[allow(dead_code)]
fn _keep(_: SharedString) {}
