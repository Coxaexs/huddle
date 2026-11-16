//! The achievement board (app/components/achievements-panel.tsx, achievement-medal.tsx,
//! achievements.css): your progress ring and points, the five pins on your profile, the categories,
//! and every achievement as a card with its medal, progress and rarity.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use gpui::{AnyElement, Context, FontWeight, Hsla, RenderImage, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde::Deserialize;
use serde_json::{Value, json};

use super::Shell;
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui;

#[derive(Clone, Deserialize)]
pub(super) struct Def {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub tier: String,
    pub category: String,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub hint: Option<String>,
    pub condition: Condition,
}

#[derive(Clone, Deserialize)]
pub(super) struct Condition {
    #[serde(rename = "type")]
    pub stat: String,
}

#[derive(Deserialize)]
struct Category {
    id: String,
    label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalogue {
    achievements: Vec<Def>,
    categories: Vec<Category>,
    tier_labels: HashMap<String, String>,
    tier_points: HashMap<String, u32>,
    showcase_limit: usize,
}

/// From `tools/export-achievements.mjs`.
static CATALOGUE: LazyLock<Catalogue> = LazyLock::new(|| {
    crate::assets::ASSETS
        .iter()
        .find(|(p, _)| *p == "data/achievements.json")
        .and_then(|(_, b)| serde_json::from_slice(b).ok())
        .expect("data/achievements.json")
});

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Row {
    pub earned: bool,
    pub earned_at: Option<String>,
    pub current: f64,
    pub threshold: f64,
    pub progress: f64,
}

pub(super) struct Board {
    rows: HashMap<String, Row>,
    rarity: HashMap<String, f64>,
    showcase: Vec<String>,
    loading: bool,
    error: Option<String>,
    category: String,
    filter: &'static str,
    saving: bool,
}

/// The tier's metal (achievements.css): three for the rim, the face and the glyph.
fn metal(tier: &str) -> ([u32; 3], u32, u32) {
    match tier {
        "silver" => ([0xf4f7fb, 0x9aa5b3, 0x66707d], 0x2b3240, 0xeef3fa),
        "gold" => ([0xffe58a, 0xd39a19, 0x8d5e05], 0x4a3204, 0xffe9a3),
        "platinum" => ([0xa5f3fc, 0xc4b5fd, 0xf9a8d4], 0x1d1636, 0xf3edff),
        _ => ([0xe7b98a, 0x9a5b2c, 0x6d3b17], 0x3a2414, 0xffe2c4),
    }
}

fn rgb3(c: u32) -> [f32; 3] {
    [((c >> 16) & 0xff) as f32, ((c >> 8) & 0xff) as f32, (c & 0xff) as f32]
}

fn lerp(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/// A conic gradient's colour at `turn` (0..1 from the top, clockwise) over evenly spaced stops.
fn conic(stops: &[[f32; 3]], turn: f32) -> [f32; 3] {
    let t = turn.rem_euclid(1.) * (stops.len() - 1) as f32;
    let i = (t.floor() as usize).min(stops.len() - 2);
    lerp(stops[i], stops[i + 1], t - i as f32)
}

/// The angle of (x, y) from the centre as a CSS conic turn: 0 at the top, clockwise.
fn turn_of(x: f32, y: f32) -> f32 {
    (x.atan2(-y) / std::f32::consts::TAU).rem_euclid(1.)
}

/// `.ach-medal`: the conic metal rim (from 210deg; platinum's rainbow from 0), the face's radial
/// shine at 35% 30% with its inner edge, greyed and dimmed when locked. Drawn per pixel since gpui
/// has no conic gradients; cached by tier, state, size and scale.
fn medal_picture(tier: &str, earned: bool, size: f32, scale: f32) -> Arc<RenderImage> {
    thread_local! {
        static CACHE: RefCell<HashMap<(String, bool, u32, u32), Arc<RenderImage>>> = RefCell::new(HashMap::new());
    }
    let key = (tier.to_string(), earned, (size * 10.) as u32, (scale * 10.) as u32);
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let n = (size * scale).round().max(1.) as u32;
    let (rim, face, _) = metal(tier);
    let (stops, from): (Vec<[f32; 3]>, f32) = if tier == "platinum" {
        ([0xa5f3fc, 0xc4b5fd, 0xf9a8d4, 0xfde68a, 0xa7f3d0, 0xa5f3fc].iter().map(|c| rgb3(*c)).collect(), 0.)
    } else {
        ([rim[0], rim[1], rim[0], rim[2], rim[0]].iter().map(|c| rgb3(*c)).collect(), 210. / 360.)
    };
    let face_c = rgb3(face);
    let shine = lerp(face_c, [255., 255., 255.], 0.3);
    let r = n as f32 / 2.;
    let face_r = r * 0.78;
    // `circle at 35% 30%` over the face box, to its farthest corner, the face colour at 70%.
    let (fx, fy) = (-face_r + 0.35 * 2. * face_r, -face_r + 0.30 * 2. * face_r);
    let far = ((face_r + fx.abs()).powi(2) + (face_r + fy.abs()).powi(2)).sqrt();
    let mut bgra = vec![0u8; (n * n * 4) as usize];
    for py in 0..n {
        for px_ in 0..n {
            let (x, y) = (px_ as f32 + 0.5 - r, py as f32 + 0.5 - r);
            let d = (x * x + y * y).sqrt();
            let edge = (r - d + 0.5).clamp(0., 1.);
            if edge <= 0. {
                continue;
            }
            let mut c = if d <= face_r - 0.5 {
                let t = (((x - fx).powi(2) + (y - fy).powi(2)).sqrt() / (far * 0.7)).min(1.);
                let mut c = lerp(shine, face_c, t);
                // Inset: a 1px dark edge, and a soft shade rising from the bottom.
                if d > face_r - 1.5 * scale {
                    c = lerp(c, [0., 0., 0.], 0.35);
                }
                let bottom = ((y - (face_r - 4. * scale)) / (4. * scale)).clamp(0., 1.);
                lerp(c, [0., 0., 0.], 0.3 * bottom)
            } else {
                let mut c = conic(&stops, turn_of(x, y) - from);
                // The rim's 1px highlight along the top.
                if y < 0. && d > r - 1.2 * scale {
                    c = lerp(c, [255., 255., 255.], 0.25);
                }
                c
            };
            let mut alpha = edge;
            if !earned {
                let grey = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
                c = [grey * 0.62; 3];
                alpha *= 0.75;
            }
            let i = ((py * n + px_) * 4) as usize;
            bgra[i] = (c[2] * alpha) as u8;
            bgra[i + 1] = (c[1] * alpha) as u8;
            bgra[i + 2] = (c[0] * alpha) as u8;
            bgra[i + 3] = (alpha * 255.) as u8;
        }
    }
    let image = image::RgbaImage::from_raw(n, n, bgra).expect("medal");
    let picture = Arc::new(RenderImage::new(smallvec::smallvec![image::Frame::new(image)]));
    CACHE.with(|c| c.borrow_mut().insert(key, picture.clone()));
    picture
}

/// `.ach-ring`: lavender up to the share earned, the rest a faint ring.
fn ring_picture(share: f32, scale: f32) -> Arc<RenderImage> {
    let n = (62. * scale).round() as u32;
    let r = n as f32 / 2.;
    let lav = rgb3(0xa78bfa);
    let mut bgra = vec![0u8; (n * n * 4) as usize];
    for py in 0..n {
        for px_ in 0..n {
            let (x, y) = (px_ as f32 + 0.5 - r, py as f32 + 0.5 - r);
            let d = (x * x + y * y).sqrt();
            let alpha = (r - d + 0.5).clamp(0., 1.);
            if alpha <= 0. {
                continue;
            }
            let (c, a) = if turn_of(x, y) < share { (lav, alpha) } else { ([232., 227., 245.], alpha * 0.1) };
            let i = ((py * n + px_) * 4) as usize;
            bgra[i] = (c[2] * a) as u8;
            bgra[i + 1] = (c[1] * a) as u8;
            bgra[i + 2] = (c[0] * a) as u8;
            bgra[i + 3] = (a * 255.) as u8;
        }
    }
    let image = image::RgbaImage::from_raw(n, n, bgra).expect("ring");
    Arc::new(RenderImage::new(smallvec::smallvec![image::Frame::new(image)]))
}

/// lucide-react's names as this app's icon files (Gamepad2 → gamepad-2, a few renamed).
fn icon_file(name: &str) -> String {
    match name {
        "CheckCircle2" => return "circle-check".into(),
        "CircleHelp" => return "circle-question-mark".into(),
        "Wand2" => return "wand-sparkles".into(),
        _ => {}
    }
    let mut out = String::new();
    let mut prev: Option<char> = None;
    for ch in name.chars() {
        if let Some(p) = prev
            && ((ch.is_ascii_uppercase() && (p.is_ascii_lowercase() || p.is_ascii_digit())) || (ch.is_ascii_digit() && p.is_ascii_alphabetic()))
        {
            out.push('-');
        }
        out.push(ch.to_ascii_lowercase());
        prev = Some(ch);
    }
    out
}

/// getAchievement(): a definition by id, and its tier's label (TIER_LABELS).
pub(super) fn find_def(id: &str) -> Option<Def> {
    CATALOGUE.achievements.iter().find(|d| d.id == id).cloned()
}

pub(super) fn tier_label(tier: &str) -> String {
    CATALOGUE.tier_labels.get(tier).cloned().unwrap_or_else(|| tier.to_string())
}

/// AchievementMedal: the metal, the icon in the tier's glyph colour, and a lock badge when locked
/// (a question mark for a locked secret).
pub(super) fn medal(def: &Def, earned: bool, size: f32, scale: f32) -> AnyElement {
    let hidden = !earned && def.secret;
    let (_, _, glyph) = metal(&def.tier);
    let glyph: Hsla = if earned {
        rgb(glyph).into()
    } else {
        let g = rgb3(glyph);
        let grey = (0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2]) * 0.62 / 255.;
        gpui::hsla(0., 0., grey, 0.75)
    };
    let name = if hidden { "circle-question-mark".to_string() } else { icon_file(&def.icon) };
    let lock = (size * 0.4).round();
    div()
        .relative()
        .flex_none()
        .size(px(size))
        .rounded_full()
        .when(earned, |d| d.shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(2.)), blur_radius: px(6.), spread_radius: px(0.) }]))
        .child(gpui::img(gpui::ImageSource::Render(medal_picture(&def.tier, earned, size, scale))).absolute().top_0().left_0().size(px(size)))
        .child(div().absolute().inset_0().flex().items_center().justify_center().child(ui::icon(&name, (size * 0.46).round(), glyph)))
        .when(!earned && !hidden, |d| {
            d.child(
                div()
                    .absolute()
                    .right(px(-2.))
                    .bottom(px(-2.))
                    .size(px(lock))
                    .rounded_full()
                    .bg(Theme::paper())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(ui::icon("lock", (size * 0.24).round().max(9.), Theme::muted())),
            )
        })
        .into_any_element()
}

fn rarity_text(share: Option<f64>) -> String {
    match share {
        Some(s) if s > 0. => {
            let pct = s * 100.;
            if pct < 1. { "Under 1% of members".into() } else { format!("{}% of members", pct.round()) }
        }
        _ => "Nobody has this yet".into(),
    }
}

fn rarity_color(share: Option<f64>) -> Hsla {
    match share {
        Some(s) if s >= 0.15 => Theme::muted().into(),
        Some(s) if s >= 0.05 => rgb(0x60a5fa).into(),
        _ => rgb(0xe879f9).into(),
    }
}

/// formatAchievementValue: voice time in minutes or hours, the rest as numbers.
fn value_text(stat: &str, value: f64) -> String {
    if stat == "voice_seconds" {
        return if value < 3600. { format!("{}m", (value / 60.).floor()) } else { format!("{}h", (value / 3600.).floor()) };
    }
    let n = value.round() as i64;
    let digits = n.abs().to_string();
    let mut grouped = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(c);
    }
    if n < 0 { format!("-{grouped}") } else { grouped }
}

/// toLocaleDateString in the app's language.
fn date_text(iso: &str) -> String {
    let Some(at) = crate::model::parse_time(iso) else { return String::new() };
    let local = at.with_timezone(&chrono::Local);
    match crate::i18n::locale().split('-').next().unwrap_or("en") {
        "tr" | "de" | "ru" | "nl" => local.format("%d.%m.%Y").to_string(),
        "fr" | "es" | "pt" | "it" => local.format("%d/%m/%Y").to_string(),
        _ => local.format("%-m/%-d/%Y").to_string(),
    }
}

/// Unlock sounds, kept on this computer (achievementSoundEnabled).
fn sound_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("achievement-sound"))
}

pub(super) fn sound_on() -> bool {
    sound_path().and_then(|p| std::fs::read_to_string(p).ok()).is_none_or(|s| s.trim() != "off")
}

impl Shell {
    pub(super) fn open_achievements(&mut self, cx: &mut Context<Self>) {
        self.achievements = Some(Board {
            rows: HashMap::new(),
            rarity: HashMap::new(),
            showcase: Vec::new(),
            loading: true,
            error: None,
            category: "all".into(),
            filter: "all",
            saving: false,
        });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_get("/api/achievements") }).await;
            this.update(cx, |this, cx| {
                // Unlocks the board found are announced too.
                let fresh: Vec<String> = result.as_ref().ok().and_then(|v| serde_json::from_value(v.get("newlyEarned").cloned().unwrap_or(Value::Null)).ok()).unwrap_or_default();
                this.announce_unlocked(fresh, cx);
                let Some(b) = this.achievements.as_mut() else { return };
                b.loading = false;
                match result {
                    Ok(v) => {
                        for row in v.get("achievements").and_then(Value::as_array).cloned().unwrap_or_default() {
                            if let (Some(id), Ok(r)) = (row.get("id").and_then(Value::as_str).map(str::to_string), serde_json::from_value::<Row>(row.clone())) {
                                b.rows.insert(id, r);
                            }
                        }
                        b.rarity = serde_json::from_value(v.get("rarity").cloned().unwrap_or(Value::Null)).unwrap_or_default();
                        b.showcase = serde_json::from_value(v.get("showcase").cloned().unwrap_or(Value::Null)).unwrap_or_default();
                    }
                    Err(e) => b.error = Some(if e.to_string().is_empty() { "Could not load achievements.".into() } else { e.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn close_achievements(&mut self, cx: &mut Context<Self>) {
        if self.achievements.take().is_some() {
            cx.notify();
        }
    }

    /// togglePin: up to five earned achievements on your profile (PUT /api/achievements).
    fn toggle_showcase(&mut self, id: String, cx: &mut Context<Self>) {
        let limit = CATALOGUE.showcase_limit;
        let Some(b) = self.achievements.as_mut() else { return };
        if b.saving {
            return;
        }
        let previous = b.showcase.clone();
        let next: Vec<String> = if previous.contains(&id) {
            previous.iter().filter(|x| **x != id).cloned().collect()
        } else if previous.len() < limit {
            previous.iter().cloned().chain(std::iter::once(id)).collect()
        } else {
            self.toast(format!("You can pin up to {limit}. Unpin one first."), cx);
            return;
        };
        b.saving = true;
        b.showcase = next.clone();
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_put("/api/achievements", json!({ "showcase": next })) }).await;
            this.update(cx, |this, cx| {
                let mut failed = None;
                if let Some(b) = this.achievements.as_mut() {
                    b.saving = false;
                    match result {
                        Ok(v) => b.showcase = serde_json::from_value(v.get("showcase").cloned().unwrap_or(Value::Null)).unwrap_or_default(),
                        Err(e) => {
                            b.showcase = previous;
                            failed = Some(if e.to_string().is_empty() { "Could not update your profile.".to_string() } else { e.to_string() });
                        }
                    }
                }
                if let Some(text) = failed {
                    this.toast(text, cx);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_achievements(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let b = self.achievements.as_ref()?;
        let scale = window.scale_factor();
        let cat = &*CATALOGUE;
        let total = cat.achievements.len();
        let earned_count = b.rows.values().filter(|r| r.earned).count();
        let tier_of = |id: &str| cat.achievements.iter().find(|d| d.id == id).map(|d| d.tier.clone()).unwrap_or_else(|| "bronze".into());
        let points: u32 = b.rows.iter().filter(|(_, r)| r.earned).map(|(id, _)| cat.tier_points.get(&tier_of(id)).copied().unwrap_or(0)).sum();
        let max_points: u32 = cat.achievements.iter().map(|d| cat.tier_points.get(&d.tier).copied().unwrap_or(0)).sum();
        let share = if total > 0 { earned_count as f32 / total as f32 } else { 0. };
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let line: Hsla = Theme::line().into();
        let thousands = |n: u32| value_text("", n as f64);

        let icon_button = |id: &'static str, glyph: &'static str, size: f32| {
            div().id(id).flex_none().size(px(32.)).rounded(px(9.)).border_1().border_color(gpui::transparent_black()).flex().items_center().justify_center().cursor_pointer().child(ui::icon(glyph, size, muted))
        };
        let sound = sound_on();
        let head = div()
            .relative()
            .flex_none()
            .pt(px(18.))
            .px(px(20.))
            .pb(px(14.))
            .border_b_1()
            .border_color(line)
            .flex()
            .items_center()
            .gap(px(14.))
            .children(
                crate::cssbg::picture("linear-gradient(135deg, rgba(167, 139, 250, 0.18), transparent 70%)", 878., 95., 0., scale)
                    .map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top_0().left_0().w(px(878.)).h(px(95.))),
            )
            .child(
                div()
                    .relative()
                    .flex_none()
                    .size(px(62.))
                    .child(gpui::img(gpui::ImageSource::Render(ring_picture(share, scale))).absolute().top_0().left_0().size(px(62.)))
                    .child(
                        div()
                            .absolute()
                            .top(px(6.))
                            .left(px(6.))
                            .size(px(50.))
                            .rounded_full()
                            .bg(Theme::paper())
                            .flex()
                            .flex_col()
                            .items_center()
                            .justify_center()
                            .child(div().font_family(DISPLAY_FONT).text_size(px(18.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(ink).child(earned_count.to_string()))
                            .child(div().mt(px(11.)).text_size(px(10.)).line_height(px(10.)).text_color(muted).child(format!("/{total}"))),
                    ),
            )
            .child(
                div()
                    .relative()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(div().font_family(DISPLAY_FONT).text_size(px(20.)).line_height(px(30.)).font_weight(FontWeight::BOLD).text_color(ink).child("Achievements"))
                    .child(
                        div()
                            .mt(px(2.))
                            .flex()
                            .text_size(px(12.5))
                            .line_height(px(18.75))
                            .text_color(muted)
                            .child(div().font_weight(FontWeight::BOLD).text_color(ink).child(format!("{} pts", thousands(points))))
                            .child(div().mx(px(6.)).opacity(0.6).child("·"))
                            .child(format!("{}% complete", (share * 100.).round()))
                            .child(format!(" · {} possible", thousands(max_points))),
                    ),
            )
            .child(
                div()
                    .id("ach-play-all")
                    .relative()
                    .flex_none()
                    .h(px(32.))
                    .px(px(12.))
                    .rounded_full()
                    .border_1()
                    .border_color(lavender.opacity(0.5))
                    .bg(lavender.opacity(0.16))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(12.5))
                    .line_height(px(18.75))
                    .font_weight(FontWeight::BOLD)
                    .text_color(ink)
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::lavender()))
                    .tooltip(ui::tooltip("Play this theme's unlock animation"))
                    .child(ui::icon("play-filled", 14., ink))
                    .child("Play animation")
                    .on_click(cx.listener(|this, _, _, cx| this.set_notice("The unlock animation is not in this app yet.", cx))),
            )
            .child(
                icon_button("ach-sound", if sound { "volume-2" } else { "volume-x" }, 16.)
                    .relative()
                    .tooltip(ui::tooltip(if sound { "Unlock sounds on" } else { "Unlock sounds off" }))
                    .on_click(cx.listener(move |_, _, _, cx| {
                        if let Some(path) = sound_path() {
                            let _ = std::fs::write(path, if sound { "off" } else { "on" });
                        }
                        cx.notify();
                    })),
            )
            .child(icon_button("ach-close", "x", 18.).relative().on_click(cx.listener(|this, _, _, cx| this.close_achievements(cx))));

        let mut slots = div().flex().gap(px(8.));
        for i in 0..cat.showcase_limit {
            let def = b.showcase.get(i).and_then(|id| cat.achievements.iter().find(|d| &d.id == id));
            slots = slots.child(match def {
                Some(def) => {
                    let id = def.id.clone();
                    div()
                        .id(SharedString::from(format!("ach-slot-{i}")))
                        .size(px(44.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .tooltip(ui::tooltip(format!("{}: click to unpin", def.label)))
                        .child(medal(def, true, 38., scale))
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_showcase(id.clone(), cx)))
                        .into_any_element()
                }
                None => div().size(px(44.)).rounded_full().border(px(1.5)).border_dashed().border_color(ink.opacity(0.22)).into_any_element(),
            });
        }
        let showcase = div()
            .flex_none()
            .px(px(20.))
            .py(px(10.))
            .border_b_1()
            .border_color(line)
            .flex()
            .flex_wrap()
            .items_center()
            .justify_between()
            .gap(px(16.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(ink)
                    .child(ui::icon("pin", 12., ink))
                    .child("On your profile")
                    .child(div().text_color(muted).child(format!(" · pin up to {} earned achievements", cat.showcase_limit))),
            )
            .child(slots);

        // Categories with their counts, then the filter.
        let mut counts: HashMap<&str, (usize, usize)> = HashMap::new();
        for d in &cat.achievements {
            let e = counts.entry(d.category.as_str()).or_default();
            e.1 += 1;
            if b.rows.get(&d.id).is_some_and(|r| r.earned) {
                e.0 += 1;
            }
        }
        let tab = |id: String, label: String, count: String, active: bool, cx: &mut Context<Self>| {
            let key = id.clone();
            div()
                .id(SharedString::from(format!("ach-tab-{id}")))
                .flex_none()
                .flex()
                .items_baseline()
                .px(px(11.))
                .py(px(6.))
                .rounded_full()
                .border_1()
                .border_color(gpui::transparent_black())
                .text_size(px(12.5))
                .line_height(px(18.75))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if active { Hsla::from(rgb(0x15121f)) } else { muted })
                .when(active, |d| d.bg(Theme::lavender()))
                .when(!active, |d| d.hover(|s| s.bg(ink.opacity(0.06)).text_color(ink)))
                .cursor_pointer()
                .child(label)
                .child(div().ml(px(4.)).text_size(px(11.)).font_weight(FontWeight::MEDIUM).opacity(0.7).child(count))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(b) = this.achievements.as_mut() {
                        b.category = key.clone();
                        cx.notify();
                    }
                }))
        };
        let mut tabs = div().id("ach-tabs").flex_none().pt(px(10.)).px(px(16.)).flex().gap(px(4.)).overflow_x_scroll();
        tabs = tabs.child(tab("all".into(), "All".into(), format!("{earned_count}/{total}"), b.category == "all", cx));
        for c in &cat.categories {
            let (e, n) = counts.get(c.id.as_str()).copied().unwrap_or((0, 0));
            tabs = tabs.child(tab(c.id.clone(), c.label.clone(), if n > 0 { format!("{e}/{n}") } else { String::new() }, b.category == c.id, cx));
        }
        let mut filters = div().flex_none().pt(px(8.)).px(px(16.)).pb(px(10.)).flex().gap(px(4.));
        for (f, label) in [("all", "Everything"), ("earned", "Earned"), ("locked", "Still to get")] {
            let active = b.filter == f;
            filters = filters.child(
                div()
                    .id(SharedString::from(format!("ach-filter-{f}")))
                    .px(px(10.))
                    .py(px(4.))
                    .rounded_full()
                    .border_1()
                    .border_color(if active { line } else { gpui::transparent_black().into() })
                    .text_size(px(11.5))
                    .line_height(px(17.25))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(if active { ink } else { muted })
                    .cursor_pointer()
                    .hover(|s| s.bg(ink.opacity(0.06)).text_color(ink))
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(b) = this.achievements.as_mut() {
                            b.filter = f;
                            cx.notify();
                        }
                    })),
            );
        }

        // Earned first (newest first), then locked: secrets last, closest to unlocking first.
        let mut visible: Vec<&Def> = cat
            .achievements
            .iter()
            .filter(|d| b.category == "all" || d.category == b.category)
            .filter(|d| {
                let earned = b.rows.get(&d.id).is_some_and(|r| r.earned);
                match b.filter {
                    "earned" => earned,
                    "locked" => !earned,
                    _ => true,
                }
            })
            .collect();
        visible.sort_by(|a, c| {
            let (ra, rc) = (b.rows.get(&a.id), b.rows.get(&c.id));
            let (ea, ec) = (ra.is_some_and(|r| r.earned), rc.is_some_and(|r| r.earned));
            if ea != ec {
                return ec.cmp(&ea);
            }
            if ea && ec {
                return rc.and_then(|r| r.earned_at.clone()).unwrap_or_default().cmp(&ra.and_then(|r| r.earned_at.clone()).unwrap_or_default());
            }
            if a.secret != c.secret {
                return a.secret.cmp(&c.secret);
            }
            rc.map_or(0., |r| r.progress).partial_cmp(&ra.map_or(0., |r| r.progress)).unwrap_or(std::cmp::Ordering::Equal)
        });

        let modal_w = 880f32.min(f32::from(window.viewport_size().width) - 32.);
        let inner = modal_w - 2. - 32.;
        let cols = (((inner + 10.) / 270.).floor() as usize).max(1);
        let col_w = (inner - 10. * (cols as f32 - 1.)) / cols as f32;
        let mut grid = div().id("ach-grid").flex_1().min_h_0().overflow_y_scroll().pt(px(4.)).px(px(16.)).pb(px(18.)).flex().flex_col().gap(px(10.));
        let note = |text: String, color: Hsla| div().py(px(30.)).text_center().text_size(px(16.)).line_height(px(24.)).text_color(color).child(text);
        if b.loading {
            grid = grid.child(note("Loading…".into(), muted));
        } else if let Some(e) = &b.error {
            grid = grid.child(note(e.clone(), Theme::coral().into()));
        } else if visible.is_empty() {
            grid = grid.child(note("Nothing here yet.".into(), muted));
        } else {
            for chunk in visible.chunks(cols) {
                let mut row = div().flex().gap(px(10.));
                for def in chunk {
                    row = row.child(div().flex_none().w(px(col_w)).flex().child(self.render_achievement_card(def, b, col_w, window, cx)));
                }
                grid = grid.child(row);
            }
        }

        let vh = f32::from(window.viewport_size().height);
        Some(
            div()
                .id("ach-backdrop")
                .absolute()
                .inset_0()
                .p(px(16.))
                .bg(rgba(0x06040e9e))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| this.close_achievements(cx)))
                .child(
                    div()
                        .id("ach-modal")
                        .w(px(modal_w))
                        .max_h(px((vh * 0.86).min(900.)))
                        .flex()
                        .flex_col()
                        .overflow_hidden()
                        .rounded(px(18.))
                        .bg(Theme::paper())
                        .border_1()
                        .border_color(line)
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.5), offset: gpui::point(px(0.), px(24.)), blur_radius: px(80.), spread_radius: px(0.) }])
                        .text_color(ink)
                        .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .child(head)
                        .child(showcase)
                        .child(tabs)
                        .child(filters)
                        .child(grid),
                )
                .into_any_element(),
        )
    }

    /// `.ach-card`: medal, name and tier chip, what it asks, progress while locked, when it was
    /// earned and how rare it is; play and pin while hovered (pin stays dim otherwise).
    fn render_achievement_card(&self, def: &Def, b: &Board, col_w: f32, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let scale = window.scale_factor();
        let cat = &*CATALOGUE;
        let row = b.rows.get(&def.id);
        let earned = row.is_some_and(|r| r.earned);
        let hidden = !earned && def.secret;
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let border: Hsla = if !earned {
            Theme::line().into()
        } else {
            match def.tier.as_str() {
                "gold" => rgba(0xeab30866).into(),
                "platinum" => rgb(0xc4b5fd).into(),
                _ => crate::theme::mix(Theme::lavender(), 0.3, Theme::line()),
            }
        };
        let (chip_fg, chip_bg) = match def.tier.as_str() {
            "silver" => (0x232a35, 0xd5dbe3),
            "gold" => (0x3d2a02, 0xf8d55a),
            "platinum" => (0x1d1636, 0xc4b5fd),
            _ => (0x3a2414, 0xe7b98a),
        };
        let pinned = b.showcase.contains(&def.id);
        let can_pin = pinned || b.showcase.len() < cat.showcase_limit;
        let group = SharedString::from(format!("ach-card-{}", def.id));
        let rarity = b.rarity.get(&def.id).copied();
        let mut body = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pr(px(if earned { 52. } else { 24. }))
                    .child({
                        // Cut with "…" to fit beside the chip, as text-overflow does.
                        let title = if hidden { "Secret achievement".to_string() } else { def.label.clone() };
                        let chip_text = cat.tier_labels.get(&def.tier).cloned().unwrap_or_default().to_uppercase();
                        let chip_w = f32::from(ui::text_width(window, &chip_text, FontWeight::EXTRA_BOLD, 9.5)) + 12.;
                        let room = col_w - 2. - 24. - 46. - 12. - if earned { 52. } else { 24. } - 6. - chip_w;
                        div().min_w_0().text_size(px(14.)).line_height(px(17.5)).font_weight(FontWeight::BOLD).text_color(if earned { ink } else { muted }).child(ui::fit(window, &title, FontWeight::BOLD, 14., px(room.max(20.))))
                    })
                    .child(
                        div()
                            .flex_none()
                            .px(px(6.))
                            .py(px(1.))
                            .rounded_full()
                            .bg(rgb(chip_bg))
                            .text_size(px(9.5))
                            .line_height(px(14.25))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(rgb(chip_fg))
                            .child(cat.tier_labels.get(&def.tier).cloned().unwrap_or_default().to_uppercase()),
                    ),
            )
            .child(
                div()
                    .mt(px(3.))
                    .text_size(px(12.))
                    .line_height(px(16.8))
                    .text_color(muted)
                    .when(hidden, |d| d.italic())
                    .child(if hidden { def.hint.clone().unwrap_or_else(|| "Keep exploring…".into()) } else { def.description.clone() }),
            );
        if let Some(r) = row.filter(|_| !earned && !hidden) {
            body = body.child(
                div()
                    .mt(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(div().flex_1().h(px(6.)).rounded_full().overflow_hidden().bg(ink.opacity(0.1)).child(div().h_full().w(gpui::relative(r.progress.clamp(0., 1.) as f32)).rounded_full().bg(lavender)))
                    .child(div().flex_none().text_size(px(10.5)).line_height(px(15.75)).text_color(muted).child(format!("{} / {}", value_text(&def.condition.stat, r.current.min(r.threshold)), value_text(&def.condition.stat, r.threshold)))),
            );
        }
        body = body.child(
            div()
                .mt(px(6.))
                .flex()
                .flex_wrap()
                .gap(px(10.))
                .text_size(px(10.5))
                .line_height(px(15.75))
                .text_color(muted)
                .when_some(row.and_then(|r| r.earned_at.clone()).filter(|_| earned), |d, at| d.child(format!("Earned {}", date_text(&at))))
                .when(!hidden, |d| d.child(div().text_color(rarity_color(rarity)).child(rarity_text(rarity)))),
        );
        let id = def.id.clone();
        div()
            .id(group.clone())
            .group(group.clone())
            .relative()
            .w_full()
            .flex()
            .items_start()
            .gap(px(12.))
            .pt(px(12.))
            .px(px(12.))
            .pb(px(11.))
            .rounded(px(12.))
            .bg(Hsla::from(Theme::panel()).opacity(0.85))
            .border_1()
            .border_color(border)
            .child(medal(def, earned, 46., scale))
            .child(body)
            .when(earned, |d| {
                d.child(
                    div()
                        .id(SharedString::from(format!("ach-play-{}", def.id)))
                        .absolute()
                        .top(px(8.))
                        .right(px(36.))
                        .size(px(26.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .opacity(0.)
                        .group_hover(group.clone(), |s| s.opacity(1.))
                        .hover(|s| s.bg(Theme::lavender()))
                        .cursor_pointer()
                        .child(ui::icon("play-filled", 13., muted))
                        .on_click(cx.listener(|this, _, _, cx| this.set_notice("The unlock animation is not in this app yet.", cx))),
                )
                .child(
                    div()
                        .id(SharedString::from(format!("ach-pin-{}", def.id)))
                        .absolute()
                        .top(px(8.))
                        .right(px(8.))
                        .size(px(26.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .opacity(if pinned { 1. } else if can_pin { 0.55 } else { 0.25 })
                        .when(can_pin && !pinned, |d| d.group_hover(group.clone(), |s| s.opacity(1.)))
                        .when(can_pin, |d| d.cursor_pointer().hover(|s| s.bg(ink.opacity(0.08))))
                        .tooltip(ui::tooltip(if pinned { "Remove from your profile".to_string() } else if can_pin { "Show on your profile".to_string() } else { format!("Profile showcase is full ({})", cat.showcase_limit) }))
                        .child(ui::icon(if pinned { "pin-off" } else { "pin" }, 14., if pinned { lavender } else { muted }))
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_showcase(id.clone(), cx))),
                )
            })
            .into_any_element()
    }
}
