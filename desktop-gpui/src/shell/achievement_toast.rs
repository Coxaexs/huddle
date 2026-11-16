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
}

impl Variant {
    fn current() -> Self {
        if crate::theme::active_theme() == "vampire" { Variant::Bats } else { Variant::Pop }
    }
    /// How long each stays up before leaving on its own, and how long leaving takes.
    fn stay(self) -> f32 {
        match self {
            Variant::Pop => 6.2,
            Variant::Bats => 7.6,
        }
    }
    fn leave(self) -> f32 {
        match self {
            Variant::Pop => 0.45,
            Variant::Bats => 0.55,
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
        // A minor organ swell.
        Variant::Bats => ("saw", 0.035, vec![(220., 0., 1.1), (261.6, 0., 1.1), (329.6, 0., 1.1), (440., 0.35, 0.9)]),
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
        Some(match variant {
            Variant::Pop => self.toast_pop(&def, t, out, more, vw, window, cx),
            Variant::Bats => self.toast_bats(&def, t, out, more, vw, window, cx),
        })
    }

    fn toast_close(&self, color: Hsla, cx: &mut Context<Self>) -> impl IntoElement {
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
