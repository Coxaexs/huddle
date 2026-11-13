//! Styled display names: the 29 name fonts and 25 name effects of lib/profile-style.ts, drawn the way
//! app/profile-style.css draws them. Fonts and plain colours are ordinary text; effects (text filled
//! with gradients, outlines, glows, layered copies) are written as SVG with the same geometry as the
//! CSS (backgrounds sized and placed against the name's inline box, drop-shadows, text-shadows) and
//! rendered with resvg. Names rest on their first frame in chat and lists, as on the web.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use gpui::{AnyElement, App, FontWeight, Hsla, ImageSource, IntoElement, RenderImage, SharedString, Window, div, img, prelude::*, px};
use serde_json::Value;

use crate::fonts;
use crate::theme::UI_FONT;

pub struct FontSpec {
    pub id: &'static str,
    pub family: Option<&'static str>,
    pub weight: u16,
    pub scale: f32,
    /// letter-spacing in em.
    pub tracking: f32,
}

macro_rules! f {
    ($id:literal) => { FontSpec { id: $id, family: None, weight: 400, scale: 1.0, tracking: 0.0 } };
    ($id:literal, $fam:literal, $w:literal, $s:literal) => { FontSpec { id: $id, family: Some($fam), weight: $w, scale: $s, tracking: 0.0 } };
    ($id:literal, $fam:literal, $w:literal, $s:literal, $t:literal) => { FontSpec { id: $id, family: Some($fam), weight: $w, scale: $s, tracking: $t } };
}

/// NAME_FONTS.
pub static FONTS: [FontSpec; 29] = [
    f!("default"),
    f!("elegant", "Playfair Display", 700, 1.04),
    f!("royal", "Cinzel", 700, 0.96, 0.02),
    f!("slab", "Zilla Slab", 700, 1.1),
    f!("moderno", "MuseoModerno", 700, 0.98),
    f!("wide", "Syncopate", 700, 0.8, 0.03),
    f!("mono", "Space Mono", 700, 0.94),
    f!("poster", "Bebas Neue", 400, 1.24, 0.04),
    f!("bubbly", "Fredoka", 600, 1.04),
    f!("cherry", "Cherry Bomb One", 400, 1.1),
    f!("comic", "Bangers", 400, 1.16, 0.05),
    f!("chunky", "Bagel Fat One", 400, 1.02),
    f!("handwritten", "Caveat", 700, 1.32),
    f!("script", "Pacifico", 400, 0.96),
    f!("cursive", "Dancing Script", 700, 1.24),
    f!("gummy", "Sour Gummy", 600, 1.02),
    f!("pixel", "Pixelify Sans", 600, 1.08),
    f!("arcade", "Press Start 2P", 400, 0.7),
    f!("scifi", "Audiowide", 400, 0.98),
    f!("neon", "Tilt Neon", 400, 1.06),
    f!("glitch", "Rubik Glitch", 400, 0.98),
    f!("gothic", "Pirata One", 400, 1.2),
    f!("metal", "Metal Mania", 400, 1.12),
    f!("drip", "Rubik Wet Paint", 400, 0.98),
    f!("western", "Rye", 400, 0.9),
    f!("typewriter", "Special Elite", 400, 1.02),
    f!("stencil", "Black Ops One", 400, 0.98),
    f!("blocky", "Silkscreen", 400, 0.92, 0.02),
    f!("undead", "Eater", 400, 0.92),
];

/// NAME_EFFECTS: id and starting colours.
pub static EFFECTS: [(&str, &[&str]); 25] = [
    ("solid", &["#ff7ab8"]),
    ("gradient", &["#ff7ab8", "#7c6cff"]),
    ("outline", &["#7dd3fc"]),
    ("highlight", &["#fde047"]),
    ("toon", &["#ffd23f", "#ff4d6d"]),
    ("pop", &["#ffffff", "#7c6cff"]),
    ("neon", &["#ff3cac"]),
    ("aura", &["#a78bfa"]),
    ("fire", &[]),
    ("frost", &[]),
    ("galaxy", &["#b18cff", "#5ee7ff"]),
    ("shimmer", &["#f5d0fe", "#a78bfa"]),
    ("chrome", &["#e2e8f0"]),
    ("holo", &[]),
    ("rainbow", &[]),
    ("sparkle", &["#fff1a8", "#ffb3d9"]),
    ("candy", &["#ff6fae", "#ffffff"]),
    ("retro", &["#ffd23f", "#ff3cac"]),
    ("anaglyph", &["#00e5ff", "#ff2bd6"]),
    ("glitch", &["#e5e7eb"]),
    ("liquid", &["#38bdf8", "#1e3a8a"]),
    ("wave", &["#5eead4", "#818cf8"]),
    ("jelly", &["#86efac", "#22d3ee"]),
    ("enchanted", &["#5ce1e6"]),
    ("infected", &["#9be15d"]),
];

#[derive(Clone)]
pub struct NameStyle {
    pub font: Option<&'static FontSpec>,
    pub effect: Option<&'static str>,
    /// --n1, --n2, --n3 (effects written for more stops reuse the first ones, as on the web).
    pub colors: Vec<Rgba>,
}

impl NameStyle {
    /// nameLook(): nothing when the style changes neither the font nor the effect.
    pub fn from_profile(style: Option<&Value>) -> Option<Self> {
        let style = style?;
        let font = style
            .get("font")
            .and_then(Value::as_str)
            .and_then(|id| FONTS.iter().find(|f| f.id == id))
            .filter(|f| f.family.is_some());
        let effect = style.get("effect").and_then(Value::as_str).and_then(|id| EFFECTS.iter().find(|(e, _)| *e == id));
        if font.is_none() && effect.is_none() {
            return None;
        }
        let chosen: Vec<String> = style
            .get("nameColors")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        let mut colors: Vec<Rgba> = if chosen.is_empty() {
            effect.map(|(_, d)| d.iter().filter_map(|c| Rgba::parse(c)).collect()).unwrap_or_default()
        } else {
            chosen.iter().filter_map(|c| Rgba::parse(c)).collect()
        };
        if let Some(first) = colors.first().copied() {
            if colors.len() < 2 {
                colors.push(first);
            }
            if colors.len() < 3 {
                colors.push(colors[1]);
            }
        }
        Some(Self { font, effect: effect.map(|(id, _)| *id), colors })
    }

    fn n(&self, i: usize) -> Rgba {
        self.colors.get(i).copied().unwrap_or(Rgba::WHITE)
    }

    fn key(&self) -> String {
        format!("{}|{}|{:?}", self.font.map_or("", |f| f.id), self.effect.unwrap_or(""), self.colors.iter().map(|c| c.hex()).collect::<Vec<_>>())
    }
}

/// A name in the face and colours its owner picked. `size` and `weight` are where it sits (author
/// line, member list…); `color` is the text colour there.
pub fn styled_name(
    text: &str,
    style: Option<&NameStyle>,
    size: f32,
    weight: FontWeight,
    color: Hsla,
    window: &Window,
    cx: &mut App,
) -> AnyElement {
    let Some(style) = style else { return text.to_string().into_any_element() };
    let (family, font_weight, font_size, tracking) = match style.font {
        Some(f) => {
            let family = f.family.unwrap();
            if !fonts::is_ready(family) {
                fonts::ensure(family, f.weight, cx, |cx| cx.refresh_windows());
            }
            let ready = fonts::is_ready(family);
            (
                if ready { family } else { UI_FONT },
                FontWeight(f.weight as f32),
                size * f.scale,
                f.tracking,
            )
        }
        None => (UI_FONT, weight, size, 0.),
    };
    match style.effect {
        None | Some("solid") => {
            let fill: Hsla = if style.effect.is_some() { style.n(0).into() } else { color };
            div()
                .font_family(SharedString::from(family))
                .font_weight(font_weight)
                .text_size(px(font_size))
                .line_height(px(if style.font.is_some() { font_size } else { size * 1.5 }))
                .text_color(fill)
                .whitespace_nowrap()
                .child(text.to_string())
                .into_any_element()
        }
        Some(effect) => {
            let scale = window.scale_factor();
            let key = format!("{text}|{}|{family}|{font_size}|{scale}", style.key());
            let picture = cached(&key, || paint(text, style, effect, family, font_weight, font_size, tracking, window, scale));
            match picture {
                // A box the size of the name itself; the picture (glows and all) hangs over its edges.
                Some(p) => div()
                    .relative()
                    .flex_none()
                    .w(px(p.width - 2. * p.pad))
                    .h(px(p.height - 2. * p.pad))
                    .child(
                        img(ImageSource::Render(p.image.clone()))
                            .absolute()
                            .left(px(-p.pad))
                            .top(px(-p.pad))
                            .w(px(p.width))
                            .h(px(p.height)),
                    )
                    .into_any_element(),
                None => text.to_string().into_any_element(),
            }
        }
    }
}

struct Picture {
    image: Arc<RenderImage>,
    width: f32,
    height: f32,
    pad: f32,
}

fn cached(key: &str, make: impl FnOnce() -> Option<Picture>) -> Option<Arc<Picture>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<Picture>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(p) = cache.lock().unwrap().get(key) {
        return Some(p.clone());
    }
    let picture = Arc::new(make()?);
    cache.lock().unwrap().insert(key.to_string(), picture.clone());
    Some(picture)
}

#[allow(clippy::too_many_arguments)]
fn paint(
    text: &str,
    style: &NameStyle,
    effect: &str,
    family: &str,
    weight: FontWeight,
    fs: f32,
    tracking: f32,
    window: &Window,
    scale: f32,
) -> Option<Picture> {
    let bytes = fonts::bytes(family)?;
    let (ascent, descent) = fonts::vertical_metrics(&bytes);
    let advance = advance(window, text, family, weight, fs) + tracking * fs * text.chars().count() as f32;
    let pad = (fs * 0.6).ceil();
    let bx = Rect { x: pad, y: pad, w: advance, h: (ascent + descent) * fs };
    let baseline = pad + ascent * fs;
    let svg = effect_svg(text, style, effect, family, weight.0 as u16, fs, tracking, &bx, baseline);
    let full = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{svg}</svg>"#,
        w = bx.w + 2. * pad,
        h = bx.h + 2. * pad
    );
    let options = resvg::usvg::Options { fontdb: fonts::database(), ..Default::default() };
    let tree = resvg::usvg::Tree::from_str(&full, &options).ok()?;
    let (pw, ph) = (((bx.w + 2. * pad) * scale).ceil() as u32, ((bx.h + 2. * pad) * scale).ceil() as u32);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
    resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    // gpui wants straight-alpha BGRA.
    let mut data = Vec::with_capacity((pw * ph * 4) as usize);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
    }
    let buffer = image::RgbaImage::from_raw(pw, ph, data)?;
    let image = Arc::new(RenderImage::new(vec![image::Frame::new(buffer)]));
    Some(Picture { image, width: bx.w + 2. * pad, height: bx.h + 2. * pad, pad })
}

fn advance(window: &Window, text: &str, family: &str, weight: FontWeight, size: f32) -> f32 {
    let mut face = gpui::font(SharedString::from(family.to_string()));
    face.weight = weight;
    let run = gpui::TextRun { len: text.len(), font: face, color: gpui::black(), background_color: None, underline: None, strikethrough: None };
    f32::from(window.text_system().shape_line(SharedString::from(text.to_string()), px(size), &[run], None).width)
}

// ---------------------------------------------------------------------------- colours

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rgba {
    r: f32,
    g: f32,
    b: f32,
    a: f32,
}

impl Rgba {
    pub(crate) const WHITE: Rgba = Rgba { r: 1., g: 1., b: 1., a: 1. };
    pub(crate) const CLEAR: Rgba = Rgba { r: 0., g: 0., b: 0., a: 0. };

    pub fn parse(css: &str) -> Option<Self> {
        let s = css.trim();
        if s == "transparent" {
            return Some(Self::CLEAR);
        }
        if let Some(hex) = s.strip_prefix('#') {
            let full: String = if hex.len() == 3 { hex.chars().flat_map(|c| [c, c]).collect() } else { hex.to_string() };
            let n = u32::from_str_radix(&full[..6.min(full.len())], 16).ok()?;
            return Some(Self::rgb(((n >> 16) & 255) as u8, ((n >> 8) & 255) as u8, (n & 255) as u8));
        }
        let inner = s.strip_prefix("rgba(").or_else(|| s.strip_prefix("rgb("))?.trim_end_matches(')');
        let parts: Vec<f32> = inner.split(',').filter_map(|p| p.trim().parse().ok()).collect();
        let a = parts.get(3).copied().unwrap_or(1.);
        Some(Self { r: parts.first()? / 255., g: parts.get(1)? / 255., b: parts.get(2)? / 255., a })
    }

    const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r: r as f32 / 255., g: g as f32 / 255., b: b as f32 / 255., a: 1. }
    }

    fn rgba(r: u8, g: u8, b: u8, a: f32) -> Self {
        Self { a, ..Self::rgb(r, g, b) }
    }

    /// color-mix(in srgb, self pct%, other).
    fn mix(self, pct: f32, other: Rgba) -> Rgba {
        let p = pct / 100.;
        // Premultiplied mixing, as CSS does.
        let a = self.a * p + other.a * (1. - p);
        if a <= 0. {
            return Self::CLEAR;
        }
        let ch = |x: f32, y: f32| (x * self.a * p + y * other.a * (1. - p)) / a;
        Rgba { r: ch(self.r, other.r), g: ch(self.g, other.g), b: ch(self.b, other.b), a }
    }

    pub(crate) fn opacity(&self) -> f32 {
        self.a
    }

    #[allow(dead_code)]
    fn alpha(self, a: f32) -> Rgba {
        Rgba { a: self.a * a, ..self }
    }

    pub(crate) fn hex(&self) -> String {
        format!("#{:02x}{:02x}{:02x}", (self.r * 255.).round() as u8, (self.g * 255.).round() as u8, (self.b * 255.).round() as u8)
    }

    pub(crate) fn stop(&self, offset: f32) -> String {
        format!(r#"<stop offset="{offset}" stop-color="{}" stop-opacity="{:.3}"/>"#, self.hex(), self.a)
    }

    fn fill(&self) -> String {
        format!(r#"fill="{}" fill-opacity="{:.3}""#, self.hex(), self.a)
    }
}

impl From<Rgba> for Hsla {
    fn from(c: Rgba) -> Hsla {
        gpui::Rgba { r: c.r, g: c.g, b: c.b, a: c.a }.into()
    }
}

// ---------------------------------------------------------------------------- SVG building

#[derive(Clone, Copy)]
struct Rect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

/// One CSS background layer: a gradient over a tile of `size`, placed at `pos` inside the box, either
/// once or repeated.
enum Paint {
    /// linear-gradient(angle, stops) with stop offsets in 0..1 of the gradient line.
    Linear(f32, Vec<(Rgba, f32)>),
    /// radial-gradient(rx ry at cx cy, inner, transparent stop): an ellipse inside the tile.
    Radial { rx: f32, ry: f32, cx: f32, cy: f32, stops: Vec<(Rgba, f32)> },
}

struct Layer {
    paint: Paint,
    /// Tile size in px.
    size: (f32, f32),
    /// Tile offset from the box's top-left in px.
    pos: (f32, f32),
    repeat_x: bool,
    repeat_y: bool,
}

struct Svg {
    defs: String,
    body: String,
    next: usize,
}

impl Svg {
    fn new() -> Self {
        Self { defs: String::new(), body: String::new(), next: 0 }
    }

    fn id(&mut self, prefix: &str) -> String {
        self.next += 1;
        format!("{prefix}{}", self.next)
    }

    /// A CSS linear-gradient over `area`, as an SVG gradient in user space.
    fn linear(&mut self, angle: f32, stops: &[(Rgba, f32)], area: Rect) -> String {
        let id = self.id("g");
        let rad = angle.to_radians();
        let (dx, dy) = (rad.sin(), -rad.cos());
        let len = (area.w * dx).abs() + (area.h * dy).abs();
        let (cx, cy) = (area.x + area.w / 2., area.y + area.h / 2.);
        let (x1, y1, x2, y2) = (cx - dx * len / 2., cy - dy * len / 2., cx + dx * len / 2., cy + dy * len / 2.);
        let stops: String = stops.iter().map(|(c, o)| c.stop(*o)).collect();
        self.defs.push_str(&format!(
            r#"<linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{stops}</linearGradient>"#
        ));
        id
    }

    fn radial(&mut self, cx: f32, cy: f32, rx: f32, ry: f32, stops: &[(Rgba, f32)]) -> String {
        let id = self.id("r");
        let stops: String = stops.iter().map(|(c, o)| c.stop(*o)).collect();
        // An ellipse: a circle gradient squashed by a transform.
        let k = if rx > 0. { ry / rx } else { 1. };
        self.defs.push_str(&format!(
            r#"<radialGradient id="{id}" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{}" r="{rx}" gradientTransform="scale(1 {k})">{stops}</radialGradient>"#,
            cy / k.max(0.0001)
        ));
        id
    }

    /// Paints `layers` (CSS order: the first on top) into `clip`, the text's shape.
    fn backgrounds(&mut self, layers: &[Layer], bx: Rect, clip: &str) -> String {
        let mut out = format!(r#"<g clip-path="url(#{clip})">"#);
        for layer in layers.iter().rev() {
            let tile = Rect { x: bx.x + layer.pos.0, y: bx.y + layer.pos.1, w: layer.size.0, h: layer.size.1 };
            if layer.repeat_x || layer.repeat_y {
                let pid = self.id("p");
                let inner_area = Rect { x: 0., y: 0., w: tile.w, h: tile.h };
                let fill = self.paint(&layer.paint, inner_area);
                self.defs.push_str(&format!(
                    r#"<pattern id="{pid}" patternUnits="userSpaceOnUse" x="{}" y="{}" width="{}" height="{}"><rect width="{}" height="{}" fill="url(#{fill})"/></pattern>"#,
                    tile.x,
                    if layer.repeat_y { tile.y } else { tile.y },
                    tile.w,
                    if layer.repeat_y { tile.h } else { tile.h },
                    tile.w,
                    tile.h
                ));
                let (y, h) = if layer.repeat_y { (bx.y - bx.h, bx.h * 3.) } else { (tile.y, tile.h) };
                out.push_str(&format!(r#"<rect x="{}" y="{y}" width="{}" height="{h}" fill="url(#{pid})"/>"#, bx.x - bx.w, bx.w * 3.));
            } else {
                let fill = self.paint(&layer.paint, tile);
                out.push_str(&format!(r#"<rect x="{}" y="{}" width="{}" height="{}" fill="url(#{fill})"/>"#, tile.x, tile.y, tile.w, tile.h));
            }
        }
        out.push_str("</g>");
        out
    }

    fn paint(&mut self, paint: &Paint, area: Rect) -> String {
        match paint {
            Paint::Linear(angle, stops) => self.linear(*angle, stops, area),
            Paint::Radial { rx, ry, cx, cy, stops } => self.radial(area.x + cx * area.w, area.y + cy * area.h, *rx, *ry, stops),
        }
    }

    /// CSS `filter: drop-shadow(...) drop-shadow(...)`, applied in order.
    fn drop_shadows(&mut self, shadows: &[(f32, f32, f32, Rgba)]) -> String {
        let id = self.id("f");
        let mut prims = String::new();
        let mut input = "SourceGraphic".to_string();
        for (i, (dx, dy, blur, c)) in shadows.iter().enumerate() {
            let out = format!("s{i}");
            prims.push_str(&format!(
                r#"<feDropShadow in="{input}" dx="{dx}" dy="{dy}" stdDeviation="{}" flood-color="{}" flood-opacity="{:.3}" result="{out}"/>"#,
                blur / 2.,
                c.hex(),
                c.a
            ));
            input = out;
        }
        self.defs.push_str(&format!(r#"<filter id="{id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">{prims}</filter>"#));
        id
    }

    fn blur(&mut self, radius: f32) -> String {
        let id = self.id("b");
        self.defs.push_str(&format!(
            r#"<filter id="{id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{}"/></filter>"#,
            radius / 2.
        ));
        id
    }
}

fn esc(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The SVG body (defs and drawing) for one name with one effect, frame zero.
#[allow(clippy::too_many_arguments)]
fn effect_svg(text: &str, style: &NameStyle, effect: &str, family: &str, weight: u16, fs: f32, tracking: f32, bx: &Rect, baseline: f32) -> String {
    let bx = *bx;
    let em = |v: f32| v * fs;
    let mut s = Svg::new();
    let t = esc(text);
    let attrs = format!(
        r#"font-family="{family}" font-size="{fs}" font-weight="{weight}" letter-spacing="{}" x="{}" y="{baseline}""#,
        tracking * fs,
        bx.x
    );
    let text_el = |extra: &str| format!(r#"<text {attrs} {extra} xml:space="preserve">{t}</text>"#);
    let clip_id = s.id("c");
    s.defs.push_str(&format!(r#"<clipPath id="{clip_id}">{}</clipPath>"#, text_el("")));
    let (n1, n2, n3) = (style.n(0), style.n(1), style.n(2));
    let three = style.colors.len() >= 3 && style.colors[2] != style.colors[1];
    let w = bx.w;
    let h = bx.h;
    let full = |paint: Paint| Layer { paint, size: (w, h), pos: (0., 0.), repeat_x: false, repeat_y: false };
    // background-size: P% 100% at background-position Q% 0 (no repeat): the tile's offset.
    let wide = |paint: Paint, size_pct: f32, pos_pct: f32| {
        let lw = w * size_pct / 100.;
        Layer { paint, size: (lw, h), pos: ((w - lw) * pos_pct / 100., 0.), repeat_x: false, repeat_y: false }
    };
    let even = |colors: &[Rgba]| -> Vec<(Rgba, f32)> {
        let n = colors.len().max(2) - 1;
        colors.iter().enumerate().map(|(i, c)| (*c, i as f32 / n as f32)).collect()
    };
    let clear = Rgba::CLEAR;
    let white = Rgba::WHITE;

    let mut drawing = String::new();
    // Text-shadows sit under the text; the first one listed is drawn on top.
    let shadows = |s: &mut Svg, list: &[(f32, f32, f32, Rgba)], drawing: &mut String| {
        for (dx, dy, blur, c) in list.iter().rev() {
            let filter = if *blur > 0. { format!(r#"filter="url(#{})""#, s.blur(*blur)) } else { String::new() };
            drawing.push_str(&format!(
                r#"<g transform="translate({dx} {dy})" {filter}>{}</g>"#,
                text_el(&c.fill())
            ));
        }
    };

    match effect {
        "gradient" | "rainbow" | "sparkle" => {
            let stops = match effect {
                "rainbow" => even(&["#ff4d4d", "#ff9f1c", "#ffe14d", "#4ade80", "#22d3ee", "#6366f1", "#d946ef", "#ff4d4d"].map(|c| Rgba::parse(c).unwrap())),
                _ if three && effect == "gradient" => even(&[n1, n2, n3, n2, n1]),
                _ => even(&[n1, n2, n1]),
            };
            drawing.push_str(&s.backgrounds(&[wide(Paint::Linear(90., stops), 200., 0.)], bx, &clip_id));
            if effect == "sparkle" {
                // ::before and ::after: a ✦ at the top left and one at the bottom right, glowing.
                for (x, y, size, c) in [(bx.x - em(0.32), bx.y - em(0.3), 0.5, n1), (bx.x + w + em(0.42) - em(0.42) * 0.8, bx.y + h + em(0.1) - em(0.42), 0.42, n2)] {
                    let glow = s.blur(em(size) * 0.3 * 2.);
                    let star = |extra: &str| {
                        format!(r#"<text font-family="Apple Symbols, Instrument Sans" font-size="{}" x="{x}" y="{}" {extra}>✦</text>"#, em(size), y + em(size) * 0.85)
                    };
                    drawing.push_str(&format!(r#"<g filter="url(#{glow})">{}</g>{}"#, star(&c.fill()), star(&c.fill())));
                }
            }
        }
        "outline" => {
            // Hollow letters with a bright edge; at rest the fill has not come in yet.
            let f = s.drop_shadows(&[(0., 0., em(0.18), n1.mix(55., clear))]);
            drawing.push_str(&format!(
                r#"<g filter="url(#{f})">{}</g>"#,
                text_el(&format!(r#"fill="none" stroke="{}" stroke-width="{}""#, n1.hex(), em(0.045).max(1.)))
            ));
        }
        "highlight" => {
            // A marker swipe behind the name: 52% of the box tall, near its bottom.
            let mh = h * 0.52;
            let my = bx.y + (h - mh) * 0.92;
            let g = s.linear(100., &[(clear, 0.), (n1.mix(70., clear), em(0.28) / (w + em(0.32))), (n1.mix(55., clear), 1. - em(0.3) / (w + em(0.32))), (clear, 1. - em(0.1) / (w + em(0.32)))], Rect { x: bx.x - em(0.16), y: my, w: w + em(0.32), h: mh });
            drawing.push_str(&format!(r#"<rect x="{}" y="{my}" width="{}" height="{mh}" rx="{}" fill="url(#{g})"/>"#, bx.x - em(0.16), w + em(0.32), em(0.3)));
            drawing.push_str(&text_el(r##"fill="#e8e3f5""##));
        }
        "toon" => {
            shadows(&mut s, &[(em(0.05), em(0.07), 0., n2), (em(0.09), em(0.12), 0., Rgba::rgb(0x1b, 0x10, 0x30))], &mut drawing);
            drawing.push_str(&text_el(&format!(
                r##"{} stroke="#1b1030" stroke-width="{}" paint-order="stroke fill""##,
                n1.fill(),
                em(0.07)
            )));
        }
        "pop" => {
            let black = Rgba::rgb(0, 0, 0);
            shadows(
                &mut s,
                &[
                    (em(0.02), em(0.02), 0., n2),
                    (em(0.04), em(0.04), 0., n2),
                    (em(0.06), em(0.06), 0., n2.mix(85., black)),
                    (em(0.08), em(0.08), 0., n2.mix(70., black)),
                    (em(0.1), em(0.1), 0., n2.mix(55., black)),
                    (em(0.12), em(0.14), em(0.12), Rgba::rgba(0, 0, 0, 0.45)),
                ],
                &mut drawing,
            );
            drawing.push_str(&text_el(&n1.fill()));
        }
        "neon" => {
            shadows(
                &mut s,
                &[(0., 0., em(0.04), white), (0., 0., em(0.16), n1), (0., 0., em(0.38), n1), (0., 0., em(0.8), n1.mix(70., clear))],
                &mut drawing,
            );
            drawing.push_str(&text_el(&n1.mix(28., white).fill()));
        }
        "aura" => {
            shadows(&mut s, &[(0., 0., em(0.25), n1), (0., 0., em(0.6), n1.mix(60., clear))], &mut drawing);
            drawing.push_str(&text_el(&n1.mix(30., white).fill()));
        }
        "fire" => {
            let layers = [
                Layer {
                    paint: Paint::Radial { rx: em(0.32), ry: em(0.45), cx: 0.5, cy: 1., stops: vec![(Rgba::rgba(255, 246, 200, 0.95), 0.), (clear, 0.7)] },
                    size: (em(0.7), em(1.4)),
                    pos: (0., em(0.9)),
                    repeat_x: true,
                    repeat_y: false,
                },
                full(Paint::Linear(0., vec![
                    (Rgba::parse("#fff4b8").unwrap(), 0.),
                    (Rgba::parse("#ffd23f").unwrap(), 0.22),
                    (Rgba::parse("#ff7a1a").unwrap(), 0.52),
                    (Rgba::parse("#e8261c").unwrap(), 0.78),
                    (Rgba::parse("#8a0d0d").unwrap(), 1.),
                ])),
            ];
            let f = s.drop_shadows(&[(0., 0., em(0.1), Rgba::rgba(255, 110, 20, 0.65)), (0., -em(0.05), em(0.18), Rgba::rgba(255, 60, 0, 0.35))]);
            let painted = s.backgrounds(&layers, bx, &clip_id);
            drawing.push_str(&format!(r#"<g filter="url(#{f})">{painted}</g>"#));
        }
        "frost" | "shimmer" | "chrome" | "retro" | "holo" | "enchanted" => {
            // The glint band starts off to the right (background-position 160%) and is not seen at rest.
            let base = match effect {
                "frost" => full(Paint::Linear(180., vec![(white, 0.), (Rgba::parse("#dff4ff").unwrap(), 0.32), (Rgba::parse("#9bd8ff").unwrap(), 0.62), (Rgba::parse("#5aa9e6").unwrap(), 1.)])),
                "shimmer" => full(Paint::Linear(90., vec![(n1, 0.), (n2, 1.)])),
                "chrome" => full(Paint::Linear(180., vec![
                    (white, 0.),
                    (n1.mix(55., white), 0.3),
                    (n1.mix(55., Rgba::rgb(0x1a, 0x1a, 0x22)), 0.5),
                    (n1.mix(80., white), 0.54),
                    (white, 1.),
                ])),
                "retro" => full(Paint::Linear(180., vec![
                    (Rgba::parse("#fffbe6").unwrap(), 0.),
                    (n1, 0.46),
                    (n2.mix(60., Rgba::rgb(0x1a, 0x06, 0x30)), 0.5),
                    (n2, 0.54),
                    (n2.mix(65., white), 1.),
                ])),
                "holo" => wide(
                    Paint::Linear(100., even(&["#ff9ad5", "#ffe29a", "#9affc8", "#9ad8ff", "#c79aff", "#ff9ad5"].map(|c| Rgba::parse(c).unwrap()))),
                    300.,
                    0.,
                ),
                _ => full(Paint::Linear(180., vec![(n1, 0.), (n1, 1.)])),
            };
            let glint = match effect {
                "enchanted" => vec![
                    wide(Paint::Linear(115., vec![(clear, 0.3), (Rgba::rgba(206, 160, 255, 0.95), 0.4), (Rgba::rgba(150, 80, 255, 0.75), 0.46), (clear, 0.56)]), 300., 150.),
                    wide(Paint::Linear(65., vec![(clear, 0.4), (Rgba::rgba(190, 140, 255, 0.6), 0.5), (clear, 0.6)]), 240., -120.),
                ],
                "holo" => vec![wide(Paint::Linear(115., vec![(clear, 0.35), (Rgba::rgba(255, 255, 255, 0.8), 0.48), (clear, 0.6)]), 260., 160.)],
                _ => vec![wide(Paint::Linear(105., vec![(clear, 0.4), (Rgba::rgba(255, 255, 255, 0.9), 0.5), (clear, 0.6)]), 260., 160.)],
            };
            let mut layers = glint;
            layers.push(base);
            let painted = s.backgrounds(&layers, bx, &clip_id);
            let filter = match effect {
                "frost" => Some(s.drop_shadows(&[(0., 0., em(0.12), Rgba::rgba(150, 215, 255, 0.6))])),
                "chrome" => Some(s.drop_shadows(&[(0., em(0.04), 0., Rgba::rgba(0, 0, 0, 0.55)), (0., 0., em(0.1), n1.mix(35., clear))])),
                "retro" => Some(s.drop_shadows(&[(em(0.06), em(0.07), 0., n2.mix(55., Rgba::rgb(0x12, 0, 0x1f)))])),
                "holo" => Some(s.drop_shadows(&[(0., 0., em(0.1), Rgba::rgba(200, 170, 255, 0.45))])),
                "enchanted" => Some(s.drop_shadows(&[(0., 0., em(0.12), Rgba::rgba(170, 110, 255, 0.55))])),
                _ => None,
            };
            match filter {
                Some(f) => drawing.push_str(&format!(r#"<g filter="url(#{f})">{painted}</g>"#)),
                None => drawing.push_str(&painted),
            }
        }
        "galaxy" => {
            let mid = Rgba::parse("#3a1d8a").unwrap();
            let star = |cx: f32, cy: f32, r: f32| Layer {
                paint: Paint::Radial { rx: em(r), ry: em(r), cx, cy, stops: vec![(white, 0.6), (clear, 1.)] },
                size: (em(1.6), em(1.)),
                pos: (0., 0.),
                repeat_x: true,
                repeat_y: true,
            };
            let layers = [
                star(0.18, 0.3, 0.05),
                star(0.42, 0.7, 0.04),
                star(0.66, 0.22, 0.06),
                star(0.84, 0.64, 0.04),
                Layer { paint: Paint::Radial { rx: w * 2. * 0.6, ry: h * 0.9, cx: 0.25, cy: 0.4, stops: vec![(n1, 0.), (clear, 0.7)] }, size: (w * 2., h), pos: (0., 0.), repeat_x: false, repeat_y: false },
                Layer { paint: Paint::Radial { rx: w * 2. * 0.6, ry: h * 0.9, cx: 0.75, cy: 0.6, stops: vec![(n2, 0.), (clear, 0.7)] }, size: (w * 2., h), pos: (0., 0.), repeat_x: false, repeat_y: false },
                full(Paint::Linear(90., vec![(n1.mix(55., mid), 0.), (n2.mix(55., mid), 1.)])),
            ];
            let f = s.drop_shadows(&[(0., 0., em(0.14), n1.mix(55., clear))]);
            let painted = s.backgrounds(&layers, bx, &clip_id);
            drawing.push_str(&format!(r#"<g filter="url(#{f})">{painted}</g>"#));
        }
        "candy" => {
            let tile = em(0.9);
            let layer = Layer {
                paint: Paint::Linear(-45., vec![(n1, 0.), (n1, 0.25), (n2, 0.25), (n2, 0.5), (n1, 0.5), (n1, 0.75), (n2, 0.75), (n2, 1.)]),
                size: (tile, tile),
                pos: (0., 0.),
                repeat_x: true,
                repeat_y: true,
            };
            let f = s.drop_shadows(&[(0., 0., em(0.04), Rgba::rgba(0, 0, 0, 0.6)), (0., em(0.05), em(0.05), Rgba::rgba(0, 0, 0, 0.35))]);
            let painted = s.backgrounds(&[layer], bx, &clip_id);
            drawing.push_str(&format!(r#"<g filter="url(#{f})">{painted}</g>"#));
        }
        "anaglyph" => {
            shadows(&mut s, &[(-em(0.06), 0., 0., n1.mix(85., clear)), (em(0.06), 0., 0., n2.mix(85., clear))], &mut drawing);
            drawing.push_str(&text_el(r##"fill="#f8f8ff""##));
        }
        "glitch" => {
            // At rest the torn copies are clipped away; the RGB fringe stays.
            shadows(&mut s, &[(-em(0.04), 0., 0., Rgba::rgba(0, 229, 255, 0.55)), (em(0.04), 0., 0., Rgba::rgba(255, 43, 214, 0.55))], &mut drawing);
            drawing.push_str(&text_el(&n1.fill()));
        }
        "liquid" => {
            drawing.push_str(&text_el(&format!(
                r#"{} stroke="{}" stroke-width="{}""#,
                n1.mix(16., clear).fill(),
                n1.mix(70., white).hex(),
                em(0.035).max(1.)
            )));
            let poly: String = [(0., 50.), (12.5, 41.), (25., 46.), (37.5, 56.), (50., 50.), (62.5, 41.), (75., 46.), (87.5, 56.), (100., 50.), (100., 100.), (0., 100.)]
                .iter()
                .map(|(x, y)| format!("{},{} ", bx.x + w * x / 100., bx.y + h * y / 100.))
                .collect();
            let water = s.id("w");
            s.defs.push_str(&format!(r#"<clipPath id="{water}"><polygon points="{poly}"/></clipPath>"#));
            let g = s.linear(180., &[(n1.mix(55., white), 0.), (n1, 0.45), (n2, 1.)], bx);
            let f = s.drop_shadows(&[(0., 0., em(0.08), n1.mix(55., clear))]);
            drawing.push_str(&format!(r#"<g clip-path="url(#{water})" filter="url(#{f})">{}</g>"#, text_el(&format!(r#"fill="url(#{g})""#))));
        }
        "wave" | "jelly" => {
            // Letter by letter from the first colour to the second.
            let letters: Vec<char> = text.chars().collect();
            let last = (letters.len().max(2) - 1) as f32;
            let tspans: String = letters
                .iter()
                .enumerate()
                .map(|(i, ch)| {
                    let c = n1.mix(100. - i as f32 / last * 100., n2);
                    format!(r#"<tspan {}>{}</tspan>"#, c.fill(), esc(&ch.to_string()))
                })
                .collect();
            if effect == "wave" {
                let glow = s.blur(em(0.3));
                drawing.push_str(&format!(
                    r#"<g filter="url(#{glow})"><text {attrs} {} xml:space="preserve">{t}</text></g>"#,
                    n1.mix(35., clear).fill()
                ));
            }
            drawing.push_str(&format!(r#"<text {attrs} xml:space="preserve">{tspans}</text>"#));
        }
        "infected" => {
            let spot = |rx: f32, ry: f32, cx: f32, cy: f32, c: Rgba, tw: f32| Layer {
                paint: Paint::Radial { rx: em(rx), ry: em(ry), cx, cy, stops: vec![(c, 0.), (clear, 0.7)] },
                size: (em(tw), em(1.)),
                pos: (0., 0.),
                repeat_x: true,
                repeat_y: true,
            };
            let layers = [
                spot(0.16, 0.12, 0.3, 0.62, Rgba::rgba(20, 28, 6, 0.8), 1.3),
                spot(0.1, 0.09, 0.72, 0.34, Rgba::rgba(70, 8, 8, 0.75), 0.9),
                full(Paint::Linear(180., vec![(n1.mix(60., white), 0.), (n1, 0.45), (n1.mix(55., Rgba::rgb(0x0b, 0x12, 0x05)), 1.)])),
            ];
            let f = s.drop_shadows(&[(0., 0., em(0.08), n1.mix(45., clear))]);
            let painted = s.backgrounds(&layers, bx, &clip_id);
            drawing.push_str(&format!(r#"<g filter="url(#{f})">{painted}</g>"#));
        }
        _ => drawing.push_str(&text_el(&n1.fill())),
    }
    format!("<defs>{}</defs>{drawing}", s.defs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixes_like_css() {
        let red = Rgba::rgb(255, 0, 0);
        let half = red.mix(50., Rgba::CLEAR);
        assert!((half.a - 0.5).abs() < 0.001 && (half.r - 1.).abs() < 0.001);
        let pink = red.mix(50., Rgba::WHITE);
        assert!((pink.g - 0.5).abs() < 0.01);
    }

    #[test]
    fn reads_profile_styles() {
        let v: Value = serde_json::json!({ "font": "blocky", "effect": "glitch", "nameColors": ["#e2e8f0"] });
        let s = NameStyle::from_profile(Some(&v)).unwrap();
        assert_eq!(s.font.unwrap().family, Some("Silkscreen"));
        assert_eq!(s.effect, Some("glitch"));
        assert_eq!(s.colors.len(), 3);
        assert!(NameStyle::from_profile(Some(&serde_json::json!({}))).is_none());
    }

    #[test]
    fn every_effect_builds_valid_svg() {
        let bx = Rect { x: 10., y: 10., w: 80., h: 20. };
        for (id, _) in EFFECTS {
            let style = NameStyle::from_profile(Some(&serde_json::json!({ "effect": id }))).unwrap();
            let body = effect_svg("mewis", &style, id, "Instrument Sans", 700, 16., 0., &bx, 25.);
            let svg = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40">{body}</svg>"#);
            resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).unwrap_or_else(|e| panic!("{id}: {e}"));
        }
    }
}
