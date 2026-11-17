//! A profile card's own style (lib/profile-look.ts cardLook, app/profile-style.css `.pst`): the
//! theme pair (chosen, or made from the profile colour), the finish as the card's background, ink
//! and surfaces light or dark to suit it, the edge (soft line, gradient line, glow, flow) and how
//! the card arrives (entrance). Patterns, the tilt toward the pointer and its glare are not here yet.

use gpui::{BoxShadow, Hsla, Rgba, point, px, rgb, rgba};
use serde_json::Value;

use crate::theme::mix;

pub(super) struct CardLook {
    /// `--pst-bg`, as CSS for `ui::css_background`.
    pub bg: String,
    pub ink: Hsla,
    pub ink2: Hsla,
    pub ink3: Hsla,
    pub surface: Hsla,
    pub line: Hsla,
    pub ring: Hsla,
    /// `--pt-a`: the theme's first colour.
    pub pt_a: Hsla,
    /// `--pt-btn`: the first action button.
    pub button: Hsla,
    /// The status bubble.
    pub bubble: Hsla,
    /// The edge's gradient (line, glow, flow) and its width, or a plain inset line (soft).
    pub edge_grad: Option<(String, f32)>,
    pub edge_line: Option<Hsla>,
    /// Only glow, flow and none set the card's shadow (over a frame's); soft and line keep it.
    pub shadow: Option<Vec<BoxShadow>>,
    pub entrance: Option<String>,
    /// `.pst-pattern`: the pattern and its colour (`--pst-pat-color`); whether the card is light.
    pub pattern: Option<(String, Hsla)>,
    pub light: bool,
    /// `.pst-f-aurora .pst-lights`: the glows over an aurora card (still, unblurred here).
    pub lights: Option<String>,
    /// The flow edge's conic stops (0..1 of a turn), drawn turning.
    pub flow: Option<Vec<(Rgba, f32)>>,
}

fn hex(value: &str) -> Option<Rgba> {
    let h = value.strip_prefix('#')?;
    if h.len() != 6 {
        return None;
    }
    let n = u32::from_str_radix(h, 16).ok()?;
    Some(rgb(n))
}

fn luminance(c: Rgba) -> f32 {
    let ch = |v: f32| if v <= 0.03928 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) };
    0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

fn css(c: Hsla) -> String {
    let c = Rgba::from(c);
    format!("rgba({}, {}, {}, {:.3})", (c.r * 255.).round(), (c.g * 255.).round(), (c.b * 255.).round(), c.a)
}

/// buttonColor(): the more colourful of the pair, its lightness held between 20% and 40%.
fn button_color(a: Rgba, b: Rgba) -> Hsla {
    let hsl = |c: Rgba| {
        let (r, g, b) = (c.r, c.g, c.b);
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let l = (max + min) / 2.;
        let d = max - min;
        let sat = if d == 0. { 0. } else { d / (1. - (2. * l - 1.).abs()) };
        let mut h = 0.;
        if d != 0. {
            h = if max == r { ((g - b) / d) % 6. } else if max == g { (b - r) / d + 2. } else { (r - g) / d + 4. };
        }
        (((h * 60.) + 360.) % 360., sat, l)
    };
    let (ha, hb) = (hsl(a), hsl(b));
    let (h, mut sat, mut l) = if ha.1 >= hb.1 { ha } else { hb };
    if sat > 0.08 {
        sat = sat.max(0.5);
    }
    l = l.clamp(0.2, 0.4);
    gpui::hsla(h / 360., sat.min(1.), l, 1.)
}

/// darken(): the made-up second colour of a theme from the profile colour.
fn darken(c: Rgba, amount: f32) -> Rgba {
    let k = 1. - amount;
    Rgba { r: c.r * k + 8. / 255. * amount, g: c.g * k + 8. / 255. * amount, b: c.b * k + 14. / 255. * amount, a: 1. }
}

pub(super) fn card_look(style: Option<&Value>, color: &str) -> Option<CardLook> {
    let style = style?;
    let s = |k: &str| style.get(k).and_then(Value::as_str).filter(|v| !v.is_empty()).map(String::from);
    // cardTheme(): the chosen pair, or one made from the profile colour when a finish, pattern or
    // edge was chosen; otherwise the card is not styled.
    let (a, b) = match style.get("theme").and_then(Value::as_array).filter(|t| t.len() == 2) {
        Some(t) => (hex(t[0].as_str()?)?, hex(t[1].as_str()?)?),
        None => {
            s("finish").or(s("pattern")).or(s("edge"))?;
            let base = hex(color).unwrap_or(rgb(0x5865f2));
            (base, darken(base, 0.72))
        }
    };
    let light = luminance(a) * 0.6 + luminance(b) * 0.4 > 0.42;
    let (ha, hb): (Hsla, Hsla) = (a.into(), b.into());
    let white: Hsla = gpui::white();
    let clear = gpui::hsla(0., 0., 0., 0.);
    let finish = s("finish").unwrap_or_else(|| "gradient".into());
    let (mut ink, mut ink2, mut ink3, mut surface, mut line, scrim) = if light {
        (rgb(0x17121f).into(), Hsla::from(rgba(0x17121fd6)), Hsla::from(rgba(0x17121fa3)), Hsla::from(rgba(0xffffff75)), Hsla::from(rgba(0x17121f1f)), Hsla::from(rgba(0xffffff3d)))
    } else {
        (Hsla::from(rgb(0xf7f5fc)), Hsla::from(rgba(0xffffffd1)), Hsla::from(rgba(0xffffff9e)), Hsla::from(rgba(0x0806104d)), Hsla::from(rgba(0xffffff1f)), Hsla::from(rgba(0x0a081257)))
    };
    let dark_base = |c: u32| -> Hsla { rgb(c).into() };
    let mut ring = if light { mix(ha, 0.76, white) } else { mix(ha, 0.66, dark_base(0x0a0812)) };
    let base = format!("linear-gradient(180deg, {} 0%, {} 14%, {} 100%)", css(ha), css(ha), css(hb));
    let bg = match (finish.as_str(), light) {
        ("diagonal", _) => format!(
            "{}, radial-gradient(120% 70% at 0% 18%, {} 0%, {} 58%), linear-gradient(135deg, {} 0%, {} 100%)",
            css(scrim),
            css(mix(ha, 0.75, white)),
            css(clear),
            css(ha),
            css(hb)
        ),
        ("mesh", _) => format!(
            "{}, radial-gradient(60% 45% at 12% 22%, {} 0%, {} 72%), radial-gradient(55% 40% at 88% 34%, {} 0%, {} 72%), radial-gradient(70% 50% at 28% 88%, {} 0%, {} 74%), radial-gradient(50% 40% at 92% 92%, {} 0%, {} 72%), linear-gradient(180deg, {} 0%, {} 100%)",
            css(scrim),
            css(ha),
            css(clear),
            css(mix(ha, 0.55, hb)),
            css(clear),
            css(mix(hb, 0.93, white).opacity(0.86)),
            css(clear),
            css(mix(ha, 0.4, hb)),
            css(clear),
            css(mix(ha, 0.5, hb)),
            css(hb)
        ),
        ("aurora", false) => {
            ring = mix(hb, 0.55, dark_base(0x06050c));
            format!("linear-gradient(180deg, {} 0%, {} 100%)", css(mix(hb, 0.62, dark_base(0x06050c))), css(mix(hb, 0.38, dark_base(0x06050c))))
        }
        ("aurora", true) => {
            ring = mix(hb, 0.4, white);
            format!("linear-gradient(180deg, {} 0%, {} 100%)", css(mix(hb, 0.45, white)), css(mix(hb, 0.25, white)))
        }
        ("glass", false) => {
            ring = mix(ha, 0.22, dark_base(0x0e0e14));
            surface = rgba(0xffffff0f).into();
            format!(
                "linear-gradient(160deg, rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.03) 34%, rgba(0, 0, 0, 0) 60%), radial-gradient(85% 55% at 0% 0%, {} 0%, {} 72%), radial-gradient(85% 60% at 100% 100%, {} 0%, {} 72%), #101017",
                css(mix(ha, 0.5, clear)),
                css(clear),
                css(mix(hb, 0.55, clear)),
                css(clear)
            )
        }
        ("glass", true) => {
            ring = mix(ha, 0.25, dark_base(0xf6f6fa));
            surface = rgba(0xffffff8c).into();
            format!(
                "linear-gradient(160deg, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.2) 40%, rgba(0, 0, 0, 0) 65%), radial-gradient(85% 55% at 0% 0%, {} 0%, {} 72%), radial-gradient(85% 60% at 100% 100%, {} 0%, {} 72%), #f3f2f8",
                css(mix(ha, 0.6, clear)),
                css(clear),
                css(mix(hb, 0.45, clear)),
                css(clear)
            )
        }
        ("holo", false) => {
            ring = mix(ha, 0.62, dark_base(0x0b0b12));
            format!("linear-gradient(160deg, {} 0%, {} 100%)", css(mix(ha, 0.7, dark_base(0x0b0b12))), css(mix(hb, 0.72, dark_base(0x050508))))
        }
        ("holo", true) => {
            ring = mix(ha, 0.8, white);
            format!("linear-gradient(160deg, {} 0%, {} 100%)", css(mix(ha, 0.85, white)), css(hb))
        }
        ("spotlight", false) => {
            ring = mix(ha, 0.45, dark_base(0x07060c));
            format!(
                "radial-gradient(75% 42% at 50% 26%, {} 0%, {} 26%, {} 70%), radial-gradient(110% 45% at 50% 112%, {} 0%, {} 72%), radial-gradient(140% 100% at 50% 40%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.55) 100%), #07060c",
                css(mix(ha, 0.85, white)),
                css(mix(ha, 0.8, clear)),
                css(clear),
                css(mix(hb, 0.85, clear)),
                css(clear)
            )
        }
        ("spotlight", true) => {
            ring = mix(ha, 0.6, white);
            format!(
                "radial-gradient(75% 42% at 50% 26%, #ffffff 0%, {} 40%, {} 75%), radial-gradient(110% 45% at 50% 112%, {} 0%, {} 72%), {}",
                css(ha),
                css(clear),
                css(hb),
                css(clear),
                css(mix(ha, 0.55, white))
            )
        }
        ("split", _) => {
            let mid = mix(ha, 0.55, white);
            format!("{}, linear-gradient(158deg, {a} 0%, {a} 50%, {m} 50%, {m} 50.7%, {b} 50.7%, {b} 100%)", css(scrim), a = css(ha), m = css(mid), b = css(hb))
        }
        _ => format!("{}, {base}", css(scrim)),
    };
    if light && finish == "glass" {
        ink = rgb(0x17121f).into();
    }
    // The edge: soft by default; line / glow / flow are a gradient line (flow spins on the web).
    let edge = s("edge").unwrap_or_else(|| "soft".into());
    let grad = format!("linear-gradient(135deg, {} 0%, {} 50%, {} 100%)", css(mix(ha, 0.7, white)), css(hb), css(mix(ha, 0.85, white)));
    let under = BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: point(px(0.), px(18.)), blur_radius: px(44.), spread_radius: px(0.) };
    let glow = |c: Hsla, alpha: f32, blur: f32| BoxShadow { color: c.opacity(alpha), offset: point(px(0.), px(0.)), blur_radius: px(blur), spread_radius: px(0.) };
    let (edge_grad, edge_line, shadow) = match edge.as_str() {
        "none" => (None, None, Some(vec![BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), ..under }])),
        "line" => (Some((grad, 2.)), None, None),
        "glow" => (Some((grad, 1.5)), None, Some(vec![glow(ha, 0.42, 22.), glow(hb, 0.3, 56.), under])),
        "flow" => (Some((grad, 2.)), None, Some(vec![glow(ha, 0.3, 18.), under])),
        _ => (None, Some(if light { Hsla::from(rgba(0x140e2024)) } else { Hsla::from(rgba(0xffffff24)) }), None),
    };
    if light {
        line = rgba(0x17121f1f).into();
    }
    let bubble = if light { rgba(0xffffffd1).into() } else { mix(ring, 0.8, gpui::hsla(0., 0., 0., 0.4)) };
    let _ = &mut ink2;
    let _ = &mut ink3;
    Some(CardLook {
        bg,
        ink,
        ink2,
        ink3,
        surface,
        line,
        ring,
        pt_a: ha,
        button: button_color(a, b),
        bubble,
        edge_grad,
        edge_line,
        shadow,
        entrance: s("entrance"),
        pattern: s("pattern").filter(|p| p != "none").map(|p| (p, if light { mix(hb, 0.55, gpui::black()) } else { mix(ha, 0.4, white) })),
        light,
        flow: (edge == "flow").then(|| {
            // conic-gradient(pt-a, pt-a+45% white 8%, pt-b 22%, transparent 34% 58%, pt-a 72%,
            // pt-b+50% white 82%, pt-a)
            let a = Rgba::from(ha);
            let b = Rgba::from(hb);
            vec![
                (a, 0.),
                (Rgba::from(mix(ha, 0.45, white)), 0.08),
                (b, 0.22),
                (Rgba { a: 0., ..b }, 0.34),
                (Rgba { a: 0., ..a }, 0.58),
                (a, 0.72),
                (Rgba::from(mix(hb, 0.5, white)), 0.82),
                (a, 1.),
            ]
        }),
        lights: (finish == "aurora").then(|| {
            format!(
                "radial-gradient(30% 22% at 28% 34%, {} 0%, {} 70%), radial-gradient(34% 26% at 72% 52%, {} 0%, {} 70%), radial-gradient(28% 22% at 58% 78%, {} 0%, {} 70%)",
                css(mix(ha, 0.92, white)),
                css(clear),
                css(mix(ha, 0.55, hb)),
                css(clear),
                css(mix(ha, 0.45 / 0.75, white).opacity(0.75)),
                css(clear)
            )
        }),
    })
}

/// The entrance at `t` (0..1 of its time): (opacity, y offset).
pub(super) fn entrance_at(kind: &str, t: f32) -> (f32, f32) {
    // cubic-bezier(0.2, 1, 0.3, 1), roughly: a fast start that settles.
    let settle = |x: f32| 1. - (1. - x).powi(4);
    match kind {
        "drop" => {
            // -80 → +8 (half-way, landing) → -6 → +2 → 0.
            let y = if t < 0.5 {
                let k = (t / 0.5).powi(2);
                -80. + 88. * k
            } else if t < 0.72 {
                8. - 14. * ((t - 0.5) / 0.22)
            } else if t < 0.88 {
                -6. + 8. * ((t - 0.72) / 0.16)
            } else {
                2. - 2. * ((t - 0.88) / 0.12)
            };
            ((t / 0.5).min(1.), y)
        }
        "rise" => (settle(t), 28. * (1. - settle(t))),
        // pop, flip, unfold, zoom, swing, glitch: scales and turns gpui cannot draw; they fade in.
        _ => (settle(t), 0.),
    }
}

/// How long an entrance takes (`--pst-in-t`).
pub(super) fn entrance_ms(kind: &str) -> u64 {
    match kind {
        "flip" => 750,
        "unfold" => 600,
        "zoom" => 550,
        "swing" => 900,
        "drop" => 700,
        _ => 500,
    }
}

pub(super) fn css_color(c: Hsla) -> String {
    css(c)
}

/// A frame's edge gradient and glow (`.profile-frame-*`: --pf-grad and box-shadow), from
/// resources/cosmetics/frame-edges.json.
pub(super) fn frame_edge(id: &str) -> Option<(String, Vec<BoxShadow>)> {
    static TABLE: std::sync::OnceLock<std::collections::HashMap<String, Value>> = std::sync::OnceLock::new();
    let table = TABLE.get_or_init(|| {
        crate::assets::ASSETS
            .iter()
            .find(|(p, _)| *p == "cosmetics/frame-edges.json")
            .and_then(|(_, b)| serde_json::from_slice(b).ok())
            .unwrap_or_default()
    });
    let entry = table.get(id)?;
    let grad = entry.get("grad")?.as_str()?.to_string();
    let shadow = entry.get("shadow").and_then(Value::as_str).map(parse_shadows).unwrap_or_default();
    Some((grad, shadow))
}

/// CSS box-shadow lists ("0 0 16px rgba(…), 0 12px 32px rgba(0, 0, 0, 0.6)"), outer ones only.
fn parse_shadows(text: &str) -> Vec<BoxShadow> {
    crate::cssbg::split_top(text)
        .iter()
        .filter_map(|part| {
            let color_at = part.find("rgba(").or_else(|| part.find("rgb(")).or_else(|| part.find('#'))?;
            let color = crate::names::Rgba::parse(part[color_at..].trim())?;
            let nums: Vec<f32> = part[..color_at].split_whitespace().filter_map(|v| v.trim_end_matches("px").parse().ok()).collect();
            let at = |i: usize| nums.get(i).copied().unwrap_or(0.);
            Some(BoxShadow { color: Hsla::from(color), offset: point(px(at(0)), px(at(1))), blur_radius: px(at(2)), spread_radius: px(at(3)) })
        })
        .collect()
}

/// `.pst-pattern`: the chosen pattern's tile repeated over the card in `color`, 17% strong (13% on
/// light cards) and fading to 30% of that toward the bottom, as one picture of the card's size.
pub(super) fn pattern_picture(kind: &str, color: Hsla, light: bool, w: f32, h: f32, scale: f32) -> Option<std::sync::Arc<gpui::RenderImage>> {
    use std::cell::RefCell;
    use std::collections::HashMap;
    thread_local! {
        static CACHE: RefCell<HashMap<String, Option<std::sync::Arc<gpui::RenderImage>>>> = RefCell::new(HashMap::new());
    }
    let fill = css(color);
    let key = format!("{kind}|{fill}|{light}|{w}|{h}|{scale}");
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let paint = || -> Option<std::sync::Arc<gpui::RenderImage>> {
        // The tile, white on clear: from the web's own data URLs, or (stripes, checker) its gradients.
        let (tw, th, tile, transform) = match kind {
            // repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 13px)
            "stripes" => (13., 13., "<rect width='2' height='13' fill='#fff'/>".to_string(), " patternTransform='rotate(45)'"),
            // conic-gradient(#fff 25%, transparent 0 50%, #fff 0 75%, transparent 0) at 26px
            "checker" => (26., 26., "<rect x='13' width='13' height='13' fill='#fff'/><rect y='13' width='13' height='13' fill='#fff'/>".to_string(), ""),
            _ => {
                static TABLE: std::sync::OnceLock<HashMap<String, Value>> = std::sync::OnceLock::new();
                let table = TABLE.get_or_init(|| {
                    crate::assets::ASSETS
                        .iter()
                        .find(|(p, _)| *p == "cosmetics/card-patterns.json")
                        .and_then(|(_, b)| serde_json::from_slice(b).ok())
                        .unwrap_or_default()
                });
                let t = table.get(kind)?;
                (t["w"].as_f64()? as f32, t["h"].as_f64()? as f32, t["svg"].as_str()?.to_string(), "")
            }
        };
        let strength = if light { 0.13 } else { 0.17 };
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><pattern id="t" width="{tw}" height="{th}" patternUnits="userSpaceOnUse"{transform}>{tile}</pattern><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{fill}"/><stop offset="0.35" stop-color="{fill}"/><stop offset="1" stop-color="{fill}" stop-opacity="0.3"/></linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="url(#t)"/></mask></defs><rect width="{w}" height="{h}" fill="url(#f)" mask="url(#m)" opacity="{strength}"/></svg>"#
        );
        let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).ok()?;
        let (pw, ph) = ((w * scale).ceil() as u32, (h * scale).ceil() as u32);
        let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
        resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
        let mut data = Vec::with_capacity((pw * ph * 4) as usize);
        for p in pixmap.pixels() {
            let c = p.demultiply();
            data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
        }
        Some(std::sync::Arc::new(gpui::RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)])))
    };
    let result = paint();
    CACHE.with(|c| c.borrow_mut().insert(key, result.clone()));
    result
}

/// `.pst-f-aurora .pst-lights`: the glows in a box a quarter larger than the card on every side,
/// blurred 22px, at 90%, as one picture of the card's size.
pub(super) fn lights_picture(css_text: &str, w: f32, h: f32, scale: f32) -> Option<std::sync::Arc<gpui::RenderImage>> {
    use std::cell::RefCell;
    use std::collections::HashMap;
    thread_local! {
        static CACHE: RefCell<HashMap<String, Option<std::sync::Arc<gpui::RenderImage>>>> = RefCell::new(HashMap::new());
    }
    let key = format!("{css_text}|{w}|{h}|{scale}");
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let paint = || -> Option<std::sync::Arc<gpui::RenderImage>> {
        let area = crate::cssbg::Box2 { x: -0.25 * w, y: -0.25 * h, w: 1.5 * w, h: 1.5 * h };
        let (defs, draw) = crate::cssbg::to_svg(css_text, &area, "l");
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}<filter id="b" x="{}" y="{}" width="{}" height="{}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="22"/></filter></defs><g filter="url(#b)" opacity="0.9">{draw}</g></svg>"#,
            area.x, area.y, area.w, area.h
        );
        let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).ok()?;
        let (pw, ph) = ((w * scale).ceil() as u32, (h * scale).ceil() as u32);
        let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
        resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
        let mut data = Vec::with_capacity((pw * ph * 4) as usize);
        for p in pixmap.pixels() {
            let c = p.demultiply();
            data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
        }
        Some(std::sync::Arc::new(gpui::RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)])))
    };
    let result = paint();
    CACHE.with(|c| c.borrow_mut().insert(key, result.clone()));
    result
}

/// `.pst-edge-flow .pst-edge`: a 2px ring whose colours turn round the card (conic-gradient from
/// --pst-spin, one turn in 5s), painted as short pieces each coloured for its angle.
pub(super) fn paint_flow_edge(bounds: gpui::Bounds<gpui::Pixels>, stops: &[(Rgba, f32)], radius: f32, window: &mut gpui::Window) {
    let start = {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        *START.get_or_init(std::time::Instant::now)
    };
    let spin = (start.elapsed().as_secs_f32() / 5.).fract() * 360.;
    let (x0, y0) = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
    let (w, h) = (f32::from(bounds.size.width), f32::from(bounds.size.height));
    let (cx, cy) = (x0 + w / 2., y0 + h / 2.);
    // The ring's middle line: a rounded rectangle 1px in, walked clockwise from the top left.
    let (half, r) = (1., (radius - 1.).max(0.));
    let (l, t, rr, b) = (x0 + half, y0 + half, x0 + w - half, y0 + h - half);
    let mut pts: Vec<(f32, f32, f32, f32)> = Vec::new(); // point and outward normal
    let line = |pts: &mut Vec<(f32, f32, f32, f32)>, a: (f32, f32), z: (f32, f32), n: (f32, f32)| {
        let len = ((z.0 - a.0).powi(2) + (z.1 - a.1).powi(2)).sqrt();
        let steps = (len / 3.).ceil().max(1.) as usize;
        for i in 0..steps {
            let k = i as f32 / steps as f32;
            pts.push((a.0 + (z.0 - a.0) * k, a.1 + (z.1 - a.1) * k, n.0, n.1));
        }
    };
    let arc = |pts: &mut Vec<(f32, f32, f32, f32)>, c: (f32, f32), from: f32| {
        let steps = ((r * std::f32::consts::FRAC_PI_2) / 2.).ceil().max(1.) as usize;
        for i in 0..steps {
            let a = (from + 90. * i as f32 / steps as f32).to_radians();
            pts.push((c.0 + r * a.cos(), c.1 + r * a.sin(), a.cos(), a.sin()));
        }
    };
    line(&mut pts, (l + r, t), (rr - r, t), (0., -1.));
    arc(&mut pts, (rr - r, t + r), -90.);
    line(&mut pts, (rr, t + r), (rr, b - r), (1., 0.));
    arc(&mut pts, (rr - r, b - r), 0.);
    line(&mut pts, (rr - r, b), (l + r, b), (0., 1.));
    arc(&mut pts, (l + r, b - r), 90.);
    line(&mut pts, (l, b - r), (l, t + r), (-1., 0.));
    arc(&mut pts, (l + r, t + r), 180.);
    let colour_at = |turn: f32| -> Hsla {
        let i = stops.iter().position(|(_, o)| *o >= turn).unwrap_or(stops.len() - 1);
        if i == 0 {
            return stops[0].0.into();
        }
        let ((ca, oa), (cb, ob)) = (stops[i - 1], stops[i]);
        let k = if ob > oa { (turn - oa) / (ob - oa) } else { 1. };
        // Premultiplied, as CSS blends gradient stops.
        let alpha = ca.a + (cb.a - ca.a) * k;
        if alpha <= 0. {
            return gpui::hsla(0., 0., 0., 0.);
        }
        let ch = |x: f32, y: f32| (x * ca.a + (y * cb.a - x * ca.a) * k) / alpha;
        Rgba { r: ch(ca.r, cb.r), g: ch(ca.g, cb.g), b: ch(ca.b, cb.b), a: alpha }.into()
    };
    let n = pts.len();
    for i in 0..n {
        let (p, q) = (pts[i], pts[(i + 1) % n]);
        let (mx, my) = ((p.0 + q.0) / 2., (p.1 + q.1) / 2.);
        let angle = (mx - cx).atan2(-(my - cy)).to_degrees().rem_euclid(360.);
        let color = colour_at(((angle - spin).rem_euclid(360.)) / 360.);
        if color.a <= 0.003 {
            continue;
        }
        // A little longer than the step, so neighbours overlap instead of showing seams.
        let (dx, dy) = (q.0 - p.0, q.1 - p.1);
        let len = (dx * dx + dy * dy).sqrt().max(0.001);
        let (ex, ey) = (dx / len * 0.4, dy / len * 0.4);
        let mut path = gpui::PathBuilder::fill();
        path.move_to(point(px(p.0 - ex + p.2 * half), px(p.1 - ey + p.3 * half)));
        path.line_to(point(px(q.0 + ex + q.2 * half), px(q.1 + ey + q.3 * half)));
        path.line_to(point(px(q.0 + ex - q.2 * half), px(q.1 + ey - q.3 * half)));
        path.line_to(point(px(p.0 - ex - p.2 * half), px(p.1 - ey - p.3 * half)));
        path.close();
        if let Ok(path) = path.build() {
            window.paint_path(path, color);
        }
    }
    window.request_animation_frame();
}
