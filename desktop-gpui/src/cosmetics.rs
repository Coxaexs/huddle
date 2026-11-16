//! Cosmetics from app/components/cosmetics.tsx and its stylesheets: avatar decorations (SVG laid over
//! an avatar) and nameplates (a backdrop behind a name in the member list). The art is the web's own,
//! exported by tools/export-cosmetics.mjs; nameplate colours come from the CSS rules
//! (tools/extract-nameplates.py).

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use gpui::{AnyElement, ImageSource, IntoElement, RenderImage, SharedString, div, img, prelude::*, px};
use serde_json::Value;

use crate::cssbg::{self, Box2};

fn asset(path: &str) -> Option<&'static [u8]> {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == path).map(|(_, b)| *b)
}

/// The ring-style decorations are drawn by CSS around the avatar, not as art (RING_DECORATIONS).
const RINGS: [&str; 6] = ["neon", "rainbow", "cyber", "gold", "sakura", "diamond"];

/// An avatar of `size` with its decoration on top: `.avatar-deco` covers 120% of the avatar, offset
/// by −10%; the exported art has a widened viewBox (−60…180) so wings and horns are not cut off.
pub fn decorate(avatar: AnyElement, frame: &str, size: f32) -> AnyElement {
    decorate_grey(avatar, frame, size, false)
}

/// The same, greyed out (an offline member's avatar).
pub fn decorate_grey(avatar: AnyElement, frame: &str, size: f32, grey: bool) -> AnyElement {
    if frame.is_empty() || frame == "none" || RINGS.contains(&frame) {
        return avatar;
    }
    let path = format!("cosmetics/decorations/{frame}.svg");
    if asset(&path).is_none() {
        return avatar;
    }
    let deco = size * 1.2;
    div()
        .relative()
        .size(px(size))
        .flex_none()
        .child(avatar)
        .child(
            img(SharedString::from(path))
                .absolute()
                .left(px(-size * 0.1 - deco * 0.5))
                .top(px(-size * 0.1 - deco * 0.5))
                .size(px(deco * 2.))
                .grayscale(grey),
        )
        .into_any_element()
}

fn table() -> &'static HashMap<String, Value> {
    static TABLE: OnceLock<HashMap<String, Value>> = OnceLock::new();
    TABLE.get_or_init(|| {
        asset("cosmetics/nameplates.json")
            .and_then(|b| serde_json::from_slice::<HashMap<String, Value>>(b).ok())
            .unwrap_or_default()
    })
}

pub fn has_nameplate(id: &str) -> bool {
    !id.is_empty() && id != "none" && table().contains_key(id)
}

/// `.has-nameplate` backdrop at `w`×`h`: the base colour, the CSS gradients (`background-size:
/// cover`), the art on the right 64% faded in over its first 38%, the inset border, 8px corners.
pub fn nameplate(id: &str, w: f32, h: f32, scale: f32) -> Option<AnyElement> {
    let key = format!("{id}|{w}|{h}|{scale}");
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<RenderImage>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    let cached = cache.lock().unwrap().get(&key).cloned();
    let image = match cached {
        Some(image) => image,
        None => {
            let image = Arc::new(paint_nameplate(id, w, h, scale)?);
            cache.lock().unwrap().insert(key, image.clone());
            image
        }
    };
    Some(img(ImageSource::Render(image)).absolute().left_0().top_0().w(px(w)).h(px(h)).into_any_element())
}

fn paint_nameplate(id: &str, w: f32, h: f32, scale: f32) -> Option<RenderImage> {
    let rule = table().get(id)?;
    let base = rule.get("base").and_then(Value::as_str).unwrap_or("transparent");
    let art_css = rule.get("art").and_then(Value::as_str).unwrap_or("");
    let (bg_defs, bg_draw) = cssbg::to_svg(art_css, &Box2 { x: 0., y: 0., w, h }, "bg");
    let base_fill = crate::names::Rgba::parse(base).unwrap_or(crate::names::Rgba::CLEAR);
    // The art file is a whole <svg>: nest it, keeping its viewBox and aspect rule.
    let art = asset(&format!("cosmetics/nameplates/{id}.svg"))
        .and_then(|b| std::str::from_utf8(b).ok())
        .map(|s| {
            let open_end = s.find('>').unwrap_or(0);
            let head = &s[..open_end];
            let attr = |name: &str| {
                head.find(&format!("{name}=\"")).map(|i| {
                    let rest = &head[i + name.len() + 2..];
                    rest[..rest.find('"').unwrap_or(0)].to_string()
                })
            };
            let view_box = attr("viewBox").unwrap_or_else(|| "60 0 100 48".into());
            let aspect = attr("preserveAspectRatio").unwrap_or_else(|| "xMaxYMid slice".into());
            let inner = &s[open_end + 1..s.rfind("</svg>").unwrap_or(s.len())];
            format!(
                r#"<g mask="url(#fade)"><svg x="{}" y="0" width="{}" height="{h}" viewBox="{view_box}" preserveAspectRatio="{aspect}" overflow="hidden">{inner}</svg></g>"#,
                w * 0.36,
                w * 0.64
            )
        })
        .unwrap_or_default();
    let border = rule
        .get("box-shadow")
        .and_then(Value::as_str)
        .and_then(|s| s.strip_prefix("inset 0 0 0 1px "))
        .and_then(crate::names::Rgba::parse)
        .map(|c| format!(r#"<rect x="0.5" y="0.5" width="{}" height="{}" rx="7.5" fill="none" stroke="{}" stroke-opacity="{}"/>"#, w - 1., h - 1., c.hex(), c.opacity()))
        .unwrap_or_default();
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs>{bg_defs}
<clipPath id="round"><rect width="{w}" height="{h}" rx="8"/></clipPath>
<linearGradient id="fadeg" gradientUnits="userSpaceOnUse" x1="{}" y1="0" x2="{w}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.38" stop-color="#fff"/></linearGradient>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><rect x="{}" width="{}" height="{h}" fill="url(#fadeg)"/></mask>
</defs>
<g clip-path="url(#round)"><rect width="{w}" height="{h}" fill="{}" fill-opacity="{}"/>{bg_draw}{art}</g>{border}</svg>"##,
        w * 0.36,
        w * 0.36,
        w * 0.64,
        base_fill.hex(),
        base_fill.opacity()
    );
    let options = resvg::usvg::Options { fontdb: crate::fonts::database(), ..Default::default() };
    let tree = resvg::usvg::Tree::from_str(&svg, &options).ok()?;
    let (pw, ph) = ((w * scale).ceil() as u32, (h * scale).ceil() as u32);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
    resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    let mut data = Vec::with_capacity((pw * ph * 4) as usize);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
    }
    Some(RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)]))
}

/// One `.pf-piece` of a profile frame's art (ProfileFrameArt): an SVG placed around the card by
/// its inline style, as fractions of the card (`width`, `left`/`right`) with its bottom on the
/// card's top (`bottom:100%`) or its top on the card's bottom (`top:100%`), then moved by
/// `translate: 0 N%` of its own height.
struct FramePiece {
    body: String,
    view: (f32, f32, f32, f32),
    width: f32,
    left: Option<f32>,
    right: Option<f32>,
    above: bool,
    shift: f32,
}

fn frame_pieces(id: &str) -> Arc<Vec<FramePiece>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<Vec<FramePiece>>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().unwrap().get(id).cloned() {
        return hit;
    }
    let mut pieces = Vec::new();
    let text = asset(&format!("cosmetics/frames/{id}.svg")).map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let attr = |tag: &str, name: &str| -> Option<String> {
        let at = tag.find(&format!(" {name}=\""))? + name.len() + 3;
        Some(tag[at..at + tag[at..].find('"')?].to_string())
    };
    let pct = |v: &str| v.trim().trim_end_matches('%').parse::<f32>().ok().map(|n| n / 100.);
    for chunk in text.split("<svg").skip(1) {
        let Some(open_end) = chunk.find('>') else { continue };
        let tag = &chunk[..open_end];
        if !tag.contains("pf-piece") {
            continue;
        }
        let Some(close) = chunk.rfind("</svg>") else { continue };
        let view: Vec<f32> = attr(tag, "viewBox").unwrap_or_default().split_whitespace().filter_map(|v| v.parse().ok()).collect();
        let [vx, vy, vw, vh] = view[..] else { continue };
        let style = attr(tag, "style").unwrap_or_default();
        let mut piece = FramePiece { body: chunk[open_end + 1..close].to_string(), view: (vx, vy, vw, vh), width: 1., left: None, right: None, above: true, shift: 0. };
        for rule in style.split(';') {
            let Some((k, v)) = rule.split_once(':') else { continue };
            match k.trim() {
                "width" => piece.width = pct(v).unwrap_or(1.),
                "left" => piece.left = pct(v),
                "right" => piece.right = pct(v),
                "bottom" => piece.above = true,
                "top" => piece.above = false,
                "translate" => piece.shift = v.split_whitespace().nth(1).and_then(pct).unwrap_or(0.),
                _ => {}
            }
        }
        pieces.push(piece);
    }
    let pieces = Arc::new(pieces);
    cache.lock().unwrap().insert(id.to_string(), pieces.clone());
    pieces
}

/// A piece drawn at `w`×`h` px with room around it for `.pf-piece`'s drop shadow (0 4px 6px
/// black 45%) and the moon glows the CSS puts on some shapes.
fn paint_piece(piece: &FramePiece, w: f32, h: f32, pad: f32, scale: f32) -> Option<RenderImage> {
    let (vx, vy, vw, vh) = piece.view;
    let k = w / vw;
    let body = piece
        .body
        .replace(r#"class="pf-moonglow""#, r#"filter="url(#pfx-moonglow)""#)
        .replace(r#"class="pfx-moon-blood""#, r#"filter="url(#pfx-moonblood)""#);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{tw}" height="{th}" viewBox="0 0 {tw} {th}"><defs>
<filter id="pf-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.45"/></filter>
<filter id="pfx-moonglow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="{g1}" flood-color="rgb(255,246,194)" flood-opacity="0.8"/></filter>
<filter id="pfx-moonblood" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="{g2}" flood-color="rgb(255,30,60)" flood-opacity="0.8"/></filter>
</defs><g filter="url(#pf-shadow)"><g transform="translate({pad} {pad}) scale({k}) translate({nx} {ny})">{body}</g></g></svg>"##,
        tw = w + pad * 2.,
        th = h + pad * 2.,
        g1 = 5. / k,
        g2 = 12. / k,
        nx = -vx,
        ny = -vy,
    );
    let _ = vh;
    let options = resvg::usvg::Options { fontdb: crate::fonts::database(), ..Default::default() };
    let tree = resvg::usvg::Tree::from_str(&svg, &options).ok()?;
    let (pw, ph) = (((w + pad * 2.) * scale).ceil() as u32, ((h + pad * 2.) * scale).ceil() as u32);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
    resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    let mut data = Vec::with_capacity((pw * ph * 4) as usize);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
    }
    Some(RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)]))
}

pub fn has_frame_art(id: &str) -> bool {
    !id.is_empty() && id != "none" && !frame_pieces(id).is_empty()
}

/// `.pframe-art`: a profile frame's pieces around a card of `card_w`×`card_h`, as children placed
/// relative to the card (above it).
pub fn frame_art(id: &str, card_w: f32, card_h: f32, scale: f32) -> Vec<AnyElement> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<RenderImage>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    let pad = 24.;
    let mut out = Vec::new();
    for (n, piece) in frame_pieces(id).iter().enumerate() {
        let w = (piece.width * card_w).round();
        let h = (w * piece.view.3 / piece.view.2).round();
        let key = format!("{id}|{n}|{w}|{h}|{scale}");
        let cached = cache.lock().unwrap().get(&key).cloned();
        let Some(image) = cached.or_else(|| {
            let image = Arc::new(paint_piece(piece, w, h, pad, scale)?);
            cache.lock().unwrap().insert(key, image.clone());
            Some(image)
        }) else {
            continue;
        };
        let x = match (piece.left, piece.right) {
            (Some(l), _) => l * card_w,
            (None, Some(r)) => card_w - r * card_w - w,
            _ => 0.,
        };
        let y = if piece.above { -h } else { card_h } + piece.shift * h;
        out.push(img(ImageSource::Render(image)).absolute().left(px(x - pad)).top(px(y - pad)).w(px(w + pad * 2.)).h(px(h + pad * 2.)).into_any_element());
    }
    out
}

/// The glow some frames give the card (`.profile-frame-*` box-shadow rules in cosmetics.css).
pub fn frame_shadow(id: &str) -> Option<Vec<gpui::BoxShadow>> {
    let shadow = |x: f32, y: f32, blur: f32, rgba: (u8, u8, u8, f32)| gpui::BoxShadow {
        color: gpui::Hsla::from(gpui::Rgba { r: rgba.0 as f32 / 255., g: rgba.1 as f32 / 255., b: rgba.2 as f32 / 255., a: rgba.3 }),
        offset: gpui::point(px(x), px(y)),
        blur_radius: px(blur),
        spread_radius: px(0.),
    };
    let under = shadow(0., 12., 32., (0, 0, 0, 0.6));
    Some(match id {
        "kitty" => vec![shadow(0., 0., 14., (216, 255, 106, 0.18)), under],
        "blaze-blue" => vec![shadow(0., -6., 26., (34, 211, 238, 0.4)), under],
        "blaze-pink" => vec![shadow(0., -6., 26., (255, 92, 192, 0.4)), under],
        "vampire" => vec![shadow(0., 0., 22., (192, 16, 42, 0.45)), under],
        _ => return None,
    })
}
